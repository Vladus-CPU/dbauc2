import datetime
import os
from functools import wraps
import jwt
from flask import request, g
from .errors import AppFail
from .db import open_db, make_users_table

JWT_SECRET = os.environ.get('JWT_SECRET', 'dev_secret_change_me')
JWT_ALGO = 'HS256'
JWT_TTL_MIN = int(os.environ.get('JWT_TTL_MIN', '60'))


def make_token(user):
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


def read_token(token):
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except Exception as e:
        raise AppFail("Invalid or expired token", statuscode=401, details=str(e))


def fetch_user(connection):
    auth = request.headers.get('Authorization', '')
    if not auth.startswith('Bearer '):
        return None
    token = auth.split(' ', 1)[1].strip()
    try:
        data = read_token(token)
    except AppFail:
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


def need_login(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        conn = open_db()
        try:
            make_users_table(conn)
            user = fetch_user(conn)
            if not user:
                raise AppFail("Unauthorized", statuscode=401)
            return f(*args, **kwargs)
        finally:
            conn.close()
    return wrapper


def need_admin(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        conn = open_db()
        try:
            make_users_table(conn)
            user = fetch_user(conn)
            if not user or int(user.get('is_admin', 0)) != 1:
                raise AppFail("Forbidden", statuscode=403)
            return f(*args, **kwargs)
        finally:
            conn.close()
    return wrapper

__all__ = ['make_token', 'read_token', 'fetch_user', 'need_login', 'need_admin', 'JWT_SECRET', 'JWT_ALGO', 'JWT_TTL_MIN']
