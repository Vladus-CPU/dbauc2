from decimal import Decimal
from typing import Dict, Optional

DECIMAL_QUANT = Decimal('0.000001')

def _normalize_decimal(value: Optional[Decimal]) -> Optional[Decimal]:
    if value is None:
        return None
    if not isinstance(value, Decimal):
        value = Decimal(str(value))
    return value.quantize(DECIMAL_QUANT)

def _aggregate_levels(orders, reverse: bool = False):
    buckets: Dict[Decimal, Dict[str, Decimal | int]] = {}
    for order in orders:
        price = order['price']
        if price not in buckets:
            buckets[price] = {"quantity": Decimal('0'), "orders": 0}
        buckets[price]["quantity"] += order['quantity']
        buckets[price]["orders"] += 1
    sorted_prices = sorted(buckets.keys(), reverse=reverse)
    running = Decimal('0')
    depth = []
    for price in sorted_prices:
        entry = buckets[price]
        running += entry['quantity']
        depth.append({
            "price": float(price),
            "totalQuantity": float(entry['quantity']),
            "orderCount": int(entry['orders']),
            "cumulativeQuantity": float(running)
        })
    return depth

def _serialize_orders(rows):
    out = []
    for row in rows:
        out.append({
            "id": row['id'],
            "side": row['side'],
            "price": float(row['price']),
            "quantity": float(row['quantity']),
            "traderId": row['trader_id'],
            "createdAt": row['created_at'].isoformat() if row['created_at'] else None
        })
    return out
