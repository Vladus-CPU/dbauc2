import datetime
import hashlib
import hmac
import os
from decimal import Decimal
from typing import Optional, Tuple
from flask import current_app
from ..security import JWT_SECRET
from .aucutils import DECIMAL_QUANT, _normalize_decimal

def _record_clearing_state(
    cur,
    auction_id: int,
    admin_user,
    *,
    price: Optional[Decimal],
    quantity: Optional[Decimal],
    demand: Optional[Decimal],
    supply: Optional[Decimal],
    price_interval: Optional[Tuple[Optional[Decimal], Optional[Decimal]]] ) -> None:
    admin_id_value = None
    if isinstance(admin_user, dict):
        admin_id_value = admin_user.get('id')
    low, high = (None, None)
    if price_interval:
        low, high = price_interval
    cur.execute(
        """
        UPDATE auctions
        SET status='cleared',
            closed_at=%s,
            admin_id=COALESCE(admin_id,%s),
            clearing_price=%s,
            clearing_quantity=%s,
            clearing_demand=%s,
            clearing_supply=%s,
            clearing_price_low=%s,
            clearing_price_high=%s
        WHERE id=%s
        """,
        (
            datetime.datetime.utcnow(),
            admin_id_value,
            _normalize_decimal(price),
            _normalize_decimal(quantity),
            _normalize_decimal(demand),
            _normalize_decimal(supply),
            _normalize_decimal(low),
            _normalize_decimal(high),
            auction_id
        )
    )

def _generate_trade_document(
    auction_id: int,
    role: str,
    trader_id: int,
    amount: Decimal,
    price: Decimal,
    product: str,) -> str:
    base_dir = os.path.join(current_app.config['GENERATED_DOCS_ROOT'], f'auction_{auction_id}')
    os.makedirs(base_dir, exist_ok=True)
    now = datetime.datetime.utcnow()
    timestamp_iso = now.isoformat() + 'Z'
    epoch_ts = int(now.timestamp())
    filename = f"auction_{auction_id}_{role}_trader_{trader_id}_{epoch_ts}.txt"
    path = os.path.join(base_dir, filename)
    op_type = 'Покупка' if role.strip().lower() == 'покупець' else 'Продаж'
    try:
        amt = amount if isinstance(amount, Decimal) else Decimal(str(amount))
    except Exception:
        amt = Decimal('0')
    try:
        prc = price if isinstance(price, Decimal) else Decimal(str(price))
    except Exception:
        prc = Decimal('0')
    total_cost = (prc * amt).quantize(DECIMAL_QUANT)
    payload = f"{auction_id}|{trader_id}|{op_type}|{product}|{str(prc)}|{str(amt)}|{timestamp_iso}"
    try:
        key_bytes = (JWT_SECRET or 'local_dev_secret').encode('utf-8')
    except Exception:
        key_bytes = b'local_dev_secret'
    signature = hmac.new(key_bytes, payload.encode('utf-8'), hashlib.sha256).hexdigest()
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write("=== ПІДТВЕРДЖЕННЯ УГОДИ ===\n")
        fh.write(f"Аукціон: {product}\n")
        fh.write(f"Тип операції: {op_type}\n")
        fh.write(f"Трейдер ID: {trader_id}\n")
        fh.write(f"Дата угоди: {timestamp_iso}\n")
        fh.write("\n")
        fh.write("Деталі угоди:\n")
        fh.write(f"- Продукт: {product}\n")
        fh.write(f"- Ціна: {str(prc)}\n")
        fh.write(f"- Кількість: {str(amt)}\n")
        fh.write(f"- Загальна вартість: {str(total_cost)}\n")
        fh.write("\n")
        fh.write(f"Підпис системи: {signature}\n")
    return path

def _record_inventory_movement(conn, trader_id: int, product: str, delta_qty: Decimal,
    *, auction_id: int, order_id: int) -> None:
    if delta_qty is None:
        return
    try:
        if isinstance(delta_qty, (int, float)):
            delta_value = Decimal(str(delta_qty))
        else:
            delta_value = Decimal(delta_qty)
    except Exception:
        delta_value = Decimal('0')
    if delta_value == Decimal('0'):
        return
    inv_cur = conn.cursor()
    try:
        inv_cur.execute(
            """
            INSERT INTO trader_inventory (trader_id, product, quantity)
            VALUES (%s,%s,%s)
            ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity), updated_at = CURRENT_TIMESTAMP
            """,
            (trader_id, product, str(delta_value))
        )
    finally:
        inv_cur.close()
    if delta_value < 0:
        check_cur = conn.cursor(dictionary=True)
        try:
            check_cur.execute(
                "SELECT quantity FROM trader_inventory WHERE trader_id=%s AND product=%s",
                (trader_id, product)
            )
            row = check_cur.fetchone()
        finally:
            check_cur.close()
        if row:
            try:
                current_qty = Decimal(str(row['quantity']))
            except Exception:
                current_qty = Decimal('0')
            if current_qty <= Decimal('0'):
                cleanup_cur = conn.cursor()
                try:
                    cleanup_cur.execute(
                        "DELETE FROM trader_inventory WHERE trader_id=%s AND product=%s",
                        (trader_id, product)
                    )
                finally:
                    cleanup_cur.close()
    notes = f"Auction #{auction_id}, order #{order_id}, product {product}"
    res_cur = conn.cursor()
    try:
        res_cur.execute(
            "INSERT INTO resource_transactions (trader_id, type, quantity, notes) VALUES (%s,%s,%s,%s)",
            (
                trader_id,
                'inventory_add' if delta_value > 0 else 'inventory_remove',
                str(abs(delta_value)),
                notes
            )
        )
    finally:
        res_cur.close()
