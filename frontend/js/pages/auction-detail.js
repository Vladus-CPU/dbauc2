import {authorizedFetch, getAuctionBook, getMe, joinAuction, myParticipationStatus, placeAuctionOrder, cancelAuctionOrder, meAuctionOrders} from '../api.js';
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
const refreshBtn = document.getElementById('refresh-book');
const myOrdersListEl = document.getElementById('my-orders-list');
const clearingRoundsListEl = document.getElementById('clearing-rounds-list');
const historyChartsEl = document.getElementById('history-charts');
const priceDistEl = document.getElementById('price-distribution');
const recentOrdersEl = document.getElementById('recent-orders');
const recentClearingEl = document.getElementById('recent-clearing');
const clearingChartEl = document.getElementById('clearing-chart');
const refreshDistBtn = document.getElementById('refresh-distribution');
const tabsNavEl = document.querySelector('.market-tabs__nav');
const tabsContainerEl = document.querySelector('.market-tabs');

if (!auctionId) {
  summaryEl.innerHTML = '<p class="error">Невірний ідентифікатор аукціону</p>';
  throw new Error('Missing auction id');
}

let isLoading = false;
let __refreshSeq = 0;
let __lastHistoryAt = 0;
let __lastDistributionAt = 0;
const HISTORY_INTERVAL = 3500;
const DIST_INTERVAL = 3500;
const FULL_REFRESH_INTERVAL = 12000;
let __refreshTimer = null;
let __pendingHistory = null;
let __pendingDistribution = null;
let __activeTab = 'tab-book';
let __refreshInFlight = false;

function canViewAdminData() {
  const me = window.__lastMe;
  return Boolean(me?.authenticated && me.user?.is_admin);
}

function formatNumber(value, options = {}) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const defaults = { minimumFractionDigits: 0, maximumFractionDigits: 1 };
  return Number(value).toLocaleString('uk-UA', { ...defaults, ...options });
}

function formatPrice(value) { return formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function formatQty(value) { return formatNumber(value, { maximumFractionDigits: 1 }); }

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

function renderSummary(book, me) {
  const { auction } = book;
  let authorBadge = '';
  if (me?.authenticated && auction?.creator_id && me.user?.id === auction.creator_id) {
    authorBadge = '<span class="pill pill-author" style="margin-left:8px;">Автор</span>';
  }
  titleEl.innerHTML = `${auction.product} ${authorBadge}`;
  statusEl.textContent = tStatus(auction.status);
  statusEl.className = `pill status-${auction.status}`;
  document.title = `${auction.product} · Книга заявок аукціону`;

  const meta = [];
  if (auction.approval_status && auction.approval_status !== 'approved') {
    meta.push(`<span><strong>Статус модерації:</strong> ${auction.approval_status}</span>`);
  }
  meta.push(`<span><strong>Тип:</strong> ${auction.type}</span>`);
  meta.push(`<span><strong>k:</strong> ${formatNumber(auction.k_value, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</span>`);
  
  // Додаємо інформацію про раунди
  if (auction.current_round !== undefined && auction.current_round !== null) {
    meta.push(`<span><strong>Поточний раунд:</strong> ${auction.current_round}</span>`);
  }
  
  // Завжди додаємо елемент таймера - його будуть оновлювати потім
  meta.push(`<span id="next-clearing-timer"><strong>⏱ Наступний кліринг:</strong> <span id="clearing-time">—</span></span>`);
  
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
  const isCleared = auction.status === 'cleared' || auction.status === 'closed';
  const isAdmin = me?.authenticated && me.user?.is_admin;
  const shouldHideTabs = isCleared && !isAdmin;
  const marketMainEl = document.querySelector('.market-main');
  if (marketMainEl) {
    if (shouldHideTabs) {
      if (tabsNavEl) tabsNavEl.style.display = 'none';
      if (tabsContainerEl) tabsContainerEl.style.display = 'none';
      let noticeEl = marketMainEl.querySelector('.sealed-completion-notice');
      if (!noticeEl) {
        noticeEl = document.createElement('div');
        noticeEl.className = 'card sealed-completion-notice';
        noticeEl.innerHTML = `
          <div class="sealed-notice" style="margin: 0;">
            <p><strong>🔒 Sealed-bid аукціон завершено</strong></p>
            <p style="margin-top: 12px; font-size: 0.9rem;">
              Згідно з правилами sealed-bid (закритого) аукціону, книга заявок, розподіл цін
              та активність приховані після завершення клірингу. Це забезпечує конфіденційність стратегій учасників.
            </p>
            <p style="margin-top: 12px; font-size: 0.9rem; color: var(--market-muted);">
              Результати клірингу доступні тільки адміністраторам через спеціальні звіти.
            </p>
          </div>
        `;
        marketMainEl.insertBefore(noticeEl, marketMainEl.firstChild);
      }
      noticeEl.style.display = 'block';
    } else {
      if (tabsNavEl) tabsNavEl.style.display = '';
      if (tabsContainerEl) tabsContainerEl.style.display = '';
      const noticeEl = marketMainEl.querySelector('.sealed-completion-notice');
      if (noticeEl) {
        noticeEl.style.display = 'none';
      }
      if (isCleared && isAdmin) {
        let adminNoticeEl = marketMainEl.querySelector('.admin-cleared-notice');
        if (!adminNoticeEl) {
          adminNoticeEl = document.createElement('div');
          adminNoticeEl.className = 'card admin-cleared-notice';
          adminNoticeEl.innerHTML = `
            <div class="admin-notice" style="margin: 0;">
              <p><strong>👤 Адмін режим: Аукціон завершено</strong></p>
              <p style="margin-top: 8px; font-size: 0.9rem;">
                Ви маєте доступ до всіх даних включно з історією клірингу, розподілом цін та активністю.
                Ці дані приховані від звичайних учасників згідно з sealed-bid правилами.
              </p>
            </div>
          `;
          marketMainEl.insertBefore(adminNoticeEl, marketMainEl.firstChild);
        }
        adminNoticeEl.style.display = 'block';
      } else {
        const adminNoticeEl = marketMainEl.querySelector('.admin-cleared-notice');
        if (adminNoticeEl) {
          adminNoticeEl.style.display = 'none';
        }
      }
    }
  }

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

function renderBook(book, me) {
  bidsBody.innerHTML = '';
  asksBody.innerHTML = '';
  const isAdmin = me?.authenticated && me.user?.is_admin;
  const sealedView = book.visibility === 'sealed' && !isAdmin;
  if (sealedView) {
    bidsBody.innerHTML = '<tr><td colspan="5" class="muted">🔒 Книга заявок прихована (sealed-bid режим)</td></tr>';
    asksBody.innerHTML = '<tr><td colspan="5" class="muted">🔒 Книга заявок прихована (sealed-bid режим)</td></tr>';
    return;
  }
  const bidLevels = (book.book.bids || []).slice(0, 15);
  const askLevels = (book.book.asks || []).slice(0, 15);
  const totalVolume = (book.metrics?.totalBidQuantity || 0) + (book.metrics?.totalAskQuantity || 0);
  const maxBidCum = Math.max(...bidLevels.map(l => l.cumulativeQuantity || 0), 0);
  const maxAskCum = Math.max(...askLevels.map(l => l.cumulativeQuantity || 0), 0);
  bidLevels.forEach((level) => {
    const tr = document.createElement('tr');
    tr.className = 'bid-row';
    const depthPct = maxBidCum ? (level.cumulativeQuantity / maxBidCum) * 100 : 0;
    const sharePct = totalVolume ? (level.totalQuantity / totalVolume) * 100 : 0;
    tr.innerHTML = `
      <td class="depth-cell"><div class="depth-bar depth-bar--bid" style="--d:${depthPct.toFixed(2)}%"></div><span>${formatPrice(level.price)}</span></td>
      <td class="num">${formatQty(level.totalQuantity)}</td>
      <td class="num lvl-share" title="Частка від загального обсягу">${sharePct?formatNumber(sharePct,{maximumFractionDigits:1})+'%':'—'}</td>
      <td class="num">${level.orderCount}</td>
      <td class="num">${formatQty(level.cumulativeQuantity)}</td>
    `;
    bidsBody.append(tr);
  });
  askLevels.forEach((level) => {
    const tr = document.createElement('tr');
    tr.className = 'ask-row';
    const depthPct = maxAskCum ? (level.cumulativeQuantity / maxAskCum) * 100 : 0;
    const sharePct = totalVolume ? (level.totalQuantity / totalVolume) * 100 : 0;
    tr.innerHTML = `
      <td class="depth-cell"><div class="depth-bar depth-bar--ask" style="--d:${depthPct.toFixed(2)}%"></div><span>${formatPrice(level.price)}</span></td>
      <td class="num">${formatQty(level.totalQuantity)}</td>
      <td class="num lvl-share" title="Частка від загального обсягу">${sharePct?formatNumber(sharePct,{maximumFractionDigits:1})+'%':'—'}</td>
      <td class="num">${level.orderCount}</td>
      <td class="num">${formatQty(level.cumulativeQuantity)}</td>
    `;
    asksBody.append(tr);
  });
  if (!bidsBody.children.length) {
    bidsBody.innerHTML = '<tr><td colspan="5" class="muted">Немає активних заявок</td></tr>';
  }
  if (!asksBody.children.length) {
    asksBody.innerHTML = '<tr><td colspan="5" class="muted">Немає активних заявок</td></tr>';
  }
}

function renderMetrics(book, me) {
  const auction = book.auction;
  const isCleared = auction.status === 'cleared' || auction.status === 'closed';
  const isAdmin = me?.authenticated && me.user?.is_admin;

  if (book.visibility === 'sealed' && !isAdmin) {
    if (isCleared) {
      metricsEl.innerHTML = `
        <div class="sealed-notice">
          <p style="margin: 0 0 12px 0;">
            <strong>🔒 Sealed-bid аукціон завершено</strong>
          </p>
          <dl>
            <dt>k-параметр</dt>
            <dd>${book.metrics?.kValue !== null && book.metrics?.kValue !== undefined ? formatNumber(book.metrics.kValue, {maximumFractionDigits: 3}) : '—'}</dd>
            <dt>Фінальна clearing ціна</dt>
            <dd>${book.metrics?.lastClearingPrice !== null && book.metrics?.lastClearingPrice !== undefined ? formatPrice(book.metrics.lastClearingPrice) : '—'}</dd>
            <dt>Фінальна clearing кількість</dt>
            <dd>${book.metrics?.lastClearingQuantity !== null && book.metrics?.lastClearingQuantity !== undefined ? formatQty(book.metrics.lastClearingQuantity) : '—'}</dd>
          </dl>
        </div>
      `;
    } else {
      metricsEl.innerHTML = `
        <div class="sealed-notice">
          <p class="muted" style="margin: 0 0 12px 0;">
            <strong>🔒 Sealed-bid режим</strong><br>
            Метрики книги заявок недоступні до завершення клірингу.
          </p>
          <dl>
            <dt>k-параметр</dt>
            <dd>${book.metrics?.kValue !== null && book.metrics?.kValue !== undefined ? formatNumber(book.metrics.kValue, {maximumFractionDigits: 3}) : '—'}</dd>
            <dt>Остання clearing ціна</dt>
            <dd>${book.metrics?.lastClearingPrice !== null && book.metrics?.lastClearingPrice !== undefined ? formatPrice(book.metrics.lastClearingPrice) : '—'}</dd>
            <dt>Остання clearing кількість</dt>
            <dd>${book.metrics?.lastClearingQuantity !== null && book.metrics?.lastClearingQuantity !== undefined ? formatQty(book.metrics.lastClearingQuantity) : '—'}</dd>
          </dl>
        </div>
      `;
    }
    return;
  }
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
  if (pct) return `${formatNumber(val,{maximumFractionDigits:1})}%`;
    if (typeof val==='number') return formatNumber(val);
    return val;
  };
  metricsEl.innerHTML = '';
  const wrap = document.createElement('div'); wrap.className='metrics-tiles';
  const grid = document.createElement('div'); grid.className='metrics-tiles__grid';
  const tiles = [
    {k:'spread', label:'Спред', value:fmt(m.spread), spark:sparkBar(h.spread,{stroke:'#7ee787'}), cls:(m.spread<0?'negative':'positive')},
    {k:'mid', label:'Mid ціна', value:fmt(m.midPrice), spark:sparkBar(h.midPrice,{stroke:'#66c0f4'})},
    {k:'depthImb', label:'Дисбаланс', value:fmt(typeof m.depthImbalance==='number'?m.depthImbalance*100:NaN,{pct:true}), spark:sparkBar(h.depthImbalancePct,{stroke:'#ff9393'}), cls: (m.depthImbalance>0?'positive':'negative')},
    {k:'lastClr', label:'Clearing ціна', value:fmt(m.lastClearingPrice), spark:sparkBar(h.lastClearingPrice,{stroke:'#cfa8ff'})}
  ];
  if (typeof m.kValue === 'number') {
    tiles.push({k:'kVal', label:'k-параметр', value:fmt(m.kValue,{maximumFractionDigits:3})});
  }
  if (typeof m.adaptiveK === 'number') {
    const diffCls = (m.kValue!==undefined && m.adaptiveK!==m.kValue)? 'positive' : '';
    tiles.push({k:'kAdaptive', label:'k адаптив', value:fmt(m.adaptiveK,{maximumFractionDigits:3}), cls: diffCls});
  }
  tiles.forEach(t=>{
    const div = document.createElement('div'); div.className='metric-tile'+(t.cls?(' '+t.cls):'');
    div.innerHTML = `<div class="metric-tile__label">${t.label}</div><div class="metric-tile__value">${t.value}</div>${t.spark?`<div class="metric-tile__spark">${t.spark}</div>`:''}`;
    grid.appendChild(div);
  });

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

async function fetchHistory(force=false, seqExpected) {
  if (!auctionId) return null;
  if (!canViewAdminData()) {
    if (historyChartsEl) {
      historyChartsEl.innerHTML = '<div class="muted">Дані історії доступні лише адміністраторам.</div>';
    }
    return null;
  }
  const now = Date.now();
  if (!force && (now - __lastHistoryAt < HISTORY_INTERVAL)) return null;
  const p = (async () => {
    try {
      const r = await authorizedFetch(`/api/auctions/${auctionId}/history`);
      if (r.status === 403) {
        if (historyChartsEl) {
          historyChartsEl.innerHTML = '<div class="muted">Дані історії доступні лише адміністраторам.</div>';
        }
        return null;
      }
      if (!r.ok) return null;
      const data = await r.json();
      if (seqExpected && seqExpected < __refreshSeq) return null;
      __lastHistoryAt = Date.now();
      return data;
    } catch { return null; }
  })();
  __pendingHistory = p;
  return p;
}

function buildLine(pts, {w=340,h=90,stroke='#66c0f4'}={}) {
  if (!pts || pts.length < 2) return `<div class="chart-empty">—</div>`;
  const ys = pts.map(p=>p.price);
  const minY = Math.min(...ys), maxY = Math.max(...ys), span = maxY-minY||1;
  const coords = pts.map((p,i)=>{
    const x = (i/(pts.length-1))*(w-2)+1;
    const y = h-2-((p.price-minY)/span)*(h-4);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" class="micro-chart micro-chart--line" preserveAspectRatio="none"><polyline points="${coords}" fill="none" stroke="${stroke}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

function buildDepth(curve, {w=340,h=110,midPrice=null}={}) {
  const bids = (curve?.bids||[]).slice(0,60);
  const asks = (curve?.asks||[]).slice(0,60);
  if (!bids.length && !asks.length) return '<div class="chart-empty">—</div>';
  const prices = [...bids.map(b=>b.price),...asks.map(a=>a.price)];
  const cumVals = [...bids.map(b=>b.cum),...asks.map(a=>a.cum)];
  const minP=Math.min(...prices), maxP=Math.max(...prices), maxCum=Math.max(...cumVals,1);
  const pad=4;
  const sx=p=>pad+((p-minP)/(maxP-minP||1))*(w-pad*2);
  const sy=c=>h-pad-((c/maxCum)*(h-pad*2));
  const mkPath=(arr)=>arr.map((pt,i)=>`${i?'L':'M'}${sx(pt.price).toFixed(2)},${sy(pt.cum).toFixed(2)}`).join(' ');
  const bidPath = mkPath(bids);
  const askPath = mkPath(asks);
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" class="micro-chart micro-chart--depth" preserveAspectRatio="none">
    <path d="${bidPath}" fill="none" stroke="#2ecc71" stroke-width="1.5"/>
    <path d="${askPath}" fill="none" stroke="#ff7676" stroke-width="1.5"/>
    ${midPrice!==null?`<line x1="${sx(midPrice).toFixed(2)}" y1="0" x2="${sx(midPrice).toFixed(2)}" y2="${h}" stroke="#9ca3af" stroke-dasharray="4 4" stroke-width="1" opacity="0.7"/>`:''}
  </svg>`;
}

async function updateHistoryCharts(force=false, seqExpected) {
  if (!historyChartsEl) return;
  if (!canViewAdminData()) {
    historyChartsEl.innerHTML = '<div class="muted">Цей розділ доступний лише адміністраторам.</div>';
    return;
  }
  const data = await fetchHistory(force, seqExpected);
  if (!data) return;
  const prices = (data.clearedSeries||[]).filter(p=>typeof p.price==='number');
  const lastPrice = prices.length? prices[prices.length-1].price : null;
  const firstPrice = prices.length? prices[0].price : null;
  const changeAbs = (lastPrice!==null && firstPrice!==null)? (lastPrice-firstPrice) : null;
  const changePct = (changeAbs!==null && firstPrice)? (changeAbs/firstPrice)*100 : null;
  const mid = window.__lastBook?.metrics?.midPrice ?? null;
  const bidDepthTotal = data.bookCurve?.bids?.length? data.bookCurve.bids[data.bookCurve.bids.length-1].cum : 0;
  const askDepthTotal = data.bookCurve?.asks?.length? data.bookCurve.asks[data.bookCurve.asks.length-1].cum : 0;
  const depthShareBid = bidDepthTotal+askDepthTotal? (bidDepthTotal/(bidDepthTotal+askDepthTotal))*100 : null;
  historyChartsEl.innerHTML = `
    <div class="charts-row">
      <div class="mini-chart">
        <div class="mini-chart__header">
          <span class="mini-chart__title">Ціни клірингу</span>
          <span class="mini-chart__stat">${lastPrice!==null?formatPrice(lastPrice):'—'}${changeAbs!==null?` <span class="${changeAbs>0?'pos':'neg'}">(${changeAbs>0?'+':''}${formatPrice(changeAbs)}${changePct!==null?` / ${changePct>0?'+':''}${formatNumber(changePct,{maximumFractionDigits:1})}%`:''})</span>`:''}</span>
        </div>
        <div class="mini-chart__body">${buildLine(prices,{})}</div>
        <div class="mini-chart__footer">Діапазон: ${firstPrice!==null?formatPrice(Math.min(firstPrice,lastPrice)):'—'} – ${lastPrice!==null?formatPrice(Math.max(firstPrice,lastPrice)):'—'}</div>
      </div>
      <div class="mini-chart">
        <div class="mini-chart__header">
          <span class="mini-chart__title">Кумулятивна глибина</span>
          <span class="mini-chart__stat">Bid ${formatQty(bidDepthTotal)} · Ask ${formatQty(askDepthTotal)}${mid!==null?` · Mid ${formatPrice(mid)}`:''}</span>
        </div>
        <div class="mini-chart__body">${buildDepth(data.bookCurve,{midPrice:mid})}</div>
        <div class="mini-chart__footer">Співвідн.: ${depthShareBid!==null?formatNumber(depthShareBid,{maximumFractionDigits:1}):'—'}% bid / ${depthShareBid!==null?formatNumber(100-depthShareBid,{maximumFractionDigits:1}):'—'}% ask</div>
      </div>
    </div>`;
}

async function updatePriceDistribution(force=false, seqExpected) {
  if (!priceDistEl) return;
  if (!canViewAdminData()) {
    priceDistEl.innerHTML = '<div class="muted">Розподіл цін доступний лише адміністраторам.</div>';
    return;
  }
  const now = Date.now();
  if (!force && (now - __lastDistributionAt < DIST_INTERVAL)) return;
  try {
    const res = await authorizedFetch(`/api/auctions/${auctionId}/distribution`);
    if (res.status === 403) {
      priceDistEl.innerHTML = '<div class="muted">Розподіл цін доступний лише адміністраторам.</div>';
      return;
    }
    if (!res.ok) return;
    const dist = await res.json();
    if (seqExpected && seqExpected < __refreshSeq) return;
    __lastDistributionAt = Date.now();
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

async function renderClearingRounds() {
  if (!clearingRoundsListEl) return;
  clearingRoundsListEl.innerHTML = '<p class="muted" style="padding:16px;">Завантаження…</p>';
  try {
    // Завантажуємо раунди через публічний endpoint
    const response = await authorizedFetch(`/api/auctions/${auctionId}/clearing-history`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const historyResp = await response.json();
    const rounds = historyResp.rounds || [];
    
    // Отримуємо інформацію про наступний кліринг з поточної книги
    let nextClearingInfo = '';
    if (window.__lastBook?.auction?.next_clearing_at) {
      const nextClearing = new Date(window.__lastBook.auction.next_clearing_at);
      const now = new Date();
      if (nextClearing > now) {
        nextClearingInfo = `<div style="padding:12px;background:var(--surface);border-radius:6px;margin-bottom:12px;border-left:4px solid #66c0f4;">
          <strong>⏱ Наступний кліринг:</strong> <span id="next-clearing-countdown">${formatDate(nextClearing)}</span>
        </div>`;
      }
    }
    
    if (!rounds.length) {
      clearingRoundsListEl.innerHTML = nextClearingInfo + '<p class="muted" style="padding:16px;">Клірингу ще не було</p>';
      return;
    }
    
    const html = nextClearingInfo + `
      <div style="overflow-x:auto;">
        <table style="width:100%;font-size:0.85rem;border-collapse:collapse;">
          <thead>
            <tr style="background:var(--surface);border-bottom:1px solid var(--surface-border-soft);">
              <th style="padding:8px;text-align:left;">Раунд</th>
              <th style="padding:8px;text-align:right;">Clearing ціна</th>
              <th style="padding:8px;text-align:right;">Обсяг</th>
              <th style="padding:8px;text-align:right;">Попит</th>
              <th style="padding:8px;text-align:right;">Пропозиція</th>
              <th style="padding:8px;text-align:right;">Виконано ордерів</th>
              <th style="padding:8px;text-align:right;">Час клірингу</th>
            </tr>
          </thead>
          <tbody>
            ${rounds.map((r, idx) => `
              <tr style="border-bottom:1px solid var(--surface-border-soft);">
                <td style="padding:8px;"><strong>#${r.roundNumber}</strong></td>
                <td style="padding:8px;text-align:right;color:#66c0f4;"><strong>${formatPrice(r.clearingPrice)}</strong></td>
                <td style="padding:8px;text-align:right;">${formatQty(r.clearingVolume)}</td>
                <td style="padding:8px;text-align:right;color:#7ee787;">${formatQty(r.clearingDemand)}</td>
                <td style="padding:8px;text-align:right;color:#ff9393;">${formatQty(r.clearingSupply)}</td>
                <td style="padding:8px;text-align:right;"><span style="background:var(--surface);padding:2px 6px;border-radius:3px;">${r.matchedOrders}</span></td>
                <td style="padding:8px;white-space:nowrap;font-size:0.8rem;color:var(--text-muted);">${formatDate(r.clearedAt)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    clearingRoundsListEl.innerHTML = html;
  } catch (err) {
    console.warn('Не вдалося завантажити раунди клірингу:', err);
    if (clearingRoundsListEl) {
      clearingRoundsListEl.innerHTML = `<p class="muted" style="padding:16px;">❌ ${err?.message || 'Помилка завантаження'}</p>`;
    }
  }
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
  const isAdmin = me?.authenticated && me.user?.is_admin;
  
  const isCleared = auction.status === 'cleared' || auction.status === 'closed';
  if (isCleared) {
    formsEl.innerHTML = `
      <div class="sealed-notice">
        <p><strong>🔒 Аукціон завершено</strong></p>
        <p style="margin-top: 8px; font-size: 0.9rem;">
          Подача нових заявок неможлива після завершення клірингу.
        </p>
      </div>
    `;
    return;
  }
  
  if (!me?.authenticated) {
    formsEl.innerHTML = '<p class="muted">Увійдіть, щоб взяти участь в аукціоні.</p>';
    return;
  }
  
  if (isAdmin) {
    formsEl.innerHTML = `
      <div class="admin-notice">
        <p class="muted"><strong>👤 Адмін режим</strong></p>
        <p class="muted" style="font-size: 0.85rem; margin-top: 8px;">
          Ви увійшли як адміністратор. Подача заявок доступна тільки для трейдерів.
        </p>
      </div>
    `;
    return;
  }
  
  const joinStatus = participation?.status || null;
  const statusLabel = document.createElement('div');
  statusLabel.className = 'participation-status';
  statusLabel.innerHTML = `<strong>Статус участі:</strong> <span class="status-badge status-${joinStatus || 'none'}">${joinStatus || 'не приєднався'}</span>`;
  if (participation?.account_id) {
    statusLabel.innerHTML += `<span class="muted" style="display: block; margin-top: 4px; font-size: 0.85rem;">Рахунок: ${participation.account_id}</span>`;
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
  orderForm.className = 'order-form';
  orderForm.innerHTML = `
    <h4 style="margin: 12px 0 8px 0; font-size: 0.95rem;">Подати заявку</h4>
    <label for="order-side">Тип заявки</label>
    <select id="order-side" name="side" required>
      <option value="bid">📈 Bid (купівля)</option>
      <option value="ask">📉 Ask (продаж)</option>
    </select>
    <div class="market-form__split">
      <label>
        Ціна
        <input name="price" type="number" min="0" step="0.1" placeholder="0.0" required />
      </label>
      <label>
        Кількість
        <input name="quantity" type="number" min="0" step="0.1" placeholder="0.0" required />
      </label>
    </div>
    <button type="submit" class="btn btn-primary">Подати заявку</button>
  `;
  orderForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitBtn = orderForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Обробка...';
    const formData = new FormData(orderForm);
    const payload = {
      type: formData.get('side'),
      price: Number(formData.get('price')),
      quantity: Number(formData.get('quantity')),
    };
    try {
      if (payload.price <= 0 || payload.quantity <= 0) {
        throw new Error('Ціна та кількість повинні бути більше нуля');
      }
      await placeAuctionOrder(auctionId, payload);
      showToast('✅ Заявку прийнято', 'success');
      orderForm.reset();
      await load();
    } catch (error) {
      showToast(localizeErrorMessage(error?.message || 'Не вдалося подати заявку'), 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  });
  formsEl.append(orderForm);
}

async function load(seq) {
  if (isLoading) return;
  isLoading = true;
  const currentSeq = seq || ++__refreshSeq;
  summaryEl.classList.add('is-loading');
  try {
    const [me, book] = await Promise.all([
      getMe().catch(() => ({ authenticated: false })),
      getAuctionBook(auctionId),
    ]);
    if (currentSeq < __refreshSeq) return;
    let participation = null;
    if (me?.authenticated && !me.user?.is_admin) {
      participation = await myParticipationStatus(auctionId).catch(() => null);
    }
    renderSummary(book, me);
    renderBook(book, me);
    renderMetrics(book, me);
    await renderMyOrdersTab(me);
    renderForms(book, me, participation);
    window.__lastBook = book;
    window.__lastMe = me;
    if (book?.auction?.status && book.auction.status !== 'collecting') {
      if (__refreshTimer) { clearInterval(__refreshTimer); __refreshTimer = null; }
    }
  } catch (error) {
    if (currentSeq >= __refreshSeq) {
      summaryEl.innerHTML = `<p class="error">${localizeErrorMessage(error?.message || 'Не вдалося завантажити аукціон')}</p>`;
    }
    console.error(error);
  } finally {
    if (currentSeq >= __refreshSeq) summaryEl.classList.remove('is-loading');
    isLoading = false;
  }
  return currentSeq;
}

async function refreshAll() {
  if (__refreshInFlight) return;
  __refreshInFlight = true;
  const seq = ++__refreshSeq;
  await load(seq);
  if (__activeTab === 'tab-activity') {
    await updateHistoryCharts(false, seq);
    if (window.__lastBook) {
      try { renderOrdersList(window.__lastBook); } catch {}
      try { renderClearing(window.__lastBook); } catch {}
      try { renderClearingRounds(); } catch {}
    }
  } else if (__activeTab === 'tab-distribution') {
    await updatePriceDistribution(false, seq);
  }
  __refreshInFlight = false;
}

async function renderMyOrdersTab(me) {
  if (!myOrdersListEl) return;
  myOrdersListEl.innerHTML = '';
  if (!me?.authenticated || me.user?.is_admin) {
    myOrdersListEl.innerHTML = '<div class="muted">Доступно лише трейдерам</div>';
    return;
  }
  let rows = [];
  try {
    rows = await meAuctionOrders();
  } catch (_) {
    myOrdersListEl.innerHTML = '<div class="muted">Не вдалося завантажити</div>';
    return;
  }
  const ours = rows.filter((o) => Number(o.auction_id) === Number(auctionId));
  if (!ours.length) {
    myOrdersListEl.innerHTML = '<div class="muted">Ще немає ордерів</div>';
    return;
  }
  const list = document.createElement('ul');
  list.className = 'market-activity__list';
  ours.forEach((o) => {
    const li = document.createElement('li');
    const qty = Number(o.quantity);
    const createdAt = o.created_at ? new Date(o.created_at).toLocaleString() : '';
    li.innerHTML = `
      <div><strong>${tSide(o.side)}</strong> ${formatQty(qty)} @ ${formatPrice(o.price)} ${o.status ? `<span class="pill">${o.status}</span>` : ''}</div>
      <span>${createdAt}</span>
    `;
    if (o.status === 'open') {
      const btn = document.createElement('button');
      btn.className = 'btn btn-ghost btn-compact';
      btn.textContent = 'Скасувати';
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await cancelAuctionOrder(auctionId, o.id);
          showToast('Ордер скасовано', 'success');
          await load();
          await renderMyOrdersTab(me);
        } catch (e) {
          showToast(localizeErrorMessage(e?.message), 'error');
        } finally {
          btn.disabled = false;
        }
      });
      li.appendChild(btn);
    }
    list.appendChild(li);
  });
  myOrdersListEl.appendChild(list);
}

// Функція для оновлення таймера кліренгу без повного перезавантаження
function updateClearingTimer() {
  const clearingTimeEl = document.getElementById('clearing-time');
  if (!clearingTimeEl || !window.__lastBook?.auction?.next_clearing_at) return;
  
  const nextClearingAt = window.__lastBook.auction.next_clearing_at;
  const nextClearing = new Date(nextClearingAt);
  const now = new Date();
  
  console.log(`[Timer] nextClearingAt=${nextClearingAt}, now=${now.toISOString()}, diff=${nextClearing - now}ms`);
  
  if (nextClearing <= now) {
    clearingTimeEl.textContent = 'виконується...';
    return;
  }
  
  const diffMs = nextClearing - now;
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffSeconds = Math.floor((diffMs % 60000) / 1000);
  const timeStr = `через ${diffMinutes}хв ${diffSeconds}с`;
  
  clearingTimeEl.textContent = timeStr;
}

refreshBtn.addEventListener('click', () => { refreshAll().then(()=> showToast('Оновлено', 'info')); });

document.addEventListener('DOMContentLoaded', async () => {
  await initAccessControl();
  await refreshAll();
  if (!__refreshTimer) {
    __refreshTimer = setInterval(() => {
      if (document.hidden) return;
      if (isLoading) return;
      refreshAll();
    }, FULL_REFRESH_INTERVAL);
  }
  
  // Оновлюємо таймер кожну секунду
  setInterval(() => {
    if (!document.hidden) {
      updateClearingTimer();
    }
  }, 1000);
  window.addEventListener('beforeunload', () => {
    if (__refreshTimer) {
      clearInterval(__refreshTimer);
      __refreshTimer = null;
    }
  });

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
      __activeTab = id;
      if (id === 'tab-my-orders') { renderMyOrdersTab(window.__lastMe); }
      if (id === 'tab-rounds') { renderClearingRounds(); }
      if (id === 'tab-activity') {
        updateHistoryCharts(true, __refreshSeq);
        if (window.__lastBook) {
          try { renderOrdersList(window.__lastBook); } catch {}
          try { renderClearing(window.__lastBook); } catch {}
          try { renderClearingRounds(); } catch {}
        }
      }
      if (id === 'tab-distribution') {
        updatePriceDistribution(true, __refreshSeq);
      }
    });
  });

  if (refreshDistBtn) {
    refreshDistBtn.addEventListener('click', () => {
      updatePriceDistribution(true, __refreshSeq).then(()=> showToast('Оновлено', 'info'));
    });
  }
});
