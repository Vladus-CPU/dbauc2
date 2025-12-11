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

@admin_bp.get('/auction-orders/pending')
@require_admin
def get_pending_orders():
    conn = db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT
                ao.id, ao.auction_id, ao.trader_id, ao.side, ao.price, ao.quantity, ao.created_at,
                a.product AS auction_product, a.k_value AS auction_k_value, u.username AS trader_username
            FROM auction_orders ao
            JOIN auctions a ON a.id = ao.auction_id
            JOIN users u ON u.id = ao.trader_id
            WHERE ao.status = 'open' AND (ao.admin_approved = 0 OR ao.admin_approved IS NULL)
            ORDER BY ao.created_at ASC
            """
        )
        orders = cursor.fetchall()
        result = [{
            "id": o['id'], "auctionId": o['auction_id'], "auctionProduct": o['auction_product'],
            "traderId": o['trader_id'], "traderUsername": o['trader_username'], "side": o['side'],
            "price": float(o['price']), "quantity": float(o['quantity']),
            "createdAt": o['created_at'].isoformat() if o['created_at'] else None,
            "auctionDefaultK": float(o['auction_k_value']) if o['auction_k_value'] else 0.5
        } for o in orders]
        return jsonify({"orders": result, "count": len(result)})
    finally:
        cursor.close()
        conn.close()


@admin_bp.post('/auction-orders/<int:order_id>/approve')
@require_admin
def approve_order(order_id: int):
    data = request.get_json(silent=True) or {}
    if 'k_coefficient' not in data:
        raise OrderDataError("Field 'k_coefficient' is required")
    k_coefficient = to_decimal(data['k_coefficient'])
    if k_coefficient < Decimal('0') or k_coefficient > Decimal('1'):
        raise OrderDataError("k_coefficient must be between 0 and 1")
    conn = db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT id, status, admin_approved FROM auction_orders WHERE id = %s", (order_id,))
        order = cursor.fetchone()
        if not order:
            raise AppError("Order not found", statuscode=404)
        if order['admin_approved'] == 1:
            return jsonify({"message": "Order already approved"}), 200
        if order['status'] != 'open':
            raise AppError("Can only approve orders with status 'open'", statuscode=400)
        cursor.execute(
            "UPDATE auction_orders SET admin_approved = 1, admin_k_coefficient = %s WHERE id = %s",
            (str(k_coefficient), order_id)
        )
        conn.commit()
        admin_user = get_auth_user(conn)
        return jsonify({
            "message": "Order approved successfully",
            "orderId": order_id,
            "kCoefficient": float(k_coefficient),
            "approvedBy": admin_user.get('username') if admin_user else None
        }), 200
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


@admin_bp.post('/auction-orders/<int:order_id>/reject')
@require_admin
def reject_order(order_id: int):
    data = request.get_json(silent=True) or {}
    reason = (data.get('reason') or '').strip() or None
    conn = db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT id, status, admin_approved FROM auction_orders WHERE id=%s", (order_id,))
        row = cursor.fetchone()
        if not row:
            raise AppError("Order not found", statuscode=404)
        if row['status'] != 'open':
            return jsonify({"message": "Order already processed", "orderId": order_id, "status": row['status']})
        cursor.execute("UPDATE auction_orders SET status='rejected', admin_approved=0, rejection_reason=%s WHERE id=%s", (reason, order_id))
        conn.commit()
        admin_user = get_auth_user(conn)
        return jsonify({
            "message": "Order rejected",
            "orderId": order_id,
            "status": "rejected",
            "reason": reason,
            "rejectedBy": admin_user.get('username') if admin_user else None
        }), 200
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


@admin_bp.post('/auction-orders/batch-approve')
@require_admin
def batch_approve_orders():
    data = request.get_json(silent=True) or {}
    raw_ids = data.get('orderIds') or []
    if not isinstance(raw_ids, list) or not raw_ids:
        raise OrderDataError("Field 'orderIds' must be non-empty array")
    if 'k_coefficient' not in data:
        raise OrderDataError("Field 'k_coefficient' is required")
    k_value = to_decimal(data['k_coefficient'])
    if k_value < Decimal('0') or k_value > Decimal('1'):
        raise OrderDataError("k_coefficient must be between 0 and 1")
    order_ids = [int(i) for i in raw_ids if isinstance(i, (int, str))]
    conn = db_connection()
    cursor = conn.cursor(dictionary=True)
    approved = []
    skipped = []
    try:
        for oid in order_ids:
            cursor.execute("SELECT id, status, admin_approved FROM auction_orders WHERE id=%s", (oid,))
            row = cursor.fetchone()
            if not row or row['status'] != 'open' or row['admin_approved'] == 1:
                skipped.append(oid)
                continue
            cursor.execute(
                "UPDATE auction_orders SET admin_approved=1, admin_k_coefficient=%s WHERE id=%s",
                (str(k_value), oid)
            )
            approved.append(oid)
        conn.commit()
        return jsonify({
            "message": "Batch approve complete",
            "kCoefficient": float(k_value),
            "approved": approved,
            "skipped": skipped,
            "total": len(order_ids)
        }), 200
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


@admin_bp.post('/auction-orders/batch-reject')
@require_admin
def batch_reject_orders():
    data = request.get_json(silent=True) or {}
    raw_ids = data.get('orderIds') or []
    reason = (data.get('reason') or '').strip() or None
    if not isinstance(raw_ids, list) or not raw_ids:
        raise OrderDataError("Field 'orderIds' must be non-empty array")
    order_ids = [int(i) for i in raw_ids if isinstance(i, (int, str))]
    conn = db_connection()
    cursor = conn.cursor(dictionary=True)
    rejected = []
    skipped = []
    try:
        for oid in order_ids:
            cursor.execute("SELECT id, status FROM auction_orders WHERE id=%s", (oid,))
            row = cursor.fetchone()
            if not row or row['status'] != 'open':
                skipped.append(oid)
                continue
            cursor.execute("UPDATE auction_orders SET status='rejected', admin_approved=0, rejection_reason=%s WHERE id=%s", (reason, oid))
            rejected.append(oid)
        conn.commit()
        return jsonify({
            "message": "Batch reject complete",
            "rejected": rejected,
            "skipped": skipped,
            "total": len(order_ids),
            "reason": reason
        }), 200
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


@admin_bp.post('/bots')
@require_admin
def create_bot_account():
    data = request.get_json(silent=True) or {}
    user_id = data.get('user_id')
    bot_name = data.get('bot_name', '').strip()
    strategy = data.get('strategy', 'balanced').strip()
    if not user_id or not bot_name:
        raise OrderDataError("Fields 'user_id' and 'bot_name' are required")
    conn = db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT id FROM users WHERE id = %s", (user_id,))
        if not cursor.fetchone():
            raise AppError("User not found", statuscode=404)
        cursor.execute(
            "INSERT INTO bot_accounts (user_id, bot_name, bot_strategy, is_active) VALUES (%s, %s, %s, 1)",
            (user_id, bot_name, strategy)
        )
        bot_id = cursor.lastrowid
        conn.commit()
        return jsonify({
            "message": "Bot account created", "botId": bot_id, "botName": bot_name
        }), 201
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


@admin_bp.post('/bots/fund')
@require_admin
def fund_bot_wallets():
    data = request.get_json(silent=True) or {}
    prefix = (data.get('usernamePrefix') or 'bot_').strip() or 'bot_'
    auction_id = data.get('auctionId')
    amount = _parse_amount(data)
    conn = db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        ensure_users_table(conn)
        ensure_wallet_tables(conn)
        admin_user = get_auth_user(conn)
        if not admin_user:
            raise AppError("Unauthorized", statuscode=401)

        like_pattern = prefix + '%'
        params = []
        if auction_id:
            params = [auction_id, like_pattern]
            cur.execute(
                """
                SELECT DISTINCT u.id, u.username
                FROM users u
                JOIN auction_orders ao ON ao.trader_id = u.id
                WHERE ao.auction_id = %s AND u.username LIKE %s
                """,
                params
            )
        else:
            params = [like_pattern]
            cur.execute(
                """
                SELECT u.id, u.username
                FROM users u
                WHERE u.username LIKE %s
                """,
                params
            )
        bot_rows = cur.fetchall()
        if not bot_rows:
            return jsonify({"message": "No bot users found", "count": 0, "prefix": prefix, "auctionId": auction_id}), 200

        funded = []
        for row in bot_rows:
            result = wallet_deposit(
                conn,
                row['id'],
                amount,
                meta={
                    "source": "bot-fund",
                    "adminId": admin_user.get('id'),
                    "username": row.get('username'),
                    "auctionId": auction_id,
                }
            )
            funded.append({
                "userId": row['id'],
                "username": row.get('username'),
                "available": float(result['available']),
                "reserved": float(result['reserved']),
            })
        conn.commit()
        return jsonify({
            "message": "Bots funded",
            "count": len(funded),
            "amount": float(amount),
            "auctionId": auction_id,
            "prefix": prefix,
            "bots": funded,
        }), 200
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@admin_bp.get('/auctions/<int:auction_id>/clearing-history')
@require_admin
def get_clearing_history(auction_id: int):
    """ОТРИМАННЯ ІСТОРІЇ РАУНДІВ КЛІРИНГУ ДЛЯ АУКЦІОНУ"""
    conn = db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT id FROM auctions WHERE id = %s", (auction_id,))
        if not cursor.fetchone():
            raise AppError("Auction not found", statuscode=404)

        # Check if table exists
        cursor.execute("SHOW TABLES LIKE 'auction_clearing_rounds'")
        if not cursor.fetchone():
            # Table doesn't exist yet - return empty result
            return jsonify({"auctionId": auction_id, "rounds": [], "count": 0}), 200

        cursor.execute(
            """
            SELECT id, round_number, clearing_price, clearing_volume,
                   clearing_demand, clearing_supply, total_bids, total_asks,
                   matched_orders, cleared_at
            FROM auction_clearing_rounds
            WHERE auction_id = %s
            ORDER BY round_number DESC
            """,
            (auction_id,)
        )
        rounds = cursor.fetchall()
        result = [{
            "id": r['id'],
            "roundNumber": r['round_number'],
            "clearingPrice": float(r['clearing_price']) if r['clearing_price'] else None,
            "clearingVolume": float(r['clearing_volume']) if r['clearing_volume'] else None,
            "clearingDemand": float(r['clearing_demand']) if r['clearing_demand'] else None,
            "clearingSupply": float(r['clearing_supply']) if r['clearing_supply'] else None,
            "totalBids": r['total_bids'],
            "totalAsks": r['total_asks'],
            "matchedOrders": r['matched_orders'],
            "clearedAt": r['cleared_at'].isoformat() if r['cleared_at'] else None
        } for r in rounds]
        return jsonify({"auctionId": auction_id, "rounds": result, "count": len(result)}), 200
    finally:
        cursor.close()
        conn.close()


@admin_bp.get('/auctions/pending')
@require_admin
def get_pending_auctions():
    """ОТРИМАННЯ СПИСКУ АУКЦІОНІВ, ЩО ЧЕКАЮТЬ СХВАЛЕННЯ"""
    conn = db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT a.id, a.product, a.type, a.k_value, a.window_start, a.window_end,
                   a.created_at, a.creator_id, a.approval_status,
                   u.username AS creator_username
            FROM auctions a
            LEFT JOIN users u ON u.id = a.creator_id
            WHERE a.approval_status = 'pending'
            ORDER BY a.created_at ASC
            """
        )
        auctions = cursor.fetchall()
        return jsonify(serialize(auctions)), 200
    finally:
        cursor.close()
        conn.close()


@admin_bp.get('/auctions/approved')
@require_admin
def get_approved_auctions():
    """ОТРИМАННЯ СПИСКУ СХВАЛЕНИХ АУКЦІОНІВ"""
    conn = db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT a.id, a.product, a.type, a.k_value, a.window_start, a.window_end,
                   a.created_at, a.creator_id, a.approval_status, a.status,
                   u.username AS creator_username
            FROM auctions a
            LEFT JOIN users u ON u.id = a.creator_id
            WHERE a.approval_status = 'approved' AND a.creator_id IS NOT NULL
            ORDER BY a.created_at DESC
            """
        )
        auctions = cursor.fetchall()
        return jsonify(serialize(auctions)), 200
    finally:
        cursor.close()
        conn.close()


@admin_bp.patch('/auctions/<int:auction_id>/approve')
@require_admin
def approve_auction(auction_id: int):
    """СХВАЛЕННЯ АУКЦІОНУ АДМІНІСТРАТОРОМ"""
    data = request.get_json(silent=True) or {}
    note = (data.get('note') or '').strip() or None

    conn = db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT id, approval_status, creator_id FROM auctions WHERE id=%s", (auction_id,))
        auction = cursor.fetchone()
        if not auction:
            raise AppError("Auction not found", statuscode=404)

        if auction['approval_status'] == 'approved':
            return jsonify({"message": "Auction already approved"}), 200

        admin_user = get_auth_user(conn)
        cursor.execute(
            "UPDATE auctions SET approval_status='approved', approval_note=%s, admin_id=%s WHERE id=%s",
            (note, admin_user['id'] if admin_user else None, auction_id)
        )
        conn.commit()

        return jsonify({
            "message": "Auction approved successfully",
            "auctionId": auction_id,
            "approvedBy": admin_user.get('username') if admin_user else None
        }), 200
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


@admin_bp.patch('/auctions/<int:auction_id>/reject')
@require_admin
def reject_auction(auction_id: int):
    """ВІДХИЛЕННЯ АУКЦІОНУ АДМІНІСТРАТОРОМ"""
    data = request.get_json(silent=True) or {}
    note = (data.get('note') or '').strip() or None

    conn = db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT id, approval_status FROM auctions WHERE id=%s", (auction_id,))
        auction = cursor.fetchone()
        if not auction:
            raise AppError("Auction not found", statuscode=404)

        if auction['approval_status'] == 'rejected':
            return jsonify({"message": "Auction already rejected"}), 200

        cursor.execute(
            "UPDATE auctions SET approval_status='rejected', approval_note=%s, status='closed' WHERE id=%s",
            (note, auction_id)
        )
        conn.commit()

        admin_user = get_auth_user(conn)
        return jsonify({
            "message": "Auction rejected",
            "auctionId": auction_id,
            "note": note,
            "rejectedBy": admin_user.get('username') if admin_user else None
        }), 200
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()
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
