import json
from decimal import Decimal
from typing import Optional, Tuple
from ..errors import AppError, OrderDataError
from ..db import ensure_wallet_tables

def _ensure_wallet_row(conn, user_id: int):
    ensure_wallet_tables(conn)
    cur = conn.cursor()
    try:
        cur.execute(
            "INSERT INTO wallet_accounts (user_id) VALUES (%s) ON DUPLICATE KEY UPDATE user_id=user_id",
            (user_id,)
        )
    finally:
        cur.close()

def _get_balances(conn, user_id: int) -> Tuple[Decimal, Decimal]:
    cur = conn.cursor()
    try:
        cur.execute("SELECT available, reserved FROM wallet_accounts WHERE user_id=%s", (user_id,))
        row = cur.fetchone()
        if not row:
            return Decimal('0'), Decimal('0')
        return Decimal(str(row[0])), Decimal(str(row[1]))
    finally:
        cur.close()

def _log_tx(conn, user_id: int, tx_type: str, amount: Decimal, available: Decimal, meta: Optional[dict]):
    cur = conn.cursor()
    try:
        cur.execute(
            "INSERT INTO wallet_transactions (user_id, type, amount, balance_after, meta) VALUES (%s,%s,%s,%s,%s)",
            (user_id, tx_type, str(amount), str(available), json.dumps(meta, ensure_ascii=False) if meta else None)
        )
        return cur.lastrowid
    finally:
        cur.close()

def wallet_deposit(conn, user_id: int, amount: Decimal, meta: Optional[dict] = None):
    if amount <= 0:
        raise OrderDataError("Deposit amount must be positive")
    _ensure_wallet_row(conn, user_id)
    cur = conn.cursor()
    try:
        cur.execute("UPDATE wallet_accounts SET available = available + %s WHERE user_id=%s", (str(amount), user_id))
    finally:
        cur.close()
    available, reserved = _get_balances(conn, user_id)
    tx_id = _log_tx(conn, user_id, 'deposit', amount, available, meta)
    return {'available': available, 'reserved': reserved, 'txId': tx_id}

def wallet_withdraw(conn, user_id: int, amount: Decimal, meta: Optional[dict] = None):
    if amount <= 0:
        raise OrderDataError("Withdraw amount must be positive")
    _ensure_wallet_row(conn, user_id)
    available, reserved = _get_balances(conn, user_id)
    if available < amount:
        raise AppError("Insufficient balance", statuscode=400)
    cur = conn.cursor()
    try:
        cur.execute("UPDATE wallet_accounts SET available = available - %s WHERE user_id=%s", (str(amount), user_id))
    finally:
        cur.close()
    available -= amount
    tx_id = _log_tx(conn, user_id, 'withdraw', -amount, available, meta)
    return {'available': available, 'reserved': reserved, 'txId': tx_id}

def wallet_reserve(conn, user_id: int, amount: Decimal, meta: Optional[dict] = None):
    if amount <= 0:
        raise OrderDataError("Reserve amount must be positive")
    _ensure_wallet_row(conn, user_id)
    available, reserved = _get_balances(conn, user_id)
    if available < amount:
        raise AppError("Insufficient balance", statuscode=400)
    cur = conn.cursor()
    try:
        cur.execute(
            "UPDATE wallet_accounts SET available = available - %s, reserved = reserved + %s WHERE user_id=%s",
            (str(amount), str(amount), user_id)
        )
    finally:
        cur.close()
    available -= amount
    reserved += amount
    tx_id = _log_tx(conn, user_id, 'reserve', -amount, available, meta)
    return {'available': available, 'reserved': reserved, 'txId': tx_id}

def wallet_release(conn, user_id: int, amount: Decimal, meta: Optional[dict] = None):
    if amount <= 0:
        balances = wallet_balance(conn, user_id)
        return {'available': balances['available'], 'reserved': balances['reserved']}
    _ensure_wallet_row(conn, user_id)
    available, reserved = _get_balances(conn, user_id)
    if reserved < amount:
        amount = reserved
    cur = conn.cursor()
    try:
        cur.execute(
            "UPDATE wallet_accounts SET available = available + %s, reserved = reserved - %s WHERE user_id=%s",
            (str(amount), str(amount), user_id)
        )
    finally:
        cur.close()
    available += amount
    reserved -= amount
    tx_id = _log_tx(conn, user_id, 'release', amount, available, meta)
    return {'available': available, 'reserved': reserved, 'txId': tx_id}

def wallet_spend(conn, user_id: int, amount: Decimal, meta: Optional[dict] = None):
    if amount <= 0:
        balances = wallet_balance(conn, user_id)
        return {'available': balances['available'], 'reserved': balances['reserved']}
    _ensure_wallet_row(conn, user_id)
    available, reserved = _get_balances(conn, user_id)
    if reserved < amount:
        raise AppError("Insufficient reserved funds", statuscode=400)
    cur = conn.cursor()
    try:
        cur.execute(
            "UPDATE wallet_accounts SET reserved = reserved - %s WHERE user_id=%s",
            (str(amount), user_id)
        )
    finally:
        cur.close()
    reserved -= amount
    tx_id = _log_tx(conn, user_id, 'spend', -amount, available, meta)
    return {'available': available, 'reserved': reserved, 'txId': tx_id}

def wallet_balance(conn, user_id: int):
    _ensure_wallet_row(conn, user_id)
    available, reserved = _get_balances(conn, user_id)
    return {'available': available, 'reserved': reserved, 'total': available + reserved}

__all__ = [
    'wallet_deposit',
    'wallet_withdraw',
    'wallet_reserve',
    'wallet_release',
    'wallet_spend',
    'wallet_balance',
]