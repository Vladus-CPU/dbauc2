const CACHE_TTL_MS = 30_000;
let cachedSession = null;
let cacheTimestamp = 0;
let inflightSessionPromise = null;

export function shouldUseCache(forceRefresh) {
    if (forceRefresh) return false;
    if (!cachedSession) return false;
    return (Date.now() - cacheTimestamp) < CACHE_TTL_MS;
}

export function getCachedSession() {
    return cachedSession;
}

export function setCachedSession(session) {
    cachedSession = session;
    cacheTimestamp = Date.now();
}

export function clearCache() {
    cachedSession = null;
    cacheTimestamp = 0;
}

export function getInflightPromise() {
    return inflightSessionPromise;
}

export function setInflightPromise(promise) {
    inflightSessionPromise = promise;
}

export function clearInflightPromise() {
    inflightSessionPromise = null;
}