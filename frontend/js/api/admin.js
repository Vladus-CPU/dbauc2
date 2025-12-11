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

export async function listPendingAuctionOrders() {
    const res = await authorizedFetch('/api/admin/auction-orders/pending');
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Не вдалося отримати відкриті заявки: ${res.status} ${txt}`);
    }
    return res.json();
}

export async function approveAuctionOrder(orderId, kCoefficient) {
    const res = await authorizedFetch(`/api/admin/auction-orders/${orderId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ k_coefficient: kCoefficient })
    });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Не вдалося схвалити заявку: ${res.status} ${txt}`);
    }
    return res.json();
}

export async function rejectAuctionOrder(orderId, reason) {
    const res = await authorizedFetch(`/api/admin/auction-orders/${orderId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
    });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Не вдалося відхилити заявку: ${res.status} ${txt}`);
    }
    return res.json();
}

export async function batchApproveAuctionOrders(orderIds, kCoefficient) {
    const res = await authorizedFetch('/api/admin/auction-orders/batch-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds, k_coefficient: kCoefficient })
    });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Масове схвалення не вдалося: ${res.status} ${txt}`);
    }
    return res.json();
}

export async function batchRejectAuctionOrders(orderIds, reason) {
    const res = await authorizedFetch('/api/admin/auction-orders/batch-reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds, reason })
    });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Масове відхилення не вдалося: ${res.status} ${txt}`);
    }
    return res.json();
}

export async function getClearingHistory(auctionId) {
    const res = await authorizedFetch(`/api/admin/auctions/${auctionId}/clearing-history`);
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Не вдалося отримати історію: ${res.status} ${txt}`);
    }
    return res.json();
}

export async function getPendingAuctions() {
    const res = await authorizedFetch('/api/admin/auctions/pending');
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Не вдалося отримати аукціони на модерації: ${res.status} ${txt}`);
    }
    const data = await res.json();
    console.log('getPendingAuctions response:', data);
    // Backend може повертати масив напряму або обгорнутий в об'єкт
    return Array.isArray(data) ? data : (data.auctions || data.items || []);
}

export async function getApprovedAuctions() {
    const res = await authorizedFetch('/api/admin/auctions/approved');
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Не вдалося отримати схвалені аукціони: ${res.status} ${txt}`);
    }
    const data = await res.json();
    console.log('getApprovedAuctions response:', data);
    // Backend може повертати масив напряму або обгорнутий в об'єкт
    return Array.isArray(data) ? data : (data.auctions || data.items || []);
}

export async function approveAuction(auctionId, note = null) {
    const res = await authorizedFetch(`/api/admin/auctions/${auctionId}/approve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note })
    });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Не вдалося схвалити аукціон: ${res.status} ${txt}`);
    }
    return res.json();
}

export async function rejectAuction(auctionId, note = null) {
    const res = await authorizedFetch(`/api/admin/auctions/${auctionId}/reject`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note })
    });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Не вдалося відхилити аукціон: ${res.status} ${txt}`);
    }
    return res.json();
}

export async function confirmAuctionK(auctionId, k) {
    const res = await authorizedFetch(`/api/admin/auctions/${auctionId}/k/confirm`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ k })
    });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Не вдалося підтвердити k: ${res.status} ${txt}`);
    }
    return res.json();
}
