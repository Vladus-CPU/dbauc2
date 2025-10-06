const browserOrigin = typeof window !== 'undefined' ? window.location.origin : '';
const configuredOrigin = typeof window !== 'undefined' && window.API_BASE_URL ? window.API_BASE_URL : null;
export const API_BASE_URL = configuredOrigin || (browserOrigin && browserOrigin !== 'null' ? browserOrigin : 'http://localhost:5000');

export function resolveApiUrl(path) {
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
