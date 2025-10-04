import {
  getAuctionBook,
  getMe,
  joinAuction,
  myParticipationStatus,
  placeAuctionOrder,
} from '../api.js';
import { showToast } from '../ui/toast.js';
import { initAccessControl } from '../ui/session.js';

const params = new URLSearchParams(window.location.search);
const auctionId = Number(params.get('id'));
const summaryEl = document.getElementById('market-summary');
const titleEl = document.getElementById('market-title');
const statusEl = document.getElementById('market-status');
const metaEl = document.getElementById('market-meta');
const actionsEl = document.getElementById('market-actions');
const thumbEl = document.getElementById('market-thumbnail');
const bidsBody = document.getElementById('book-bids');
const asksBody = document.getElementById('book-asks');
const metricsEl = document.getElementById('market-metrics');
const formsEl = document.getElementById('market-forms');
const recentOrdersEl = document.getElementById('recent-orders');
const recentClearingEl = document.getElementById('recent-clearing');
const clearingChartEl = document.getElementById('clearing-chart');
const refreshBtn = document.getElementById('refresh-book');

if (!auctionId) {
  summaryEl.innerHTML = '<p class="error">Невірний ідентифікатор аукціону</p>';
  throw new Error('Missing auction id');
}

let isLoading = false;

function formatNumber(value, options = {}) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '—';
  }
  const defaults = { minimumFractionDigits: 0, maximumFractionDigits: 6 };
  return Number(value).toLocaleString('uk-UA', { ...defaults, ...options });
}

function formatPrice(value) {
  return formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

function formatQty(value) {
  return formatNumber(value, { maximumFractionDigits: 6 });
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('uk-UA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function renderSummary(book) {
  const { auction } = book;
  titleEl.textContent = `${auction.product}`;
  statusEl.textContent = auction.status;
  statusEl.className = `pill status-${auction.status}`;
  document.title = `${auction.product} · Auction order book`;

  const meta = [];
  meta.push(`<span><strong>Тип:</strong> ${auction.type}</span>`);
  meta.push(`<span><strong>k:</strong> ${formatNumber(auction.k_value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>`);
  if (auction.window_start) {
    meta.push(`<span><strong>Початок:</strong> ${formatDate(auction.window_start)}</span>`);
  }
  if (auction.window_end) {
    meta.push(`<span><strong>Кінець:</strong> ${formatDate(auction.window_end)}</span>`);
  }
  meta.push(`<span><strong>Створено:</strong> ${formatDate(auction.created_at)}</span>`);
  metaEl.innerHTML = meta.join('');

  const firstSymbol = auction.product?.trim()?.charAt(0)?.toUpperCase();
  thumbEl.innerHTML = firstSymbol ? `<span>${firstSymbol}</span>` : '<span>📦</span>';

  actionsEl.innerHTML = '';
  const metrics = book.metrics;
  if (metrics.bestBid !== null || metrics.bestAsk !== null) {
    const best = document.createElement('div');
    best.className = 'market-summary__quote';
    best.innerHTML = `
      <div>
        <span class="muted">Best bid</span>
        <strong>${formatPrice(metrics.bestBid)}</strong>
      </div>
      <div>
        <span class="muted">Best ask</span>
        <strong>${formatPrice(metrics.bestAsk)}</strong>
      </div>
    `;
    actionsEl.append(best);
  }
}

function renderBook(book) {
  bidsBody.innerHTML = '';
  asksBody.innerHTML = '';
  (book.book.bids || []).slice(0, 15).forEach((level) => {
    const tr = document.createElement('tr');
    tr.className = 'bid-row';
    tr.innerHTML = `
      <td>${formatPrice(level.price)}</td>
      <td>${formatQty(level.totalQuantity)}</td>
      <td>${level.orderCount}</td>
      <td>${formatQty(level.cumulativeQuantity)}</td>
    `;
    bidsBody.append(tr);
  });
  (book.book.asks || []).slice(0, 15).forEach((level) => {
    const tr = document.createElement('tr');
    tr.className = 'ask-row';
    tr.innerHTML = `
      <td>${formatPrice(level.price)}</td>
      <td>${formatQty(level.totalQuantity)}</td>
      <td>${level.orderCount}</td>
      <td>${formatQty(level.cumulativeQuantity)}</td>
    `;
    asksBody.append(tr);
  });
  if (!bidsBody.children.length) {
    bidsBody.innerHTML = '<tr><td colspan="4" class="muted">Немає активних заявок</td></tr>';
  }
  if (!asksBody.children.length) {
    asksBody.innerHTML = '<tr><td colspan="4" class="muted">Немає активних заявок</td></tr>';
  }
}

function renderMetrics(book) {
  const m = book.metrics;
  metricsEl.innerHTML = '';
  const rows = [
    ['Spread', m.spread],
    ['Bid volume', m.totalBidQuantity],
    ['Ask volume', m.totalAskQuantity],
    ['Bid orders', m.bidOrderCount],
    ['Ask orders', m.askOrderCount],
    ['Last clearing price', m.lastClearingPrice],
    ['Last clearing volume', m.lastClearingQuantity],
  ];
  rows.forEach(([label, value]) => {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = typeof value === 'number' ? formatNumber(value) : value ?? '—';
    metricsEl.append(dt, dd);
  });
}

function renderOrdersList(book) {
  recentOrdersEl.innerHTML = '';
  const combined = [];
  (book.recentOrders?.bids || []).forEach((o) => combined.push({ ...o, side: 'bid' }));
  (book.recentOrders?.asks || []).forEach((o) => combined.push({ ...o, side: 'ask' }));
  combined.sort((a, b) => {
    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return dateB - dateA;
  });
  combined.slice(0, 12).forEach((order) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <div><strong>${order.side === 'bid' ? 'BUY' : 'SELL'}</strong> ${formatQty(order.quantity)} @ ${formatPrice(order.price)}</div>
      <span>${formatDate(order.createdAt)}</span>
    `;
    recentOrdersEl.append(li);
  });
  if (!recentOrdersEl.children.length) {
    recentOrdersEl.innerHTML = '<li class="muted">Недостатньо даних</li>';
  }
}

function renderClearing(book) {
  recentClearingEl.innerHTML = '';
  const data = book.recentClearing || [];
  data.forEach((entry) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <div><strong>${formatQty(entry.quantity)}</strong> @ ${formatPrice(entry.price)}</div>
      <span>${formatDate(entry.createdAt)}</span>
    `;
    recentClearingEl.append(li);
  });
  if (!data.length) {
    recentClearingEl.innerHTML = '<li class="muted">Клірингів ще не було</li>';
  }
  renderClearingChart(data);
}

function renderClearingChart(data) {
  clearingChartEl.innerHTML = '';
  if (!data || data.length < 2) {
    const empty = document.createElement('div');
    empty.className = 'market-chart__empty';
    empty.textContent = 'Ще немає історії цін';
    clearingChartEl.append(empty);
    return;
  }
  const ordered = [...data].slice(0, 30).reverse();
  const prices = ordered.map((d) => Number(d.price));
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const diff = max - min || 1;
  const points = ordered.map((entry, index) => {
    const x = (index / (ordered.length - 1)) * 100;
    const y = 100 - ((entry.price - min) / diff) * 100;
    return `${x},${y}`;
  }).join(' ');

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');

  const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  polyline.setAttribute('points', points);
  polyline.setAttribute('fill', 'none');
  polyline.setAttribute('stroke', '#66c0f4');
  polyline.setAttribute('stroke-width', '2');
  polyline.setAttribute('stroke-linejoin', 'round');
  polyline.setAttribute('stroke-linecap', 'round');

  const areaPoints = `0,100 ${points} 100,100`;
  const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  polygon.setAttribute('points', areaPoints);
  polygon.setAttribute('fill', 'rgba(102, 192, 244, 0.18)');

  svg.append(polygon, polyline);
  clearingChartEl.append(svg);
}

function renderForms(book, me, participation) {
  formsEl.innerHTML = '';
  const auction = book.auction;
  const isTrader = me?.authenticated && !me.user?.is_admin;
  if (!isTrader) {
    formsEl.innerHTML = '<p class="muted">Увійдіть як трейдер, щоб подавати заявки.</p>';
    return;
  }
  const joinStatus = participation?.status || null;
  const statusLabel = document.createElement('div');
  statusLabel.innerHTML = `<strong>Статус участі:</strong> ${joinStatus || 'не приєднався'}`;
  if (participation?.account_id) {
    statusLabel.innerHTML += `<span class="muted"> · accountId ${participation.account_id}</span>`;
  }
  formsEl.append(statusLabel);

  if (auction.type === 'open' && auction.status === 'collecting') {
    const note = document.createElement('p');
    note.className = 'muted';
    note.textContent = 'Відкритий аукціон — приєднання не потрібне, можна одразу подавати заявки.';
    formsEl.append(note);
  }

  if (auction.status === 'collecting' && auction.type === 'closed' && joinStatus !== 'approved') {
    if (joinStatus === 'pending') {
      const note = document.createElement('p');
      note.className = 'muted';
      note.textContent = 'Запит на участь очікує підтвердження адміністратора.';
      formsEl.append(note);
    } else {
      const form = document.createElement('form');
      form.innerHTML = `
        <label for="participation-account">accountId (опційно)</label>
        <input id="participation-account" type="number" min="0" step="1" placeholder="ID рахунку" />
        <button type="submit" class="btn">Подати заявку на участь</button>
      `;
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const accountIdValue = Number(form.querySelector('input').value);
        try {
          await joinAuction(auctionId, Number.isFinite(accountIdValue) && accountIdValue > 0 ? accountIdValue : undefined);
          showToast('Запит на участь відправлено', 'success');
          await load();
        } catch (error) {
          showToast(error?.message || 'Не вдалося подати заявку', 'error');
        }
      });
      formsEl.append(form);
    }
  }

  const canPlaceOrders = auction.status === 'collecting' && (
    auction.type === 'open' || joinStatus === 'approved'
  );
  if (!canPlaceOrders) {
    const note = document.createElement('p');
    note.className = 'muted';
    if (auction.status !== 'collecting') {
      note.textContent = 'Аукціон вже закрито для подачі заявок.';
    } else if (auction.type === 'closed') {
      note.textContent = 'Очікуйте підтвердження участі, щоб подавати заявки.';
    }
    formsEl.append(note);
    return;
  }

  const orderForm = document.createElement('form');
  orderForm.innerHTML = `
    <label for="order-side">Тип ордеру</label>
    <select id="order-side" name="side">
      <option value="bid">Купити</option>
      <option value="ask">Продати</option>
    </select>
    <div class="market-form__split">
      <label>
        Ціна
        <input name="price" type="number" min="0" step="0.000001" required />
      </label>
      <label>
        Кількість
        <input name="quantity" type="number" min="0" step="0.000001" required />
      </label>
    </div>
    <button type="submit" class="btn">Подати ордер</button>
  `;
  orderForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(orderForm);
    const payload = {
      type: formData.get('side'),
      price: Number(formData.get('price')),
      quantity: Number(formData.get('quantity')),
    };
    try {
      await placeAuctionOrder(auctionId, payload);
      showToast('Ордер прийнято', 'success');
      orderForm.reset();
      await load();
    } catch (error) {
      showToast(error?.message || 'Не вдалося подати ордер', 'error');
    }
  });
  formsEl.append(orderForm);
}

async function load() {
  if (isLoading) return;
  isLoading = true;
  summaryEl.classList.add('is-loading');
  try {
    const [me, book] = await Promise.all([
      getMe().catch(() => ({ authenticated: false })),
      getAuctionBook(auctionId),
    ]);
    let participation = null;
    if (me?.authenticated && !me.user?.is_admin) {
      participation = await myParticipationStatus(auctionId).catch(() => null);
    }
    renderSummary(book);
    renderBook(book);
    renderMetrics(book);
    renderOrdersList(book);
    renderClearing(book);
    renderForms(book, me, participation);
  } catch (error) {
    summaryEl.innerHTML = `<p class="error">${error?.message || 'Не вдалося завантажити аукціон'}</p>`;
    console.error(error);
  } finally {
    summaryEl.classList.remove('is-loading');
    isLoading = false;
  }
}

refreshBtn.addEventListener('click', () => {
  load().then(() => showToast('Книга заявок оновлена', 'info'));
});

document.addEventListener('DOMContentLoaded', async () => {
  await initAccessControl();
  await load();
});
