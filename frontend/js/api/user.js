import { authorizedFetch } from './http.js';

export async function getMyProfile() {
    const res = await authorizedFetch('/api/me/profile');
    if (!res.ok) throw new Error(`Не вдалося отримати профіль: ${res.status}`);
    return res.json();
}

export async function updateMyProfile(payload) {
    const res = await authorizedFetch('/api/me/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Не вдалося оновити профіль: ${res.status} ${txt}`);
    }
    return res.json();
}

export async function meAuctions() {
    const res = await authorizedFetch('/api/me/auctions');
    if (!res.ok) throw new Error(`Мої аукціони не вдалися: ${res.status}`);
    return res.json();
}

export async function meAuctionOrders() {
    const res = await authorizedFetch('/api/me/auction-orders');
    if (!res.ok) throw new Error(`Мої замовлення не вдалися: ${res.status}`);
    return res.json();
}

export async function meDocuments() {
    const res = await authorizedFetch('/api/me/documents');
    if (!res.ok) throw new Error(`Мої документи не вдалися: ${res.status}`);
    return res.json();
}
