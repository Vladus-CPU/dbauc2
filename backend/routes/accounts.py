from flask import Blueprint, jsonify, request
from ..db import db_connection, ensure_auctions_tables, ensure_users_table
from ..errors import AppError, DBError
from ..security import get_auth_user
from ..utils import is_trader
accounts_bp = Blueprint('accounts', __name__, url_prefix='/api/accounts')

@accounts_bp.get('/')
def list_accounts():
    conn = db_connection()
    cur = None
    try:
        ensure_users_table(conn)
        user = get_auth_user(conn)
        if not user:
            raise AppError("Unauthorized", statuscode=401)
        cur = conn.cursor(dictionary=True)
        ensure_auctions_tables(conn)
        cur.execute(
            "SELECT id, account_number, added_at FROM trader_accounts WHERE trader_id=%s ORDER BY added_at DESC",
            (user['id'],)
        )
        rows = cur.fetchall()
        return jsonify(rows)
    finally:
        if cur is not None:
            try:
                cur.close()
            except Exception:
                pass
        conn.close()

@accounts_bp.post('/')
def add_account():
    conn = db_connection()
    cur = None
    try:
        ensure_users_table(conn)
        user = get_auth_user(conn)
        if not user or not is_trader(user):
            raise AppError("Unauthorized", statuscode=401)
        data = request.get_json(silent=True) or {}
        acct = (data.get('accountNumber') or '').strip()
        if not acct:
            raise AppError("Field 'accountNumber' is required", statuscode=400)
        cur = conn.cursor()
        ensure_auctions_tables(conn)
        cur.execute(
            "INSERT INTO trader_accounts (trader_id, account_number) VALUES (%s,%s)",
            (user['id'], acct)
        )
        conn.commit()
        return jsonify({"message": "Account added", "id": cur.lastrowid}), 201
    except AppError:
        raise
    except Exception as exception:
        try:
            conn.rollback()
        except Exception:
            pass
        raise DBError("Error adding account", details=str(exception))
    finally:
        if cur:
            cur.close()
        conn.close()
