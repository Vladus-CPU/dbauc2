from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, List, Tuple
from ..errors import BadOrderData

def to_decimal(n) -> Decimal:
    try:
        if isinstance(n, Decimal):
            return n
        return Decimal(str(n))
    except Exception:
        raise BadOrderData("Invalid numeric value")

DECIMAL_QUANT = Decimal('0.000001')

def _sort_key_bid(order: Dict[str, Any]) -> Tuple[Decimal, Any]:
    created_at = order.get('created_at')
    return (-order['price'], created_at)

def _sort_key_ask(order: Dict[str, Any]) -> Tuple[Decimal, Any]:
    created_at = order.get('created_at')
    return (order['price'], created_at)

def compute_call_market_clearing(orders: List[Dict]) -> Dict[str, Any]:
    bids = [
        {
            **o,
            'price': to_decimal(o['price']),
            'quantity': to_decimal(o['quantity'])
        }
        for o in orders
        if o['side'] == 'bid'
    ]
    asks = [
        {
            **o,
            'price': to_decimal(o['price']),
            'quantity': to_decimal(o['quantity'])
        }
        for o in orders
        if o['side'] == 'ask'
    ]
    if not bids or not asks:
        return {
            "price": Decimal('0'),
            "volume": Decimal('0'),
            "allocations": [],
            "demand": Decimal('0'),
            "supply": Decimal('0'),
            "price_interval": (None, None),
        }
    bids.sort(key=_sort_key_bid)
    asks.sort(key=_sort_key_ask)
    price_levels = sorted({*(b['price'] for b in bids), *(a['price'] for a in asks)})
    cumulative: List[Tuple[Decimal, Decimal, Decimal]] = []
    for price_level in price_levels:
        demand = sum(b['quantity'] for b in bids if b['price'] >= price_level)
        supply = sum(a['quantity'] for a in asks if a['price'] <= price_level)
        cumulative.append((price_level, demand, supply))
    candidate = next(
        (
            (px, demand, supply)
            for (px, demand, supply) in cumulative
            if demand > 0 and supply > 0 and demand <= supply
        ),
        None
    )
    if candidate is None:
        candidate = max(
            ((px, demand, supply) for (px, demand, supply) in cumulative if min(demand, supply) > 0),
            default=None,
            key=lambda item: (min(item[1], item[2]), -float(item[0]))
        )
    if candidate is None:
        return {
            "price": Decimal('0'),
            "volume": Decimal('0'),
            "allocations": [],
            "demand": Decimal('0'),
            "supply": Decimal('0'),
            "price_interval": (None, None),
        }
    clearing_price_hint, demand_at_price, supply_at_price = candidate
    trade_volume = min(demand_at_price, supply_at_price)
    if trade_volume <= 0:
        return {
            "price": Decimal('0'),
            "volume": Decimal('0'),
            "allocations": [],
            "demand": demand_at_price,
            "supply": supply_at_price,
            "price_interval": (None, None),
        }
    eligible_bids = [b for b in bids if b['price'] >= clearing_price_hint]
    eligible_asks = [a for a in asks if a['price'] <= clearing_price_hint]
    bid_allocs: List[Dict[str, Any]] = []
    remaining = trade_volume
    for index, order in enumerate(eligible_bids):
        if remaining <= 0:
            break
        fill = order['quantity'] if order['quantity'] <= remaining else remaining
        if index == len(eligible_bids) - 1:
            fill = remaining
        if fill > 0:
            bid_allocs.append({
                "order_id": order['id'],
                "cleared_qty": fill,
                "side": 'bid'
            })
            remaining -= fill
    if remaining > 0:
        for alloc in bid_allocs:
            if remaining <= 0:
                break
            alloc['cleared_qty'] += remaining
            remaining = Decimal('0')
    ask_allocs: List[Dict[str, Any]] = []
    remaining = trade_volume
    for index, order in enumerate(eligible_asks):
        if remaining <= 0:
            break
        fill = order['quantity'] if order['quantity'] <= remaining else remaining
        if index == len(eligible_asks) - 1:
            fill = remaining
        if fill > 0:
            ask_allocs.append({
                "order_id": order['id'],
                "cleared_qty": fill,
                "side": 'ask'
            })
            remaining -= fill
    if remaining > 0:
        for alloc in ask_allocs:
            if remaining <= 0:
                break
            alloc['cleared_qty'] += remaining
            remaining = Decimal('0')
    executed_bid_prices = [next(b['price'] for b in eligible_bids if b['id'] == alloc['order_id']) for alloc in bid_allocs]
    executed_ask_prices = [next(a['price'] for a in eligible_asks if a['id'] == alloc['order_id']) for alloc in ask_allocs]
    highest_winning_bid = max(executed_bid_prices) if executed_bid_prices else None
    lowest_winning_ask = min(executed_ask_prices) if executed_ask_prices else None
    executed_ids = {alloc['order_id'] for alloc in bid_allocs}.union({alloc['order_id'] for alloc in ask_allocs})
    losing_bid_price = max((o['price'] for o in bids if o['id'] not in executed_ids), default=None)
    losing_ask_price = min((o['price'] for o in asks if o['id'] not in executed_ids), default=None)
    lower_candidates = [clearing_price_hint]
    upper_candidates = [clearing_price_hint]
    if lowest_winning_ask is not None:
        lower_candidates.append(lowest_winning_ask)
    if losing_bid_price is not None:
        lower_candidates.append(losing_bid_price)
    if highest_winning_bid is not None:
        upper_candidates.append(highest_winning_bid)
    if losing_ask_price is not None:
        upper_candidates.append(losing_ask_price)
    lower_bound = max(lower_candidates)
    upper_bound = min(upper_candidates)
    if lower_bound > upper_bound:
        lower_bound = min(lower_candidates)
        upper_bound = max(upper_candidates)
    clearing_price = ((lower_bound + upper_bound) / Decimal('2')).quantize(DECIMAL_QUANT, rounding=ROUND_HALF_UP)
    allocations = []
    allocations.extend(bid_allocs)
    allocations.extend(ask_allocs)
    return {
        "price": clearing_price,
        "volume": trade_volume,
        "allocations": allocations,
        "demand": demand_at_price,
        "supply": supply_at_price,
        "price_interval": (lower_bound, upper_bound),
    }

def compute_k_double_clearing(orders: List[Dict], k: Decimal) -> Tuple[Decimal, List[Dict]]:
    bids = [o for o in orders if o['side'] == 'bid']
    asks = [o for o in orders if o['side'] == 'ask']
    bids.sort(key=lambda x: (x['price'], x['created_at']), reverse=True)
    asks.sort(key=lambda x: (x['price'], x['created_at']))
    bid_levels = []
    ask_levels = []
    last_price = None
    for b in bids:
        if last_price is None or b['price'] != last_price:
            bid_levels.append((b['price'], Decimal('0')))
            last_price = b['price']
        bid_levels[-1] = (bid_levels[-1][0], bid_levels[-1][1] + b['quantity'])
    last_price = None
    for a in asks:
        if last_price is None or a['price'] != last_price:
            ask_levels.append((a['price'], Decimal('0')))
            last_price = a['price']
        ask_levels[-1] = (ask_levels[-1][0], ask_levels[-1][1] + a['quantity'])
    prices = sorted({*[p for p, _ in bid_levels], *[p for p, _ in ask_levels]})
    def cum_demand_at(px: Decimal) -> Decimal:
        return sum(q for p, q in bid_levels if p >= px)
    def cum_supply_at(px: Decimal) -> Decimal:
        return sum(q for p, q in ask_levels if p <= px)
    max_qty = Decimal('0')
    p_star = None
    for px in prices:
        d = cum_demand_at(px)
        s = cum_supply_at(px)
        traded = min(d, s)
        if traded > max_qty and any(b['price'] >= px for b in bids) and any(a['price'] <= px for a in asks):
            max_qty = traded
            p_star = px
    if max_qty == 0 or p_star is None:
        return (Decimal('0'), [])
    b_m_price = max([b['price'] for b in bids if b['price'] >= p_star], default=p_star)
    a_m_price = min([a['price'] for a in asks if a['price'] <= p_star], default=p_star)
    price_k = (k * a_m_price + (Decimal('1') - k) * b_m_price)
    lo = min(a_m_price, b_m_price)
    hi = max(a_m_price, b_m_price)
    if price_k < lo:
        price_k = lo
    if price_k > hi:
        price_k = hi
    accepted_bids = [b for b in bids if b['price'] >= price_k]
    accepted_asks = [a for a in asks if a['price'] <= price_k]
    total_bid_qty = sum(b['quantity'] for b in accepted_bids)
    total_ask_qty = sum(a['quantity'] for a in accepted_asks)
    trade_qty = min(total_bid_qty, total_ask_qty)
    allocations = []
    if trade_qty == 0:
        return (price_k, [])
    if total_bid_qty > total_ask_qty:
        remaining = total_ask_qty
        for a in accepted_asks:
            allocations.append({"order_id": a['id'], "cleared_qty": a['quantity']})
        for b in accepted_bids:
            if remaining <= 0:
                allocations.append({"order_id": b['id'], "cleared_qty": Decimal('0')})
                continue
            share = (b['quantity'] / total_bid_qty) * total_ask_qty
            qty = min(b['quantity'], share)
            allocations.append({"order_id": b['id'], "cleared_qty": qty})
            remaining -= qty
    elif total_ask_qty > total_bid_qty:
        remaining = total_bid_qty
        for b in accepted_bids:
            allocations.append({"order_id": b['id'], "cleared_qty": b['quantity']})
        for a in accepted_asks:
            if remaining <= 0:
                allocations.append({"order_id": a['id'], "cleared_qty": Decimal('0')})
                continue
            share = (a['quantity'] / total_ask_qty) * total_bid_qty
            qty = min(a['quantity'], share)
            allocations.append({"order_id": a['id'], "cleared_qty": qty})
            remaining -= qty
    else:
        for b in accepted_bids:
            allocations.append({"order_id": b['id'], "cleared_qty": b['quantity']})
        for a in accepted_asks:
            allocations.append({"order_id": a['id'], "cleared_qty": a['quantity']})
    return (price_k, allocations)

__all__ = ['compute_call_market_clearing', 'compute_k_double_clearing', 'to_decimal']