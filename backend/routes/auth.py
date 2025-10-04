from flask import Blueprint, jsonify, request
from passlib.hash import bcrypt
from ..db import db_connection, ensure_users_table, ensure_user_profiles
from ..errors import AppError, DBError
from ..security import create_token, get_auth_user
auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')

@auth_bp.post('/register')
def register():
    conn = db_connection()
    ensure_users_table(conn)
    ensure_user_profiles(conn)
    data = request.get_json(silent=True) or {}
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''
    email = (data.get('email') or '').strip() or None
    first_name = (data.get('firstName') or '').strip()
    last_name = (data.get('lastName') or '').strip()
    city = (data.get('city') or '').strip() or None
    region = (data.get('region') or '').strip() or None
    country = (data.get('country') or '').strip() or None
    if not username or not password:
        raise AppError("Username and password required", statuscode=400)
    if not first_name or not last_name:
        raise AppError("Profile fields required: firstName, lastName", statuscode=400)
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute("SELECT id FROM users WHERE username=%s", (username,))
        if cur.fetchone():
            return jsonify({"error": "Username already exists"}), 409
        pwd_hash = bcrypt.hash(password)
        cur.close()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO users (username, email, password_hash, is_admin) VALUES (%s, %s, %s, %s)",
            (username, email, pwd_hash, 0)
        )
        user_id = cur.lastrowid
        cur.close()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO traders_profile (user_id, first_name, last_name, city, region, country) "
            "VALUES (%s,%s,%s,%s,%s,%s)"
            " ON DUPLICATE KEY UPDATE first_name=VALUES(first_name), last_name=VALUES(last_name), "
            "city=VALUES(city), region=VALUES(region), country=VALUES(country)",
            (user_id, first_name, last_name, city, region, country)
        )
        conn.commit()
        return jsonify({"message": "Registered"}), 201
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        raise DBError("Error registering user", details=str(e))
    finally:
        cur.close()
        conn.close()

@auth_bp.post('/login')
def login():
    conn = db_connection()
    ensure_users_table(conn)
    data = request.get_json(silent=True) or {}
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''
    if not username or not password:
        raise AppError("Username and password required", statuscode=400)
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute("SELECT id, username, email, password_hash, is_admin, created_at FROM users WHERE username=%s", (username,))
        user = cur.fetchone()
        if not user or not bcrypt.verify(password, user['password_hash']):
            return jsonify({"error": "Invalid credentials"}), 401
        token = create_token(user)
        return jsonify({
            "token": token,
            "user": {
                "id": user['id'],
                "username": user['username'],
                "email": user['email'],
                "is_admin": int(user['is_admin']),
                "created_at": user['created_at'].isoformat() if user['created_at'] else None,
            }
        })
    finally:
        cur.close()
        conn.close()

@auth_bp.get('/me')
def me():
    conn = db_connection()
    try:
        ensure_users_table(conn)
        user = get_auth_user(conn)
        if not user:
            return jsonify({"authenticated": False}), 200
        return jsonify({"authenticated": True, "user": user})
    finally:
        conn.close()