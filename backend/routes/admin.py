import json
from decimal import Decimal
from flask import Blueprint, jsonify, request
from ..db import db_connection, ensure_users_table, ensure_wallet_tables
from ..errors import AppError, OrderDataError
from ..security import get_auth_user, require_admin
from ..services.wallet import (
    wallet_balance,
    wallet_deposit,
    wallet_release,
    wallet_reserve,
    wallet_spend,
    wallet_withdraw,
)
from ..utils import serialize, to_decimal

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

def _ensure_target_user(cur, user_id: int):
    cur.execute("SELECT id, username, email, is_admin FROM users WHERE id=%s", (user_id,))
    user = cur.fetchone()
    if not user:
        raise AppError("User not found", statuscode=404)
    return user

def _admin_actor_meta(admin_user, note: str | None = None):
    meta = {
        "actor": "admin",
        "adminId": admin_user.get('id') if isinstance(admin_user, dict) else None,
        "adminUsername": admin_user.get('username') if isinstance(admin_user, dict) else None,
    }
    if note:
        meta['note'] = note
    return meta

def _parse_amount(payload):
    if 'amount' not in payload:
        raise OrderDataError("Field 'amount' is required")
    amount = to_decimal(payload.get('amount'))
    if amount <= Decimal('0'):
        raise OrderDataError("Amount must be positive")
    return amount

@admin_bp.get('/wallet')
@require_admin
def admin_wallet_overview():
    conn = db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        ensure_users_table(conn)
        ensure_wallet_tables(conn)
        cur.execute(
            """
            SELECT u.id, u.username, u.email, u.is_admin,
                   COALESCE(w.available, 0) AS available,
                   COALESCE(w.reserved, 0) AS reserved,
                   COALESCE(w.updated_at, NULL) AS updated_at
            FROM users u
            LEFT JOIN wallet_accounts w ON w.user_id = u.id
            ORDER BY u.username ASC
            """
        )
        rows = cur.fetchall()
        total_available = Decimal('0')
        total_reserved = Decimal('0')
        for row in rows:
            total_available += Decimal(str(row.get('available') or 0))
            total_reserved += Decimal(str(row.get('reserved') or 0))
        return jsonify({
            "users": serialize(rows),
            "totals": {
                "available": float(total_available),
                "reserved": float(total_reserved),
                "total": float(total_available + total_reserved),
            }
        })
    finally:
        cur.close()
        conn.close()

@admin_bp.get('/wallet/<int:user_id>/transactions')
@require_admin
def admin_wallet_transactions(user_id: int):
    limit_param = request.args.get('limit')
    limit = 100
    try:
        if limit_param is not None:
            limit = int(limit_param)
    except (TypeError, ValueError):
        limit = 100
    limit = max(1, min(300, limit))
    conn = db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        ensure_users_table(conn)
        ensure_wallet_tables(conn)
        _ensure_target_user(cur, user_id)
        cur.execute(
            """
            SELECT id, type, amount, balance_after, meta, created_at
            FROM wallet_transactions
            WHERE user_id=%s
            ORDER BY created_at DESC
            LIMIT %s
            """,
            (user_id, limit)
        )
        rows = cur.fetchall()
        transactions = []
        for row in rows:
            meta = None
            raw_meta = row.get('meta')
            if raw_meta:
                try:
                    meta = json.loads(raw_meta)
                except Exception:
                    meta = raw_meta
            transactions.append({
                "id": row['id'],
                "type": row['type'],
                "amount": float(row['amount']),
                "balanceAfter": float(row['balance_after']),
                "meta": meta,
                "createdAt": row['created_at'].isoformat() if row['created_at'] else None,
            })
        return jsonify(transactions)
    finally:
        cur.close()
        conn.close()

@admin_bp.post('/wallet/<int:user_id>/actions')
@require_admin
def admin_wallet_actions(user_id: int):
    data = request.get_json(silent=True) or {}
    action = (data.get('action') or '').strip().lower()
    if action not in {'deposit', 'withdraw', 'reserve', 'release', 'spend'}:
        raise OrderDataError("Unsupported wallet action")
    amount = _parse_amount(data)
    note = data.get('note')
    conn = db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        ensure_users_table(conn)
        ensure_wallet_tables(conn)
        target_user = _ensure_target_user(cur, user_id)
        admin_user = get_auth_user(conn)
        if not admin_user:
            raise AppError("Unauthorized", statuscode=401)
        meta = _admin_actor_meta(admin_user, note)
        meta['targetUsername'] = target_user.get('username')
        try:
            if action == 'deposit':
                result = wallet_deposit(conn, user_id, amount, meta)
            elif action == 'withdraw':
                result = wallet_withdraw(conn, user_id, amount, meta)
            elif action == 'reserve':
                result = wallet_reserve(conn, user_id, amount, meta)
            elif action == 'release':
                result = wallet_release(conn, user_id, amount, meta)
            else:
                result = wallet_spend(conn, user_id, amount, meta)
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        balances = wallet_balance(conn, user_id)
        return jsonify({
            "message": "Wallet updated",
            "action": action,
            "balances": {
                "available": float(balances['available']),
                "reserved": float(balances['reserved']),
                "total": float(balances['total']),
            },
            "txId": result.get('txId') if isinstance(result, dict) else None,
        }), 200
    finally:
        cur.close()
        conn.close()
