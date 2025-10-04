const browserOrigin = typeof window !== 'undefined' ? window.location.origin : '';
const configuredOrigin = typeof window !== 'undefined' && window.API_BASE_URL ? window.API_BASE_URL : null;
const API_BASE_URL = configuredOrigin || (browserOrigin && browserOrigin !== 'null' ? browserOrigin : 'http://localhost:5000');

function resolveApiUrl(path) {
    if (path.startsWith('http://') || path.startsWith('https://')) {
        return path;
    }
    if (!API_BASE_URL) {
        return path;
    }
    if (path.startsWith('/')) {
        return `${API_BASE_URL}${path}`;
    }
    return `${API_BASE_URL}/${path}`;
}

const TOKEN_KEY = 'token';
export function setToken(token, remember = true) {
    try {
        if (token) {
            if (remember) {
                localStorage.setItem(TOKEN_KEY, token);
                try { sessionStorage.removeItem(TOKEN_KEY); } 
                catch {}
            } else {
                sessionStorage.setItem(TOKEN_KEY, token);
                try { localStorage.removeItem(TOKEN_KEY); } 
                catch {}
            }
        } else {
            try { localStorage.removeItem(TOKEN_KEY); } 
            catch {}
            try { sessionStorage.removeItem(TOKEN_KEY); } 
            catch {}
        }
    } catch {}
}
export function getToken() {
    try { 
        return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || ''; 
    }
    catch { 
        return localStorage.getItem(TOKEN_KEY) || ''; 
    }
}

export async function authorizedFetch(url, options = {}) {
    const resolvedUrl = resolveApiUrl(url);
    const token = getToken();
    const headers = new Headers(options.headers || {});
    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }
    return fetch(resolvedUrl, { ...options, headers });
}

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
            console.warn('API listings fetch fallback', networkError);
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
        console.error('Failed to fetch listings:', error);
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
            console.warn('API listings summary fetch fallback', networkError);
        }
        if (!response || !response.ok) {
            response = await fetch(`${API_BASE_URL}/listings/summary${query}`);
        }
        if (!response.ok) {
            throw new Error(`Error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Failed to fetch listings summary:', error);
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
            throw new Error(`Create listing failed: ${response.status} ${text}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Failed to create listing:', error);
        throw error;
    }
}

export async function getListingById(listingId) {
    const res = await authorizedFetch(`/api/listings/${listingId}`);
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Get listing failed: ${res.status} ${txt}`);
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
        throw new Error(`Update listing failed: ${res.status} ${txt}`);
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
        throw new Error(`Patch listing failed: ${res.status} ${txt}`);
    }
    return res.json();
}

export async function deleteListing(listingId) {
    const res = await authorizedFetch(`/api/listings/${listingId}`, { method: 'DELETE' });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Delete listing failed: ${res.status} ${txt}`);
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

export async function registerUser(payload) {
    const res = await fetch(resolveApiUrl('/api/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Register failed: ${res.status} ${txt}`);
    }
    return res.json();
}

export async function loginUser({ username, password, remember = true }) {
    const res = await fetch(resolveApiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Login failed: ${res.status} ${txt}`);
    }
    const data = await res.json();
    if (data?.token) setToken(data.token, remember);
    return data;
}

export async function getMe() {
    const res = await authorizedFetch('/api/auth/me');
    if (!res.ok) {
        if (res.status === 401) {
            setToken('');
            return { 
                authenticated: false 
            };
        }
        throw new Error(`Me failed: ${res.status}`);
    }
    return res.json();
}

export async function getMyProfile() {
    const res = await authorizedFetch('/api/me/profile');
    if (!res.ok) throw new Error(`Get profile failed: ${res.status}`);
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
        throw new Error(`Update profile failed: ${res.status} ${txt}`);
    }
    return res.json();
}

export async function listAuctions({ status, type } = {}) {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (type) params.set('type', type);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(resolveApiUrl(`/api/auctions${suffix}`));
    if (!res.ok) throw new Error(`List auctions failed: ${res.status}`);
    return res.json();
}

export async function getAuctionBook(auctionId) {
    const res = await fetch(resolveApiUrl(`/api/auctions/${auctionId}/book`));
    if (!res.ok) throw new Error(`Get auction book failed: ${res.status}`);
    return res.json();
}

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
    if (!res.ok) throw new Error(`Close auction failed: ${res.status}`);
    return res.json();
}

export async function clearAuction(auctionId) {
    const res = await authorizedFetch(`/api/admin/auctions/${auctionId}/clear`, {
        method: 'POST'
    });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Clear auction failed: ${res.status} ${txt}`);
    }
    return res.json();
}

export async function listAccounts() {
    const res = await authorizedFetch('/api/accounts');
    if (!res.ok) throw new Error(`List accounts failed: ${res.status}`);
    return res.json();
}

export async function addAccount(accountNumber) {
    const res = await authorizedFetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountNumber })
    });
    if (!res.ok) throw new Error(`Add account failed: ${res.status}`);
    return res.json();
}

export async function promoteUser(userId) {
    const res = await authorizedFetch(`/api/admin/users/${userId}/promote`, { method: 'POST' });
    if (!res.ok) throw new Error(`Promote failed: ${res.status}`);
    return res.json();
}

export async function demoteUser(userId) {
    const res = await authorizedFetch(`/api/admin/users/${userId}/demote`, { method: 'POST' });
    if (!res.ok) throw new Error(`Demote failed: ${res.status}`);
    return res.json();
}

export async function bootstrapAdmin() {
    const res = await authorizedFetch('/api/admin/bootstrap', { method: 'POST' });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Bootstrap admin failed: ${res.status} ${txt}`);
    }
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
        throw new Error(`Join auction failed: ${res.status} ${txt}`);
    }
    return res.json();
}

export async function listParticipantsAdmin(auctionId) {
    const res = await authorizedFetch(`/api/admin/auctions/${auctionId}/participants`);
    if (!res.ok) throw new Error(`List participants failed: ${res.status}`);
    return res.json();
}

export async function approveParticipant(auctionId, participantId) {
    const res = await authorizedFetch(`/api/admin/auctions/${auctionId}/participants/${participantId}/approve`, {
        method: 'PATCH'
    });
    if (!res.ok) throw new Error(`Approve participant failed: ${res.status}`);
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
        throw new Error(`Place order failed: ${res.status} ${txt}`);
    }
    return res.json();
}

export async function listAuctionOrdersAdmin(auctionId) {
    const res = await authorizedFetch(`/api/admin/auctions/${auctionId}/orders`);
    if (!res.ok) throw new Error(`List auction orders failed: ${res.status}`);
    return res.json();
}

export async function myParticipationStatus(auctionId) {
    const res = await authorizedFetch(`/api/auctions/${auctionId}/participants/me`);
    if (!res.ok) throw new Error(`Get participation failed: ${res.status}`);
    return res.json();
}

export async function listResourceTransactions() {
    const res = await authorizedFetch('/api/resources/transactions');
    if (!res.ok) throw new Error(`List transactions failed: ${res.status}`);
    return res.json();
}

export async function addResourceTransaction({ type, quantity, notes }) {
    const res = await authorizedFetch('/api/resources/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, quantity, notes })
    });
    if (!res.ok) throw new Error(`Add transaction failed: ${res.status}`);
    return res.json();
}

export async function listResourceDocuments(options = {}) {
    const params = new URLSearchParams();
    if (options.traderId) params.set('traderId', options.traderId);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    const res = await authorizedFetch(`/api/resources/documents${suffix}`);
    if (!res.ok) throw new Error(`List resource documents failed: ${res.status}`);
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
        throw new Error(`Upload document failed: ${res.status} ${txt}`);
    }
    return res.json();
}

export async function listAdminUsers() {
    const res = await authorizedFetch('/api/admin/users');
    if (!res.ok) throw new Error(`List users failed: ${res.status}`);
    return res.json();
}

export async function listAuctionDocuments(auctionId) {
    const res = await authorizedFetch(`/api/admin/auctions/${auctionId}/documents`);
    if (!res.ok) throw new Error(`List documents failed: ${res.status}`);
    return res.json();
}

export async function getWalletBalance() {
    const res = await authorizedFetch('/api/me/wallet');
    if (!res.ok) throw new Error(`Wallet balance failed: ${res.status}`);
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
        throw new Error(`Deposit failed: ${res.status} ${txt}`);
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
        throw new Error(`Withdraw failed: ${res.status} ${txt}`);
    }
    return res.json();
}

export async function walletTransactions(limit = 50) {
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    const res = await authorizedFetch(`/api/me/wallet/transactions?${params.toString()}`);
    if (!res.ok) throw new Error(`Wallet transactions failed: ${res.status}`);
    return res.json();
}

export async function meAuctions() {
    const res = await authorizedFetch('/api/me/auctions');
    if (!res.ok) throw new Error(`Me auctions failed: ${res.status}`);
    return res.json();
}
export async function meAuctionOrders() {
    const res = await authorizedFetch('/api/me/auction-orders');
    if (!res.ok) throw new Error(`Me orders failed: ${res.status}`);
    return res.json();
}
export async function meDocuments() {
    const res = await authorizedFetch('/api/me/documents');
    if (!res.ok) throw new Error(`Me documents failed: ${res.status}`);
    return res.json();
}
