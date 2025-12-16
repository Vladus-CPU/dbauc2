from flask import Blueprint, jsonify, request
from passlib.hash import pbkdf2_sha256
try:
    from passlib.hash import bcrypt as bcrypt_hash
except Exception:
    bcrypt_hash = None
def _hash_password(password: str) -> str:
    """Hash password using pbkdf2_sha256 (pure Python, no native deps)."""
    return pbkdf2_sha256.hash(password)


def _verify_password(password: str, stored_hash: str) -> bool:
    """Verify password; support pbkdf2 first, fallback to bcrypt if present."""
    # Primary: pbkdf2
    try:
        if stored_hash.startswith("$pbkdf2-sha256$") and pbkdf2_sha256.verify(password, stored_hash):
            return True
    except Exception:
        pass
    # Fallback: bcrypt hashes created раніше, якщо модуль доступний
    if bcrypt_hash and stored_hash.startswith("$2"):
        try:
            return bcrypt_hash.verify(password, stored_hash)
        except Exception:
            pass
    # Generic attempt pbkdf2 (covers hashes без prefix, якщо такі є)
    try:
        return pbkdf2_sha256.verify(password, stored_hash)
    except Exception:
        return False

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
        pwd_hash = _hash_password(password)
        cur.execute(
            "INSERT INTO users (username, email, password_hash, is_admin) VALUES (%s, %s, %s, %s)",
            (username, email, pwd_hash, 0)
        )
        user_id = cur.lastrowid
        cur.execute(
            "INSERT INTO traders_profile (user_id, first_name, last_name, city, region, country) "
            "VALUES (%s, %s, %s, %s, %s, %s)",
            (user_id, first_name, last_name, city, region, country)
        )
        conn.commit()
        return jsonify({"message": "Registered"}), 201
    except Exception as e:
        conn.rollback()
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
        if not user or not _verify_password(password, user['password_hash']):
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
