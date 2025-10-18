from decimal import Decimal
from flask import Blueprint, jsonify, request
from ..db import (
    db_connection,
    ensure_auctions_tables,
    ensure_listings_table,
    ensure_users_table,
)
from ..errors import AppError, DBError
from ..security import get_auth_user, require_admin
from ..utils import clean_string, is_admin, to_decimal

listings_bp = Blueprint('listings', __name__, url_prefix='/api')

ALLOWED_STATUSES = {'draft', 'published', 'archived'}

def _as_float(value):
    try:
        if value is None:
            return None
        return float(value)
    except Exception:
        return None

def _row_to_listing(row):
    if not row:
        return None
    listing = {
        "id": row.get("id"),
        "title": row.get("title"),
        "description": row.get("description"),
        "startingBid": _as_float(row.get("starting_bid")),
        "currentBid": _as_float(row.get("current_bid")),
        "unit": row.get("unit"),
        "image": row.get("image"),
        "status": row.get("status"),
        "baseQuantity": _as_float(row.get("base_quantity")),
        "ownerId": row.get("owner_id"),
        "ownerUsername": row.get("owner_username"),
        "createdAt": row.get("created_at").isoformat() if row.get("created_at") else None,
        "updatedAt": row.get("updated_at").isoformat() if row.get("updated_at") else None,
        "auctionCount": int(row.get("auction_count") or 0),
    }
    last_id = row.get("last_auction_id")
    if last_id:
        listing["lastAuction"] = {
            "id": last_id,
            "status": row.get("last_auction_status"),
            "createdAt": row.get("last_auction_created_at").isoformat() if row.get("last_auction_created_at") else None,
        }
    else:
        listing["lastAuction"] = None
    return listing

def _current_user():
    auth_conn = db_connection()
    try:
        ensure_users_table(auth_conn)
        user = get_auth_user(auth_conn)
        if not user:
            raise AppError("Unauthorized", statuscode=401)
        return user
    finally:
        auth_conn.close()

def _normalize_status(status_value: str | None, *, required: bool = False) -> str | None:
    if status_value is None:
        if required:
            raise AppError("Field 'status' is required", statuscode=400)
        return None
    status_value = str(status_value).strip().lower()
    if status_value not in ALLOWED_STATUSES:
        raise AppError("Invalid status value", statuscode=400)
    return status_value

def _normalize_decimal(value, field_name: str, *, allow_null: bool = True, min_value: Decimal | None = None) -> Decimal | None:
    if value is None or (isinstance(value, str) and not value.strip()):
        if allow_null:
            return None
        raise AppError(f"Field '{field_name}' is required", statuscode=400)
    dec = to_decimal(value)
    if min_value is not None and dec < min_value:
        raise AppError(f"Field '{field_name}' must be >= {min_value}", statuscode=400)
    return dec

def _fetch_listing_with_meta(connection, listing_id: int):
    cur = connection.cursor(dictionary=True)
    try:
        ensure_listings_table(connection)
        ensure_users_table(connection)
        ensure_auctions_tables(connection)
        cur.execute(
            """
            SELECT
                l.id, l.title, l.description, l.starting_bid, l.current_bid, l.unit, l.image,
                l.owner_id, l.status, l.base_quantity, l.created_at, l.updated_at,
                u.username AS owner_username,
                (SELECT COUNT(*) FROM auctions a WHERE a.listing_id = l.id) AS auction_count,
                (SELECT a2.id FROM auctions a2 WHERE a2.listing_id = l.id ORDER BY a2.created_at DESC LIMIT 1) AS last_auction_id,
                (SELECT a3.status FROM auctions a3 WHERE a3.listing_id = l.id ORDER BY a3.created_at DESC LIMIT 1) AS last_auction_status,
                (SELECT a4.created_at FROM auctions a4 WHERE a4.listing_id = l.id ORDER BY a4.created_at DESC LIMIT 1) AS last_auction_created_at
            FROM listings l
            LEFT JOIN users u ON u.id = l.owner_id
            WHERE l.id = %s
            """,
            (listing_id,),
        )
        row = cur.fetchone()
        if not row:
            raise AppError("Listing not found", statuscode=404)
        return row
    finally:
        cur.close()

@listings_bp.get('/listings/summary')
def listings_summary():
    connection = db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        ensure_listings_table(connection)
        search_term = clean_string(request.args.get('search'))
        status_param = request.args.get('status')
        where_clauses = []
        params = []
        if search_term:
            where_clauses.append('(l.title LIKE %s OR l.description LIKE %s)')
            like_term = f"%{search_term}%"
            params.extend([like_term, like_term])
        if status_param and status_param.lower() not in ('all', '*'):
            status_filter = _normalize_status(status_param)
            where_clauses.append('l.status = %s')
            params.append(status_filter)
        sql = 'SELECT l.status, COUNT(*) AS count FROM listings l'
        if where_clauses:
            sql += ' WHERE ' + ' AND '.join(where_clauses)
        sql += ' GROUP BY l.status'
        cursor.execute(sql, tuple(params))
        rows = cursor.fetchall()
        counts = {row.get('status'): int(row.get('count') or 0) for row in rows if row.get('status')}
        summary = {
            "total": sum(counts.values()),
            "draft": counts.get('draft', 0),
            "published": counts.get('published', 0),
            "archived": counts.get('archived', 0),
        }
        return jsonify(summary)
    except AppError:
        raise
    except Exception as exception:
        raise DBError("Error fetching listings summary", details=str(exception))
    finally:
        cursor.close()
        connection.close()

@listings_bp.get('/listings')
def list_listings():
    connection = db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        ensure_listings_table(connection)
        ensure_users_table(connection)
        ensure_auctions_tables(connection)
        detailed = str(request.args.get('detailed', '')).lower() in ('1', 'true', 'yes')
        status_param = request.args.get('status')
        search_term = clean_string(request.args.get('search'))
        limit_param = request.args.get('limit')
        page_param = request.args.get('page')
        offset_param = request.args.get('offset')
        sort_param = request.args.get('sort', 'created_desc')
        where_clauses = []
        params = []
        status_filter = None
        if status_param and status_param.lower() not in ('all', '*'):
            status_filter = _normalize_status(status_param)
        elif not detailed:
            status_filter = 'published'
        if status_filter:
            where_clauses.append('l.status = %s')
            params.append(status_filter)
        if search_term:
            where_clauses.append('(l.title LIKE %s OR l.description LIKE %s)')
            like_term = f"%{search_term}%"
            params.extend([like_term, like_term])
        sort_map = {
            'title_asc': 'l.title ASC',
            'title_desc': 'l.title DESC',
            'created_asc': 'l.created_at ASC',
            'created_desc': 'l.created_at DESC',
            'updated_desc': 'l.updated_at DESC',
            'status': 'l.status ASC, l.created_at DESC',
        }
        order_clause = sort_map.get(sort_param, 'l.created_at DESC')
        limit_default = 25 if detailed else 100
        try:
            limit_value = int(limit_param) if limit_param is not None else limit_default
        except ValueError:
            raise AppError("Invalid limit parameter", statuscode=400)
        limit_value = max(1, min(limit_value, 100))

        if offset_param is not None:
            try:
                offset_value = max(0, int(offset_param))
            except ValueError:
                raise AppError("Invalid offset parameter", statuscode=400)
        elif page_param is not None:
            try:
                page_value = max(1, int(page_param))
            except ValueError:
                raise AppError("Invalid page parameter", statuscode=400)
            offset_value = (page_value - 1) * limit_value
        else:
            offset_value = 0

        sql = """
            SELECT
                l.id, l.title, l.description, l.starting_bid, l.current_bid, l.unit, l.image,
                l.owner_id, l.status, l.base_quantity, l.created_at, l.updated_at,
                u.username AS owner_username,
                (SELECT COUNT(*) FROM auctions a WHERE a.listing_id = l.id) AS auction_count,
                (SELECT a2.id FROM auctions a2 WHERE a2.listing_id = l.id ORDER BY a2.created_at DESC LIMIT 1) AS last_auction_id,
                (SELECT a3.status FROM auctions a3 WHERE a3.listing_id = l.id ORDER BY a3.created_at DESC LIMIT 1) AS last_auction_status,
                (SELECT a4.created_at FROM auctions a4 WHERE a4.listing_id = l.id ORDER BY a4.created_at DESC LIMIT 1) AS last_auction_created_at
            FROM listings l
            LEFT JOIN users u ON u.id = l.owner_id
        """

        if where_clauses:
            sql += ' WHERE ' + ' AND '.join(where_clauses)
        sql += f' ORDER BY {order_clause}'

        filter_params = list(params)

        if detailed:
            sql += ' LIMIT %s OFFSET %s'
            params.extend([limit_value, offset_value])
        else:
            sql += ' LIMIT %s'
            params.append(limit_value)

        cursor.execute(sql, tuple(params))
        rows = cursor.fetchall()
        listings = [_row_to_listing(r) for r in rows]

        if detailed:
            count_cursor = connection.cursor()
            try:
                count_sql = 'SELECT COUNT(*) FROM listings l'
                if where_clauses:
                    count_sql += ' WHERE ' + ' AND '.join(where_clauses)
                count_cursor.execute(count_sql, tuple(filter_params))
                total = int(count_cursor.fetchone()[0])
            finally:
                count_cursor.close()
            return jsonify({
                "items": listings,
                "total": total,
                "limit": limit_value,
                "offset": offset_value,
            })
        return jsonify(listings)
    except AppError:
        raise
    except Exception as exception:
        raise DBError("Error fetching listings", details=str(exception))
    finally:
        cursor.close()
        connection.close()


@listings_bp.get('/listings/<int:listing_id>')
def get_listing(listing_id: int):
    connection = db_connection()
    try:
        row = _fetch_listing_with_meta(connection, listing_id)
        return jsonify(_row_to_listing(row))
    finally:
        connection.close()


@listings_bp.post('/listings')
def create_listing():
    user = _current_user()

    data = request.get_json(silent=True) or {}
    title = clean_string(data.get('title'))
    unit = clean_string(data.get('unit'))
    description = clean_string(data.get('description'))
    image = clean_string(data.get('image'))
    status_value = _normalize_status(data.get('status')) or 'draft'
    starting_bid = _normalize_decimal(data.get('startingBid'), 'startingBid', allow_null=False, min_value=Decimal('0'))
    current_bid = _normalize_decimal(data.get('currentBid'), 'currentBid', allow_null=True, min_value=Decimal('0'))
    base_quantity = _normalize_decimal(data.get('baseQuantity'), 'baseQuantity', allow_null=True, min_value=Decimal('0'))

    if not title:
        raise AppError("Field 'title' is required", statuscode=400)
    if not unit:
        raise AppError("Field 'unit' is required", statuscode=400)
    if status_value != 'draft' and not is_admin(user):
        raise AppError("Only admins can publish or archive listings", statuscode=403)

    connection = db_connection()
    cursor = connection.cursor()
    try:
        ensure_listings_table(connection)
        cursor.execute(
            """
            INSERT INTO listings (title, description, starting_bid, current_bid, unit, image, owner_id, status, base_quantity)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                title,
                description,
                str(starting_bid),
                str(current_bid) if current_bid is not None else None,
                unit,
                image,
                user['id'],
                status_value,
                str(base_quantity) if base_quantity is not None else None,
            ),
        )
        connection.commit()
        new_id = cursor.lastrowid
    except Exception as exception:
        try:
            connection.rollback()
        except Exception:
            pass
        raise DBError("Error creating listing", details=str(exception))
    finally:
        cursor.close()
        connection.close()

    detail_conn = db_connection()
    try:
        row = _fetch_listing_with_meta(detail_conn, new_id)
        return jsonify(_row_to_listing(row)), 201
    finally:
        detail_conn.close()


def _update_listing(listing_id: int, partial: bool = False):
    user = _current_user()

    connection = db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        ensure_listings_table(connection)
        ensure_users_table(connection)
        ensure_auctions_tables(connection)
        cursor.execute("SELECT * FROM listings WHERE id=%s", (listing_id,))
        listing = cursor.fetchone()
        if not listing:
            raise AppError("Listing not found", statuscode=404)
        if listing.get('owner_id') != user['id'] and not is_admin(user):
            raise AppError("Forbidden", statuscode=403)

        data = request.get_json(silent=True) or {}
        updates = []
        values = []

        if 'title' in data or not partial:
            title = clean_string(data.get('title'))
            if not title:
                raise AppError("Field 'title' is required", statuscode=400)
            updates.append('title = %s')
            values.append(title)

        if 'unit' in data or not partial:
            unit = clean_string(data.get('unit'))
            if not unit:
                raise AppError("Field 'unit' is required", statuscode=400)
            updates.append('unit = %s')
            values.append(unit)

        if 'description' in data or not partial:
            description = clean_string(data.get('description'))
            updates.append('description = %s')
            values.append(description)

        if 'image' in data or (not partial and 'image' not in data):
            image = clean_string(data.get('image'))
            updates.append('image = %s')
            values.append(image)

        if 'startingBid' in data or not partial:
            starting_bid = _normalize_decimal(data.get('startingBid'), 'startingBid', allow_null=False, min_value=Decimal('0'))
            updates.append('starting_bid = %s')
            values.append(str(starting_bid))

        if 'currentBid' in data:
            current_bid = _normalize_decimal(data.get('currentBid'), 'currentBid', allow_null=True, min_value=Decimal('0'))
            updates.append('current_bid = %s')
            values.append(str(current_bid) if current_bid is not None else None)

        if 'baseQuantity' in data:
            base_quantity = _normalize_decimal(data.get('baseQuantity'), 'baseQuantity', allow_null=True, min_value=Decimal('0'))
            updates.append('base_quantity = %s')
            values.append(str(base_quantity) if base_quantity is not None else None)

        if 'status' in data:
            status_value = _normalize_status(data.get('status'), required=True)
            if status_value != listing.get('status'):
                if not is_admin(user) and status_value != 'draft':
                    raise AppError("Only admins can change status to published or archived", statuscode=403)
                updates.append('status = %s')
                values.append(status_value)

        if not updates:
            return jsonify(_row_to_listing(listing))

        updates.append('updated_at = CURRENT_TIMESTAMP')

        cursor.close()
        cursor = connection.cursor()
        cursor.execute(
            f"UPDATE listings SET {', '.join(updates)} WHERE id=%s",
            (*values, listing_id),
        )
        connection.commit()

        cursor.close()
        cursor = connection.cursor(dictionary=True)
        cursor.execute("SELECT * FROM listings WHERE id=%s", (listing_id,))
        updated = cursor.fetchone()
    except AppError:
        raise
    except Exception as exception:
        try:
            connection.rollback()
        except Exception:
            pass
        raise DBError("Error updating listing", details=str(exception))
    finally:
        cursor.close()
        connection.close()

    detail_conn = db_connection()
    try:
        row = _fetch_listing_with_meta(detail_conn, listing_id)
        return jsonify(_row_to_listing(row))
    finally:
        detail_conn.close()


@listings_bp.put('/listings/<int:listing_id>')
def put_listing(listing_id: int):
    return _update_listing(listing_id, partial=False)


@listings_bp.patch('/listings/<int:listing_id>')
def patch_listing(listing_id: int):
    return _update_listing(listing_id, partial=True)


@listings_bp.delete('/listings/<int:listing_id>')
def delete_listing(listing_id: int):
    user = _current_user()

    connection = db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        ensure_listings_table(connection)
        ensure_users_table(connection)
        ensure_auctions_tables(connection)
        cursor.execute(
            """
            SELECT l.*, (
                SELECT COUNT(*) FROM auctions a WHERE a.listing_id = l.id
            ) AS auction_count
            FROM listings l WHERE l.id=%s
            """,
            (listing_id,),
        )
        listing = cursor.fetchone()
        if not listing:
            raise AppError("Listing not found", statuscode=404)
        if listing.get('owner_id') != user['id'] and not is_admin(user):
            raise AppError("Forbidden", statuscode=403)
        if int(listing.get('auction_count') or 0) > 0 and not is_admin(user):
            raise AppError("Cannot delete listing with auctions. Archive instead or ask an admin.", statuscode=400)
        cursor.close()
        cursor = connection.cursor()
        cursor.execute("DELETE FROM listings WHERE id=%s", (listing_id,))
        connection.commit()
        return jsonify({"message": "Listing deleted"})
    except AppError:
        raise
    except Exception as exception:
        try:
            connection.rollback()
        except Exception:
            pass
        raise DBError("Error deleting listing", details=str(exception))
    finally:
        cursor.close()
        connection.close()


@listings_bp.post('/listings/<int:listing_id>/auctions')
@require_admin
def create_listing_auction(listing_id: int):
    connection = db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        ensure_listings_table(connection)
        ensure_users_table(connection)
        ensure_auctions_tables(connection)

        cursor.execute("SELECT * FROM listings WHERE id=%s", (listing_id,))
        listing = cursor.fetchone()
        if not listing:
            raise AppError("Listing not found", statuscode=404)

        data = request.get_json(silent=True) or {}
        auction_type = clean_string(data.get('type')) or 'open'
        if auction_type not in ('open', 'closed'):
            raise AppError("Field 'type' must be 'open' or 'closed'", statuscode=400)
        k_value = _normalize_decimal(data.get('k'), 'k', allow_null=False, min_value=Decimal('0'))
        if k_value > Decimal('1'):
            raise AppError("Field 'k' must be between 0 and 1", statuscode=400)

        window_start = clean_string(data.get('windowStart'))
        window_end = clean_string(data.get('windowEnd'))

        admin_user = _current_user()
        if not is_admin(admin_user):
            raise AppError("Forbidden", statuscode=403)

        cursor.close()
        cursor = connection.cursor()
        cursor.execute(
            """
            INSERT INTO auctions (product, type, k_value, window_start, window_end, admin_id, listing_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (
                listing['title'],
                auction_type,
                str(k_value),
                window_start,
                window_end,
                admin_user['id'],
                listing_id,
            ),
        )
        auction_id = cursor.lastrowid

        publish_listing = data.get('publishListing', True)
        if publish_listing and listing.get('status') != 'published':
            cursor.execute(
                "UPDATE listings SET status='published', updated_at=CURRENT_TIMESTAMP WHERE id=%s",
                (listing_id,),
            )

        connection.commit()
        return jsonify({"message": "Auction created", "auctionId": auction_id}), 201
    except AppError:
        raise
    except Exception as exception:
        try:
            connection.rollback()
        except Exception:
            pass
        raise DBError("Error creating auction for listing", details=str(exception))
    finally:
        cursor.close()
        connection.close()