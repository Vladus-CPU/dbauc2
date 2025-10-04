import json
from decimal import Decimal
from typing import Optional, Tuple
from ..errors import AppError, OrderDataError
from ..db import ensure_wallet_tables

def make_wallet_if_missing(conn, user_id: int):
    """Create wallet row if it does not exist (student style helper)."""
    ensure_wallet_tables(conn)
    cur = conn.cursor()
    try:
        cur.execute(
            "INSERT INTO wallet_accounts (user_id) VALUES (%s) ON DUPLICATE KEY UPDATE user_id=user_id",
            (user_id,)
        )
    finally:
        cur.close()

def fetch_balances(conn, user_id: int) -> Tuple[Decimal, Decimal]:
    """Get current available + reserved balances."""
    cur = conn.cursor()
    try:
        cur.execute("SELECT available, reserved FROM wallet_accounts WHERE user_id=%s", (user_id,))
        row = cur.fetchone()
        if not row:
            return Decimal('0'), Decimal('0')
        return Decimal(str(row[0])), Decimal(str(row[1]))
    finally:
        cur.close()

def write_tx_row(conn, user_id: int, tx_type: str, amount: Decimal, available: Decimal, meta: Optional[dict]):
    """Persist a transaction row and return its id."""
    cur = conn.cursor()
    try:
        cur.execute(
            "INSERT INTO wallet_transactions (user_id, type, amount, balance_after, meta) VALUES (%s,%s,%s,%s,%s)",
            (user_id, tx_type, str(amount), str(available), json.dumps(meta, ensure_ascii=False) if meta else None)
        )
        return cur.lastrowid
    finally:
        cur.close()

def add_money(conn, user_id: int, amount: Decimal, meta: Optional[dict] = None):
    if amount <= 0:
        raise OrderDataError("Deposit amount must be positive")
    make_wallet_if_missing(conn, user_id)
    cur = conn.cursor()
    try:
        cur.execute("UPDATE wallet_accounts SET available = available + %s WHERE user_id=%s", (str(amount), user_id))
    finally:
        cur.close()
    available, reserved = fetch_balances(conn, user_id)
    tx_id = write_tx_row(conn, user_id, 'deposit', amount, available, meta)
    return {'available': available, 'reserved': reserved, 'txId': tx_id}

def take_money(conn, user_id: int, amount: Decimal, meta: Optional[dict] = None):
    if amount <= 0:
        raise OrderDataError("Withdraw amount must be positive")
    make_wallet_if_missing(conn, user_id)
    available, reserved = fetch_balances(conn, user_id)
    if available < amount:
        raise AppError("Insufficient balance", statuscode=400)
    cur = conn.cursor()
    try:
        cur.execute("UPDATE wallet_accounts SET available = available - %s WHERE user_id=%s", (str(amount), user_id))
    finally:
        cur.close()
    available -= amount
    tx_id = write_tx_row(conn, user_id, 'withdraw', -amount, available, meta)
    return {'available': available, 'reserved': reserved, 'txId': tx_id}

def lock_money(conn, user_id: int, amount: Decimal, meta: Optional[dict] = None):
    if amount <= 0:
        raise OrderDataError("Reserve amount must be positive")
    make_wallet_if_missing(conn, user_id)
    available, reserved = fetch_balances(conn, user_id)
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
    tx_id = write_tx_row(conn, user_id, 'reserve', -amount, available, meta)
    return {'available': available, 'reserved': reserved, 'txId': tx_id}

def unlock_money(conn, user_id: int, amount: Decimal, meta: Optional[dict] = None):
    if amount <= 0:
        balances = get_wallet_stats(conn, user_id)
        return {'available': balances['available'], 'reserved': balances['reserved']}
    make_wallet_if_missing(conn, user_id)
    available, reserved = fetch_balances(conn, user_id)
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
    tx_id = write_tx_row(conn, user_id, 'release', amount, available, meta)
    return {'available': available, 'reserved': reserved, 'txId': tx_id}

def spend_locked(conn, user_id: int, amount: Decimal, meta: Optional[dict] = None):
    if amount <= 0:
        balances = get_wallet_stats(conn, user_id)
        return {'available': balances['available'], 'reserved': balances['reserved']}
    make_wallet_if_missing(conn, user_id)
    available, reserved = fetch_balances(conn, user_id)
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
    tx_id = write_tx_row(conn, user_id, 'spend', -amount, available, meta)
    return {'available': available, 'reserved': reserved, 'txId': tx_id}

def get_wallet_stats(conn, user_id: int):
    make_wallet_if_missing(conn, user_id)
    available, reserved = fetch_balances(conn, user_id)
    return {'available': available, 'reserved': reserved, 'total': available + reserved}

__all__ = [
    'add_money',
    'take_money',
    'lock_money',
    'unlock_money',
    'spend_locked',
    'get_wallet_stats',
]