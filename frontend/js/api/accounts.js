import { authorizedFetch } from './http.js';

export async function listAccounts() {
    const res = await authorizedFetch('/api/accounts');
    if (!res.ok) throw new Error(`Не вдалося отримати список рахунків: ${res.status}`);
    return res.json();
}

export async function addAccount(accountNumber) {
    const res = await authorizedFetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountNumber })
    });
    if (!res.ok) throw new Error(`Не вдалося додати рахунок: ${res.status}`);
    return res.json();
}
