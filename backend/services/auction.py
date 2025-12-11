# -*- coding: utf-8 -*-
"""
МОДУЛЬ АЛГОРИТМІВ ПОДВІЙНОГО АУКЦІОНУ (DOUBLE AUCTION)

Цей модуль реалізує два основні алгоритми клірингу для подвійного аукціону:
1. Call Market Clearing - класичний аукціон з визначенням єдиної ціни
2. K-Double Auction - подвійний аукціон з коефіцієнтом k для гнучкого ціноутворення

ПОДВІЙНИЙ АУКЦІОН (Double Auction):
Це механізм торгівлі, де одночасно присутні:
- Покупці (bids) - подають заявки на купівлю з максимальною ціною, яку готові заплатити
- Продавці (asks) - подають заявки на продаж з мінімальною ціною, за яку готові продати

Мета: знайти ціну рівноваги (clearing price), при якій максимізується обсяг торгівлі
"""

from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, List, Optional, Tuple
from backend.errors import OrderDataError


def to_decimal(n) -> Decimal:
    """
    БЕЗПЕЧНЕ ПЕРЕТВОРЕННЯ ЗНАЧЕННЯ В DECIMAL

    Функція конвертує різні типи даних в Decimal для точних фінансових розрахунків.
    Використання Decimal замість float дозволяє уникнути помилок округлення.

    Приклад:
        float: 0.1 + 0.2 = 0.30000000000000004
        Decimal: 0.1 + 0.2 = 0.3 (точно)

    Параметри:
        n: значення для перетворення (int, float, str, Decimal)

    Повертає:
        Decimal: точне числове значення

    Викидає:
        OrderDataError: якщо значення не може бути перетворене
    """
    try:
        # Якщо вже Decimal, повертаємо як є
        if isinstance(n, Decimal):
            return n
        # Перетворюємо в рядок, потім в Decimal (найбезпечніший спосіб)
        return Decimal(str(n))
    except Exception:
        raise OrderDataError("Invalid numeric value")


# Константа для квантування (округлення) чисел до 6 знаків після коми
# Це визначає точність фінансових розрахунків (0.000001)
DECIMAL_QUANT = Decimal('0.000001')


def compute_call_market_clearing(orders: List[Dict]) -> Dict[str, Any]:
    """
    АЛГОРИТМ КЛАСИЧНОГО CALL MARKET CLEARING

    Це базовий алгоритм аукціону, що визначає єдину ціну для всіх учасників.

    МЕХАНІЗМ РОБОТИ:

    1. РОЗДІЛЕННЯ ЗАЯВОК:
       - Bid (заявки на купівлю): "Готовий купити за ціною не вище X"
       - Ask (заявки на продаж): "Готовий продати за ціною не нижче Y"

    2. СОРТУВАННЯ:
       - Bid: від найвищої до найнижчої (найагресивніші покупці першими)
       - Ask: від найнижчої до найвищої (найагресивніші продавці першими)

    3. ПОШУК РІВНОВАГИ:
       - Для кожного рівня ціни розраховуємо:
         * Demand (попит): скільки покупців готові купити за цією ціною
         * Supply (пропозиція): скільки продавців готові продати за цією ціною
       - Шукаємо ціну, де demand ≤ supply та обсяг максимальний

    4. ВИЗНАЧЕННЯ CLEARING PRICE:
       - Беремо інтервал між найвищою виграшною bid та найнижчою виграшною ask
       - Фінальна ціна = середнє арифметичне інтервалу

    5. ALLOCATION (розподіл):
       - Визначаємо, хто з учасників та в якому обсязі отримує виконання

    Параметри:
        orders: список заявок, кожна містить:
            - id: унікальний ідентифікатор
            - side: 'bid' або 'ask'
            - price: ціна заявки
            - quantity: кількість
            - created_at: час створення (для пріоритету)

    Повертає:
        Dict з результатами:
            - price: клірингова ціна
            - volume: загальний обсяг торгівлі
            - allocations: список виконаних заявок
            - demand: загальний попит на рівні ціни
            - supply: загальна пропозиція на рівні ціни
            - price_interval: діапазон можливих цін (нижня, верхня)
    """

    # ФУНКЦІЇ СОРТУВАННЯ для визначення пріоритету заявок

    def _sort_key_bid(order: Dict[str, Any]) -> Tuple[Decimal, Any]:
        """
        Ключ сортування для BID (заявок на купівлю)

        Пріоритет:
        1. Вища ціна (мінус для сортування за спаданням)
        2. Раніше створена заявка (при однаковій ціні)
        """
        created_at = order.get('created_at')
        return (-order['price'], created_at)

    def _sort_key_ask(order: Dict[str, Any]) -> Tuple[Decimal, Any]:
        """
        Ключ сортування для ASK (заявок на продаж)

        Пріоритет:
        1. Нижча ціна (сортування за зростанням)
        2. Раніше створена заявка (при однаковій ціні)
        """
        created_at = order.get('created_at')
        return (order['price'], created_at)

    # КРОК 1: НОРМАЛІЗАЦІЯ ТА РОЗДІЛЕННЯ ЗАЯВОК

    # Відбираємо всі BID заявки та конвертуємо значення в Decimal
    bids = [
        {
            **o,  # Копіюємо всі поля заявки
            'price': to_decimal(o['price']),  # Конвертуємо ціну в Decimal
            'quantity': to_decimal(o['quantity'])  # Конвертуємо кількість в Decimal
        }
        for o in orders
        if o['side'] == 'bid'  # Тільки заявки на купівлю
    ]

    # Відбираємо всі ASK заявки
    asks = [
        {
            **o,
            'price': to_decimal(o['price']),
            'quantity': to_decimal(o['quantity'])
        }
        for o in orders
        if o['side'] == 'ask'  # Тільки заявки на продаж
    ]

    # ПЕРЕВІРКА: чи є і покупці, і продавці
    # Без обох сторін торгівля неможлива
    if not bids or not asks:
        return {
            "price": Decimal('0'),
            "volume": Decimal('0'),
            "allocations": [],
            "demand": Decimal('0'),
            "supply": Decimal('0'),
            "price_interval": (None, None),
        }

    # КРОК 2: СОРТУВАННЯ ЗАЯВОК ЗА ПРІОРИТЕТОМ

    # Сортуємо bid: найвищі ціни спочатку (найагресивніші покупці)
    bids.sort(key=_sort_key_bid)
    # Сортуємо ask: найнижчі ціни спочатку (найагресивніші продавці)
    asks.sort(key=_sort_key_ask)

    # КРОК 3: СТВОРЕННЯ СПИСКУ ВСІХ МОЖЛИВИХ ЦІНОВИХ РІВНІВ

    # Об'єднуємо всі унікальні ціни з bid та ask заявок
    # Це формує "price grid" - сітку цін для аналізу
    price_levels = sorted({*(b['price'] for b in bids), *(a['price'] for a in asks)})

    # КРОК 4: РОЗРАХУНОК КУМУЛЯТИВНОГО ПОПИТУ ТА ПРОПОЗИЦІЇ

    # Для кожного рівня ціни розраховуємо:
    # - Скільки покупців готові купити за цією ціною або вище
    # - Скільки продавців готові продати за цією ціною або нижче
    cumulative: List[Tuple[Decimal, Decimal, Decimal]] = []
    for price_level in price_levels:
        # DEMAND: сума quantity всіх bid з price >= price_level
        # (всі покупці, що готові заплатити не менше цієї ціни)
        demand = sum(b['quantity'] for b in bids if b['price'] >= price_level)

        # SUPPLY: сума quantity всіх ask з price <= price_level
        # (всі продавці, що готові продати за цією ціною або нижче)
        supply = sum(a['quantity'] for a in asks if a['price'] <= price_level)

        cumulative.append((price_level, demand, supply))

    # КРОК 5: ПОШУК ОПТИМАЛЬНОЇ ЦІНИ РІВНОВАГИ

    # ІДЕАЛЬНИЙ КАНДИДАТ: demand > 0, supply > 0, demand ≤ supply
    # Це означає, що всі покупці можуть бути задоволені
    candidate = next(
        (
            (px, demand, supply)
            for (px, demand, supply) in cumulative
            if demand > 0 and supply > 0 and demand <= supply
        ),
        None  # Якщо не знайдено, candidate = None
    )

    # Якщо ідеального кандидата немає, шукаємо компромісний варіант
    if candidate is None:
        # Вибираємо ціну з максимальним обсягом торгівлі min(demand, supply)
        # При рівних обсягах обираємо нижчу ціну (краще для покупців)
        candidate = max(
            ((px, demand, supply) for (px, demand, supply) in cumulative if min(demand, supply) > 0),
            default=None,
            key=lambda item: (min(item[1], item[2]), -float(item[0]))
        )

    # Якщо взагалі немає можливості торгувати
    if candidate is None:
        return {
            "price": Decimal('0'),
            "volume": Decimal('0'),
            "allocations": [],
            "demand": Decimal('0'),
            "supply": Decimal('0'),
            "price_interval": (None, None),
        }

    # Розпаковуємо результати пошуку рівноваги
    clearing_price_hint, demand_at_price, supply_at_price = candidate

    # Обсяг торгівлі = мінімум з попиту та пропозиції
    # (не можна продати більше, ніж хочуть купити, і навпаки)
    trade_volume = min(demand_at_price, supply_at_price)

    # Якщо обсяг нульовий, торгівля неможлива
    if trade_volume <= 0:
        return {
            "price": Decimal('0'),
            "volume": Decimal('0'),
            "allocations": [],
            "demand": demand_at_price,
            "supply": supply_at_price,
            "price_interval": (None, None),
        }

    # КРОК 6: ВИЗНАЧЕННЯ ВИГРАШНИХ ЗАЯВОК

    # Eligible bids: всі bid з ціною >= clearing_price_hint
    # (покупці, що готові платити достатньо)
    eligible_bids = [b for b in bids if b['price'] >= clearing_price_hint]

    # Eligible asks: всі ask з ціною <= clearing_price_hint
    # (продавці, що готові продавати за цією ціною)
    eligible_asks = [a for a in asks if a['price'] <= clearing_price_hint]

    # КРОК 7: ALLOCATION ДЛЯ BID (розподіл для покупців)

    bid_allocs: List[Dict[str, Any]] = []
    remaining = trade_volume  # Залишок для розподілу

    for index, order in enumerate(eligible_bids):
        # Якщо весь обсяг розподілений, зупиняємось
        if remaining <= 0:
            break

        # Визначаємо, скільки виконати для цієї заявки
        fill = order['quantity'] if order['quantity'] <= remaining else remaining

        # Якщо це остання заявка, віддаємо їй весь залишок
        # (для точного виконання trade_volume)
        if index == len(eligible_bids) - 1:
            fill = remaining

        if fill > 0:
            # Додаємо allocation (запис про виконання)
            bid_allocs.append({
                "order_id": order['id'],
                "cleared_qty": fill,  # Виконана кількість
                "side": 'bid'
            })
            remaining -= fill

    # Якщо залишився обсяг (може бути через округлення), додаємо до останньої заявки
    if remaining > 0:
        for alloc in bid_allocs:
            if remaining <= 0:
                break
            alloc['cleared_qty'] += remaining
            remaining = Decimal('0')

    # КРОК 8: ALLOCATION ДЛЯ ASK (розподіл для продавців)

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

    # КРОК 9: ВИЗНАЧЕННЯ ФІНАЛЬНОЇ CLEARING PRICE

    # Знаходимо ціни виконаних заявок
    executed_bid_prices = [next(b['price'] for b in eligible_bids if b['id'] == alloc['order_id']) for alloc in bid_allocs]
    executed_ask_prices = [next(a['price'] for a in eligible_asks if a['id'] == alloc['order_id']) for alloc in ask_allocs]

    # Найвища виграшна bid (максимальна ціна покупця, що отримав виконання)
    highest_winning_bid = max(executed_bid_prices) if executed_bid_prices else None
    # Найнижча виграшна ask (мінімальна ціна продавця, що отримав виконання)
    lowest_winning_ask = min(executed_ask_prices) if executed_ask_prices else None

    # Знаходимо програшні заявки (найближчі заявки, що не отримали виконання)
    executed_ids = {alloc['order_id'] for alloc in bid_allocs}.union({alloc['order_id'] for alloc in ask_allocs})
    losing_bid_price = max((o['price'] for o in bids if o['id'] not in executed_ids), default=None)
    losing_ask_price = min((o['price'] for o in asks if o['id'] not in executed_ids), default=None)

    # ФОРМУВАННЯ ЦІНОВОГО ІНТЕРВАЛУ
    # Нижня межа: max(lowest_winning_ask, losing_bid_price, hint)
    # Верхня межа: min(highest_winning_bid, losing_ask_price, hint)

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

    # Якщо інтервал інвертований, виправляємо
    if lower_bound > upper_bound:
        lower_bound = min(lower_candidates)
        upper_bound = max(upper_candidates)

    # ФІНАЛЬНА ЦІНА = середнє арифметичне інтервалу
    # Це забезпечує справедливість для обох сторін
    clearing_price = ((lower_bound + upper_bound) / Decimal('2')).quantize(DECIMAL_QUANT, rounding=ROUND_HALF_UP)

    # КРОК 10: ФОРМУВАННЯ РЕЗУЛЬТАТУ

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
    """
    АЛГОРИТМ K-DOUBLE AUCTION CLEARING

    Це розширений алгоритм подвійного аукціону з параметром k,
    що дозволяє адміністратору впливати на ціноутворення.

    КОЕФІЦІЄНТ K (0 ≤ k ≤ 1):

    - k = 0: ціна визначається тільки покупцями (bid)
      clearing_price = bid_marginal_price
      Переваги отримують ПРОДАВЦІ (вищі ціни)

    - k = 0.5: збалансована ціна (середнє між bid і ask)
      clearing_price = (bid_marginal + ask_marginal) / 2
      СПРАВЕДЛИВО для обох сторін

    - k = 1: ціна визначається тільки продавцями (ask)
      clearing_price = ask_marginal_price
      Переваги отримують ПОКУПЦІ (нижчі ціни)

    ФОРМУЛА:
    clearing_price = k × ask_marginal + (1 - k) × bid_marginal

    МЕХАНІЗМ РОБОТИ:

    1. НОРМАЛІЗАЦІЯ: конвертуємо всі ціни та кількості в Decimal
    2. РОЗДІЛЕННЯ: bid та ask заявки
    3. СОРТУВАННЯ: за ціною та пріоритетом (iteration або created_at)
    4. ПОШУК P_STAR: ціна рівноваги з максимальним обсягом
    5. ALLOCATION: розподіл виконання між заявками
    6. MARGINAL PRICES: визначаємо граничні ціни bid та ask
    7. K-FORMULA: розраховуємо фінальну ціну з коефіцієнтом k
    8. FINALIZATION: фіналізуємо allocations та результат

    Параметри:
        orders: список заявок (структура як у compute_call_market_clearing)
        k: коефіцієнт адміністратора (0-1), визначає баланс між bid та ask

    Повертає:
        Dict з результатами (аналогічно compute_call_market_clearing, плюс):
            - p_star: ціна рівноваги з максимальним обсягом

    Викидає:
        OrderDataError: якщо k поза діапазоном [0, 1]
    """

    # ФУНКЦІЯ ВИЗНАЧЕННЯ ПРІОРИТЕТУ ЗАЯВОК
    def _priority_key(order: Dict[str, Any]) -> Tuple[int, Any]:
        """
        Ключ пріоритету для сортування заявок

        Пріоритет:
        1. Заявки з iteration (номер раунду) - вищий пріоритет
        2. Заявки з created_at (час створення)
        3. Заявки з тільки ID (найнижчий пріоритет)

        Це дозволяє обробляти заявки з попередніх раундів першими
        """
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

    # ВАЛІДАЦІЯ КОЕФІЦІЄНТА K
    k_value = to_decimal(k)
    if k_value < Decimal('0') or k_value > Decimal('1'):
        raise OrderDataError("Parameter 'k' must be between 0 and 1")

    # КРОК 1: НОРМАЛІЗАЦІЯ ТА ВАЛІДАЦІЯ ЗАЯВОК

    normalized: List[Dict[str, Any]] = []
    for order in orders:
        try:
            # Конвертуємо ціну та кількість в Decimal
            price = to_decimal(order['price'])
            quantity = to_decimal(order['quantity'])
        except OrderDataError:
            raise

        # Відкидаємо некоректні заявки (ціна або кількість <= 0)
        if price <= 0 or quantity <= 0:
            continue

        normalized.append({
            **order,
            'price': price,
            'quantity': quantity
        })

    # КРОК 2: РОЗДІЛЕННЯ НА BID ТА ASK

    bids = [o for o in normalized if o['side'] == 'bid']
    asks = [o for o in normalized if o['side'] == 'ask']

    # Перевірка наявності обох сторін
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

    # КРОК 3: СОРТУВАННЯ ЗАЯВОК

    # Bid: від найвищої ціни до найнижчої, потім за пріоритетом
    bids.sort(key=lambda x: (-x['price'], _priority_key(x)))

    # Ask: від найнижчої ціни до найвищої, потім за пріоритетом
    asks.sort(key=lambda x: (x['price'], _priority_key(x)))

    # КРОК 4: СТВОРЕННЯ PRICE GRID

    # Всі унікальні ціни з обох сторін
    price_grid = sorted({*(b['price'] for b in bids), *(a['price'] for a in asks)})

    # Функції розрахунку кумулятивного попиту та пропозиції
    def cumulative_demand(px: Decimal) -> Decimal:
        """Сумарна кількість bid з price >= px"""
        return sum(b['quantity'] for b in bids if b['price'] >= px)

    def cumulative_supply(px: Decimal) -> Decimal:
        """Сумарна кількість ask з price <= px"""
        return sum(a['quantity'] for a in asks if a['price'] <= px)

    # КРОК 5: ПОШУК P_STAR (ціни рівноваги з максимальним обсягом)

    best: Optional[Tuple[Decimal, Decimal, Decimal, Decimal, Decimal]] = None

    for price_level in price_grid:
        # Розраховуємо попит та пропозицію на цьому рівні
        demand_at_level = cumulative_demand(price_level)
        supply_at_level = cumulative_supply(price_level)

        # Обсяг торгівлі = мінімум з попиту та пропозиції
        traded = min(demand_at_level, supply_at_level)

        # Якщо обсяг нульовий, пропускаємо
        if traded <= 0:
            continue

        # Дисбаланс: чим менший, тим краще (ідеально = 0)
        imbalance = -abs(demand_at_level - supply_at_level)

        # Кандидат: (обсяг, дисбаланс, ціна, попит, пропозиція)
        candidate = (
            traded,
            imbalance,
            price_level,
            demand_at_level,
            supply_at_level,
        )

        # Якщо це перший кандидат, зберігаємо
        if best is None:
            best = candidate
            continue

        # КРИТЕРІЇ ВИБОРУ КРАЩОГО КАНДИДАТА:
        # 1. Більший обсяг торгівлі
        # 2. Менший дисбаланс (при рівному обсязі)
        # 3. Вища ціна (при рівному обсязі та дисбалансі)

        if candidate[0] > best[0]:  # Більший обсяг
            best = candidate
        elif candidate[0] == best[0]:  # Рівний обсяг
            if candidate[1] > best[1]:  # Менший дисбаланс
                best = candidate
            elif candidate[1] == best[1] and candidate[2] > best[2]:  # Вища ціна
                best = candidate

    # Якщо не знайдено жодного кандидата
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

    # Розпаковуємо найкращий результат
    trade_qty = best[0]  # Обсяг торгівлі
    p_star = best[2]  # Ціна рівноваги
    demand_at_star = best[3]  # Попит на рівні p_star
    supply_at_star = best[4]  # Пропозиція на рівні p_star

    # Перевірка на нульовий обсяг
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

    # КРОК 6: ВИЗНАЧЕННЯ ВИГРАШНИХ ЗАЯВОК

    # Bid з ціною >= p_star
    winning_bids = [b for b in bids if b['price'] >= p_star]
    # Ask з ціною <= p_star
    winning_asks = [a for a in asks if a['price'] <= p_star]

    # КРОК 7: ALLOCATION ДЛЯ BID

    remaining = trade_qty
    bid_allocs: List[Dict[str, Any]] = []
    bid_marginal_price: Decimal | None = None  # Гранична ціна bid

    for idx, bid in enumerate(winning_bids):
        if remaining <= 0:
            break

        # Скільки виконати для цієї заявки
        fill = min(bid['quantity'], remaining)

        if fill <= 0:
            continue

        remaining -= fill

        bid_allocs.append({
            "order_id": bid['id'],
            "cleared_qty": fill,
            "side": 'bid',
        })

        # Зберігаємо ціну останньої виконаної bid (маргінальна ціна)
        bid_marginal_price = bid['price']

    # КРОК 8: ALLOCATION ДЛЯ ASK

    remaining = trade_qty
    ask_allocs: List[Dict[str, Any]] = []
    ask_marginal_price: Decimal | None = None  # Гранична ціна ask

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

        # Зберігаємо ціну останньої виконаної ask (маргінальна ціна)
        ask_marginal_price = ask['price']

    # Перевірка наявності виконаних заявок та маргінальних цін
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

    # КРОК 9: РОЗРАХУНОК CLEARING PRICE З КОЕФІЦІЄНТОМ K

    # Визначаємо інтервал можливих цін
    lower_bound = min(ask_marginal_price, bid_marginal_price)
    upper_bound = max(ask_marginal_price, bid_marginal_price)

    # ФОРМУЛА K-DOUBLE AUCTION:
    # price = k × ask_marginal + (1 - k) × bid_marginal
    #
    # Пояснення:
    # - k=0: ціна = bid_marginal (покупці визначають ціну)
    # - k=1: ціна = ask_marginal (продавці визначають ціну)
    # - k=0.5: ціна = середнє між bid і ask (збалансована ціна)
    price_k = (k_value * ask_marginal_price) + ((Decimal('1') - k_value) * bid_marginal_price)

    # Обмежуємо ціну інтервалом [lower_bound, upper_bound]
    if price_k < lower_bound:
        price_k = lower_bound
    if price_k > upper_bound:
        price_k = upper_bound

    # Округлюємо до 6 знаків після коми
    price_k = price_k.quantize(DECIMAL_QUANT, rounding=ROUND_HALF_UP)

    # Розраховуємо попит та пропозицію на фінальній ціні
    demand_at_price = cumulative_demand(price_k)
    supply_at_price = cumulative_supply(price_k)

    # КРОК 10: ФІНАЛІЗАЦІЯ ALLOCATIONS

    def _finalize_allocations(entries: List[Dict[str, Any]], target: Decimal) -> List[Dict[str, Any]]:
        """
        Коригує allocations для точного виконання цільового обсягу

        Через округлення можуть виникнути невеликі розбіжності,
        тому остання заявка отримує скоригований обсяг
        """
        if not entries:
            return entries

        running = Decimal('0')
        last_index = len(entries) - 1

        for idx, entry in enumerate(entries):
            qty = entry['cleared_qty']

            # Для останньої заявки розраховуємо точний залишок
            if idx == last_index:
                qty = target - running

            # Округлюємо до 6 знаків
            qty = qty.quantize(DECIMAL_QUANT, rounding=ROUND_HALF_UP)

            # Не дозволяємо від'ємні значення
            if qty < Decimal('0'):
                qty = Decimal('0')

            entry['cleared_qty'] = qty
            running += qty

        return entries

    # Фіналізуємо allocations для bid та ask
    bid_allocs = _finalize_allocations(bid_allocs, trade_qty)
    ask_allocs = _finalize_allocations(ask_allocs, trade_qty)

    # Округлюємо загальний обсяг
    total_volume = trade_qty.quantize(DECIMAL_QUANT, rounding=ROUND_HALF_UP)

    # КРОК 11: ФОРМУВАННЯ ФІНАЛЬНОГО РЕЗУЛЬТАТУ

    return {
        "price": price_k,  # Клірингова ціна з коефіцієнтом k
        "volume": total_volume,  # Загальний обсяг торгівлі
        "allocations": bid_allocs + ask_allocs,  # Всі виконання
        "demand": demand_at_price.quantize(DECIMAL_QUANT, rounding=ROUND_HALF_UP),
        "supply": supply_at_price.quantize(DECIMAL_QUANT, rounding=ROUND_HALF_UP),
        "price_interval": (
            lower_bound.quantize(DECIMAL_QUANT, rounding=ROUND_HALF_UP),
            upper_bound.quantize(DECIMAL_QUANT, rounding=ROUND_HALF_UP),
        ),
        "p_star": p_star,  # Ціна рівноваги
    }


# Експортуємо функції для використання в інших модулях
__all__ = ['compute_call_market_clearing', 'compute_k_double_clearing', 'to_decimal']
