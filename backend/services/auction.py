from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, List, Optional, Tuple
from ..errors import OrderDataError

def to_decimal(n) -> Decimal:
    try:
        if isinstance(n, Decimal):
            return n
        return Decimal(str(n))
    except Exception:
        raise OrderDataError("Invalid numeric value")

DECIMAL_QUANT = Decimal('0.000001')

def compute_call_market_clearing(orders: List[Dict]) -> Dict[str, Any]:
    def _sort_key_bid(order: Dict[str, Any]) -> Tuple[Decimal, Any]:
        created_at = order.get('created_at')
        return (-order['price'], created_at)
    def _sort_key_ask(order: Dict[str, Any]) -> Tuple[Decimal, Any]:
        created_at = order.get('created_at')
        return (order['price'], created_at)
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

def compute_k_double_clearing(orders: List[Dict], k: Decimal) -> Dict[str, Any]:
    def _priority_key(order: Dict[str, Any]) -> Tuple[int, Any]:
        iteration = order.get('iteration')
        if iteration is not None:
            try:
                return (0, int(iteration))
            except (TypeError, ValueError):
                return (0, iteration)
        created_at = order.get('created_at')
        if created_at is not None:
            return (1, created_at)
        return (2, order.get('id'))

    k_value = to_decimal(k)
    if k_value < Decimal('0') or k_value > Decimal('1'):
        raise OrderDataError("Parameter 'k' must be between 0 and 1")
    normalized: List[Dict[str, Any]] = []
    for order in orders:
        try:
            price = to_decimal(order['price'])
            quantity = to_decimal(order['quantity'])
        except OrderDataError:
            raise
        if price <= 0 or quantity <= 0:
            continue
        normalized.append({
            **order,
            'price': price,
            'quantity': quantity
        })
    bids = [o for o in normalized if o['side'] == 'bid']
    asks = [o for o in normalized if o['side'] == 'ask']
    if not bids or not asks:
        return {
            "price": Decimal('0'),
            "volume": Decimal('0'),
            "allocations": [],
            "demand": Decimal('0'),
            "supply": Decimal('0'),
            "price_interval": (None, None),
            "p_star": None,
        }
    bids.sort(key=lambda x: (-x['price'], _priority_key(x)))
    asks.sort(key=lambda x: (x['price'], _priority_key(x)))
    price_grid = sorted({*(b['price'] for b in bids), *(a['price'] for a in asks)})
    def cumulative_demand(px: Decimal) -> Decimal:
        return sum(b['quantity'] for b in bids if b['price'] >= px)
    def cumulative_supply(px: Decimal) -> Decimal:
        return sum(a['quantity'] for a in asks if a['price'] <= px)
    best: Optional[Tuple[Decimal, Decimal, Decimal, Decimal, Decimal]] = None
    for price_level in price_grid:
        demand_at_level = cumulative_demand(price_level)
        supply_at_level = cumulative_supply(price_level)
        traded = min(demand_at_level, supply_at_level)
        if traded <= 0:
            continue
        imbalance = -abs(demand_at_level - supply_at_level)
        candidate = (
            traded,
            imbalance,
            price_level,
            demand_at_level,
            supply_at_level,
        )
        if best is None:
            best = candidate
            continue
        if candidate[0] > best[0]:
            best = candidate
        elif candidate[0] == best[0]:
            if candidate[1] > best[1]:
                best = candidate
            elif candidate[1] == best[1] and candidate[2] > best[2]:
                best = candidate
    if best is None:
        return {
            "price": Decimal('0'),
            "volume": Decimal('0'),
            "allocations": [],
            "demand": Decimal('0'),
            "supply": Decimal('0'),
            "price_interval": (None, None),
            "p_star": None,
        }
    trade_qty = best[0]
    p_star = best[2]
    demand_at_star = best[3]
    supply_at_star = best[4]
    if trade_qty <= 0:
        return {
            "price": Decimal('0'),
            "volume": Decimal('0'),
            "allocations": [],
            "demand": demand_at_star,
            "supply": supply_at_star,
            "price_interval": (None, None),
            "p_star": p_star,
        }
    winning_bids = [b for b in bids if b['price'] >= p_star]
    winning_asks = [a for a in asks if a['price'] <= p_star]
    remaining = trade_qty
    bid_allocs: List[Dict[str, Any]] = []
    bid_marginal_price: Decimal | None = None
    for idx, bid in enumerate(winning_bids):
        if remaining <= 0:
            break
        fill = min(bid['quantity'], remaining)
        if fill <= 0:
            continue
        remaining -= fill
        bid_allocs.append({
            "order_id": bid['id'],
            "cleared_qty": fill,
            "side": 'bid',
        })
        bid_marginal_price = bid['price']
    remaining = trade_qty
    ask_allocs: List[Dict[str, Any]] = []
    ask_marginal_price: Decimal | None = None
    for idx, ask in enumerate(winning_asks):
        if remaining <= 0:
            break
        fill = min(ask['quantity'], remaining)
        if fill <= 0:
            continue
        remaining -= fill
        ask_allocs.append({
            "order_id": ask['id'],
            "cleared_qty": fill,
            "side": 'ask',
        })
        ask_marginal_price = ask['price']
    if not bid_allocs or not ask_allocs or bid_marginal_price is None or ask_marginal_price is None:
        return {
            "price": Decimal('0'),
            "volume": Decimal('0'),
            "allocations": [],
            "demand": demand_at_star,
            "supply": supply_at_star,
            "price_interval": (None, None),
            "p_star": p_star,
        }
    lower_bound = min(ask_marginal_price, bid_marginal_price)
    upper_bound = max(ask_marginal_price, bid_marginal_price)
    price_k = (k_value * ask_marginal_price) + ((Decimal('1') - k_value) * bid_marginal_price)
    if price_k < lower_bound:
        price_k = lower_bound
    if price_k > upper_bound:
        price_k = upper_bound
    price_k = price_k.quantize(DECIMAL_QUANT, rounding=ROUND_HALF_UP)
    demand_at_price = cumulative_demand(price_k)
    supply_at_price = cumulative_supply(price_k)
    def _finalize_allocations(entries: List[Dict[str, Any]], target: Decimal) -> List[Dict[str, Any]]:
        if not entries:
            return entries
        running = Decimal('0')
        last_index = len(entries) - 1
        for idx, entry in enumerate(entries):
            qty = entry['cleared_qty']
            if idx == last_index:
                qty = target - running
            qty = qty.quantize(DECIMAL_QUANT, rounding=ROUND_HALF_UP)
            if qty < Decimal('0'):
                qty = Decimal('0')
            entry['cleared_qty'] = qty
            running += qty
        return entries
    bid_allocs = _finalize_allocations(bid_allocs, trade_qty)
    ask_allocs = _finalize_allocations(ask_allocs, trade_qty)
    total_volume = trade_qty.quantize(DECIMAL_QUANT, rounding=ROUND_HALF_UP)
    return {
        "price": price_k,
        "volume": total_volume,
        "allocations": bid_allocs + ask_allocs,
        "demand": demand_at_price.quantize(DECIMAL_QUANT, rounding=ROUND_HALF_UP),
        "supply": supply_at_price.quantize(DECIMAL_QUANT, rounding=ROUND_HALF_UP),
        "price_interval": (
            lower_bound.quantize(DECIMAL_QUANT, rounding=ROUND_HALF_UP),
            upper_bound.quantize(DECIMAL_QUANT, rounding=ROUND_HALF_UP),
        ),
        "p_star": p_star,
    }

__all__ = ['compute_call_market_clearing', 'compute_k_double_clearing', 'to_decimal']