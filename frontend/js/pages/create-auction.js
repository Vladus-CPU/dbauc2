import { createUserAuction } from '../api/auctions.js';
import { meAuctions } from '../api/user.js';
import { showToast } from '../ui/toast.js';
import { initAccessControl } from '../ui/session.js';

const form = document.getElementById('create-auction-form');
const statusDiv = document.getElementById('submission-status');
const myAuctionsList = document.getElementById('my-auctions-list');
const myAuctionsHeader = document.getElementById('my-auctions-header');

async function init() {
    const session = await initAccessControl({ requireAuth: true, redirectTo: 'account.html' });
    if (!session?.authenticated) return;
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        const product = (formData.get('product') || '').trim();
        const type = 'open'; // fixed default (selection removed from UI)
        const k = parseFloat(formData.get('k'));
        let windowStart = formData.get('windowStart');
        let windowEnd = formData.get('windowEnd');

        if (!product) {
            showToast('Вкажіть назву продукту', 'error');
            return;
        }

        if (!isFinite(k) || k < 0 || k > 1) {
            showToast('k має бути числом між 0 та 1', 'error');
            return;
        }

        if (!windowStart) windowStart = null;
        if (!windowEnd) windowEnd = null;

        try {
            statusDiv.innerHTML = '<div style="padding:10px;border:1px solid #ddd;background:#fff;border-radius:4px;">Створення...</div>';
            const result = await createUserAuction({ product, type, k, windowStart, windowEnd });
            showToast('Аукціон створено та відправлено на модерацію', 'success');
            statusDiv.innerHTML = `
                <div style="padding:16px 18px;background:rgba(74,222,128,0.14);border:1px solid rgba(74,222,128,0.4);border-radius:14px;color:#d1ffe3;box-shadow:0 6px 18px rgba(74,222,128,0.25);">
                    <div style="font-weight:600;font-size:0.9rem;letter-spacing:0.04em;">✓ Аукціон подано</div>
                    <div style="margin-top:6px;font-size:0.8rem;color:#bdf3d3;">#${result.id} очікує модерацію адміністратора. Після схвалення з'явиться кнопка «Відкрити».</div>
                </div>
            `;
            form.reset();
            await loadMyAuctions();
        } catch (err) {
            console.error('Create auction error:', err);
            showToast(err.message || 'Помилка створення аукціону', 'error');
            statusDiv.innerHTML = `
                <div style="padding:15px;background:#f8d7da;border:1px solid #f5c6cb;border-radius:4px;color:#721c24;">
                    <strong>✗ Помилка</strong><br>
                    ${(err && err.message) || 'Невідома помилка'}
                </div>
            `;
        }
    });
    
    await loadMyAuctions();
}

async function loadMyAuctions() {
    try {
        const auctions = await meAuctions();
        if (!Array.isArray(auctions) || auctions.length === 0) {
                        if (myAuctionsHeader) myAuctionsHeader.innerHTML = '<h4 style="margin:0;font-size:0.95rem;color:#ccc;">Мої аукціони</h4>';
                        myAuctionsList.innerHTML = '<div style="padding:14px 16px;border:1px dashed rgba(255,255,255,0.18);border-radius:12px;background:rgba(255,255,255,0.03);font-size:0.8rem;color:#888;">Ще немає створених чи приєднаних аукціонів.</div>';
            return;
        }
                if (myAuctionsHeader) myAuctionsHeader.innerHTML = '<h4 style="margin:0 0 6px;font-size:0.95rem;color:#d9ffe9;">Мої аукціони</h4>';
        const html = auctions.map(a => {
            const approval = a.approval_status || null;
            const statusClass = approval === 'approved' ? 'success' : approval === 'rejected' ? 'danger' : 'warning';
            const statusText = approval === 'approved' ? 'Схвалено' : approval === 'rejected' ? 'Відхилено' : 'На модерації';
            const createdAt = a.joined_at || a.created_at;
            const kVal = a.k_value || a.auction_k_value;
            const auctionId = a.auction_id || a.id;
            const isCreator = a.is_creator === 1 || a.is_creator === true;
            const openLink = approval === 'approved'
              ? `<a href="auction.html?id=${auctionId}" class="btn btn-ghost btn-compact" style="margin-left:8px;">Відкрити</a>`
              : '';
            const noteLine = (approval === 'rejected' && a.approval_note)
              ? `<div style="color:#b30000;font-size:0.7rem;margin-top:4px;">Причина: ${a.approval_note}</div>`
              : '';
            const roleBadge = isCreator ? '<span class="chip" style="margin-left:4px;">Автор</span>' : '';
            return `
                        <div style="padding:14px 16px;margin:10px 0;border:1px solid rgba(255,255,255,0.12);border-radius:14px;background:rgba(255,255,255,0.05);backdrop-filter:blur(14px);">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
                <div style="min-width:220px;">
                  <strong>#${auctionId} ${a.product || a.auction_product || 'Аукціон'}</strong> ${roleBadge}<br>
                  <small style="color:#666;">Тип: ${a.auction_type || a.type} | k: ${kVal} | Створено: ${createdAt ? new Date(createdAt).toLocaleString('uk-UA') : '—'}</small>
                  ${noteLine}
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                  <span class="chip chip--${statusClass}">${statusText}</span>
                  ${openLink}
                </div>
              </div>
            </div>`;
        }).join('');
        myAuctionsList.innerHTML = html;
    } catch (err) {
        console.error('Load my auctions error:', err);
        myAuctionsList.innerHTML = '<p style="color:#d9534f;">Помилка завантаження аукціонів</p>';
    }
}

init();
