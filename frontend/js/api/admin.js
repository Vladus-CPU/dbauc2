import { authorizedFetch } from './http.js';

export async function createAuction({ product, type, k } = {}) {
    const body = { product, type, k };
    const res = await authorizedFetch('/api/admin/auctions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Create auction failed: ${res.status} ${txt}`);
    }
    return res.json();
}

export async function closeAuction(auctionId) {
    const res = await authorizedFetch(`/api/admin/auctions/${auctionId}/close`, {
        method: 'PATCH'
    });
    if (!res.ok) throw new Error(`Не вдалося закрити аукціон: ${res.status}`);
    return res.json();
}

export async function clearAuction(auctionId) {
    const res = await authorizedFetch(`/api/admin/auctions/${auctionId}/clear`, {
        method: 'POST'
    });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Не вдалося провести кліринг аукціону: ${res.status} ${txt}`);
    }
    return res.json();
}

export async function listParticipantsAdmin(auctionId) {
    const res = await authorizedFetch(`/api/admin/auctions/${auctionId}/participants`);
    if (!res.ok) throw new Error(`Не вдалося отримати список учасників: ${res.status}`);
    return res.json();
}

export async function approveParticipant(auctionId, participantId) {
    const res = await authorizedFetch(`/api/admin/auctions/${auctionId}/participants/${participantId}/approve`, {
        method: 'PATCH'
    });
    if (!res.ok) throw new Error(`Не вдалося схвалити учасника: ${res.status}`);
    return res.json();
}

export async function listAuctionOrdersAdmin(auctionId) {
    const res = await authorizedFetch(`/api/admin/auctions/${auctionId}/orders`);
    if (!res.ok) throw new Error(`Не вдалося отримати список ордерів аукціону: ${res.status}`);
    return res.json();
}

export async function listAuctionDocuments(auctionId) {
    const res = await authorizedFetch(`/api/admin/auctions/${auctionId}/documents`);
    if (!res.ok) throw new Error(`Не вдалося отримати список документів: ${res.status}`);
    return res.json();
}

export async function listAdminUsers() {
    const res = await authorizedFetch('/api/admin/users');
    if (!res.ok) throw new Error(`Не вдалося отримати список користувачів: ${res.status}`);
    return res.json();
}

export async function promoteUser(userId) {
    const res = await authorizedFetch(`/api/admin/users/${userId}/promote`, { method: 'POST' });
    if (!res.ok) throw new Error(`Не вдалося підвищити користувача: ${res.status}`);
    return res.json();
}

export async function demoteUser(userId) {
    const res = await authorizedFetch(`/api/admin/users/${userId}/demote`, { method: 'POST' });
    if (!res.ok) throw new Error(`Не вдалося понизити користувача: ${res.status}`);
    return res.json();
}

export async function bootstrapAdmin() {
    const res = await authorizedFetch('/api/admin/bootstrap', { method: 'POST' });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Не вдалося ініціалізувати адміна: ${res.status} ${txt}`);
    }
    return res.json();
}

export async function adminWalletSummary() {
    const res = await authorizedFetch('/api/admin/wallet');
    if (!res.ok) throw new Error(`Огляд гаманця адміністратора не вдався: ${res.status}`);
    return res.json();
}

export async function adminWalletAction(userId, { action, amount, note }) {
    const res = await authorizedFetch(`/api/admin/wallet/${userId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, amount, note }),
    });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Дія з гаманцем адміністратора не вдалася: ${res.status} ${txt}`);
    }
    return res.json();
}

export async function adminWalletTransactions(userId, limit = 100) {
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    const suffix = params.toString() ? `?${params.toString()}` : '';
    const res = await authorizedFetch(`/api/admin/wallet/${userId}/transactions${suffix}`);
    if (!res.ok) throw new Error(`Транзакції гаманця адміністратора не вдалися: ${res.status}`);
    return res.json();
}
