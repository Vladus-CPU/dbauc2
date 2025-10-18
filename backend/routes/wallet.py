import json
from decimal import Decimal
from typing import Optional
from flask import Blueprint, jsonify, request
from ..db import db_connection, ensure_users_table, ensure_wallet_tables
from ..errors import AppError, OrderDataError
from ..security import get_auth_user
from ..services.wallet import (
    wallet_balance,
    wallet_deposit,
    wallet_withdraw,
)

wallet_bp = Blueprint('wallet', __name__, url_prefix='/api/me/wallet')

def get_amount(payload: dict, key: str = 'amount') -> Decimal:
    value = payload.get(key)
    try:
        return Decimal(str(value))
    except Exception:
        raise OrderDataError(f"Field '{key}' must be a numeric value")

def current_user():
    conn = db_connection()
    try:
        ensure_users_table(conn)
        user = get_auth_user(conn)
        if not user:
            raise AppError("Unauthorized", statuscode=401)
        return user
    finally:
        conn.close()


@wallet_bp.get('/')
def get_balance():
    user = current_user()
    conn = db_connection()
    try:
        balances = wallet_balance(conn, user['id'])
        return jsonify({
            "available": float(balances['available']),
            "reserved": float(balances['reserved']),
            "total": float(balances['total'])
        })
    finally:
        conn.close()


@wallet_bp.get('/transactions')
def list_transactions():
    user = current_user()
    limit_param = request.args.get('limit')
    limit = 50
    try:
        if limit_param is not None:
            limit = int(limit_param)
    except (TypeError, ValueError):
        limit = 50
    limit = max(1, min(200, limit))
    conn = db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        ensure_wallet_tables(conn)
        cur.execute(
            "SELECT id, type, amount, balance_after, meta, created_at FROM wallet_transactions "
            "WHERE user_id=%s ORDER BY created_at DESC LIMIT %s",
            (user['id'], limit)
        )
        rows = cur.fetchall()
        transactions = []
        for row in rows:
            meta = None
            if row.get('meta'):
                try:
                    meta = json.loads(row['meta'])
                except Exception:
                    meta = row['meta']
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

@wallet_bp.post('/deposit')
def deposit():
    user = current_user()
    data = request.get_json(silent=True) or {}
    amount = get_amount(data)
    conn = db_connection()
    try:
        result = wallet_deposit(conn, user['id'], amount, meta={"source": "manual"})
        conn.commit()
        return jsonify({
            "available": float(result['available']),
            "reserved": float(result['reserved']),
            "txId": result['txId']
        }), 201
    finally:
        conn.close()

@wallet_bp.post('/withdraw')
def withdraw():
    user = current_user()
    data = request.get_json(silent=True) or {}
    amount = get_amount(data)
    conn = db_connection()
    try:
        result = wallet_withdraw(conn, user['id'], amount, meta={"source": "manual"})
        conn.commit()
        return jsonify({
            "available": float(result['available']),
            "reserved": float(result['reserved']),
            "txId": result['txId']
        }), 200
    finally:
        conn.close()
