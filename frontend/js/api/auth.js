import { resolveApiUrl } from './config.js';

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

export async function registerUser(payload) {
    const res = await fetch(resolveApiUrl('/api/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Помилка реєстрації: ${res.status} ${txt}`);
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
        throw new Error(`Помилка входу: ${res.status} ${txt}`);
    }
    const data = await res.json();
    if (data?.token) setToken(data.token, remember);
    return data;
}

export async function getMe() {
    const { authorizedFetch } = await import('./http.js');
    const res = await authorizedFetch('/api/auth/me');
    if (!res.ok) {
        if (res.status === 401) {
            setToken('');
            return { 
                authenticated: false 
            };
        }
        throw new Error(`Помилка отримання даних користувача: ${res.status}`);
    }
    return res.json();
}
