import { authorizedFetch } from './http.js';

export async function getWalletBalance() {
    const res = await authorizedFetch('/api/me/wallet');
    if (!res.ok) throw new Error(`Не вдалося отримати баланс гаманця: ${res.status}`);
    return res.json();
}

export async function walletTransactions(limit = 50) {
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    const res = await authorizedFetch(`/api/me/wallet/transactions?${params.toString()}`);
    if (!res.ok) throw new Error(`Транзакції гаманця не вдалися: ${res.status}`);
    return res.json();
}

export async function walletDeposit(amount) {
    const res = await authorizedFetch('/api/me/wallet/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount })
    });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Поповнення не вдалося: ${res.status} ${txt}`);
    }
    return res.json();
}

export async function walletWithdraw(amount) {
    const res = await authorizedFetch('/api/me/wallet/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount })
    });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Виведення не вдалося: ${res.status} ${txt}`);
    }
    return res.json();
}
