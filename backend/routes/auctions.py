import datetime
import os
from decimal import Decimal
from typing import Dict, List
from flask import Blueprint, current_app, g, jsonify, request, send_from_directory
from ..db import (
    db_connection,
    ensure_auctions_tables,
    ensure_listings_table,
    ensure_users_table,
)
from ..errors import AppError, DBError, OrderDataError
from ..security import get_auth_user, require_admin
from ..services.auction import compute_call_market_clearing
from ..services.wallet import add_money, unlock_money, lock_money, spend_locked
from ..utils import is_admin, is_trader, serialize, to_decimal

auctions_bp = Blueprint('auctions', __name__, url_prefix='/api')

DECIMAL_QUANT = Decimal('0.000001')


def _aggregate_levels(orders, reverse=False):
    buckets: Dict[Decimal, Dict[str, Decimal | int]] = {}
    for order in orders:
        price = order['price']
        if price not in buckets:
            buckets[price] = {"quantity": Decimal('0'), "orders": 0}
        buckets[price]["quantity"] += order['quantity']
        buckets[price]["orders"] += 1
    sorted_prices = sorted(buckets.keys(), reverse=reverse)
    running = Decimal('0')
    depth = []
    for price in sorted_prices:
        entry = buckets[price]
        running += entry['quantity']
        depth.append({
            "price": float(price),
            "totalQuantity": float(entry['quantity']),
            "orderCount": int(entry['orders']),
            "cumulativeQuantity": float(running)
        })
    return depth


def _serialize_orders(rows):
    out = []
    for row in rows:
        out.append({
            "id": row['id'],
            "side": row['side'],
            "price": float(row['price']),
            "quantity": float(row['quantity']),
            "traderId": row['trader_id'],
            "createdAt": row['created_at'].isoformat() if row['created_at'] else None
        })
    return out

@auctions_bp.get('/auctions')
def list_auctions():
    conn = db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        ensure_auctions_tables(conn)
        status = request.args.get('status')
        auction_type = request.args.get('type')
        where = []
        params: List = []
        if status in ('collecting', 'cleared', 'closed'):
            where.append('status = %s')
            params.append(status)
        if auction_type in ('open', 'closed'):
            where.append('type = %s')
            params.append(auction_type)
        sql = 'SELECT * FROM auctions'
        if where:
            sql += ' WHERE ' + ' AND '.join(where)
        sql += ' ORDER BY created_at DESC'
        cur.execute(sql, tuple(params))
        return jsonify(serialize(cur.fetchall()))
    finally:
        cur.close()
        conn.close()


@auctions_bp.get('/auctions/<int:auction_id>/book')
def auction_order_book(auction_id: int):
    conn = db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        ensure_auctions_tables(conn)
        cur.execute(
            "SELECT id, product, type, status, k_value, window_start, window_end, created_at, closed_at "
            "FROM auctions WHERE id=%s",
            (auction_id,)
        )
        auction = cur.fetchone()
        if not auction:
            raise AppError("Auction not found", statuscode=404)

        cur.execute(
            "SELECT id, trader_id, side, price, quantity, created_at "
            "FROM auction_orders WHERE auction_id=%s AND status='open'",
            (auction_id,)
        )
        open_rows = cur.fetchall()
        bid_orders = []
        ask_orders = []
        for row in open_rows:
            price = to_decimal(row['price'])
            quantity = to_decimal(row['quantity'])
            order = {
                'id': row['id'],
                'trader_id': row['trader_id'],
                'side': row['side'],
                'price': price,
                'quantity': quantity,
                'created_at': row['created_at']
            }
            if row['side'] == 'bid':
                bid_orders.append(order)
            else:
                ask_orders.append(order)

        bid_levels = _aggregate_levels(sorted(bid_orders, key=lambda o: (o['price'], o['created_at']), reverse=True), reverse=True)
        ask_levels = _aggregate_levels(sorted(ask_orders, key=lambda o: (o['price'], o['created_at'])), reverse=False)

        total_bid_qty = sum((order['quantity'] for order in bid_orders), Decimal('0'))
        total_ask_qty = sum((order['quantity'] for order in ask_orders), Decimal('0'))
        best_bid_dec = max((order['price'] for order in bid_orders), default=None)
        best_ask_dec = min((order['price'] for order in ask_orders), default=None)
        best_bid = float(best_bid_dec) if best_bid_dec is not None else None
        best_ask = float(best_ask_dec) if best_ask_dec is not None else None
        spread = None
        if best_bid_dec is not None and best_ask_dec is not None:
            spread = float((best_ask_dec - best_bid_dec).quantize(DECIMAL_QUANT))

        cur.execute(
            "SELECT id, trader_id, side, price, quantity, created_at, cleared_price, cleared_quantity "
            "FROM auction_orders WHERE auction_id=%s AND status='cleared' AND cleared_quantity IS NOT NULL "
            "AND cleared_quantity > 0 ORDER BY created_at DESC LIMIT 20",
            (auction_id,)
        )
        cleared_rows = cur.fetchall()
        cleared_entries = []
        for row in cleared_rows:
            cleared_entries.append({
                "id": row['id'],
                "side": row['side'],
                "price": float(to_decimal(row['cleared_price'] or row['price'])),
                "quantity": float(to_decimal(row['cleared_quantity'])),
                "createdAt": row['created_at'].isoformat() if row['created_at'] else None
            })

        metrics = {
            "bestBid": best_bid,
            "bestAsk": best_ask,
            "spread": spread,
            "totalBidQuantity": float(total_bid_qty),
            "totalAskQuantity": float(total_ask_qty),
            "bidOrderCount": len(bid_orders),
            "askOrderCount": len(ask_orders),
            "lastClearingPrice": cleared_entries[0]['price'] if cleared_entries else None,
            "lastClearingQuantity": cleared_entries[0]['quantity'] if cleared_entries else None,
        }

        recent_bid_orders = sorted(bid_orders, key=lambda o: (o['price'], o['created_at']), reverse=True)[:10]
        recent_ask_orders = sorted(ask_orders, key=lambda o: (o['price'], o['created_at']))[:10]

        response = {
            "auction": serialize(auction),
            "book": {
                "bids": bid_levels,
                "asks": ask_levels
            },
            "metrics": metrics,
            "recentOrders": {
                "bids": _serialize_orders(recent_bid_orders),
                "asks": _serialize_orders(recent_ask_orders)
            },
            "recentClearing": cleared_entries
        }
        return jsonify(response)
    finally:
        cur.close()
        conn.close()

@auctions_bp.post('/admin/auctions')
@require_admin
def create_auction():
    user = g.get('user')
    if not user or not is_admin(user):
        raise AppError("Forbidden", statuscode=403)

    data = request.get_json(silent=True) or {}
    product = (data.get('product') or '').strip()
    auction_type = (data.get('type') or 'open').strip()
    k_value = data.get('k')
    window_start = data.get('windowStart')
    window_end = data.get('windowEnd')

    raw_listing_id = data.get('listingId')
    listing_id_value = None
    if raw_listing_id is not None:
        try:
            listing_id_value = int(raw_listing_id)
        except (TypeError, ValueError):
            raise OrderDataError("Field 'listingId' must be an integer")

    def parse_dt(value):
        if not value:
            return None
        try:
            return datetime.datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        except Exception:
            raise OrderDataError("Invalid datetime format (use ISO 8601)")

    window_start_dt = parse_dt(window_start)
    window_end_dt = parse_dt(window_end)

    listing_row = None
    conn = db_connection()
    try:
        ensure_auctions_tables(conn)
        if listing_id_value is not None:
            ensure_listings_table(conn)
            listing_cur = conn.cursor(dictionary=True)
            try:
                listing_cur.execute("SELECT id, title, status FROM listings WHERE id=%s", (listing_id_value,))
                listing_row = listing_cur.fetchone()
            finally:
                listing_cur.close()
            if not listing_row:
                raise OrderDataError("Listing not found")
            if not product:
                product = (listing_row.get('title') or '').strip()

        if not product:
            raise OrderDataError("Field 'product' is required")
        if auction_type not in ('open', 'closed'):
            raise OrderDataError("Field 'type' must be 'open' or 'closed'")
        try:
            k_dec = to_decimal(k_value)
        except OrderDataError:
            raise OrderDataError("Field 'k' must be a number between 0 and 1")
        if k_dec < Decimal('0') or k_dec > Decimal('1'):
            raise OrderDataError("Field 'k' must be between 0 and 1")

        insert_cur = conn.cursor()
        try:
            insert_cur.execute(
                "INSERT INTO auctions (product, type, k_value, window_start, window_end, admin_id, listing_id) VALUES (%s,%s,%s,%s,%s,%s,%s)",
                (product, auction_type, str(k_dec), window_start_dt, window_end_dt, user['id'], listing_id_value)
            )
            auction_id = insert_cur.lastrowid
        finally:
            insert_cur.close()

        publish_listing = data.get('publishListing', True)
        if publish_listing and listing_id_value is not None and listing_row and listing_row.get('status') != 'published':
            update_cur = conn.cursor()
            try:
                update_cur.execute(
                    "UPDATE listings SET status='published', updated_at=CURRENT_TIMESTAMP WHERE id=%s",
                    (listing_id_value,)
                )
            finally:
                update_cur.close()

        conn.commit()
        return jsonify({"message": "Auction created", "id": auction_id}), 201
    except AppError:
        raise
    except Exception as exception:
        try:
            conn.rollback()
        except Exception:
            pass
        raise DBError("Error creating auction", details=str(exception))
    finally:
        conn.close()

@auctions_bp.patch('/admin/auctions/<int:auction_id>/close')
@require_admin
def close_auction(auction_id: int):
    conn = db_connection()
    cur = conn.cursor()
    try:
        ensure_auctions_tables(conn)
        cur.execute(
            "UPDATE auctions SET status='closed', closed_at=%s WHERE id=%s",
            (datetime.datetime.utcnow(), auction_id)
        )
        conn.commit()
        return jsonify({"message": "Auction closed"})
    finally:
        cur.close()
        conn.close()

@auctions_bp.post('/auctions/<int:auction_id>/join')
def join_auction(auction_id: int):
    conn = db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        ensure_users_table(conn)
        ensure_auctions_tables(conn)
        user = get_auth_user(conn)
        if not user or not is_trader(user):
            raise AppError("Unauthorized", statuscode=401)
        cur.execute("SELECT id, type, status FROM auctions WHERE id=%s", (auction_id,))
        auction = cur.fetchone()
        if not auction:
            raise AppError("Auction not found", statuscode=404)
        if auction['status'] != 'collecting':
            raise AppError("Auction is not accepting participants", statuscode=400)
        data = request.get_json(silent=True) or {}
        account_id = data.get('accountId')
        account_id_value = None
        if account_id is not None:
            try:
                account_id_value = int(account_id)
            except (TypeError, ValueError):
                raise AppError("Invalid accountId", statuscode=400)
            cur.execute(
                "SELECT id FROM trader_accounts WHERE id=%s AND trader_id=%s",
                (account_id_value, user['id'])
            )
            if not cur.fetchone():
                raise AppError("Invalid accountId for this trader", statuscode=400)
        status = 'approved' if auction['type'] == 'open' else 'pending'
        cur.close()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO auction_participants (auction_id, trader_id, account_id, status) VALUES (%s,%s,%s,%s)"
            " ON DUPLICATE KEY UPDATE account_id=VALUES(account_id), status=VALUES(status)",
            (auction_id, user['id'], account_id_value, status)
        )
        conn.commit()
        message = "Join request submitted" if status == 'pending' else "Joined auction"
        return jsonify({"message": message, "status": status}), 201
    except Exception as exception:
        current_app.logger.exception("Error joining auction %s", auction_id)
        try:
            conn.rollback()
        except Exception:
            pass
        raise DBError("Error joining auction", details=str(exception))
    finally:
        try:
            cur.close()
        except Exception:
            pass
        conn.close()

@auctions_bp.get('/admin/auctions/<int:auction_id>/participants')
@require_admin
def list_participants_admin(auction_id: int):
    conn = db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        ensure_auctions_tables(conn)
        cur.execute(
            "SELECT * FROM auction_participants WHERE auction_id=%s ORDER BY joined_at DESC",
            (auction_id,)
        )
        return jsonify(serialize(cur.fetchall()))
    finally:
        cur.close()
        conn.close()

@auctions_bp.patch('/admin/auctions/<int:auction_id>/participants/<int:participant_id>/approve')
@require_admin
def approve_participant(auction_id: int, participant_id: int):
    conn = db_connection()
    cur = conn.cursor()
    try:
        ensure_auctions_tables(conn)
        cur.execute(
            "UPDATE auction_participants SET status='approved' WHERE id=%s AND auction_id=%s",
            (participant_id, auction_id)
        )
        if cur.rowcount == 0:
            raise AppError("Participant not found", statuscode=404)
        conn.commit()
        return jsonify({"message": "Participant approved"})
    finally:
        cur.close()
        conn.close()

@auctions_bp.post('/auctions/<int:auction_id>/orders')
def place_auction_order(auction_id: int):
    conn = db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        ensure_users_table(conn)
        ensure_auctions_tables(conn)
        user = get_auth_user(conn)
        if not user or not is_trader(user):
            raise AppError("Unauthorized", statuscode=401)
        cur.execute("SELECT id, type, status, window_start, window_end FROM auctions WHERE id=%s", (auction_id,))
        auction = cur.fetchone()
        if not auction:
            raise AppError("Auction not found", statuscode=404)
        if auction['status'] != 'collecting':
            raise AppError("Auction is not collecting orders", statuscode=400)
        now = datetime.datetime.utcnow()
        if auction['window_start'] and now < auction['window_start']:
            raise AppError("Auction window has not started", statuscode=400)
        if auction['window_end'] and now > auction['window_end']:
            raise AppError("Auction window has ended", statuscode=400)
        if auction['type'] == 'closed':
            cur.execute(
                "SELECT status FROM auction_participants WHERE auction_id=%s AND trader_id=%s",
                (auction_id, user['id'])
            )
            participant = cur.fetchone()
            if not participant or participant['status'] != 'approved':
                raise AppError("Not approved to participate in this auction", statuscode=403)
        data = request.get_json(silent=True) or {}
        side = (data.get('type') or data.get('side') or '').strip()
        if side not in ('bid', 'ask'):
            raise OrderDataError("Field 'type' (or 'side') must be 'bid' or 'ask'")
        try:
            price = to_decimal(data.get('price'))
            quantity = to_decimal(data.get('quantity'))
        except OrderDataError:
            raise OrderDataError("Fields 'price' and 'quantity' must be valid positive numbers")
        if price <= 0 or quantity <= 0:
            raise OrderDataError("'price' and 'quantity' must be positive")
        reserve_amount: Decimal | None = None
        reserve_tx_id: int | None = None
        if side == 'bid':
            reserve_amount = (price * quantity).quantize(DECIMAL_QUANT)
            reserve_meta = {
                "auctionId": auction_id,
                "orderSide": side,
                "price": str(price),
                "quantity": str(quantity)
            }
            reserve_result = lock_money(conn, user['id'], reserve_amount, meta=reserve_meta)
            reserve_tx_id = reserve_result['txId']
        cur.close()
        cur = conn.cursor()
        columns = ["auction_id", "trader_id", "side", "price", "quantity"]
        values = [auction_id, user['id'], side, str(price), str(quantity)]
        if reserve_amount is not None:
            columns.extend(["reserved_amount", "reserve_tx_id"])
            values.extend([str(reserve_amount), reserve_tx_id])
        placeholders = ','.join(['%s'] * len(values))
        cur.execute(
            f"INSERT INTO auction_orders ({', '.join(columns)}) VALUES ({placeholders})",
            tuple(values)
        )
        conn.commit()
        response = {
            "message": "Order placed",
            "id": cur.lastrowid
        }
        if reserve_amount is not None:
            response["reservedAmount"] = float(reserve_amount)
        return jsonify(response), 201
    except AppError as error:
        try:
            conn.rollback()
        except Exception:
            pass
        raise error
    except Exception as exception:
        try:
            conn.rollback()
        except Exception:
            pass
        raise DBError("Error placing order", details=str(exception))
    finally:
        try:
            cur.close()
        except Exception:
            pass
        conn.close()

@auctions_bp.get('/admin/auctions/<int:auction_id>/orders')
@require_admin
def list_auction_orders_admin(auction_id: int):
    conn = db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        ensure_auctions_tables(conn)
        cur.execute(
            "SELECT id, trader_id, side, price, quantity, created_at, status FROM auction_orders WHERE auction_id=%s ORDER BY created_at ASC",
            (auction_id,)
        )
        return jsonify(serialize(cur.fetchall()))
    finally:
        cur.close()
        conn.close()

def _generate_trade_document(auction_id: int, role: str, trader_id: int, amount: Decimal, price: Decimal) -> str:
    base_dir = os.path.join(current_app.config['GENERATED_DOCS_ROOT'], f'auction_{auction_id}')
    os.makedirs(base_dir, exist_ok=True)
    timestamp = datetime.datetime.utcnow().isoformat() + 'Z'
    filename = f"auction_{auction_id}_{role}_trader_{trader_id}_{int(datetime.datetime.utcnow().timestamp())}.txt"
    path = os.path.join(base_dir, filename)
    with open(path, 'w', encoding='utf-8') as file_handle:
        file_handle.write("Підтвердження угоди\n")
        file_handle.write(f"Аукціон: {auction_id}\n")
        file_handle.write(f"Роль: {role}\n")
        file_handle.write(f"ID Торговця: {trader_id}\n")
        file_handle.write(f"Кількість: {amount}\n")
        file_handle.write(f"Ціна: {price}\n")
        file_handle.write(f"Час: {timestamp}\n")
    return path

@auctions_bp.post('/admin/auctions/<int:auction_id>/clear')
@require_admin
def clear_auction(auction_id: int):
    conn = db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        ensure_auctions_tables(conn)
        cur.execute("SELECT id, k_value, status FROM auctions WHERE id=%s", (auction_id,))
        auction = cur.fetchone()
        if not auction:
            raise AppError("Auction not found", statuscode=404)
        if auction['status'] != 'collecting':
            raise AppError("Auction not in collecting state", statuscode=400)
        admin_user = g.get('user')
        if auction.get('admin_id') and admin_user and auction['admin_id'] != admin_user['id']:
            raise AppError("Auction assigned to different administrator", statuscode=403)
        cur.execute(
            "SELECT id, trader_id, side, price, quantity, created_at, reserved_amount, reserve_tx_id "
            "FROM auction_orders WHERE auction_id=%s AND status='open'",
            (auction_id,)
        )
        raw_orders = cur.fetchall()
        if not raw_orders:
            cur.close()
            cur = conn.cursor()
            cur.execute(
                "UPDATE auctions SET status='cleared', closed_at=%s, admin_id=COALESCE(admin_id,%s) WHERE id=%s",
                (datetime.datetime.utcnow(), admin_user['id'] if admin_user else None, auction_id)
            )
            conn.commit()
            return jsonify({
                "message": "No orders to clear",
                "price": None,
                "volume": 0,
                "allocations": [],
                "demand": 0,
                "supply": 0,
                "priceInterval": None
            })
        orders: List[Dict] = []
        for row in raw_orders:
            orders.append({
                'id': row['id'],
                'trader_id': row['trader_id'],
                'side': row['side'],
                'price': to_decimal(row['price']),
                'quantity': to_decimal(row['quantity']),
                'created_at': row['created_at'],
            })
        clearing = compute_call_market_clearing(orders)
        price = clearing['price']
        allocations = clearing['allocations']
        volume = clearing.get('volume', Decimal('0'))
        if volume <= Decimal('0') or not allocations:
            cur.close()
            cur = conn.cursor()
            cur.execute(
                "UPDATE auctions SET status='cleared', closed_at=%s, admin_id=COALESCE(admin_id,%s) WHERE id=%s",
                (datetime.datetime.utcnow(), admin_user['id'] if admin_user else None, auction_id)
            )
            conn.commit()
            return jsonify({
                "message": "No trades cleared",
                "price": None,
                "volume": 0,
                "allocations": [],
                "demand": float(clearing.get('demand', Decimal('0'))),
                "supply": float(clearing.get('supply', Decimal('0'))),
                "priceInterval": None
            })
        allocation_map = {item['order_id']: item['cleared_qty'] for item in allocations}
        cur.close()
        cur = conn.cursor()
        for row in raw_orders:
            cleared_qty = allocation_map.get(row['id'], Decimal('0'))
            cleared_qty = cleared_qty.quantize(DECIMAL_QUANT)
            allocation_map[row['id']] = cleared_qty
            status = 'cleared' if cleared_qty > Decimal('0') else 'rejected'
            cur.execute(
                "UPDATE auction_orders SET status=%s, cleared_price=%s, cleared_quantity=%s WHERE id=%s",
                (status, str(price), str(cleared_qty), row['id'])
            )
        cur.execute(
            "UPDATE auctions SET status='cleared', closed_at=%s, admin_id=COALESCE(admin_id,%s) WHERE id=%s",
            (datetime.datetime.utcnow(), admin_user['id'] if admin_user else None, auction_id)
        )
        for row in raw_orders:
            cleared_qty = allocation_map.get(row['id'], Decimal('0'))
            order_meta = {
                "auctionId": auction_id,
                "orderId": row['id'],
                "side": row['side']
            }
            if row.get('reserve_tx_id') is not None:
                order_meta["reserveTxId"] = row['reserve_tx_id']
            if row['side'] == 'bid':
                order_price = to_decimal(row['price'])
                order_quantity = to_decimal(row['quantity'])
                reserved_total = to_decimal(row['reserved_amount']) if row['reserved_amount'] is not None else (order_price * order_quantity)
                reserved_total = reserved_total.quantize(DECIMAL_QUANT)
                cleared_qty_quant = to_decimal(cleared_qty)
                spent = (price * cleared_qty_quant).quantize(DECIMAL_QUANT)
                if spent > Decimal('0'):
                    spend_locked(conn, row['trader_id'], spent, meta=dict(order_meta, action='settle'))
                remaining = reserved_total - spent
                if remaining < Decimal('0'):
                    remaining = Decimal('0')
                if remaining > Decimal('0'):
                    unlock_money(conn, row['trader_id'], remaining, meta=dict(order_meta, action='release'))
            elif row['side'] == 'ask' and cleared_qty > Decimal('0'):
                cleared_qty_quant = to_decimal(cleared_qty)
                proceeds = (price * cleared_qty_quant).quantize(DECIMAL_QUANT)
                if proceeds > Decimal('0'):
                    add_money(conn, row['trader_id'], proceeds, meta=dict(order_meta, action='credit'))
        conn.commit()
        for row in raw_orders:
            cleared_qty = allocation_map.get(row['id'], Decimal('0'))
            if cleared_qty > 0:
                role = 'покупець' if row['side'] == 'bid' else 'продавець'
                _generate_trade_document(auction_id, role, row['trader_id'], cleared_qty, price)
        return jsonify({
            "message": "Auction cleared",
            "price": float(price),
            "volume": float(volume),
            "demand": float(clearing.get('demand', Decimal('0'))),
            "supply": float(clearing.get('supply', Decimal('0'))),
            "priceInterval": [
                float(clearing['price_interval'][0]) if clearing['price_interval'][0] is not None else None,
                float(clearing['price_interval'][1]) if clearing['price_interval'][1] is not None else None,
            ],
            "allocations": [
                {"orderId": order_id, "quantity": float(quantity)}
                for order_id, quantity in allocation_map.items()
            ]
        })
    except AppError as error:
        try:
            conn.rollback()
        except Exception:
            pass
        raise error
    except Exception as exception:
        try:
            conn.rollback()
        except Exception:
            pass
        raise DBError("Error clearing auction", details=str(exception))
    finally:
        try:
            cur.close()
        except Exception:
            pass
        conn.close()

@auctions_bp.get('/auctions/<int:auction_id>/participants/me')
def my_participation_status(auction_id: int):
    conn = db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        ensure_users_table(conn)
        ensure_auctions_tables(conn)
        user = get_auth_user(conn)
        if not user:
            raise AppError("Unauthorized", statuscode=401)
        cur.execute(
            "SELECT auction_id, trader_id, account_id, status FROM auction_participants WHERE auction_id=%s AND trader_id=%s",
            (auction_id, user['id'])
        )
        row = cur.fetchone()
        return jsonify(row or {"status": None, "account_id": None})
    finally:
        cur.close()
        conn.close()

@auctions_bp.get('/admin/auctions/<int:auction_id>/documents')
@require_admin
def list_auction_documents(auction_id: int):
    base_dir = os.path.join(current_app.config['GENERATED_DOCS_ROOT'], f'auction_{auction_id}')
    if not os.path.isdir(base_dir):
        return jsonify([])
    files = [file_name for file_name in os.listdir(base_dir) if os.path.isfile(os.path.join(base_dir, file_name))]
    return jsonify(files)

@auctions_bp.get('/admin/auctions/<int:auction_id>/documents/<path:filename>')
@require_admin
def download_auction_document(auction_id: int, filename: str):
    if '..' in filename or filename.startswith('/') or filename.startswith('\\'):
        raise AppError("Invalid filename", statuscode=400)
    base_dir = os.path.join(current_app.config['GENERATED_DOCS_ROOT'], f'auction_{auction_id}')
    if not os.path.isdir(base_dir):
        raise AppError("Not found", statuscode=404)
    return send_from_directory(base_dir, filename, as_attachment=True)