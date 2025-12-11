import os
from flask import Blueprint, current_app, jsonify, request, send_from_directory
from ..db import (
    db_connection,
    ensure_auctions_tables,
    ensure_trader_inventory,
    ensure_auction_clearing_rounds,
    ensure_resource_transactions,
    ensure_user_profiles,
    ensure_users_table,
)
from ..errors import AppError
from ..security import get_auth_user
from ..utils import clean_string, is_admin, serialize
me_bp = Blueprint('me', __name__, url_prefix='/api/me')

@me_bp.route('/profile', methods=['GET', 'PUT'])
def me_profile():
    conn = db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        ensure_users_table(conn)
        ensure_user_profiles(conn)
        user = get_auth_user(conn)
        if not user:
            raise AppError("Unauthorized", statuscode=401)
        admin = is_admin(user)
        table = 'admins_profile' if admin else 'traders_profile'
        base_columns = ['first_name', 'last_name']
        trader_extra = ['city', 'region', 'country'] if not admin else []
        columns = base_columns + trader_extra
        cur.execute(f"SELECT {', '.join(columns)} FROM {table} WHERE user_id=%s", (user['id'],))
        profile = cur.fetchone()
        if request.method == 'GET':
            if not profile:
                profile = {col: None for col in columns}
            return jsonify({
                "role": 'admin' if admin else 'trader',
                "profile": profile
            })
        if not profile:
            cur.close()
            cur = conn.cursor()
            cur.execute(f"INSERT INTO {table} (user_id) VALUES (%s)", (user['id'],))
            conn.commit()
            cur.close()
            cur = conn.cursor(dictionary=True)
        data = request.get_json(silent=True) or {}
        field_map = {
            'firstName': 'first_name',
            'lastName': 'last_name',
        }
        if not admin:
            field_map.update({
                'city': 'city',
                'region': 'region',
                'country': 'country'
            })

        updates = []
        params = []
        for payload_key, column_name in field_map.items():
            if payload_key in data:
                updates.append(f"{column_name}=%s")
                params.append(clean_string(data[payload_key]))
        if not updates:
            return jsonify({"message": "No changes"})
        cur.close()
        cur = conn.cursor()
        cur.execute(
            f"UPDATE {table} SET {', '.join(updates)} WHERE user_id=%s",
            (*params, user['id'])
        )
        conn.commit()

        cur.close()
        cur = conn.cursor(dictionary=True)
        cur.execute(f"SELECT {', '.join(columns)} FROM {table} WHERE user_id=%s", (user['id'],))
        profile = cur.fetchone()
        return jsonify({"message": "Profile updated", "profile": profile})
    finally:
        cur.close()
        conn.close()

@me_bp.get('/auctions')
def me_auctions():
    conn = db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        ensure_users_table(conn)
        user = get_auth_user(conn)
        if not user:
            raise AppError("Unauthorized", statuscode=401)
        ensure_auctions_tables(conn)
        # Отримуємо аукціони, де користувач є учасником
        cur.execute(
            """
            SELECT p.auction_id,
                   p.status AS participant_status,
                   p.joined_at,
                   a.product,
                   a.status AS auction_status,
                   a.type AS auction_type,
                   a.k_value,
                   a.window_start,
                   a.window_end,
                   a.approval_status,
                   a.approval_note,
                   a.creator_id,
                   CASE WHEN a.creator_id = %s THEN 1 ELSE 0 END AS is_creator
            FROM auction_participants p
            JOIN auctions a ON a.id = p.auction_id
            WHERE p.trader_id = %s
            UNION ALL
            SELECT a.id AS auction_id,
                   NULL AS participant_status,
                   a.created_at AS joined_at,
                   a.product,
                   a.status AS auction_status,
                   a.type AS auction_type,
                   a.k_value,
                   a.window_start,
                   a.window_end,
                   a.approval_status,
                   a.approval_note,
                   a.creator_id,
                   1 AS is_creator
            FROM auctions a
            WHERE a.creator_id = %s
              AND NOT EXISTS (
                SELECT 1 FROM auction_participants p2
                WHERE p2.auction_id = a.id AND p2.trader_id = %s
              )
            ORDER BY joined_at DESC
            """,
            (user['id'], user['id'], user['id'], user['id'])
        )
        rows = cur.fetchall()
        return jsonify(serialize(rows))
    finally:
        cur.close()
        conn.close()

@me_bp.get('/auction-orders')
def me_auction_orders():
    conn = db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        ensure_users_table(conn)
        user = get_auth_user(conn)
        if not user:
            raise AppError("Unauthorized", statuscode=401)
        ensure_auctions_tables(conn)
        cur.execute(
            """
            SELECT o.id, o.auction_id, o.side, o.price, o.quantity, o.status,
                   o.cleared_price, o.cleared_quantity, o.created_at,
                   a.product, a.status AS auction_status, a.type AS auction_type, a.k_value
            FROM auction_orders o
            JOIN auctions a ON a.id = o.auction_id
            WHERE o.trader_id = %s
            ORDER BY o.created_at DESC
            """,
            (user['id'],)
        )
        return jsonify(serialize(cur.fetchall()))
    finally:
        cur.close()
        conn.close()

@me_bp.get('/inventory')
def me_inventory():
    conn = db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        ensure_users_table(conn)
        ensure_trader_inventory(conn)
        user = get_auth_user(conn)
        if not user:
            raise AppError("Unauthorized", statuscode=401)
        cur.execute(
            "SELECT product, quantity, updated_at FROM trader_inventory WHERE trader_id=%s ORDER BY updated_at DESC",
            (user['id'],)
        )
        return jsonify(serialize(cur.fetchall()))
    finally:
        cur.close()
        conn.close()


@me_bp.get('/clearing-insights')
def me_clearing_insights():
    conn = db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        ensure_users_table(conn)
        ensure_auctions_tables(conn)
        ensure_trader_inventory(conn)
        ensure_auction_clearing_rounds(conn)
        ensure_resource_transactions(conn)
        user = get_auth_user(conn)
        if not user:
            raise AppError("Unauthorized", statuscode=401)

        # Поточні позиції
        cur.execute(
            """
            SELECT product, quantity, updated_at
            FROM trader_inventory
            WHERE trader_id=%s
            ORDER BY updated_at DESC
            """,
            (user['id'],)
        )
        positions = serialize(cur.fetchall())

        # Останній кліринговий раунд, в якому був користувач
        cur.execute(
            """
            SELECT acr.auction_id, acr.round_number, acr.clearing_price, acr.clearing_volume,
                   acr.clearing_demand, acr.clearing_supply, acr.cleared_at,
                   a.product, a.type
            FROM auction_clearing_rounds acr
            JOIN auctions a ON a.id = acr.auction_id
            WHERE EXISTS (
              SELECT 1 FROM auction_orders ao
              WHERE ao.auction_id = acr.auction_id
                AND ao.trader_id = %s
                AND ao.status = 'cleared'
                AND (ao.iteration IS NULL OR ao.iteration = acr.round_number)
            )
            ORDER BY acr.cleared_at DESC
            LIMIT 1
            """,
            (user['id'],)
        )
        last_round = cur.fetchone()

        # Останні виконані ордери користувача
        cur.execute(
            """
            SELECT ao.id, ao.auction_id, ao.side, ao.cleared_price, ao.cleared_quantity,
                   ao.iteration, a.product,
                   COALESCE(acr.cleared_at, ao.created_at) AS cleared_at
            FROM auction_orders ao
            JOIN auctions a ON a.id = ao.auction_id
            LEFT JOIN auction_clearing_rounds acr
              ON acr.auction_id = ao.auction_id
             AND (ao.iteration IS NOT NULL AND acr.round_number = ao.iteration)
            WHERE ao.trader_id = %s AND ao.status = 'cleared'
            ORDER BY COALESCE(acr.cleared_at, ao.created_at) DESC
            LIMIT 10
            """,
            (user['id'],)
        )
        recent_fills = serialize(cur.fetchall())

        # Зміни інвентарю після клірингу
        cur.execute(
            """
            SELECT id, type, quantity, occurred_at, notes
            FROM resource_transactions
            WHERE trader_id = %s
            ORDER BY occurred_at DESC
            LIMIT 10
            """,
            (user['id'],)
        )
        inventory_events = serialize(cur.fetchall())

        total_qty = sum(
            (float(p['quantity']) if p.get('quantity') is not None else 0)
            for p in positions
        )
        summary = {
            "positions": len(positions),
            "totalQuantity": total_qty,
            "lastClearingAt": last_round['cleared_at'].isoformat() if last_round and last_round.get('cleared_at') else None,
        }

        return jsonify({
            "summary": summary,
            "lastRound": serialize(last_round) if last_round else None,
            "recentFills": recent_fills,
            "inventoryEvents": inventory_events,
            "positions": positions,
        })
    finally:
        cur.close()
        conn.close()

@me_bp.get('/documents')
def me_documents():
    conn = db_connection()
    try:
        ensure_users_table(conn)
        user = get_auth_user(conn)
        if not user:
            raise AppError("Unauthorized", statuscode=401)
    finally:
        conn.close()
    base_root = current_app.config['GENERATED_DOCS_ROOT']
    out = []
    if not os.path.isdir(base_root):
        return jsonify(out)
    uid = user['id']
    for name in os.listdir(base_root):
        if not name.startswith('auction_'):
            continue
        try:
            aid = int(name.split('_', 1)[1])
        except Exception:
            continue
        folder = os.path.join(base_root, name)
        if not os.path.isdir(folder):
            continue
        for file_name in os.listdir(folder):
            if f"trader_{uid}_" in file_name:
                out.append({"auction_id": aid, "filename": file_name})
    return jsonify(sorted(out, key=lambda x: (x['auction_id'], x['filename'])))

@me_bp.get('/documents/<int:auction_id>/<path:filename>')
def me_document_download(auction_id: int, filename: str):
    conn = db_connection()
    try:
        ensure_users_table(conn)
        user = get_auth_user(conn)
        if not user:
            raise AppError("Unauthorized", statuscode=401)
    finally:
        conn.close()

    if f"trader_{user['id']}_" not in filename or '..' in filename or filename.startswith('/') or filename.startswith('\\'):
        raise AppError("Invalid filename", statuscode=400)
    base_dir = os.path.join(current_app.config['GENERATED_DOCS_ROOT'], f'auction_{auction_id}')
    if not os.path.isdir(base_dir):
        raise AppError("Not found", statuscode=404)
    return send_from_directory(base_dir, filename, as_attachment=True)
