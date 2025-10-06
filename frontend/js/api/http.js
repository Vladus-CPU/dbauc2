import { resolveApiUrl } from './config.js';
import { getToken } from './auth.js';

export async function authorizedFetch(url, options = {}) {
    const resolvedUrl = resolveApiUrl(url);
    const token = getToken();
    const headers = new Headers(options.headers || {});
    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }
    return fetch(resolvedUrl, { ...options, headers });
}
