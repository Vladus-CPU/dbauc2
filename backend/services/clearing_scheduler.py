# -*- coding: utf-8 -*-
"""
Модуль автоматичного клірингу для подвійного аукціону
Виконує процедуру клірингу кожні 5 хвилин для активних аукціонів
"""

import json
import threading
import time
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Dict, List, Optional

# Імпортуємо необхідні модулі з нашого проекту
from backend.db import db_connection
from backend.services.auction import compute_k_double_clearing, to_decimal
from backend.services.wallet import wallet_release, wallet_spend

# Константа: інтервал клірингу в секундах (5 хвилин = 300 секунд)
CLEARING_INTERVAL_SECONDS = 300

# Глобальна змінна для зберігання потоку планувальника
_scheduler_thread: Optional[threading.Thread] = None
# Прапорець для зупинки планувальника
_scheduler_running = False


def start_clearing_scheduler():
    """
    ЗАПУСК ПЛАНУВАЛЬНИКА АВТОМАТИЧНОГО КЛІРИНГУ
    
    Ця функція запускає фоновий потік, який кожні 5 хвилин
    перевіряє всі активні аукціони та виконує для них клірінг.
    
    Механізм роботи:
    1. Створюється daemon-потік, який працює у фоновому режимі
    2. Потік не блокує завершення основної програми
    3. Цикл виконується поки _scheduler_running == True
    """
    global _scheduler_thread, _scheduler_running
    
    # Перевіряємо, чи планувальник вже запущено
    if _scheduler_running:
        print("[CLEARING SCHEDULER] Планувальник вже запущено")
        return
    
    # Встановлюємо прапорець роботи
    _scheduler_running = True
    
    # Створюємо та запускаємо новий потік
    # daemon=True означає, що потік завершиться при завершенні основної програми
    _scheduler_thread = threading.Thread(target=_clearing_loop, daemon=True)
    _scheduler_thread.start()
    print(f"[CLEARING SCHEDULER] Запущено. Інтервал: {CLEARING_INTERVAL_SECONDS} секунд")


def stop_clearing_scheduler():
    """
    ЗУПИНКА ПЛАНУВАЛЬНИКА КЛІРИНГУ
    
    Встановлює прапорець зупинки та чекає завершення потоку
    """
    global _scheduler_running, _scheduler_thread
    
    # Встановлюємо прапорець зупинки
    _scheduler_running = False
    
    # Чекаємо завершення потоку (максимум 10 секунд)
    if _scheduler_thread and _scheduler_thread.is_alive():
        _scheduler_thread.join(timeout=10)
    
    print("[CLEARING SCHEDULER] Зупинено")


def _clearing_loop():
    """
    ОСНОВНИЙ ЦИКЛ ПЛАНУВАЛЬНИКА
    
    Ця функція виконується в окремому потоці і періодично:
    1. Шукає аукціони, для яких настав час клірингу
    2. Викликає процедуру клірингу для кожного такого аукціону
    3. Чекає до наступної ітерації
    """
    global _scheduler_running
    
    # Безкінечний цикл, поки не встановлено прапорець зупинки
    while _scheduler_running:
        try:
            # Отримуємо поточний час як UTC (naive datetime)
            # Використовуємо utcnow() для консистентності з aucmodel.py
            now = datetime.utcnow()
            print(f"[CLEARING SCHEDULER] Перевірка аукціонів о {now.isoformat()}")
            
            # Виконуємо клірінг для всіх потрібних аукціонів
            _process_auctions_for_clearing(now)
            
        except Exception as e:
            # Логуємо помилки, але продовжуємо роботу планувальника
            print(f"[CLEARING SCHEDULER ERROR] {str(e)}")
        
        # Чекаємо до наступної ітерації (5 хвилин)
        # Перевіряємо прапорець кожну секунду для швидкої зупинки
        for _ in range(CLEARING_INTERVAL_SECONDS):
            if not _scheduler_running:
                break
            time.sleep(1)


def _process_auctions_for_clearing(current_time: datetime):
    """
    ОБРОБКА АУКЦІОНІВ ДЛЯ КЛІРИНГУ ТА АВТОМАТИЧНОГО ЗАКРИТТЯ
    
    Параметри:
        current_time: поточний час для порівняння з next_clearing_at та window_end
    
    Алгоритм:
    1. Знаходимо всі аукціони зі статусом 'collecting'
    2. Перевіряємо чи закінчився window_end - якщо так, закриваємо аукціон
    3. Для активних аукціонів перевіряємо, чи настав час клірингу
    4. Якщо next_clearing_at <= current_time або це перший раунд, виконуємо клірінг
    """
    # Підключаємося до бази даних
    conn = db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        # КРОК 1: Автоматично закриваємо аукціони, у яких закінчилось вікно торгів
        cursor.execute(
            """
            SELECT id, product, window_end
            FROM auctions
            WHERE status = 'collecting'
              AND window_end IS NOT NULL
              AND window_end <= %s
            """,
            (current_time,)
        )
        auctions_to_close = cursor.fetchall()
        
        if auctions_to_close:
            print(f"[CLOSING SCHEDULER] Знайдено {len(auctions_to_close)} аукціонів для закриття")
            for auction in auctions_to_close:
                try:
                    _close_auction_automatically(conn, auction['id'], current_time)
                    print(f"[CLOSING] Аукціон #{auction['id']} ({auction['product']}) автоматично закрито")
                except Exception as e:
                    print(f"[CLOSING ERROR] Аукціон #{auction['id']}: {str(e)}")
                    conn.rollback()
        
        # КРОК 2: Вибираємо всі активні аукціони, для яких потрібен клірінг
        # Умова: status='collecting' та (next_clearing_at <= now або next_clearing_at IS NULL)
        cursor.execute(
            """
            SELECT id, product, k_value, current_round, last_clearing_at, next_clearing_at
            FROM auctions
            WHERE status = 'collecting'
              AND (next_clearing_at IS NULL OR next_clearing_at <= %s)
            """,
            (current_time,)
        )
        
        # Отримуємо список аукціонів для обробки
        auctions_to_clear = cursor.fetchall()
        
        if auctions_to_clear:
            print(f"[CLEARING SCHEDULER] Знайдено {len(auctions_to_clear)} аукціонів для клірингу")
            for auction in auctions_to_clear:
                print(f"  - Аукціон #{auction['id']} ({auction['product']}): next_clearing_at={auction['next_clearing_at']}")
        else:
            # Check how many auctions are collecting
            cursor.execute("SELECT id, product, status, next_clearing_at FROM auctions WHERE status='collecting'")
            collecting = cursor.fetchall()
            if collecting:
                print(f"[CLEARING SCHEDULER] Є {len(collecting)} аукціонів у стані collecting, але жодний не потребує клірингу:")
                for a in collecting:
                    print(f"  - Аукціон #{a['id']} ({a['product']}): next_clearing_at={a['next_clearing_at']} (current_time={current_time})")
            else:
                print(f"[CLEARING SCHEDULER] Немає аукціонів у стані collecting")
        
        # Обробляємо кожен аукціон окремо
        for auction in auctions_to_clear:
            try:
                # Захист від занадто частого клірингу (менше ніж інтервал)
                last_clear = auction.get('last_clearing_at')
                if last_clear:
                    min_next = last_clear + timedelta(seconds=CLEARING_INTERVAL_SECONDS)
                    if current_time < min_next:
                        # Підтягнути next_clearing_at до мінімального дозволеного часу
                        cursor.execute(
                            "UPDATE auctions SET next_clearing_at=%s WHERE id=%s",
                            (min_next, auction['id'])
                        )
                        conn.commit()
                        print(f"[CLEARING SKIP] Auction #{auction['id']} throttled; next at {min_next.isoformat()}")
                        continue

                # Виконуємо клірінг для одного аукціону
                _execute_clearing_for_auction(conn, auction, current_time)
            except Exception as e:
                # Логуємо помилку, але продовжуємо обробку інших аукціонів
                print(f"[CLEARING ERROR] Аукціон #{auction['id']}: {str(e)}")
                conn.rollback()
        
    finally:
        # Закриваємо курсор та з'єднання
        cursor.close()
        conn.close()


def _execute_clearing_for_auction(conn, auction: Dict, current_time: datetime):
    """
    ВИКОНАННЯ КЛІРИНГУ ДЛЯ ОДНОГО АУКЦІОНУ
    
    Це основна функція, що реалізує механізм подвійного аукціону:
    
    КРОК 1: Отримуємо всі затверджені заявки (ask та bid)
    КРОК 2: Викликаємо алгоритм клірингу з коефіцієнтом k
    КРОК 3: Збільшуємо номер раунду
    КРОК 4: Зберігаємо результати клірингу
    КРОК 5: Оновлюємо статуси заявок та виконуємо фінансові операції
    КРОК 6: Оновлюємо інвентар учасників
    КРОК 7: Створюємо snapshot інвентаризації
    КРОК 8: Плануємо наступний раунд клірингу
    
    Параметри:
        conn: з'єднання з базою даних
        auction: дані аукціону (id, product, k_value, current_round)
        current_time: поточний час виконання клірингу
    """
    auction_id = auction['id']
    product_name = auction['product']
    # Отримуємо коефіцієнт k для цього аукціону
    k_value = to_decimal(auction['k_value'])
    # Отримуємо поточний номер раунду та збільшуємо його
    current_round = int(auction.get('current_round', 0))
    new_round = current_round + 1
    
    print(f"[CLEARING] Аукціон #{auction_id} ({product_name}), раунд #{new_round}")
    
    cursor = conn.cursor(dictionary=True)
    
    try:
        # КРОК 1: ОТРИМАННЯ ЗАЯВОК ДЛЯ КЛІРИНГУ
        # Вибираємо тільки затверджені адміністратором заявки зі статусом 'open'
        # Отримуємо всі відкриті заявки
        # Для тестування: беремо всі заявки зі статусом 'open'
        # (без вимоги admin_approved = 1, щоб дозволити швидке тестування)
        cursor.execute(
            """
            SELECT id, trader_id, side, price, quantity, admin_k_coefficient, iteration
            FROM auction_orders
            WHERE auction_id = %s
              AND status = 'open'
            ORDER BY created_at ASC
            """,
            (auction_id,)
        )
        
        # Отримуємо всі заявки
        orders = cursor.fetchall()
        
        print(f"[CLEARING] Знайдено {len(orders)} затверджених заявок")
        
        # Якщо немає заявок для клірингу, плануємо наступний раунд
        if not orders:
            print(f"[CLEARING] Аукціон #{auction_id}: немає заявок, пропускаємо раунд")
            _schedule_next_clearing(cursor, auction_id, new_round, current_time)
            conn.commit()
            return
        
        # КРОК 2: ВИКОНАННЯ АЛГОРИТМУ ПОДВІЙНОГО АУКЦІОНУ
        # compute_k_double_clearing - це основний алгоритм, який:
        # - Сортує bid-заявки за спаданням ціни (найвищі ціни першими)
        # - Сортує ask-заявки за зростанням ціни (найнижчі ціни першими)
        # - Знаходить точку рівноваги (p_star), де попит = пропозиція
        # - Розраховує клірингову ціну використовуючи коефіцієнт k:
        #   clearing_price = k * ask_marginal_price + (1-k) * bid_marginal_price
        # - Визначає, які заявки будуть виконані та в якому обсязі
        clearing_result = compute_k_double_clearing(orders, k_value)
        
        # Отримуємо результати клірингу
        clearing_price = clearing_result.get('price')  # Фінальна ціна виконання
        clearing_volume = clearing_result.get('volume')  # Загальний обсяг торгів
        clearing_demand = clearing_result.get('demand')  # Сумарний попит
        clearing_supply = clearing_result.get('supply')  # Сумарна пропозиція
        allocations = clearing_result.get('allocations', [])  # Список виконаних заявок
        
        print(f"[CLEARING] Результат: ціна={clearing_price}, обсяг={clearing_volume}")
        
        # КРОК 3: ОНОВЛЕННЯ НОМЕРУ РАУНДУ В АУКЦІОНІ
        cursor.execute(
            """
            UPDATE auctions
            SET current_round = %s,
                last_clearing_at = %s
            WHERE id = %s
            """,
            (new_round, current_time, auction_id)
        )
        
        # КРОК 4: ЗБЕРЕЖЕННЯ РЕЗУЛЬТАТІВ РАУНДУ В ІСТОРІЮ
        # Підраховуємо статистику заявок
        total_bids = sum(1 for o in orders if o['side'] == 'bid')
        total_asks = sum(1 for o in orders if o['side'] == 'ask')
        matched_orders = len(allocations)
        
        # Зберігаємо інформацію про раунд клірингу
        cursor.execute(
            """
            INSERT INTO auction_clearing_rounds
            (auction_id, round_number, clearing_price, clearing_volume,
             clearing_demand, clearing_supply, total_bids, total_asks, matched_orders)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                auction_id,
                new_round,
                str(clearing_price) if clearing_price else None,
                str(clearing_volume) if clearing_volume else None,
                str(clearing_demand) if clearing_demand else None,
                str(clearing_supply) if clearing_supply else None,
                total_bids,
                total_asks,
                matched_orders
            )
        )
        
        # КРОК 5: ОБРОБКА ВИКОНАНИХ ЗАЯВОК
        # Для кожної виконаної заявки:
        # - Оновлюємо статус на 'cleared'
        # - Зберігаємо фактичну ціну та кількість виконання
        # - Виконуємо фінансові операції (списання/зарахування коштів)
        for alloc in allocations:
            order_id = alloc['order_id']
            cleared_qty = to_decimal(alloc['cleared_qty'])
            side = alloc['side']
            
            # Знаходимо повну інформацію про заявку
            order_data = next((o for o in orders if o['id'] == order_id), None)
            if not order_data:
                continue

            order_qty = to_decimal(order_data['quantity'])
            trader_id = order_data['trader_id']

            # Якщо виконано не всю кількість, лишаємо залишок у книзі
            fully_filled = cleared_qty >= order_qty
            if fully_filled:
                cursor.execute(
                    """
                    UPDATE auction_orders
                    SET status = 'cleared',
                        cleared_price = %s,
                        cleared_quantity = %s,
                        iteration = %s
                    WHERE id = %s
                    """,
                    (str(clearing_price), str(cleared_qty), new_round, order_id)
                )
            else:
                remaining = order_qty - cleared_qty
                if remaining < Decimal('0'):
                    remaining = Decimal('0')
                cursor.execute(
                    """
                    UPDATE auction_orders
                    SET quantity = %s,
                        status = 'open',
                        cleared_price = %s,
                        cleared_quantity = COALESCE(cleared_quantity, 0) + %s,
                        iteration = %s
                    WHERE id = %s
                    """,
                    (str(remaining), str(clearing_price), str(cleared_qty), new_round, order_id)
                )
            
            # ФІНАНСОВІ ОПЕРАЦІЇ:
            # Для BID (покупець):
            # - Списуємо зарезервовані кошти
            # - Якщо реальна ціна нижча за заявлену, повертаємо різницю
            if side == 'bid':
                # Розраховуємо вартість покупки
                cost = clearing_price * cleared_qty
                bid_price = to_decimal(order_data['price'])
                # Списуємо кошти з резерву
                wallet_spend(
                    conn=conn,
                    user_id=trader_id,
                    amount=cost,
                    meta={
                        "type": "clearing_bid",
                        "auction_id": auction_id,
                        "order_id": order_id,
                        "round": new_round,
                        "product": product_name,
                        "bid_price": float(bid_price),
                        "clearing_price": float(clearing_price),
                        "quantity": float(cleared_qty),
                        "cost": float(cost),
                    }
                )
                
                # Якщо трейдер заявив вищу ціну, повертаємо різницю
                original_reserve = bid_price * cleared_qty
                if original_reserve > cost:
                    refund = original_reserve - cost
                    wallet_release(
                        conn=conn,
                        user_id=trader_id,
                        amount=refund,
                        meta={
                            "type": "clearing_refund",
                            "auction_id": auction_id,
                            "order_id": order_id,
                            "round": new_round,
                            "product": product_name,
                            "bid_price": float(bid_price),
                            "clearing_price": float(clearing_price),
                            "refund": float(refund),
                        }
                    )
            
            # Для ASK (продавець):
            # - Зараховуємо кошти на рахунок
            elif side == 'ask':
                # Розраховуємо виручку від продажу
                revenue = clearing_price * cleared_qty
                ask_price = to_decimal(order_data['price'])
                import json
                meta_json = json.dumps({
                    "type": "clearing_ask",
                    "auction_id": auction_id,
                    "order_id": order_id,
                    "round": new_round,
                    "product": product_name,
                    "ask_price": float(ask_price),
                    "clearing_price": float(clearing_price),
                    "quantity": float(cleared_qty),
                    "revenue": float(revenue),
                }, ensure_ascii=False)
                # Зараховуємо кошти продавцю
                cursor.execute(
                    """
                    INSERT INTO wallet_transactions
                    (user_id, type, amount, balance_after, meta)
                    SELECT %s, 'deposit', %s,
                           COALESCE((SELECT available FROM wallet_accounts WHERE user_id=%s), 0) + %s,
                           %s
                    """,
                    (
                        trader_id,
                        str(revenue),
                        trader_id,
                        str(revenue),
                        meta_json
                    )
                )
                
                # Оновлюємо баланс гаманця
                cursor.execute(
                    """
                    INSERT INTO wallet_accounts (user_id, available)
                    VALUES (%s, %s)
                    ON DUPLICATE KEY UPDATE available = available + %s
                    """,
                    (trader_id, str(revenue), str(revenue))
                )
        
        # КРОК 6: ОНОВЛЕННЯ ІНВЕНТАРЮ УЧАСНИКІВ
        # Після виконання торгів потрібно оновити кількість товару:
        # - Покупці отримують товар (інвентар збільшується)
        # - Продавці віддають товар (інвентар зменшується)
        _update_inventory_after_clearing(
            conn=conn,
            auction_id=auction_id,
            product=product_name,
            allocations=allocations,
            orders=orders,
            round_number=new_round
        )
        
        # КРОК 7: СТВОРЕННЯ SNAPSHOT ІНВЕНТАРИЗАЦІЇ
        # Зберігаємо повний стан інвентарю всіх учасників після клірингу
        _create_inventory_snapshot(conn, auction_id, new_round)
        
        # КРОК 8: ПЛАНУВАННЯ НАСТУПНОГО РАУНДУ
        # Встановлюємо час наступного клірингу (через 5 хвилин)
        _schedule_next_clearing(cursor, auction_id, new_round, current_time)
        
        # Фіксуємо всі зміни в базі даних
        conn.commit()
        
        print(f"[CLEARING] Аукціон #{auction_id}, раунд #{new_round} успішно завершено")
        
    except Exception as e:
        # У разі помилки відміняємо всі зміни
        conn.rollback()
        print(f"[CLEARING ERROR] Аукціон #{auction_id}: {str(e)}")
        raise
    finally:
        cursor.close()


def _update_inventory_after_clearing(
    conn,
    auction_id: int,
    product: str,
    allocations: List[Dict],
    orders: List[Dict],
    round_number: int
):
    """
    ОНОВЛЕННЯ ІНВЕНТАРЮ ПІСЛЯ КЛІРИНГУ
    
    Після виконання торгів необхідно оновити інвентар учасників:
    
    Для ПОКУПЦІВ (bid):
    - Збільшуємо кількість товару на cleared_quantity
    - Додаємо запис в trader_inventory
    
    Для ПРОДАВЦІВ (ask):
    - Зменшуємо кількість товару на cleared_quantity
    - Віднімаємо з trader_inventory
    
    Параметри:
        conn: з'єднання з базою даних
        auction_id: ID аукціону
        product: назва товару
        allocations: список виконаних заявок
        orders: всі заявки для знаходження trader_id
        round_number: номер поточного раунду
    """
    cursor = conn.cursor()
    
    try:
        # Обробляємо кожну виконану заявку
        for alloc in allocations:
            order_id = alloc['order_id']
            cleared_qty = to_decimal(alloc['cleared_qty'])
            side = alloc['side']
            
            # Знаходимо дані заявки
            order_data = next((o for o in orders if o['id'] == order_id), None)
            if not order_data:
                continue
            
            trader_id = order_data['trader_id']
            
            # Визначаємо зміну інвентарю:
            # bid (покупець) -> +cleared_qty (отримує товар)
            # ask (продавець) -> -cleared_qty (віддає товар)
            if side == 'bid':
                delta_qty = cleared_qty  # Покупець отримує товар
            elif side == 'ask':
                delta_qty = -cleared_qty  # Продавець віддає товар
            else:
                continue
            
            # Оновлюємо інвентар в базі даних
            # Використовуємо ON DUPLICATE KEY UPDATE для автоматичного створення запису
            cursor.execute(
                """
                INSERT INTO trader_inventory (trader_id, product, quantity)
                VALUES (%s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    quantity = quantity + VALUES(quantity),
                    updated_at = CURRENT_TIMESTAMP
                """,
                (trader_id, product, str(delta_qty))
            )
            
            # Логуємо транзакцію інвентаризації
            transaction_type = 'inventory_add' if delta_qty > 0 else 'inventory_remove'
            cursor.execute(
                """
                INSERT INTO resource_transactions
                (trader_id, type, quantity, notes)
                VALUES (%s, %s, %s, %s)
                """,
                (
                    trader_id,
                    transaction_type,
                    str(abs(delta_qty)),
                    f"Auction #{auction_id}, round #{round_number}, order #{order_id}"
                )
            )
        
        # Видаляємо записи з нульовою або від'ємною кількістю
        cursor.execute(
            """
            DELETE FROM trader_inventory
            WHERE quantity <= 0
            """
        )
        
    finally:
        cursor.close()


def _create_inventory_snapshot(conn, auction_id: int, round_number: int):
    """
    СТВОРЕННЯ SNAPSHOT ІНВЕНТАРИЗАЦІЇ
    
    Після кожного клірингу створюємо знімок стану інвентарю всіх учасників.
    Це дозволяє:
    - Відстежувати зміни інвентарю в часі
    - Проводити аудит торгових операцій
    - Відновлювати стан на певний момент часу
    
    Snapshot зберігається у форматі JSON з інформацією:
    - trader_id: ID учасника
    - inventory: список товарів та їх кількість
    
    Параметри:
        conn: з'єднання з базою даних
        auction_id: ID аукціону
        round_number: номер раунду клірингу
    """
    cursor = conn.cursor(dictionary=True)
    
    try:
        # Вибираємо весь інвентар всіх учасників
        cursor.execute(
            """
            SELECT trader_id, product, quantity
            FROM trader_inventory
            WHERE quantity > 0
            ORDER BY trader_id, product
            """
        )
        
        inventory_data = cursor.fetchall()
        
        # Формуємо структуру даних для snapshot
        snapshot = {}
        for row in inventory_data:
            trader_id = row['trader_id']
            product = row['product']
            quantity = float(row['quantity'])
            
            # Групуємо по trader_id
            if trader_id not in snapshot:
                snapshot[trader_id] = {}
            
            snapshot[trader_id][product] = quantity
        
        # Конвертуємо в JSON
        snapshot_json = json.dumps(snapshot, ensure_ascii=False)
        
        # Зберігаємо snapshot в базу даних
        cursor.execute(
            """
            INSERT INTO inventory_snapshots
            (auction_id, round_number, snapshot_data)
            VALUES (%s, %s, %s)
            """,
            (auction_id, round_number, snapshot_json)
        )
        
        print(f"[INVENTORY] Створено snapshot для аукціону #{auction_id}, раунд #{round_number}")
        
    finally:
        cursor.close()


def _close_auction_automatically(conn, auction_id: int, current_time: datetime):
    """
    АВТОМАТИЧНЕ ЗАКРИТТЯ АУКЦІОНУ ПІСЛЯ ЗАКІНЧЕННЯ ВІКНА ТОРГІВ
    
    Параметри:
        conn: з'єднання з базою даних
        auction_id: ID аукціону для закриття
        current_time: поточний час
    """
    cursor = conn.cursor()
    try:
        # Оновлюємо статус аукціону на 'closed'
        cursor.execute(
            """
            UPDATE auctions
            SET status = 'closed', closed_at = %s
            WHERE id = %s AND status = 'collecting'
            """,
            (current_time, auction_id)
        )
        conn.commit()
    finally:
        cursor.close()


def _schedule_next_clearing(cursor, auction_id: int, current_round: int, current_time: datetime):
    """
    ПЛАНУВАННЯ НАСТУПНОГО РАУНДУ КЛІРИНГУ
    
    Встановлює час наступного клірингу (через 5 хвилин від поточного).
    Це забезпечує автоматичне виконання клірингу з фіксованим інтервалом.
    
    Параметри:
        cursor: курсор бази даних
        auction_id: ID аукціону
        current_round: номер поточного раунду
        current_time: поточний час
    """
    # Розраховуємо час наступного клірингу (через 5 хвилин)
    next_clearing_time = current_time + timedelta(seconds=CLEARING_INTERVAL_SECONDS)
    
    # Оновлюємо інформацію в таблиці аукціонів
    cursor.execute(
        """
        UPDATE auctions
        SET next_clearing_at = %s
        WHERE id = %s
        """,
        (next_clearing_time, auction_id)
    )
    
    print(f"[CLEARING] Наступний клірінг для аукціону #{auction_id} заплановано на {next_clearing_time.isoformat()}")


# Експортуємо функції для використання в інших модулях
__all__ = ['start_clearing_scheduler', 'stop_clearing_scheduler', 'CLEARING_INTERVAL_SECONDS']
