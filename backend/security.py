import datetime
import os
from functools import wraps
import jwt
from flask import request, g
from .errors import AppError
from .db import db_connection, ensure_users_table

JWT_SECRET = os.environ.get('JWT_SECRET', 'dev_secret_change_me')
JWT_ALGO = 'HS256'
JWT_TTL_MIN = int(os.environ.get('JWT_TTL_MIN', '60'))


def create_token(user):
    now = datetime.datetime.now(datetime.timezone.utc)
    exp = now + datetime.timedelta(minutes=JWT_TTL_MIN)
    payload = {
        'sub': str(user['id']),
        'username': user['username'],
        'is_admin': int(user.get('is_admin', 0)),
        'iat': int(now.timestamp()),
        'exp': int(exp.timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def decode_token(token):
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except Exception as e:
        raise AppError("Invalid or expired token", statuscode=401, details=str(e))


def get_auth_user(connection):
    auth = request.headers.get('Authorization', '')
    if not auth.startswith('Bearer '):
        return None
    token = auth.split(' ', 1)[1].strip()
    try:
        data = decode_token(token)
    except AppError:
        return None
    user_id = data.get('sub')
    try:
        user_id_int = int(user_id)
    except (ValueError, TypeError):
        return None
    cur = connection.cursor(dictionary=True)
    try:
        cur.execute("SELECT id, username, email, is_admin, created_at FROM users WHERE id=%s", (user_id_int,))
        user = cur.fetchone()
        g.user = user
        return user
    finally:
        cur.close()


def require_auth(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        conn = db_connection()
        try:
            ensure_users_table(conn)
            user = get_auth_user(conn)
            if not user:
                raise AppError("Unauthorized", statuscode=401)
            return f(*args, **kwargs)
        finally:
            conn.close()
    return wrapper


def require_admin(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        conn = db_connection()
        try:
            ensure_users_table(conn)
            user = get_auth_user(conn)
            if not user or int(user.get('is_admin', 0)) != 1:
                raise AppError("Forbidden", statuscode=403)
            return f(*args, **kwargs)
        finally:
            conn.close()
    return wrapper


__all__ = ['create_token', 'decode_token', 'get_auth_user', 'require_auth', 'require_admin', 'JWT_SECRET', 'JWT_ALGO', 'JWT_TTL_MIN']
