import { getMyProfile, authorizedFetch, meAuctions, meAuctionOrders, meDocuments } from '../api.js';
import { showToast } from '../ui/toast.js';
import { initAccessControl } from '../ui/session.js';

function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  for (const c of children) {
    if (typeof c === 'string') e.appendChild(document.createTextNode(c));
    else if (c) e.appendChild(c);
  }
  return e;
}

async function renderHead(user) {
  const head = document.getElementById('profile-head');
  if (!head) 
    return;
  head.innerHTML = '';
  const profileInfo = await getMyProfile().catch(() => null);
  const profile = profileInfo?.profile || {};
  const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ');
  const location = [profile.city, profile.region, profile.country].filter(Boolean).join(', ');
  head.append(
    el('span', { 
      className: 'eyebrow' }, 'Profile overview'),
    el('div', { 
      className: 'dashboard-card__title' },
      el('span', {}, user.username),
      el('span', { 
        className: `badge ${user.is_admin ? 'badge--accent' : 'badge--outline'}` }, user.is_admin ? 'Admin' : 'Trader')
    ),
    el('p', { 
      className: 'dashboard-card__subtitle' }, fullName || 'Complete your identity to unlock approvals.'),
    (() => {
      const meta = el('div', { 
        className: 'dashboard-card__meta' });
      if (user.email) meta.appendChild(el('span', {}, `Email • ${user.email}`));
      if (location) meta.appendChild(el('span', {}, `Location • ${location}`));
      return meta;
    })(),
    (() => {
      const chips = el('div', { 
        className: 'stat-chips' });
      chips.appendChild(el('span', { 
        className: 'chip chip--accent' }, 
        profileInfo?.role ? `Role • ${profileInfo.role}` : 'Role • trader'));
      if (profile.updated_at) chips.appendChild(el('span', { 
        className: 'chip' }, `Updated ${new Date(profile.updated_at).toLocaleDateString()}`));
      return chips;
    })(),
    (() => {
      const actions = el('div', { 
        className: 'dashboard-card__actions'});
      actions.append(
        el('a', { 
          className: 'btn btn-primary btn-compact', href: 'account.html' }, 'Manage account'),
        el('a', { 
          className: 'btn btn-ghost btn-compact', href: 'admin.html' }, user.is_admin ? 'Open admin panel' : 'Request admin')
      );
      return actions;
    })()
  );
}

async function renderAuctions() {
  const root = document.getElementById('profile-content');
  if (!root) return;
  root.innerHTML = '';
  const list = el('div', { className: 'stack-grid' });
  list.textContent = 'Loading auctions…';
  root.appendChild(list);
  try {
    const rows = await meAuctions();
    if (!rows.length) {
      list.textContent = 'No auctions participated yet';
      return;
    }
    list.innerHTML = '';
    rows.forEach(r => {
      const card = el('article', { 
        className: 'stack-card' });
      const header = el('div', { 
        className: 'stack-card__header' },
        el('strong', {}, `#${r.auction_id} ${r.product}`),
        el('span', { 
          className: 'pill pill--outline' }, r.auction_type),
        el('span', { 
          className: 'chip' }, `k = ${r.k_value}`),
        el('span', { 
          className: 'chip' }, `Auction • ${r.auction_status}`)
      );
      const meta = el('div', { 
        className: 'stack-card__meta' }, `You • ${r.participant_status} @ ${new Date(r.joined_at).toLocaleString()}`);
      card.append(header, meta);
      list.appendChild(card);
    });
  } catch (_) {
    list.textContent = 'Failed to load';
  }
}

async function renderOrders() {
  const root = document.getElementById('profile-content');
  if (!root) return;
  root.innerHTML = '';
  const list = el('div', { 
    className: 'stack-grid' });
  list.textContent = 'Loading orders…';
  root.appendChild(list);
  try {
    const rows = await meAuctionOrders();
    if (!rows.length) {
      list.textContent = 'No orders yet';
      return;
    }
    list.innerHTML = '';
    rows.forEach(o => {
      const qty = Number(o.quantity);
      const cqty = o.cleared_quantity != null ? Number(o.cleared_quantity) : null;
      const card = el('article', { className: 'stack-card' });
      const header = el('div', { className: 'stack-card__header' },
        el('strong', {}, `Auction #${o.auction_id}`),
        el('span', { className: 'pill pill--outline' }, o.side),
        el('span', { className: 'chip' }, `${o.price} × ${qty}`),
        o.status ? el('span', { className: 'chip' }, `Status • ${o.status}`) : null
      );
      card.appendChild(header);
      if (cqty != null) {
        card.appendChild(el('div', { className: 'stack-card__meta' }, `Cleared • ${o.cleared_price} × ${cqty}`));
      }
      card.appendChild(el('div', { className: 'stack-card__meta' }, `${o.product} • ${new Date(o.created_at).toLocaleString()}`));
      list.appendChild(card);
    });
  } catch (_) {
    list.textContent = 'Failed to load';
  }
}

async function renderDocs() {
  const root = document.getElementById('profile-content');
  if (!root) return;
  root.innerHTML = '';
  const list = el('div', { 
    className: 'data-list' });
  list.textContent = 'Loading documents…';
  root.appendChild(list);
  try {
    const rows = await meDocuments();
    if (!rows.length) {
      list.textContent = 'No documents yet';
      return;
    }
    list.innerHTML = '';
    rows.forEach(d => {
      const item = el('div', { className: 'data-list__item' },
        el('span', { 
          className: 'data-list__label' }, `Auction #${d.auction_id}`),
        el('span', { 
          className: 'chip' }, d.filename), d.notes ? el('span', { className: 'chip' }, d.notes) : null,
        el('span', { 
          className: 'data-list__meta' }, new Date(d.created_at || d.uploaded_at || d.uploadedAt || Date.now()).toLocaleString())
      );
      const btn = el('button', { 
        className: 'btn btn-ghost btn-compact' }, 'Download');
      btn.addEventListener('click', async () => {
        const res = await authorizedFetch(`/api/me/documents/${d.auction_id}/${encodeURIComponent(d.filename)}`);
        if (!res.ok) { 
          showToast('Download failed', 'error'); 
          return; 
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = d.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      });
      item.appendChild(btn);
      list.appendChild(item);
    });
  } catch (_) {
    list.textContent = 'Failed to load';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const session = await initAccessControl({
    requireAuth: true,
    redirectTo: 'account.html',
    onDenied: () => showToast('Увійдіть, щоб переглянути профіль.', 'error'),
  });
  if (!session?.authenticated || !session.user) return;
  const user = session.user;
  await renderHead(user);
  const tabA = document.getElementById('tab-auctions');
  const tabO = document.getElementById('tab-orders');
  const tabD = document.getElementById('tab-docs');
  function activate(tab) {
    [tabA, tabO, tabD].forEach(t => t.classList.remove('tab--active'));
    tab.classList.add('tab--active');
  }
  tabA.addEventListener('click', () => { 
    activate(tabA); renderAuctions(); });
  tabO.addEventListener('click', () => { 
    activate(tabO); renderOrders(); });
  tabD.addEventListener('click', () => { 
    activate(tabD); renderDocs(); });
  renderAuctions();
});
