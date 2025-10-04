import os
from flask import Blueprint, current_app, jsonify, request, send_from_directory
from ..db import (
    open_db,
    make_auctions_tables,
    make_user_profiles,
    make_users_table,
)
from ..errors import AppFail
from ..security import fetch_user
from ..utils import trim_or_none, is_admin_user, to_plain
me_bp = Blueprint('me', __name__, url_prefix='/api/me')

@me_bp.route('/profile', methods=['GET', 'PUT'])
def me_profile():
    conn = open_db()
    cur = conn.cursor(dictionary=True)
    try:
        make_users_table(conn)
        make_user_profiles(conn)
        user = fetch_user(conn)
        if not user:
            raise AppFail("Unauthorized", statuscode=401)
        admin = is_admin_user(user)
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
                params.append(trim_or_none(data[payload_key]))
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
    conn = open_db()
    cur = conn.cursor(dictionary=True)
    try:
        make_users_table(conn)
        user = fetch_user(conn)
        if not user:
            raise AppFail("Unauthorized", statuscode=401)
        make_auctions_tables(conn)
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
                   a.window_end
            FROM auction_participants p
            JOIN auctions a ON a.id = p.auction_id
            WHERE p.trader_id = %s
            ORDER BY a.created_at DESC
            """,
            (user['id'],)
        )
        return jsonify(to_plain(cur.fetchall()))
    finally:
        cur.close()
        conn.close()

@me_bp.get('/auction-orders')
def me_auction_orders():
    conn = open_db()
    cur = conn.cursor(dictionary=True)
    try:
        make_users_table(conn)
        user = fetch_user(conn)
        if not user:
            raise AppFail("Unauthorized", statuscode=401)
        make_auctions_tables(conn)
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
        return jsonify(to_plain(cur.fetchall()))
    finally:
        cur.close()
        conn.close()

@me_bp.get('/documents')
def me_documents():
    conn = open_db()
    try:
        make_users_table(conn)
        user = fetch_user(conn)
        if not user:
            raise AppFail("Unauthorized", statuscode=401)
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
    conn = open_db()
    try:
        make_users_table(conn)
        user = fetch_user(conn)
        if not user:
            raise AppFail("Unauthorized", statuscode=401)
    finally:
        conn.close()

    if f"trader_{user['id']}_" not in filename or '..' in filename or filename.startswith('/') or filename.startswith('\\'):
        raise AppFail("Invalid filename", statuscode=400)
    base_dir = os.path.join(current_app.config['GENERATED_DOCS_ROOT'], f'auction_{auction_id}')
    if not os.path.isdir(base_dir):
        raise AppFail("Not found", statuscode=404)
    return send_from_directory(base_dir, filename, as_attachment=True)
