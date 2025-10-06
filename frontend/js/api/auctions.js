import { resolveApiUrl } from './config.js';
import { authorizedFetch } from './http.js';

export async function listAuctions({ status, type } = {}) {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (type) params.set('type', type);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(resolveApiUrl(`/api/auctions${suffix}`));
    if (!res.ok) throw new Error(`Не вдалося отримати список аукціонів: ${res.status}`);
    return res.json();
}

export async function getAuctionBook(auctionId) {
    const res = await fetch(resolveApiUrl(`/api/auctions/${auctionId}/book`));
    if (!res.ok) throw new Error(`Не вдалося отримати книгу заявок аукціону: ${res.status}`);
    return res.json();
}

export async function joinAuction(auctionId, accountId) {
    const res = await authorizedFetch(`/api/auctions/${auctionId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId })
    });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Не вдалося приєднатися до аукціону: ${res.status} ${txt}`);
    }
    return res.json();
}

export async function myParticipationStatus(auctionId) {
    const res = await authorizedFetch(`/api/auctions/${auctionId}/participants/me`);
    if (!res.ok) throw new Error(`Не вдалося отримати статус участі: ${res.status}`);
    return res.json();
}

export async function placeAuctionOrder(auctionId, { type, price, quantity }) {
    const res = await authorizedFetch(`/api/auctions/${auctionId}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, price, quantity })
    });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Не вдалося розмістити ордер: ${res.status} ${txt}`);
    }
    return res.json();
}

export async function seedRandomAuctionOrders(auctionId, options = {}) {
    const res = await authorizedFetch(`/api/admin/auctions/${auctionId}/seed_random`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options)
    });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Не вдалося згенерувати випадкові заявки: ${res.status} ${txt}`);
    }
    return res.json();
}
