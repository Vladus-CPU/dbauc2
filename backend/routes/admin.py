from flask import Blueprint, jsonify
from ..db import db_connection, ensure_users_table
from ..errors import AppError
from ..security import get_auth_user, require_admin
from ..utils import serialize
admin_bp = Blueprint('admin', __name__, url_prefix='/api/admin')

@admin_bp.get('/users')
@require_admin
def admin_users():
    conn = db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute("SELECT id, username, email, is_admin, created_at FROM users ORDER BY created_at DESC")
        return jsonify(serialize(cur.fetchall()))
    finally:
        cur.close()
        conn.close()

@admin_bp.post('/bootstrap')
def admin_bootstrap():
    conn = db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        ensure_users_table(conn)
        user = get_auth_user(conn)
        if not user:
            raise AppError("Unauthorized", statuscode=401)
        cur.execute("SELECT COUNT(*) AS c FROM users WHERE is_admin=1")
        row = cur.fetchone()
        if row and int(row.get('c', 0)) > 0:
            return jsonify({"message": "Admin already exists"}), 200
        cur.close()
        cur = conn.cursor()
        cur.execute("UPDATE users SET is_admin=1 WHERE id=%s", (user['id'],))
        conn.commit()
        return jsonify({"message": "User promoted to admin"}), 200
    finally:
        try:
            cur.close()
        except Exception:
            pass
        conn.close()


@admin_bp.post('/users/<int:user_id>/promote')
@require_admin
def admin_promote(user_id: int):
    conn = db_connection()
    cur = conn.cursor()
    try:
        cur.execute("UPDATE users SET is_admin=1 WHERE id=%s", (user_id,))
        conn.commit()
        return jsonify({"message": "User promoted"}), 200
    finally:
        cur.close()
        conn.close()

@admin_bp.post('/users/<int:user_id>/demote')
@require_admin
def admin_demote(user_id: int):
    conn = db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT COUNT(*) AS c FROM users WHERE is_admin=1")
        row = cur.fetchone()
        count_value = row[0] if isinstance(row, tuple) else row.get('c', 0)
        if int(count_value) <= 1:
            raise AppError("Cannot demote the last admin", statuscode=400)
        cur.execute("UPDATE users SET is_admin=0 WHERE id=%s", (user_id,))
        conn.commit()
        return jsonify({"message": "User demoted"}), 200
    finally:
        cur.close()
        conn.close()
