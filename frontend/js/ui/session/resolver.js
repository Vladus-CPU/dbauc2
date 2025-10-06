import { getMe } from '../../api.js';
import { normalizeSession, cloneSession, createGuestSession } from './normalize.js';
import {
    shouldUseCache,
    getCachedSession,
    setCachedSession,
    getInflightPromise,
    setInflightPromise,
    clearInflightPromise
} from './cache.js';

export async function resolveSession(options = {}) {
    const forceRefresh = Boolean(options.forceRefresh);
    
    if (shouldUseCache(forceRefresh)) {
        return cloneSession(getCachedSession());
    }
    
    const inflightPromise = getInflightPromise();
    if (inflightPromise && !forceRefresh) {
        return inflightPromise;
    }
    
    const request = (async () => {
        try {
            const data = await getMe();
            const session = normalizeSession(data);
            setCachedSession(session);
            return cloneSession(session);
        } catch (error) {
            console.warn('Не вдалося завантажити інформацію про сесію', error);
            const guestSession = createGuestSession();
            guestSession.error = error;
            setCachedSession(guestSession);
            return cloneSession(guestSession);
        } finally {
            clearInflightPromise();
        }
    })();
    
    setInflightPromise(request);
    return request;
}
