import datetime
import os
import time
from decimal import Decimal
from typing import Dict, List, Optional, Tuple
from flask import Blueprint, current_app, g, jsonify, request, send_from_directory
from ..db import (
    db_connection,
    ensure_auctions_tables,
    ensure_listings_table,
    ensure_users_table,
    ensure_user_profiles,
    ensure_wallet_tables,
)
from ..errors import AppError, DBError, OrderDataError
from ..security import get_auth_user, require_admin
from ..services.auction import compute_call_market_clearing
from ..services.wallet import wallet_deposit, wallet_release, wallet_reserve, wallet_spend
from ..utils import is_admin, is_trader, serialize, to_decimal

auctions_bp = Blueprint('auctions', __name__, url_prefix='/api')

DECIMAL_QUANT = Decimal('0.000001')


def _normalize_decimal(value: Optional[Decimal]) -> Optional[Decimal]:
    if value is None:
        return None
    if not isinstance(value, Decimal):
        value = Decimal(str(value))
    return value.quantize(DECIMAL_QUANT)


def _record_clearing_state(
    cur,
    auction_id: int,
    admin_user,
    *,
    price: Optional[Decimal],
    quantity: Optional[Decimal],
    demand: Optional[Decimal],
    supply: Optional[Decimal],
    price_interval: Optional[Tuple[Optional[Decimal], Optional[Decimal]]]
) -> None:
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


def _aggregate_levels(orders, reverse=False):
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

@auctions_bp.get('/auctions')
def list_auctions():
    conn = db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        ensure_auctions_tables(conn)
        status = request.args.get('status')
        auction_type = request.args.get('type')
        where = []
        params: List = []
        if status in ('collecting', 'cleared', 'closed'):
            where.append('status = %s')
            params.append(status)
        if auction_type in ('open', 'closed'):
            where.append('type = %s')
            params.append(auction_type)
        sql = 'SELECT * FROM auctions'
        if where:
            sql += ' WHERE ' + ' AND '.join(where)
        sql += ' ORDER BY created_at DESC'
        cur.execute(sql, tuple(params))
        return jsonify(serialize(cur.fetchall()))
    finally:
        cur.close()
        conn.close()


@auctions_bp.get('/auctions/<int:auction_id>/book')
def auction_order_book(auction_id: int):
    conn = db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        ensure_auctions_tables(conn)
        cur.execute(
            "SELECT id, product, type, status, k_value, window_start, window_end, created_at, closed_at "
            "FROM auctions WHERE id=%s",
            (auction_id,)
        )
        auction = cur.fetchone()
        if not auction:
            raise AppError("Auction not found", statuscode=404)

        cur.execute(
            "SELECT id, trader_id, side, price, quantity, created_at "
            "FROM auction_orders WHERE auction_id=%s AND status='open'",
            (auction_id,)
        )
        open_rows = cur.fetchall()
        bid_orders = []
        ask_orders = []
        for row in open_rows:
            price = to_decimal(row['price'])
            quantity = to_decimal(row['quantity'])
            order = {
                'id': row['id'],
                'trader_id': row['trader_id'],
                'side': row['side'],
                'price': price,
                'quantity': quantity,
                'created_at': row['created_at']
            }
            if row['side'] == 'bid':
                bid_orders.append(order)
            else:
                ask_orders.append(order)

        bid_levels = _aggregate_levels(sorted(bid_orders, key=lambda o: (o['price'], o['created_at']), reverse=True), reverse=True)
        ask_levels = _aggregate_levels(sorted(ask_orders, key=lambda o: (o['price'], o['created_at'])), reverse=False)

        total_bid_qty = sum((order['quantity'] for order in bid_orders), Decimal('0'))
        total_ask_qty = sum((order['quantity'] for order in ask_orders), Decimal('0'))
        best_bid_dec = max((order['price'] for order in bid_orders), default=None)
        best_ask_dec = min((order['price'] for order in ask_orders), default=None)
        best_bid = float(best_bid_dec) if best_bid_dec is not None else None
        best_ask = float(best_ask_dec) if best_ask_dec is not None else None
        spread = None
        is_crossed_market = False
        if best_bid_dec is not None and best_ask_dec is not None:
            try:
                spread_val = (best_ask_dec - best_bid_dec).quantize(DECIMAL_QUANT)
            except Exception:
                spread_val = (best_ask_dec - best_bid_dec)
            spread = float(spread_val)
            if spread < 0:
                # crossed market (best bid >= best ask) – keep signed spread but flag it
                is_crossed_market = True
        mid_price = None
        if best_bid_dec is not None and best_ask_dec is not None:
            try:
                mid_price = float(((best_bid_dec + best_ask_dec) / Decimal('2')).quantize(DECIMAL_QUANT))
            except Exception:
                mid_price = float((best_bid_dec + best_ask_dec) / 2)
        best_bid_depth = bid_levels[0]['totalQuantity'] if bid_levels else None
        best_ask_depth = ask_levels[0]['totalQuantity'] if ask_levels else None
        best_bid_orders_level = bid_levels[0]['orderCount'] if bid_levels else None
        best_ask_orders_level = ask_levels[0]['orderCount'] if ask_levels else None
        depth_imbalance = None
        if isinstance(best_bid_depth, float) and isinstance(best_ask_depth, float) and (best_bid_depth + best_ask_depth) > 0:
            depth_imbalance = (best_bid_depth - best_ask_depth) / (best_bid_depth + best_ask_depth)
        # ---- Adaptive k (feedback) ----
        # Use current stored k_value as baseline; adjust toward bid or ask side when imbalance present.
        # Positive depth_imbalance => bids heavier => shift k down (toward 0) to slightly favor asks.
        # Negative imbalance => asks heavier => shift k up (toward 1) to favor bids.
        adaptive_k = None
        try:
            base_k = to_decimal(auction['k_value']) if auction.get('k_value') is not None else Decimal('0.5')
            if depth_imbalance is not None:
                alpha = Decimal('0.15')  # sensitivity factor (tunable)
                adj = Decimal(str(depth_imbalance)) * alpha
                candidate = base_k - adj  # subtract because positive imbalance (more bids) should lower k
                if candidate < Decimal('0'): candidate = Decimal('0')
                if candidate > Decimal('1'): candidate = Decimal('1')
                adaptive_k = float(candidate)
                # Optional persistence: only write back if difference > 0.01 to reduce churn
                if abs(candidate - base_k) >= Decimal('0.01'):
                    try:
                        cur.execute("UPDATE auctions SET k_value=%s WHERE id=%s", (str(candidate), auction_id))
                        conn.commit()
                        auction['k_value'] = str(candidate)
                    except Exception:
                        conn.rollback()
            else:
                adaptive_k = float(base_k)
        except Exception:
            adaptive_k = None
        top_n = 3
        cum_bid_depth = sum((lvl['totalQuantity'] for lvl in bid_levels[:top_n]), 0.0) if bid_levels else None
        cum_ask_depth = sum((lvl['totalQuantity'] for lvl in ask_levels[:top_n]), 0.0) if ask_levels else None
        cum_bid_orders = sum((lvl['orderCount'] for lvl in bid_levels[:top_n]), 0) if bid_levels else None
        cum_ask_orders = sum((lvl['orderCount'] for lvl in ask_levels[:top_n]), 0) if ask_levels else None

        cur.execute(
            "SELECT id, trader_id, side, price, quantity, created_at, cleared_price, cleared_quantity "
            "FROM auction_orders WHERE auction_id=%s AND status='cleared' AND cleared_quantity IS NOT NULL "
            "AND cleared_quantity > 0 ORDER BY created_at DESC LIMIT 20",
            (auction_id,)
        )
        cleared_rows = cur.fetchall()
        cleared_entries = []
        for row in cleared_rows:
            cleared_entries.append({
                "id": row['id'],
                "side": row['side'],
                "price": float(to_decimal(row['cleared_price'] or row['price'])),
                "quantity": float(to_decimal(row['cleared_quantity'])),
                "createdAt": row['created_at'].isoformat() if row['created_at'] else None
            })

        metrics = {
            "bestBid": best_bid,
            "bestAsk": best_ask,
            "spread": spread,
            "isCrossedMarket": is_crossed_market,
            "midPrice": mid_price,
            "totalBidQuantity": float(total_bid_qty),
            "totalAskQuantity": float(total_ask_qty),
            "bidOrderCount": len(bid_orders),
            "askOrderCount": len(ask_orders),
            "bestBidDepth": best_bid_depth,
            "bestAskDepth": best_ask_depth,
            "bestBidOrders": best_bid_orders_level,
            "bestAskOrders": best_ask_orders_level,
            "depthImbalance": depth_imbalance,
            "top3BidDepth": cum_bid_depth,
            "top3AskDepth": cum_ask_depth,
            "top3BidOrders": cum_bid_orders,
            "top3AskOrders": cum_ask_orders,
            "lastClearingPrice": cleared_entries[0]['price'] if cleared_entries else None,
            "lastClearingQuantity": cleared_entries[0]['quantity'] if cleared_entries else None,
            "kValue": float(auction['k_value']) if auction.get('k_value') is not None else None,
            "adaptiveK": adaptive_k,
            "adaptiveKAlpha": 0.15,
        }

        recent_bid_orders = sorted(bid_orders, key=lambda o: (o['price'], o['created_at']), reverse=True)[:10]
        recent_ask_orders = sorted(ask_orders, key=lambda o: (o['price'], o['created_at']))[:10]

        response = {
            "auction": serialize(auction),
            "book": {
                "bids": bid_levels,
                "asks": ask_levels
            },
            "metrics": metrics,
            "recentOrders": {
                "bids": _serialize_orders(recent_bid_orders),
                "asks": _serialize_orders(recent_ask_orders)
            },
            "recentClearing": cleared_entries
        }
        return jsonify(response)
    finally:
        cur.close()
        conn.close()

@auctions_bp.post('/admin/auctions')
@require_admin
def create_auction():
    user = g.get('user')
    if not user or not is_admin(user):
        raise AppError("Forbidden", statuscode=403)

    data = request.get_json(silent=True) or {}
    product = (data.get('product') or '').strip()
    auction_type = (data.get('type') or 'open').strip()
    k_value = data.get('k')
    window_start = data.get('windowStart')
    window_end = data.get('windowEnd')

    raw_listing_id = data.get('listingId')
    listing_id_value = None
    if raw_listing_id is not None:
        try:
            listing_id_value = int(raw_listing_id)
        except (TypeError, ValueError):
            raise OrderDataError("Field 'listingId' must be an integer")

    def parse_dt(value):
        if not value:
            return None
        try:
            return datetime.datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        except Exception:
            raise OrderDataError("Invalid datetime format (use ISO 8601)")

    window_start_dt = parse_dt(window_start)
    window_end_dt = parse_dt(window_end)

    listing_row = None
    conn = db_connection()
    try:
        ensure_auctions_tables(conn)
        if listing_id_value is not None:
            ensure_listings_table(conn)
            listing_cur = conn.cursor(dictionary=True)
            try:
                listing_cur.execute("SELECT id, title, status FROM listings WHERE id=%s", (listing_id_value,))
                listing_row = listing_cur.fetchone()
            finally:
                listing_cur.close()
            if not listing_row:
                raise OrderDataError("Listing not found")
            if not product:
                product = (listing_row.get('title') or '').strip()

        if not product:
            raise OrderDataError("Field 'product' is required")
        if auction_type not in ('open', 'closed'):
            raise OrderDataError("Field 'type' must be 'open' or 'closed'")
        try:
            k_dec = to_decimal(k_value)
        except OrderDataError:
            raise OrderDataError("Field 'k' must be a number between 0 and 1")
        if k_dec < Decimal('0') or k_dec > Decimal('1'):
            raise OrderDataError("Field 'k' must be between 0 and 1")

        insert_cur = conn.cursor()
        try:
            insert_cur.execute(
                "INSERT INTO auctions (product, type, k_value, window_start, window_end, admin_id, listing_id) VALUES (%s,%s,%s,%s,%s,%s,%s)",
                (product, auction_type, str(k_dec), window_start_dt, window_end_dt, user['id'], listing_id_value)
            )
            auction_id = insert_cur.lastrowid
        finally:
            insert_cur.close()

        publish_listing = data.get('publishListing', True)
        if publish_listing and listing_id_value is not None and listing_row and listing_row.get('status') != 'published':
            update_cur = conn.cursor()
            try:
                update_cur.execute(
                    "UPDATE listings SET status='published', updated_at=CURRENT_TIMESTAMP WHERE id=%s",
                    (listing_id_value,)
                )
            finally:
                update_cur.close()

        conn.commit()
        return jsonify({"message": "Auction created", "id": auction_id}), 201
    except AppError:
        raise
    except Exception as exception:
        try:
            conn.rollback()
        except Exception:
            pass
        raise DBError("Error creating auction", details=str(exception))
    finally:
        conn.close()

@auctions_bp.patch('/admin/auctions/<int:auction_id>/close')
@require_admin
def close_auction(auction_id: int):
    conn = db_connection()
    cur = conn.cursor()
    try:
        ensure_auctions_tables(conn)
        cur.execute(
            "UPDATE auctions SET status='closed', closed_at=%s WHERE id=%s",
            (datetime.datetime.utcnow(), auction_id)
        )
        conn.commit()
        return jsonify({"message": "Auction closed"})
    finally:
        cur.close()
        conn.close()

@auctions_bp.post('/auctions/<int:auction_id>/join')
def join_auction(auction_id: int):
    conn = db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        ensure_users_table(conn)
        ensure_auctions_tables(conn)
        user = get_auth_user(conn)
        if not user or not is_trader(user):
            raise AppError("Unauthorized", statuscode=401)
        cur.execute("SELECT id, type, status FROM auctions WHERE id=%s", (auction_id,))
        auction = cur.fetchone()
        if not auction:
            raise AppError("Auction not found", statuscode=404)
        if auction['status'] != 'collecting':
            raise AppError("Auction is not accepting participants", statuscode=400)
        data = request.get_json(silent=True) or {}
        account_id = data.get('accountId')
        account_id_value = None
        if account_id is not None:
            try:
                account_id_value = int(account_id)
            except (TypeError, ValueError):
                raise AppError("Invalid accountId", statuscode=400)
            cur.execute(
                "SELECT id FROM trader_accounts WHERE id=%s AND trader_id=%s",
                (account_id_value, user['id'])
            )
            if not cur.fetchone():
                raise AppError("Invalid accountId for this trader", statuscode=400)
        status = 'approved' if auction['type'] == 'open' else 'pending'
        cur.close()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO auction_participants (auction_id, trader_id, account_id, status) VALUES (%s,%s,%s,%s)"
            " ON DUPLICATE KEY UPDATE account_id=VALUES(account_id), status=VALUES(status)",
            (auction_id, user['id'], account_id_value, status)
        )
        conn.commit()
        message = "Join request submitted" if status == 'pending' else "Joined auction"
        return jsonify({"message": message, "status": status}), 201
    except Exception as exception:
        current_app.logger.exception("Error joining auction %s", auction_id)
        try:
            conn.rollback()
        except Exception:
            pass
        raise DBError("Error joining auction", details=str(exception))
    finally:
        try:
            cur.close()
        except Exception:
            pass
        conn.close()

@auctions_bp.get('/admin/auctions/<int:auction_id>/participants')
@require_admin
def list_participants_admin(auction_id: int):
    conn = db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        ensure_auctions_tables(conn)
        cur.execute(
            "SELECT * FROM auction_participants WHERE auction_id=%s ORDER BY joined_at DESC",
            (auction_id,)
        )
        return jsonify(serialize(cur.fetchall()))
    finally:
        cur.close()
        conn.close()

@auctions_bp.patch('/admin/auctions/<int:auction_id>/participants/<int:participant_id>/approve')
@require_admin
def approve_participant(auction_id: int, participant_id: int):
    conn = db_connection()
    cur = conn.cursor()
    try:
        ensure_auctions_tables(conn)
        cur.execute(
            "UPDATE auction_participants SET status='approved' WHERE id=%s AND auction_id=%s",
            (participant_id, auction_id)
        )
        if cur.rowcount == 0:
            raise AppError("Participant not found", statuscode=404)
        conn.commit()
        return jsonify({"message": "Participant approved"})
    finally:
        cur.close()
        conn.close()

@auctions_bp.post('/auctions/<int:auction_id>/orders')
def place_auction_order(auction_id: int):
    conn = db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        ensure_users_table(conn)
        ensure_auctions_tables(conn)
        user = get_auth_user(conn)
        if not user or not is_trader(user):
            raise AppError("Unauthorized", statuscode=401)
        cur.execute("SELECT id, type, status, window_start, window_end FROM auctions WHERE id=%s", (auction_id,))
        auction = cur.fetchone()
        if not auction:
            raise AppError("Auction not found", statuscode=404)
        if auction['status'] != 'collecting':
            raise AppError("Auction is not collecting orders", statuscode=400)
        now = datetime.datetime.utcnow()
        if auction['window_start'] and now < auction['window_start']:
            raise AppError("Auction window has not started", statuscode=400)
        if auction['window_end'] and now > auction['window_end']:
            raise AppError("Auction window has ended", statuscode=400)
        if auction['type'] == 'closed':
            cur.execute(
                "SELECT status FROM auction_participants WHERE auction_id=%s AND trader_id=%s",
                (auction_id, user['id'])
            )
            participant = cur.fetchone()
            if not participant or participant['status'] != 'approved':
                raise AppError("Not approved to participate in this auction", statuscode=403)
        data = request.get_json(silent=True) or {}
        side = (data.get('type') or data.get('side') or '').strip()
        if side not in ('bid', 'ask'):
            raise OrderDataError("Field 'type' (or 'side') must be 'bid' or 'ask'")
        try:
            price = to_decimal(data.get('price'))
            quantity = to_decimal(data.get('quantity'))
        except OrderDataError:
            raise OrderDataError("Fields 'price' and 'quantity' must be valid positive numbers")
        if price <= 0 or quantity <= 0:
            raise OrderDataError("'price' and 'quantity' must be positive")
        reserve_amount: Decimal | None = None
        reserve_tx_id: int | None = None
        if side == 'bid':
            reserve_amount = (price * quantity).quantize(DECIMAL_QUANT)
            reserve_meta = {
                "auctionId": auction_id,
                "orderSide": side,
                "price": str(price),
                "quantity": str(quantity)
            }
            reserve_result = wallet_reserve(conn, user['id'], reserve_amount, meta=reserve_meta)
            reserve_tx_id = reserve_result['txId']
        cur.close()
        cur = conn.cursor()
        columns = ["auction_id", "trader_id", "side", "price", "quantity"]
        values = [auction_id, user['id'], side, str(price), str(quantity)]
        if reserve_amount is not None:
            columns.extend(["reserved_amount", "reserve_tx_id"])
            values.extend([str(reserve_amount), reserve_tx_id])
        placeholders = ','.join(['%s'] * len(values))
        cur.execute(
            f"INSERT INTO auction_orders ({', '.join(columns)}) VALUES ({placeholders})",
            tuple(values)
        )
        conn.commit()
        response = {
            "message": "Order placed",
            "id": cur.lastrowid
        }
        if reserve_amount is not None:
            response["reservedAmount"] = float(reserve_amount)
        return jsonify(response), 201
    except AppError as error:
        try:
            conn.rollback()
        except Exception:
            pass
        raise error
    except Exception as exception:
        try:
            conn.rollback()
        except Exception:
            pass
        raise DBError("Error placing order", details=str(exception))
    finally:
        try:
            cur.close()
        except Exception:
            pass
        conn.close()

@auctions_bp.get('/admin/auctions/<int:auction_id>/orders')
@require_admin
def list_auction_orders_admin(auction_id: int):
    conn = db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        ensure_auctions_tables(conn)
        cur.execute(
            """
            SELECT id,
                   trader_id,
                   side,
                   price,
                   quantity,
                   created_at,
                   status,
                   reserved_amount,
                   reserve_tx_id,
                   cleared_price,
                   cleared_quantity
            FROM auction_orders
            WHERE auction_id=%s
            ORDER BY created_at ASC
            """,
            (auction_id,)
        )
        return jsonify(serialize(cur.fetchall()))
    finally:
        cur.close()
        conn.close()

def _generate_trade_document(auction_id: int, role: str, trader_id: int, amount: Decimal, price: Decimal) -> str:
    base_dir = os.path.join(current_app.config['GENERATED_DOCS_ROOT'], f'auction_{auction_id}')
    os.makedirs(base_dir, exist_ok=True)
    timestamp = datetime.datetime.utcnow().isoformat() + 'Z'
    filename = f"auction_{auction_id}_{role}_trader_{trader_id}_{int(datetime.datetime.utcnow().timestamp())}.txt"
    path = os.path.join(base_dir, filename)
    with open(path, 'w', encoding='utf-8') as file_handle:
        file_handle.write("Підтвердження угоди\n")
        file_handle.write(f"Аукціон: {auction_id}\n")
        file_handle.write(f"Роль: {role}\n")
        file_handle.write(f"ID Торговця: {trader_id}\n")
        file_handle.write(f"Кількість: {amount}\n")
        file_handle.write(f"Ціна: {price}\n")
        file_handle.write(f"Час: {timestamp}\n")
    return path

@auctions_bp.post('/admin/auctions/<int:auction_id>/clear')
@require_admin
def clear_auction(auction_id: int):
    conn = db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        ensure_auctions_tables(conn)
        cur.execute("SELECT id, k_value, status FROM auctions WHERE id=%s", (auction_id,))
        auction = cur.fetchone()
        if not auction:
            raise AppError("Auction not found", statuscode=404)
        if auction['status'] != 'collecting':
            raise AppError("Auction not in collecting state", statuscode=400)
        admin_user = g.get('user')
        if auction.get('admin_id') and admin_user and auction['admin_id'] != admin_user['id']:
            raise AppError("Auction assigned to different administrator", statuscode=403)
        cur.execute(
            "SELECT id, trader_id, side, price, quantity, created_at, reserved_amount, reserve_tx_id "
            "FROM auction_orders WHERE auction_id=%s AND status='open'",
            (auction_id,)
        )
        raw_orders = cur.fetchall()
        if not raw_orders:
            cur.close()
            cur = conn.cursor()
            _record_clearing_state(
                cur,
                auction_id,
                admin_user,
                price=None,
                quantity=None,
                demand=Decimal('0'),
                supply=Decimal('0'),
                price_interval=None
            )
            conn.commit()
            return jsonify({
                "message": "No orders to clear",
                "price": None,
                "volume": 0,
                "allocations": [],
                "demand": 0,
                "supply": 0,
                "priceInterval": None
            })
        orders: List[Dict] = []
        for row in raw_orders:
            orders.append({
                'id': row['id'],
                'trader_id': row['trader_id'],
                'side': row['side'],
                'price': to_decimal(row['price']),
                'quantity': to_decimal(row['quantity']),
                'created_at': row['created_at'],
            })
        clearing = compute_call_market_clearing(orders)
        price = clearing['price']
        allocations = clearing['allocations']
        volume = clearing.get('volume', Decimal('0'))
        demand_total = clearing.get('demand', Decimal('0'))
        supply_total = clearing.get('supply', Decimal('0'))
        price_interval = clearing.get('price_interval')
        if volume <= Decimal('0') or not allocations:
            cur.close()
            cur = conn.cursor()
            _record_clearing_state(
                cur,
                auction_id,
                admin_user,
                price=None,
                quantity=None,
                demand=demand_total,
                supply=supply_total,
                price_interval=price_interval
            )
            conn.commit()
            return jsonify({
                "message": "No trades cleared",
                "price": None,
                "volume": 0,
                "allocations": [],
                "demand": float(demand_total),
                "supply": float(supply_total),
                "priceInterval": None
            })
        allocation_map = {item['order_id']: item['cleared_qty'] for item in allocations}
        cur.close()
        cur = conn.cursor()
        for row in raw_orders:
            cleared_qty = allocation_map.get(row['id'], Decimal('0'))
            cleared_qty = cleared_qty.quantize(DECIMAL_QUANT)
            allocation_map[row['id']] = cleared_qty
            status = 'cleared' if cleared_qty > Decimal('0') else 'rejected'
            cur.execute(
                "UPDATE auction_orders SET status=%s, cleared_price=%s, cleared_quantity=%s WHERE id=%s",
                (status, str(price), str(cleared_qty), row['id'])
            )
        _record_clearing_state(
            cur,
            auction_id,
            admin_user,
            price=price,
            quantity=volume,
            demand=demand_total,
            supply=supply_total,
            price_interval=price_interval
        )
        for row in raw_orders:
            cleared_qty = allocation_map.get(row['id'], Decimal('0'))
            order_meta = {
                "auctionId": auction_id,
                "orderId": row['id'],
                "side": row['side']
            }
            if row.get('reserve_tx_id') is not None:
                order_meta["reserveTxId"] = row['reserve_tx_id']
            if row['side'] == 'bid':
                order_price = to_decimal(row['price'])
                order_quantity = to_decimal(row['quantity'])
                reserved_total = to_decimal(row['reserved_amount']) if row['reserved_amount'] is not None else (order_price * order_quantity)
                reserved_total = reserved_total.quantize(DECIMAL_QUANT)
                cleared_qty_quant = to_decimal(cleared_qty)
                spent = (price * cleared_qty_quant).quantize(DECIMAL_QUANT)
                if spent > Decimal('0'):
                    wallet_spend(conn, row['trader_id'], spent, meta=dict(order_meta, action='settle'))
                remaining = reserved_total - spent
                if remaining < Decimal('0'):
                    remaining = Decimal('0')
                if remaining > Decimal('0'):
                    wallet_release(conn, row['trader_id'], remaining, meta=dict(order_meta, action='release'))
            elif row['side'] == 'ask' and cleared_qty > Decimal('0'):
                cleared_qty_quant = to_decimal(cleared_qty)
                proceeds = (price * cleared_qty_quant).quantize(DECIMAL_QUANT)
                if proceeds > Decimal('0'):
                    wallet_deposit(conn, row['trader_id'], proceeds, meta=dict(order_meta, action='credit'))
        conn.commit()
        for row in raw_orders:
            cleared_qty = allocation_map.get(row['id'], Decimal('0'))
            if cleared_qty > 0:
                role = 'покупець' if row['side'] == 'bid' else 'продавець'
                _generate_trade_document(auction_id, role, row['trader_id'], cleared_qty, price)
        return jsonify({
            "message": "Auction cleared",
            "price": float(price),
            "volume": float(volume),
            "demand": float(demand_total),
            "supply": float(supply_total),
            "priceInterval": [
                float(price_interval[0]) if price_interval and price_interval[0] is not None else None,
                float(price_interval[1]) if price_interval and price_interval[1] is not None else None,
            ],
            "allocations": [
                {"orderId": order_id, "quantity": float(quantity)}
                for order_id, quantity in allocation_map.items()
            ]
        })
    except AppError as error:
        try:
            conn.rollback()
        except Exception:
            pass
        raise error
    except Exception as exception:
        try:
            conn.rollback()
        except Exception:
            pass
        raise DBError("Error clearing auction", details=str(exception))
    finally:
        try:
            cur.close()
        except Exception:
            pass
        conn.close()

@auctions_bp.get('/auctions/<int:auction_id>/participants/me')
def my_participation_status(auction_id: int):
    conn = db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        ensure_users_table(conn)
        ensure_auctions_tables(conn)
        user = get_auth_user(conn)
        if not user:
            raise AppError("Unauthorized", statuscode=401)
        cur.execute(
            "SELECT auction_id, trader_id, account_id, status FROM auction_participants WHERE auction_id=%s AND trader_id=%s",
            (auction_id, user['id'])
        )
        row = cur.fetchone()
        return jsonify(row or {"status": None, "account_id": None})
    finally:
        cur.close()
        conn.close()

@auctions_bp.get('/admin/auctions/<int:auction_id>/documents')
@require_admin
def list_auction_documents(auction_id: int):
    base_dir = os.path.join(current_app.config['GENERATED_DOCS_ROOT'], f'auction_{auction_id}')
    if not os.path.isdir(base_dir):
        return jsonify([])
    files = [file_name for file_name in os.listdir(base_dir) if os.path.isfile(os.path.join(base_dir, file_name))]
    return jsonify(files)

@auctions_bp.get('/admin/auctions/<int:auction_id>/documents/<path:filename>')
@require_admin
def download_auction_document(auction_id: int, filename: str):
    if '..' in filename or filename.startswith('/') or filename.startswith('\\'):
        raise AppError("Invalid filename", statuscode=400)
    base_dir = os.path.join(current_app.config['GENERATED_DOCS_ROOT'], f'auction_{auction_id}')
    if not os.path.isdir(base_dir):
        raise AppError("Not found", statuscode=404)
    return send_from_directory(base_dir, filename, as_attachment=True)

@auctions_bp.post('/admin/auctions/<int:auction_id>/seed_random')
@require_admin
def seed_random_orders(auction_id: int):
    """Create N random trader users (if needed) and place random bid/ask orders for the auction.

    Body JSON (all optional):
      count: int (default 5) - how many traders to generate
      bidsPerTrader: int (default 1)
      asksPerTrader: int (default 1)
      priceCenter: float (optional) - central reference price; if absent uses mid of existing best bid/ask or random 90..110
      priceSpread: float (default 5) - max +/- deviation from center (percent)
      quantityMin: float (default 1)
      quantityMax: float (default 10)

    Returns summary of created users and orders.
    """
    data = request.get_json(silent=True) or {}
    count = int(data.get('count') or 5)
    bids_per = int(data.get('bidsPerTrader') or 1)
    asks_per = int(data.get('asksPerTrader') or 1)
    price_spread_pct = float(data.get('priceSpread') or 5.0)
    allow_cross = bool(data.get('allowCross'))
    qty_min = float(data.get('quantityMin') or 1.0)
    qty_max = float(data.get('quantityMax') or 10.0)
    if count < 1 or count > 200:
        raise AppError("count out of range (1..200)", statuscode=400)
    if qty_min <= 0 or qty_max <= 0 or qty_min > qty_max:
        raise AppError("Invalid quantity range", statuscode=400)

    conn = db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        ensure_users_table(conn)
        ensure_user_profiles(conn)
        ensure_auctions_tables(conn)
        # Validate auction status
        cur.execute("SELECT id, status, type FROM auctions WHERE id=%s", (auction_id,))
        auction = cur.fetchone()
        if not auction:
            raise AppError("Auction not found", statuscode=404)
        if auction['status'] != 'collecting':
            raise AppError("Auction not collecting orders", statuscode=400)

        # Fetch current best bid/ask for center heuristic if needed
        cur.execute("SELECT MAX(price) as bb FROM auction_orders WHERE auction_id=%s AND side='bid' AND status='open'", (auction_id,))
        best_bid = cur.fetchone()['bb']
        cur.execute("SELECT MIN(price) as ba FROM auction_orders WHERE auction_id=%s AND side='ask' AND status='open'", (auction_id,))
        best_ask = cur.fetchone()['ba']
        price_center = data.get('priceCenter')
        if price_center is None:
            try:
                if best_bid and best_ask:
                    price_center = (float(best_bid) + float(best_ask)) / 2.0
                elif best_bid:
                    price_center = float(best_bid)
                elif best_ask:
                    price_center = float(best_ask)
                else:
                    price_center = 100.0
            except Exception:
                price_center = 100.0
        price_center = float(price_center)

        created = []
        order_rows = []
        # Simple password hash reuse (bcrypt) via auth route code path is avoided; create directly.
        from passlib.hash import bcrypt
        for i in range(count):
            username = f"bot_{int(time.time())}_{os.urandom(3).hex()}_{i}"[:60]
            pwd_hash = bcrypt.hash('password')
            # Create user
            cur.execute(
                "INSERT INTO users (username, password_hash, is_admin) VALUES (%s,%s,%s)",
                (username, pwd_hash, 0)
            )
            user_id = cur.lastrowid
            cur.execute(
                "INSERT INTO traders_profile (user_id, first_name, last_name) VALUES (%s,%s,%s) ON DUPLICATE KEY UPDATE first_name=VALUES(first_name), last_name=VALUES(last_name)",
                (user_id, 'Bot', 'Trader')
            )
            # Auto approve participation for closed auctions requirement
            cur.execute(
                "INSERT INTO auction_participants (auction_id, trader_id, status) VALUES (%s,%s,%s) ON DUPLICATE KEY UPDATE status=VALUES(status)",
                (auction_id, user_id, 'approved')
            )
            created.append(user_id)
            # Generate bid & ask orders
            import random
            for _ in range(bids_per):
                # bias bid prices to be at or below center
                price_delta = price_center * (random.uniform(-price_spread_pct, 0) / 100.0)
                price = max(0.000001, price_center + price_delta)
                qty = random.uniform(qty_min, qty_max)
                cur.execute(
                    "INSERT INTO auction_orders (auction_id, trader_id, side, price, quantity) VALUES (%s,%s,'bid',%s,%s)",
                    (auction_id, user_id, price, qty)
                )
                order_rows.append({"side": "bid", "price": price, "quantity": qty})
            for _ in range(asks_per):
                # bias ask prices to be at or above center
                price_delta = price_center * (random.uniform(0, price_spread_pct) / 100.0)
                price = max(0.000001, price_center + price_delta)
                qty = random.uniform(qty_min, qty_max)
                cur.execute(
                    "INSERT INTO auction_orders (auction_id, trader_id, side, price, quantity) VALUES (%s,%s,'ask',%s,%s)",
                    (auction_id, user_id, price, qty)
                )
                order_rows.append({"side": "ask", "price": price, "quantity": qty})
        if not allow_cross:
            # After insertion, optionally clean any accidental cross by adjusting a few orders outward
            # (lightweight approach: ensure max bid < min ask by small tick if violated)
            cur.execute("SELECT MAX(price) bb FROM auction_orders WHERE auction_id=%s AND side='bid' AND status='open'", (auction_id,))
            bb = cur.fetchone()['bb']
            cur.execute("SELECT MIN(price) ba FROM auction_orders WHERE auction_id=%s AND side='ask' AND status='open'", (auction_id,))
            ba = cur.fetchone()['ba']
            try:
                if bb is not None and ba is not None and float(bb) >= float(ba):
                    # widen ask side slightly
                    widen = (float(bb) - float(ba)) + (float(price_center) * 0.0001)
                    cur.execute("UPDATE auction_orders SET price=price + %s WHERE auction_id=%s AND side='ask' AND status='open'", (widen, auction_id))
            except Exception:
                pass
        conn.commit()
        return jsonify({
            "message": "Seeded random orders",
            "auctionId": auction_id,
            "createdUsers": created,
            "orders": order_rows,
            "priceCenter": price_center
        })
    except AppError:
        try:
            conn.rollback()
        except Exception:
            pass
        raise
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        raise DBError("Error seeding random orders", details=str(e))
    finally:
        try:
            cur.close()
        except Exception:
            pass
        conn.close()

@auctions_bp.post('/admin/auctions/<int:auction_id>/cleanup_bots')
@require_admin
def cleanup_bots(auction_id: int):
    """Remove bot-generated orders & participants for a specific auction.

    Body JSON parameters:
      usernamePrefix: string (default 'bot_') – pattern prefix for LIKE '<prefix>%'
      removeUsers: bool (default false) – if true, delete user accounts that no longer
                  participate in any other auctions after cleanup.
    Returns JSON summary with counts.
    """
    data = request.get_json(silent=True) or {}
    prefix = (data.get('usernamePrefix') or 'bot_').strip() or 'bot_'
    remove_users = bool(data.get('removeUsers'))
    like_pattern = prefix + '%'
    conn = db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        ensure_users_table(conn)
        ensure_auctions_tables(conn)
        # Verify auction exists
        cur.execute("SELECT id FROM auctions WHERE id=%s", (auction_id,))
        if not cur.fetchone():
            raise AppError("Auction not found", statuscode=404)

        # Collect bot user ids related to this auction
        cur.execute(
            """
            SELECT DISTINCT u.id FROM users u
            JOIN auction_orders ao ON ao.trader_id=u.id
            WHERE ao.auction_id=%s AND u.username LIKE %s
            UNION
            SELECT DISTINCT u.id FROM users u
            JOIN auction_participants ap ON ap.trader_id=u.id
            WHERE ap.auction_id=%s AND u.username LIKE %s
            """,
            (auction_id, like_pattern, auction_id, like_pattern)
        )
        bot_ids_rows = cur.fetchall()
        bot_ids = [row['id'] for row in bot_ids_rows]
        if not bot_ids:
            return jsonify({"message": "No bot users for this auction", "auctionId": auction_id, "removedOrders": 0, "removedParticipants": 0, "removedUsers": 0})

        # Delete orders for those users in this auction
        cur.close(); cur = conn.cursor()
        cur.execute(
            f"DELETE FROM auction_orders WHERE auction_id=%s AND trader_id IN ({','.join(['%s']*len(bot_ids))})",
            (auction_id, *bot_ids)
        )
        removed_orders = cur.rowcount
        # Delete participants
        cur.execute(
            f"DELETE FROM auction_participants WHERE auction_id=%s AND trader_id IN ({','.join(['%s']*len(bot_ids))})",
            (auction_id, *bot_ids)
        )
        removed_participants = cur.rowcount

        removed_users = 0
        if remove_users:
            # Find which of these users have any remaining auction presence
            cur.execute(
                f"""
                SELECT u.id, (
                  SELECT COUNT(*) FROM auction_orders ao WHERE ao.trader_id=u.id
                ) + (
                  SELECT COUNT(*) FROM auction_participants ap WHERE ap.trader_id=u.id
                ) AS refcount
                FROM users u WHERE u.id IN ({','.join(['%s']*len(bot_ids))})
                """,
                tuple(bot_ids)
            )
            still_rows = cur.fetchall()
            deletable = [r['id'] for r in still_rows if int(r.get('refcount') or 0) == 0]
            if deletable:
                # Remove wallet transactions and accounts
                cur.execute(
                    f"DELETE FROM wallet_transactions WHERE user_id IN ({','.join(['%s']*len(deletable))})",
                    tuple(deletable)
                )
                cur.execute(
                    f"DELETE FROM wallet_accounts WHERE user_id IN ({','.join(['%s']*len(deletable))})",
                    tuple(deletable)
                )
                # Remove trader profiles
                cur.execute(
                    f"DELETE FROM traders_profile WHERE user_id IN ({','.join(['%s']*len(deletable))})",
                    tuple(deletable)
                )
                cur.execute(
                    f"DELETE FROM users WHERE id IN ({','.join(['%s']*len(deletable))})",
                    tuple(deletable)
                )
                removed_users = cur.rowcount

        conn.commit()
        return jsonify({
            "message": "Cleanup completed",
            "auctionId": auction_id,
            "botUserIds": bot_ids,
            "removedOrders": removed_orders,
            "removedParticipants": removed_participants,
            "removedUsers": removed_users,
            "usernamePrefix": prefix
        })
    except AppError:
        try: conn.rollback()
        except Exception: pass
        raise
    except Exception as e:
        try: conn.rollback()
        except Exception: pass
        raise DBError("Error cleaning up bot data", details=str(e))

@auctions_bp.get('/auctions/<int:auction_id>/history')
def auction_history(auction_id: int):
    """Return lightweight time series for an auction (mid, best bid/ask, spread) and a current cumulative book snapshot.

    For now this derives history from the most recent open orders + cleared events (no long-term persistence yet).
    Frontend can poll this and accumulate longer history client side.
    """
    conn = db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        ensure_auctions_tables(conn)
        cur.execute("SELECT id,status FROM auctions WHERE id=%s", (auction_id,))
        auction_row = cur.fetchone()
        if not auction_row:
            raise AppError("Auction not found", statuscode=404)
        # Recent cleared (price timeline proxy)
        cur.execute(
            "SELECT cleared_price, cleared_quantity, created_at FROM auction_orders WHERE auction_id=%s AND status='cleared' AND cleared_quantity IS NOT NULL AND cleared_quantity>0 ORDER BY created_at DESC LIMIT 200",
            (auction_id,)
        )
        cleared = cur.fetchall()
        cleared_series = [
            {
                "t": row['created_at'].isoformat() if row['created_at'] else None,
                "price": float(to_decimal(row['cleared_price'])) if row.get('cleared_price') is not None else None,
                "quantity": float(to_decimal(row['cleared_quantity'])) if row.get('cleared_quantity') is not None else None
            } for row in reversed(cleared)
        ]
        # Order book aggregation (current snapshot cumulative depth curve)
        cur.execute("SELECT side, price, quantity, created_at FROM auction_orders WHERE auction_id=%s AND status='open'", (auction_id,))
        rows = cur.fetchall()
        bid_orders = [r for r in rows if r['side']=='bid']
        ask_orders = [r for r in rows if r['side']=='ask']
        def _agg(levels):
            out = []
            cum = 0.0
            for lvl in levels:
                cum += lvl['totalQuantity']
                out.append({"price": lvl['price'], "depth": lvl['totalQuantity'], "cum": cum})
            return out
        bid_levels = _aggregate_levels(sorted(bid_orders, key=lambda o: (o['price'], o['created_at']), reverse=True), reverse=True)
        ask_levels = _aggregate_levels(sorted(ask_orders, key=lambda o: (o['price'], o['created_at'])), reverse=False)
        book_snapshot = {"bids": _agg(bid_levels), "asks": _agg(ask_levels)}
        return jsonify({
            "auctionId": auction_id,
            "status": auction_row['status'],
            "clearedSeries": cleared_series,
            "bookCurve": book_snapshot
        })
    finally:
        try:
            cur.close()
        except Exception:
            pass
        conn.close()

@auctions_bp.post('/admin/bots/purge')
@require_admin
def purge_all_bots():
    """Globally remove all bot users (username LIKE 'bot_%') with ALL their data.

    Steps:
      - Identify bot user ids
      - Delete orders, participants, wallet tx/accounts, profiles, users
    """
    prefix = (request.get_json(silent=True) or {}).get('usernamePrefix') or 'bot_'
    like_pattern = prefix + '%'
    conn = db_connection()
    cur = conn.cursor()
    try:
        ensure_users_table(conn); ensure_auctions_tables(conn); ensure_wallet_tables(conn); ensure_user_profiles(conn)
        cur.execute("SELECT id FROM users WHERE username LIKE %s", (like_pattern,))
        ids = [row[0] for row in cur.fetchall()]
        if not ids:
            return jsonify({"message": "No bot users", "removedUsers": 0})
        id_list = ','.join(['%s']*len(ids))
        # Delete dependent rows
        cur.execute(f"DELETE FROM auction_orders WHERE trader_id IN ({id_list})", tuple(ids))
        orders_removed = cur.rowcount
        cur.execute(f"DELETE FROM auction_participants WHERE trader_id IN ({id_list})", tuple(ids))
        parts_removed = cur.rowcount
        cur.execute(f"DELETE FROM wallet_transactions WHERE user_id IN ({id_list})", tuple(ids))
        tx_removed = cur.rowcount
        cur.execute(f"DELETE FROM wallet_accounts WHERE user_id IN ({id_list})", tuple(ids))
        wallets_removed = cur.rowcount
        cur.execute(f"DELETE FROM traders_profile WHERE user_id IN ({id_list})", tuple(ids))
        profiles_removed = cur.rowcount
        cur.execute(f"DELETE FROM users WHERE id IN ({id_list})", tuple(ids))
        users_removed = cur.rowcount
        conn.commit()
        return jsonify({
            "message": "Bots purged",
            "usernamePrefix": prefix,
            "removedUsers": users_removed,
            "removedOrders": orders_removed,
            "removedParticipants": parts_removed,
            "removedWalletTransactions": tx_removed,
            "removedWalletAccounts": wallets_removed,
            "removedProfiles": profiles_removed,
            "botIds": ids
        })
    except AppError:
        try: conn.rollback()
        except Exception: pass
        raise
    except Exception as e:
        try: conn.rollback()
        except Exception: pass
        raise DBError("Error purging bots", details=str(e))
    finally:
        try: cur.close()
        except Exception: pass
        conn.close()

@auctions_bp.get('/auctions/<int:auction_id>/distribution')
def auction_price_distribution(auction_id: int):
    """Return histogram-like distribution of current open bid/ask prices and mid.

    Output: { mid, bestBid, bestAsk, bids:[{p,qty,count}], asks:[{p,qty,count}] }
    """
    conn = db_connection(); cur = conn.cursor(dictionary=True)
    try:
        ensure_auctions_tables(conn)
        cur.execute("SELECT id FROM auctions WHERE id=%s", (auction_id,))
        if not cur.fetchone():
            raise AppError("Auction not found", statuscode=404)
        cur.execute("SELECT side, price, quantity FROM auction_orders WHERE auction_id=%s AND status='open'", (auction_id,))
        rows = cur.fetchall()
        from collections import defaultdict
        agg = { 'bid': defaultdict(lambda: {'p': None,'qty':0.0,'count':0}), 'ask': defaultdict(lambda: {'p': None,'qty':0.0,'count':0}) }
        best_bid = None; best_ask = None
        for r in rows:
            side = r['side']; price = float(r['price']); qty = float(r['quantity'])
            if side == 'bid':
                best_bid = price if (best_bid is None or price>best_bid) else best_bid
            else:
                best_ask = price if (best_ask is None or price<best_ask) else best_ask
            bucket = round(price, 4)  # bucket precision
            cell = agg[side][bucket]
            cell['p'] = bucket; cell['qty'] += qty; cell['count'] += 1
        bids = sorted(agg['bid'].values(), key=lambda x: x['p'], reverse=True)
        asks = sorted(agg['ask'].values(), key=lambda x: x['p'])
        mid = None
        if best_bid is not None and best_ask is not None:
            mid = (best_bid + best_ask)/2
        return jsonify({
            'auctionId': auction_id,
            'mid': mid,
            'bestBid': best_bid,
            'bestAsk': best_ask,
            'bids': bids,
            'asks': asks
        })
    finally:
        try: cur.close()
        except Exception: pass
        conn.close()