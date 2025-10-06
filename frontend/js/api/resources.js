import { authorizedFetch } from './http.js';

export async function listResourceTransactions() {
    const res = await authorizedFetch('/api/resources/transactions');
    if (!res.ok) throw new Error(`Не вдалося отримати список транзакцій: ${res.status}`);
    return res.json();
}

export async function addResourceTransaction({ type, quantity, notes }) {
    const res = await authorizedFetch('/api/resources/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, quantity, notes })
    });
    if (!res.ok) throw new Error(`Не вдалося додати транзакцію: ${res.status}`);
    return res.json();
}

export async function listResourceDocuments(options = {}) {
    const params = new URLSearchParams();
    if (options.traderId) params.set('traderId', options.traderId);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    const res = await authorizedFetch(`/api/resources/documents${suffix}`);
    if (!res.ok) throw new Error(`Не вдалося отримати список документів ресурсів: ${res.status}`);
    return res.json();
}

export async function uploadResourceDocument({ file, note }) {
    const formData = new FormData();
    formData.append('file', file);
    if (note) formData.append('note', note);
    const res = await authorizedFetch('/api/resources/documents', {
        method: 'POST',
        body: formData
    });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Не вдалося завантажити документ: ${res.status} ${txt}`);
    }
    return res.json();
}
