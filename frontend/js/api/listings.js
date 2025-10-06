import { API_BASE_URL } from './config.js';
import { authorizedFetch } from './http.js';

export async function getListings(options = {}) {
    const params = new URLSearchParams();
    if (options.detailed) params.set('detailed', '1');
    if (options.status) params.set('status', options.status);
    if (options.search) params.set('search', options.search);
    if (typeof options.limit === 'number') params.set('limit', String(options.limit));
    if (typeof options.offset === 'number') params.set('offset', String(options.offset));
    if (typeof options.page === 'number') params.set('page', String(options.page));
    if (options.sort) params.set('sort', options.sort);
    const query = params.toString() ? `?${params.toString()}` : '';
    const detailed = Boolean(options.detailed);
    try {
        let response;
        try {
            response = await authorizedFetch(`/api/listings${query}`);
        } catch (networkError) {
            console.warn('Резервний варіант завантаження списків API', networkError);
        }
        if (!response || !response.ok) {
            response = await fetch(`${API_BASE_URL}/listings${query}`);
        }
        if (!response.ok) {
            throw new Error(`Error! status: ${response.status}`);
        }
        const data = await response.json();
        if (detailed) {
            if (Array.isArray(data)) {
                return {
                    items: data,
                    total: data.length,
                    limit: typeof options.limit === 'number' ? options.limit : data.length,
                    offset: typeof options.offset === 'number' ? options.offset : 0,
                };
            }
            return data;
        }
        return data;
    } catch (error) {
        console.error('Не вдалося завантажити лоти:', error);
        if (detailed) throw error;
        return [];
    }
}

export async function getListingSummary(options = {}) {
    const params = new URLSearchParams();
    if (options.search) params.set('search', options.search);
    if (options.status && options.status !== 'all') params.set('status', options.status);
    const query = params.toString() ? `?${params.toString()}` : '';
    try {
        let response;
        try {
            response = await authorizedFetch(`/api/listings/summary${query}`);
        } catch (networkError) {
            console.warn('Резервний варіант завантаження зведення по лотах API', networkError);
        }
        if (!response || !response.ok) {
            response = await fetch(`${API_BASE_URL}/listings/summary${query}`);
        }
        if (!response.ok) {
            throw new Error(`Error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Не вдалося завантажити зведення по лотах:', error);
        throw error;
    }
}

export async function createListing(data) {
    try {
        const response = await authorizedFetch('/api/listings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Не вдалося створити лот: ${response.status} ${text}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Не вдалося створити лот:', error);
        throw error;
    }
}

export async function getListingById(listingId) {
    const res = await authorizedFetch(`/api/listings/${listingId}`);
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Не вдалося отримати лот: ${res.status} ${txt}`);
    }
    return res.json();
}

export async function updateListing(listingId, payload) {
    const res = await authorizedFetch(`/api/listings/${listingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Не вдалося оновити лот: ${res.status} ${txt}`);
    }
    return res.json();
}

export async function patchListing(listingId, payload) {
    const res = await authorizedFetch(`/api/listings/${listingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Не вдалося частково оновити лот: ${res.status} ${txt}`);
    }
    return res.json();
}

export async function deleteListing(listingId) {
    const res = await authorizedFetch(`/api/listings/${listingId}`, { method: 'DELETE' });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Не вдалося видалити лот: ${res.status} ${txt}`);
    }
    return res.json();
}

export async function createListingAuction(listingId, payload) {
    const res = await authorizedFetch(`/api/listings/${listingId}/auctions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Create auction failed: ${res.status} ${txt}`);
    }
    return res.json();
}
