import { listAuctions, joinAuction, placeAuctionOrder } from '../api.js';
import { showToast } from '../ui/toast.js';
import { initAccessControl } from '../ui/session.js';

function el(tag, props = {}, ...children) {
  const element = document.createElement(tag);
  Object.assign(element, props);
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (typeof child === 'string') {
      element.appendChild(document.createTextNode(child));
    } else {
      element.appendChild(child);
    }
  }
  return element;
}

function formatNumber(value, options = {}) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return Number(value).toLocaleString('uk-UA', { minimumFractionDigits: 0, maximumFractionDigits: 6, ...options });
}

function formatPrice(value) {
  return formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('uk-UA', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function statusLabel(status) {
  switch (status) {
    case 'collecting':
      return 'Збір заявок';
    case 'cleared':
      return 'Відкліринено';
    case 'closed':
      return 'Закрито';
    default:
      return status;
  }
}

function updateMetrics(auctions) {
  const metricsRoot = document.getElementById('auction-metrics');
  if (!metricsRoot) return;
  metricsRoot.innerHTML = '';
  const collecting = auctions.filter(a => a.status === 'collecting');
  const cleared = auctions.filter(a => a.status === 'cleared');
  const closed = auctions.filter(a => a.status === 'closed');
  const upcoming = auctions
    .map(a => (a.window_start ? new Date(a.window_start) : null))
    .filter(date => date && !Number.isNaN(date.getTime()) && date > new Date())
    .sort((a, b) => a - b)[0] || null;

  const metrics = [
    { label: 'Усього аукціонів', value: auctions.length },
    { label: 'Збір заявок', value: collecting.length },
    { label: 'Відкліринено', value: cleared.length },
    { label: 'Закрито', value: closed.length },
    { label: 'Найближчий старт', value: upcoming ? formatDate(upcoming) : '—' }
  ];

  metrics.forEach((metric) => {
    const tile = el('div', { className: 'metrics-tile' },
      el('span', { className: 'metrics-tile__value' }, String(metric.value ?? '—')),
      el('span', { className: 'metrics-tile__label' }, metric.label)
    );
    metricsRoot.appendChild(tile);
  });
}

function updateHero(session) {
  const cta = document.getElementById('auction-session-cta');
  if (!cta) return;
  cta.innerHTML = '';
  if (!session?.authenticated) {
    cta.append(
      el('a', { className: 'btn btn-primary', href: 'account.html' }, 'Увійти, щоб торгувати'),
      el('span', { className: 'hero-actions__hint' }, 'Потрібно увійти, щоб подавати заявки та бачити статус участі.')
    );
    return;
  }
  cta.append(
    el('span', { className: 'hero-actions__welcome' }, `Вітаємо, ${session.user.username}!`)
  );
  if (session.user.is_admin) {
    cta.append(
      el('a', { className: 'btn btn-ghost', href: 'admin.html' }, 'Відкрити центр керування')
    );
  } else {
    cta.append(
      el('a', { className: 'btn btn-ghost', href: 'account.html' }, 'Мій кабінет')
    );
  }
}

function joinAndRefresh(auctionId, accountId, onComplete) {
  return joinAuction(auctionId, accountId).then(() => {
    showToast('Заявку на участь подано', 'success');
    onComplete?.();
  }).catch((error) => {
    showToast(error?.message || 'Не вдалося подати заявку', 'error');
  });
}

function createTraderTools(auction, session, refresh) {
  if (!session?.authenticated || session.user?.is_admin || auction.status !== 'collecting') {
    return null;
  }
  const wrap = el('div', { className: 'auction-card__tools' });
  const joinForm = el('form', { className: 'auction-join-form' },
    el('input', {
      className: 'form__input auction-join-form__input',
      name: 'accountId',
      type: 'number',
      placeholder: 'ID рахунку (опціонально)'
    }),
    el('button', { type: 'submit', className: 'btn btn-primary btn-compact' }, 'Подати заявку')
  );
  joinForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(joinForm);
    const raw = formData.get('accountId');
    const accountId = raw ? Number(raw) : undefined;
    await joinAndRefresh(auction.id, accountId, refresh);
    joinForm.reset();
  });

  const orderDetails = el('details', { className: 'auction-card__details' },
    el('summary', {}, 'Подати секретну заявку'),
    (() => {
      const form = el('form', { className: 'auction-order-form' },
        el('label', {},
          el('span', { className: 'auction-order-form__label' }, 'Тип'),
          el('select', { className: 'form__input', name: 'type' },
            el('option', { value: 'bid' }, 'bid'),
            el('option', { value: 'ask' }, 'ask')
          )
        ),
        el('label', {},
          el('span', { className: 'auction-order-form__label' }, 'Ціна'),
          el('input', { className: 'form__input', name: 'price', type: 'number', min: '0', step: '0.000001', required: true })
        ),
        el('label', {},
          el('span', { className: 'auction-order-form__label' }, 'Кількість'),
          el('input', { className: 'form__input', name: 'quantity', type: 'number', min: '0', step: '0.000001', required: true })
        ),
        el('div', { className: 'form-actions' },
          el('button', { type: 'submit', className: 'btn btn-ghost btn-compact' }, 'Надіслати заявку')
        )
      );
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const fd = new FormData(form);
        try {
          await placeAuctionOrder(auction.id, {
            type: String(fd.get('type')),
            price: Number(fd.get('price')),
            quantity: Number(fd.get('quantity')),
          });
          showToast('Заявку подано', 'success');
          form.reset();
          orderDetails.open = false;
          refresh?.();
        } catch (error) {
          showToast(error?.message || 'Не вдалося подати заявку', 'error');
        }
      });
      return form;
    })()
  );

  wrap.append(joinForm, orderDetails);
  return wrap;
}

function createCollectingCard(auction, session, refresh) {
  const card = el('article', { className: 'stack-card auction-card' });
  const header = el('div', { className: 'stack-card__header' },
    el('strong', {}, `#${auction.id} ${auction.product}`),
    el('span', { className: 'pill pill--outline' }, auction.type),
    el('span', { className: 'chip chip--accent' }, statusLabel(auction.status)),
    el('span', { className: 'chip' }, `k = ${auction.k_value}`)
  );
  const meta = el('div', { className: 'auction-card__meta' },
    el('span', {}, `Старт • ${formatDate(auction.window_start)}`),
    el('span', {}, `Завершення • ${formatDate(auction.window_end)}`)
  );
  const actions = el('div', { className: 'auction-card__actions' },
    el('a', { className: 'btn btn-ghost btn-compact', href: `auction.html?id=${auction.id}` }, 'Відкрити книгу ордерів')
  );
  const tools = createTraderTools(auction, session, refresh);
  card.append(header, meta, actions);
  if (tools) card.appendChild(tools);
  return card;
}

function createHistoryCard(auction) {
  const card = el('article', { className: 'stack-card auction-card auction-card--history' });
  card.append(
    el('div', { className: 'stack-card__header' },
      el('strong', {}, `#${auction.id} ${auction.product}`),
      el('span', { className: 'chip' }, statusLabel(auction.status))
    ),
    el('div', { className: 'auction-card__meta' },
      el('span', {}, `Тип • ${auction.type}`),
      el('span', {}, `k = ${auction.k_value}`),
      el('span', {}, `Завершено • ${formatDate(auction.window_end || auction.updated_at || auction.created_at)}`)
    )
  );
  const hasClearingMetrics = [
    auction.clearing_price,
    auction.clearing_quantity,
    auction.clearing_price_low,
    auction.clearing_price_high,
    auction.clearing_demand,
    auction.clearing_supply
  ].some((value) => value !== undefined && value !== null);
  if (hasClearingMetrics) {
    const summaryBits = [];
    if (auction.clearing_price !== undefined && auction.clearing_price !== null) {
      summaryBits.push(el('span', {}, `Ціна клірингу • ${formatPrice(auction.clearing_price)}`));
    }
    if (auction.clearing_quantity !== undefined && auction.clearing_quantity !== null) {
      summaryBits.push(el('span', {}, `Зіставлена к-сть • ${formatNumber(auction.clearing_quantity)}`));
    }
    if (auction.clearing_price_low !== undefined && auction.clearing_price_low !== null && auction.clearing_price_high !== undefined && auction.clearing_price_high !== null) {
      summaryBits.push(el('span', {}, `Діапазон цін • ${formatPrice(auction.clearing_price_low)} – ${formatPrice(auction.clearing_price_high)}`));
    }
    if (auction.clearing_demand !== undefined && auction.clearing_demand !== null) {
      summaryBits.push(el('span', {}, `Попит • ${formatNumber(auction.clearing_demand)}`));
    }
    if (auction.clearing_supply !== undefined && auction.clearing_supply !== null) {
      summaryBits.push(el('span', {}, `Пропозиція • ${formatNumber(auction.clearing_supply)}`));
    }
    if (summaryBits.length) {
      card.append(
        el('div', { className: 'auction-card__summary' },
          ...summaryBits
        )
      );
    }
  }
  card.append(
    el('div', { className: 'auction-card__actions' },
      el('a', { className: 'btn btn-ghost btn-compact', href: `auction.html?id=${auction.id}` }, 'Переглянути протокол')
    )
  );
  return card;
}

async function render(session) {
  const collectingList = document.getElementById('collecting-list');
  const clearedList = document.getElementById('cleared-list');
  collectingList.textContent = 'Завантаження…';
  clearedList.textContent = 'Завантаження…';

  let auctions = [];
  try {
    auctions = await listAuctions();
  } catch (error) {
    console.error('Failed to load auctions', error);
    collectingList.textContent = 'Не вдалося завантажити аукціони';
    clearedList.textContent = 'Не вдалося завантажити аукціони';
    return;
  }

  updateMetrics(auctions);
  updateHero(session);

  const collecting = auctions.filter(a => a.status === 'collecting');
  const history = auctions.filter(a => a.status === 'cleared' || a.status === 'closed');

  collectingList.innerHTML = '';
  if (!collecting.length) {
    collectingList.textContent = 'Наразі немає активних вікон.';
  } else {
    const refresh = () => render(session);
    collecting.forEach((auction) => {
      collectingList.appendChild(createCollectingCard(auction, session, refresh));
    });
  }

  clearedList.innerHTML = '';
  if (!history.length) {
    clearedList.textContent = 'Ще немає завершених аукціонів.';
  } else {
    history.slice(0, 6).forEach((auction) => {
      clearedList.appendChild(createHistoryCard(auction));
    });
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const session = await initAccessControl();
  await render(session);
});
