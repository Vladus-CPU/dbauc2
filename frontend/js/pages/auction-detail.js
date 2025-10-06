import {getAuctionBook, getMe, joinAuction, myParticipationStatus, placeAuctionOrder,} from '../api.js';
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
// Optional container for history charts (add a <div id="auction-history-charts"></div> in HTML where desired)
const historyChartsEl = document.getElementById('auction-history-charts');
const priceDistEl = document.getElementById('price-distribution');

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

function tStatus(value) {
  const map = {
    collecting: 'Збір заявок',
    cleared: 'Відклірингено',
    closed: 'Закрито',
  };
  if (!value) return '—';
  return map[value] || value;
}

function tSide(value) {
  const map = { bid: 'купівля', ask: 'продаж' };
  if (!value) return '—';
  return map[value] || value;
}

function localizeErrorMessage(msg) {
  if (!msg) return 'Сталася невідома помилка';
  const lower = msg.toLowerCase();
  if (lower.includes('unauthorized') || lower.includes('forbidden')) return 'Немає прав доступу';
  if (lower.includes('not found')) return 'Не знайдено';
  if (lower.includes('invalid') || lower.includes('must')) return 'Неправильні дані запиту';
  if (lower.includes('timeout')) return 'Перевищено час очікування';
  return msg;
}

function renderSummary(book) {
  const { auction } = book;
  titleEl.textContent = `${auction.product}`;
  statusEl.textContent = tStatus(auction.status);
  statusEl.className = `pill status-${auction.status}`;
  document.title = `${auction.product} · Книга заявок аукціону`;

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
        <span class="muted">Найкраща купівля</span>
        <strong>${formatPrice(metrics.bestBid)}</strong>
      </div>
      <div>
        <span class="muted">Найкращий продаж</span>
        <strong>${formatPrice(metrics.bestAsk)}</strong>
      </div>
    `;
    actionsEl.append(best);
  }
}

function renderBook(book) {
  bidsBody.innerHTML = '';
  asksBody.innerHTML = '';
  const bidLevels = (book.book.bids || []).slice(0, 15);
  const askLevels = (book.book.asks || []).slice(0, 15);
  const maxBidCum = Math.max(...bidLevels.map(l => l.cumulativeQuantity || 0), 0);
  const maxAskCum = Math.max(...askLevels.map(l => l.cumulativeQuantity || 0), 0);
  bidLevels.forEach((level) => {
    const tr = document.createElement('tr');
    tr.className = 'bid-row';
    const depthPct = maxBidCum ? (level.cumulativeQuantity / maxBidCum) * 100 : 0;
    tr.innerHTML = `
      <td class="depth-cell"><div class="depth-bar depth-bar--bid" style="--d:${depthPct.toFixed(2)}%"></div><span>${formatPrice(level.price)}</span></td>
      <td>${formatQty(level.totalQuantity)}</td>
      <td>${level.orderCount}</td>
      <td>${formatQty(level.cumulativeQuantity)}</td>
    `;
    bidsBody.append(tr);
  });
  askLevels.forEach((level) => {
    const tr = document.createElement('tr');
    tr.className = 'ask-row';
    const depthPct = maxAskCum ? (level.cumulativeQuantity / maxAskCum) * 100 : 0;
    tr.innerHTML = `
      <td class="depth-cell"><div class="depth-bar depth-bar--ask" style="--d:${depthPct.toFixed(2)}%"></div><span>${formatPrice(level.price)}</span></td>
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
  const h = window.__auctionMetricHistory || (window.__auctionMetricHistory = { spread:[], midPrice:[], depthImbalancePct:[], lastClearingPrice:[] });
  const push = (k,v)=>{ if (typeof v==='number' && isFinite(v)){ h[k].push(v); if (h[k].length>150) h[k].shift(); } };
  push('spread', m.spread); push('midPrice', m.midPrice); push('depthImbalancePct', typeof m.depthImbalance==='number'? m.depthImbalance*100:NaN); push('lastClearingPrice', m.lastClearingPrice);

  const sparkBar = (arr, {stroke='#66c0f4'}={}) => {
    if (!arr || arr.length<3) return '';
    const slice = arr.slice(-40);
    const min = Math.min(...slice), max = Math.max(...slice), span = max-min||1;
    const pts = slice.map((v,i)=>{
      const x = (i/(slice.length-1))*100;
      const y = 100 - ((v-min)/span)*100;
      return `${x.toFixed(2)},${y.toFixed(2)}`; }).join(' ');
    return `<svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  };
  const fmt = (val, {pct=false}={}) => {
    if (val===null || val===undefined || Number.isNaN(val)) return '—';
    if (pct) return `${formatNumber(val,{maximumFractionDigits:2})}%`;
    if (typeof val==='number') return formatNumber(val);
    return val;
  };
  metricsEl.innerHTML = '';
  const wrap = document.createElement('div'); wrap.className='metrics-tiles';
  // Primary tiles
  const grid = document.createElement('div'); grid.className='metrics-tiles__grid';
  const tiles = [
    {k:'spread', label:'Спред', value:fmt(m.spread), spark:sparkBar(h.spread,{stroke:'#7ee787'}), cls:(m.spread<0?'negative':'positive')},
    {k:'mid', label:'Mid ціна', value:fmt(m.midPrice), spark:sparkBar(h.midPrice,{stroke:'#66c0f4'})},
    {k:'depthImb', label:'Дисбаланс', value:fmt(typeof m.depthImbalance==='number'?m.depthImbalance*100:NaN,{pct:true}), spark:sparkBar(h.depthImbalancePct,{stroke:'#ff9393'}), cls: (m.depthImbalance>0?'positive':'negative')},
    {k:'lastClr', label:'Clearing ціна', value:fmt(m.lastClearingPrice), spark:sparkBar(h.lastClearingPrice,{stroke:'#cfa8ff'})},
    {k:'ordersBid', label:'Ордерів bid', value:fmt(m.bidOrderCount)},
    {k:'ordersAsk', label:'Ордерів ask', value:fmt(m.askOrderCount)}
  ];
  // Create standard tiles (except combined volume handled separately below)
  tiles.forEach(t=>{
    const div = document.createElement('div'); div.className='metric-tile'+(t.cls?(' '+t.cls):'');
    div.innerHTML = `<div class="metric-tile__label">${t.label}</div><div class="metric-tile__value">${t.value}</div>${t.spark?`<div class="metric-tile__spark">${t.spark}</div>`:''}`;
    grid.appendChild(div);
  });

  // Combined Bid/Ask volume progress bar tile
  const bidVol = (typeof m.totalBidQuantity === 'number' ? m.totalBidQuantity : 0) || 0;
  const askVol = (typeof m.totalAskQuantity === 'number' ? m.totalAskQuantity : 0) || 0;
  const totVol = bidVol + askVol;
  const bidPct = totVol ? (bidVol / totVol) * 100 : 0;
  const askPct = totVol ? (askVol / totVol) * 100 : 0;
  const volTile = document.createElement('div');
  volTile.className = 'metric-tile metric-tile--volumes';
  volTile.innerHTML = `
    <div class="metric-tile__label">Обсяг (усього)</div>
    <div class="metric-tile__value" style="font-size:0.95rem;">${fmt(totVol)}</div>
    <div class="dual-progress" title="Bid: ${fmt(bidVol)} (${bidPct.toFixed(1)}%) · Ask: ${fmt(askVol)} (${askPct.toFixed(1)}%)">
      <div class="dual-progress__seg bid" style="width:${bidPct}%;"></div>
      <div class="dual-progress__seg ask" style="width:${askPct}%;"></div>
    </div>
    <div class="dual-progress__legend">
      <span class="bid">Bid ${fmt(bidVol)} (${bidPct.toFixed(1)}%)</span>
      <span class="ask">Ask ${fmt(askVol)} (${askPct.toFixed(1)}%)</span>
    </div>`;
  grid.appendChild(volTile);
  wrap.appendChild(grid);
  // Toggle & extra metrics
  const toggle = document.createElement('button'); toggle.type='button'; toggle.className='metrics-more-toggle'; toggle.textContent='Додаткові метрики';
  const extra = document.createElement('div'); extra.className='metrics-extra hidden';
  const extraList = [
    ['Best bid depth', m.bestBidDepth], ['Best ask depth', m.bestAskDepth],
    ['Orders @ best bid', m.bestBidOrders], ['Orders @ best ask', m.bestAskOrders],
    ['Top3 bid depth', m.top3BidDepth], ['Top3 ask depth', m.top3AskDepth],
    ['Top3 bid orders', m.top3BidOrders], ['Top3 ask orders', m.top3AskOrders],
    ['Clearing qty', m.lastClearingQuantity]
  ];
  const dl = document.createElement('dl');
  extraList.forEach(([lab,val])=>{
    const dt=document.createElement('dt'); dt.textContent=lab; const dd=document.createElement('dd'); dd.textContent=fmt(val); dl.append(dt,dd);
  });
  extra.appendChild(dl);
  toggle.addEventListener('click',()=>{ extra.classList.toggle('hidden'); toggle.textContent = extra.classList.contains('hidden') ? 'Додаткові метрики' : 'Приховати метрики'; });
  wrap.append(toggle, extra);
  metricsEl.appendChild(wrap);
}

// --------- History (price & depth) ---------
let lastHistoryAt = 0;
async function fetchHistory() {
  if (!auctionId) return null;
  const now = Date.now();
  if (now - lastHistoryAt < 5000) return null; // throttle 5s
  lastHistoryAt = now;
  try {
    const r = await fetch(`/api/auctions/${auctionId}/history`);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

function buildLine(pts, {w=300,h=80,stroke='#66c0f4'}={}) {
  if (!pts || pts.length < 2) return `<svg width="${w}" height="${h}" class="micro-chart"></svg>`;
  const ys = pts.map(p=>p.price);
  const minY = Math.min(...ys), maxY = Math.max(...ys), span = maxY-minY||1;
  const coords = pts.map((p,i)=>{
    const x = (i/(pts.length-1))*(w-2)+1;
    const y = h-2-((p.price-minY)/span)*(h-4);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" class="micro-chart" preserveAspectRatio="none"><polyline points="${coords}" fill="none" stroke="${stroke}" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

function buildDepth(curve, {w=300,h=110}={}) {
  const bids = (curve?.bids||[]).slice(0,50);
  const asks = (curve?.asks||[]).slice(0,50);
  if (!bids.length && !asks.length) return '<div class="muted">Немає глибини</div>';
  const prices = [...bids.map(b=>b.price),...asks.map(a=>a.price)];
  const cumVals = [...bids.map(b=>b.cum),...asks.map(a=>a.cum)];
  const minP=Math.min(...prices), maxP=Math.max(...prices), maxCum=Math.max(...cumVals,1);
  const pad=4;
  const sx=p=>pad+((p-minP)/(maxP-minP||1))*(w-pad*2);
  const sy=c=>h-pad-((c/maxCum)*(h-pad*2));
  const mkPath=(arr)=>arr.map((pt,i)=>`${i?'L':'M'}${sx(pt.price).toFixed(2)},${sy(pt.cum).toFixed(2)}`).join(' ');
  const bidPath = mkPath(bids);
  const askPath = mkPath(asks);
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" class="micro-chart" preserveAspectRatio="none">
    <path d="${bidPath}" fill="none" stroke="#2ecc71" stroke-width="1.5"/>
    <path d="${askPath}" fill="none" stroke="#ff7676" stroke-width="1.5"/>
  </svg>`;
}

async function updateHistoryCharts() {
  if (!historyChartsEl) return;
  const data = await fetchHistory();
  if (!data) return;
  const prices = (data.clearedSeries||[]).filter(p=>typeof p.price==='number');
  historyChartsEl.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:18px;align-items:flex-start;">
      <div>
        <div class="muted" style="font-size:0.65rem;margin-bottom:4px;letter-spacing:0.08em;">Ціни клірингу</div>
        ${buildLine(prices,{})}
      </div>
      <div>
        <div class="muted" style="font-size:0.65rem;margin-bottom:4px;letter-spacing:0.08em;">Кумулятивна глибина</div>
        ${buildDepth(data.bookCurve,{})}
      </div>
    </div>`;
}

// --------- Price distribution (Steam-like depth bars) ---------
async function updatePriceDistribution() {
  if (!priceDistEl) return;
  try {
    const res = await fetch(`/api/auctions/${auctionId}/distribution`);
    if (!res.ok) return;
    const dist = await res.json();
    const { bids=[], asks=[], mid } = dist;
    const maxQty = Math.max(...bids.map(b=>b.qty), ...asks.map(a=>a.qty), 1);
    const row = (side, o) => {
      const pct = (o.qty / maxQty) * 100;
      return `<div class="dist-row dist-${side}" style="--w:${pct.toFixed(2)}%;"><span class="p">${formatPrice(o.p)}</span><span class="q">${formatQty(o.qty)}</span><span class="c">${o.count}</span></div>`;
    };
    priceDistEl.innerHTML = `
      <div class="dist-wrap" style="display:flex;flex-wrap:wrap;gap:28px;">
        <div style="flex:1;min-width:240px;">
          <div class="muted" style="font-size:0.65rem;letter-spacing:0.08em;margin-bottom:4px;">BIDS</div>
          <div class="dist-col">${bids.slice(0,25).map(o=>row('bid',o)).join('')||'<div class="muted">—</div>'}</div>
        </div>
        <div style="flex:1;min-width:240px;">
          <div class="muted" style="font-size:0.65rem;letter-spacing:0.08em;margin-bottom:4px;">ASKS</div>
          <div class="dist-col">${asks.slice(0,25).map(o=>row('ask',o)).join('')||'<div class="muted">—</div>'}</div>
        </div>
        <div style="flex:0 0 160px;">
          <div class="muted" style="font-size:0.65rem;letter-spacing:0.08em;margin-bottom:4px;">MID</div>
          <div style="font-size:0.9rem;font-weight:600;">${mid?formatPrice(mid):'—'}</div>
        </div>
      </div>`;
  } catch {}
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
    const sideLabel = tSide(order.side).toUpperCase();
    li.innerHTML = `
      <div><strong>${sideLabel}</strong> ${formatQty(order.quantity)} @ ${formatPrice(order.price)}</div>
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
          showToast(localizeErrorMessage(error?.message || 'Не вдалося подати заявку'), 'error');
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
  showToast(localizeErrorMessage(error?.message || 'Не вдалося подати ордер'), 'error');
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
    try {
      if (book?.auction?.status && book.auction.status !== 'collecting') {
        if (window.__auctionRefreshTimer) {
          clearInterval(window.__auctionRefreshTimer);
          window.__auctionRefreshTimer = null;
        }
      }
    } catch {}
  } catch (error) {
  summaryEl.innerHTML = `<p class="error">${localizeErrorMessage(error?.message || 'Не вдалося завантажити аукціон')}</p>`;
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
  updateHistoryCharts();
  updatePriceDistribution();
  if (!window.__auctionRefreshTimer) {
    window.__auctionRefreshTimer = setInterval(() => {
      if (document.hidden) return;
      if (isLoading) return;
      load();
      updateHistoryCharts();
      updatePriceDistribution();
    }, 15000);
  }
  // kick initial charts
  updateHistoryCharts();
  window.addEventListener('beforeunload', () => {
    if (window.__auctionRefreshTimer) {
      clearInterval(window.__auctionRefreshTimer);
      window.__auctionRefreshTimer = null;
    }
  });

  // Tabs logic
  const tabButtons = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.tab-panel');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('is-active')) return;
      tabButtons.forEach(b=>b.classList.remove('is-active'));
      panels.forEach(p=>p.classList.remove('is-active'));
      btn.classList.add('is-active');
      const id = btn.getAttribute('data-tab-target');
      const panel = document.getElementById(id);
      if (panel) panel.classList.add('is-active');
      // Trigger refresh for distribution/history when switching to that tab
      if (id === 'tab-distribution') {
        updateHistoryCharts();
        updatePriceDistribution();
      }
    });
  });
});
