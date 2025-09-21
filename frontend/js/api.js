const API_BASE_URL = 'http://localhost:5000';

const TOKEN_KEY = 'token';
export function setToken(token) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
}
export function getToken() {
    return localStorage.getItem(TOKEN_KEY) || '';
}

export async function authorizedFetch(url, options = {}) {
    const token = getToken();
    const headers = new Headers(options.headers || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(url, { ...options, headers });
}

export async function getListings() {
    try {
        let response = await fetch(`${API_BASE_URL}/api/listings`);
        if (!response.ok) {
            response = await fetch(`${API_BASE_URL}/listings`);
        }
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Failed to fetch listings:', error);
        return [];
    }
}

export async function createListing(data) {
    try {
        const response = await authorizedFetch(`${API_BASE_URL}/api/listings`, {
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

export async function registerUser({ username, password, email }) {
    const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, email })
    });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Register failed: ${res.status} ${txt}`);
    }
    return res.json();
}

export async function loginUser({ username, password }) {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Login failed: ${res.status} ${txt}`);
    }
    const data = await res.json();
    if (data?.token) setToken(data.token);
    return data;
}

export async function getMe() {
    const res = await authorizedFetch(`${API_BASE_URL}/api/auth/me`);
    if (!res.ok) throw new Error(`Me failed: ${res.status}`);
    return res.json();
}
