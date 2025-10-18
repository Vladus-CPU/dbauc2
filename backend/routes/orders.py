from flask import Blueprint, jsonify, request
from ..db import db_connection, ensure_orders_table, try_add_owner_columns, ensure_users_table
from ..errors import AppError, DBError, OrderDataError
from ..security import get_auth_user, require_admin
from ..utils import serialize

orders_bp = Blueprint('orders', __name__, url_prefix='/api')

@orders_bp.get('/orders')
def get_orders():
    connection = db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        ensure_orders_table(connection)
        cursor.execute(
            "SELECT id, type, cost, amount, remaining_amount, status, created_at FROM orders WHERE status IN ('open','partial')"
        )
        orders = cursor.fetchall()
        bids = [o for o in orders if o['type'] == 'buy']
        asks = [o for o in orders if o['type'] == 'sell']
        bids = sorted(bids, key=lambda x: (float(x['cost']), x['created_at']), reverse=True)
        asks = sorted(asks, key=lambda x: (float(x['cost']), x['created_at']))
        return jsonify({"bids": bids, "asks": asks}), 200
    except Exception as exception:
        raise DBError("Error fetching orders", details=str(exception))
    finally:
        cursor.close()
        connection.close()

@orders_bp.post('/orders')
def create_order():
    conn_auth = db_connection()
    try:
        ensure_users_table(conn_auth)
        user = get_auth_user(conn_auth)
        if not user:
            raise AppError("Unauthorized", statuscode=401)
        creator_id = user['id']
    finally:
        conn_auth.close()

    data = request.get_json(silent=True) or {}
    order_type = data.get('type')
    cost = data.get('cost')
    amount = data.get('amount')
    if order_type not in ['buy', 'sell']:
        raise OrderDataError("Field 'type' must be 'buy' or 'sell'")
    if not isinstance(cost, (int, float)) or float(cost) <= 0:
        raise OrderDataError("Field 'cost' must be a positive number")
    if not isinstance(amount, (int, float)) or float(amount) <= 0:
        raise OrderDataError("Field 'amount' must be a positive number")
    connection = db_connection()
    cursor = connection.cursor()
    try:
        ensure_orders_table(connection)
        try_add_owner_columns(connection)
        cursor.execute(
            "INSERT INTO orders (type, cost, amount, remaining_amount, status, creator_id) VALUES (%s, %s, %s, %s, %s, %s)",
            (order_type, float(cost), float(amount), float(amount), 'open', creator_id)
        )
        connection.commit()
        new_id = cursor.lastrowid
        return jsonify({"message": "Order created successfully", "id": new_id}), 201
    except Exception as exception:
        try:
            connection.rollback()
        except Exception:
            pass
        raise DBError("Error creating order", details=str(exception))
    finally:
        cursor.close()
        connection.close()

@orders_bp.get('/admin/orders')
@require_admin
def admin_orders():
    conn = db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        ensure_orders_table(conn)
        cur.execute("SELECT * FROM orders ORDER BY created_at DESC")
        return jsonify(serialize(cur.fetchall()))
    finally:
        cur.close()
        conn.close()