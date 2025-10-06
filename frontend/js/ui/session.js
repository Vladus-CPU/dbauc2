import { getMe } from '../api.js';

const CACHE_TTL_MS = 30_000;
let cachedSession = null;
let cacheTimestamp = 0;
let inflightSessionPromise = null;

function createGuestSession() {
    return { authenticated: false, user: null };
}

function normalizeSession(data) {
    const session = createGuestSession();
    if (data && typeof data === 'object') {
        if (data.user && typeof data.user === 'object') {
            const user = { ...data.user };
            const rawIsAdmin = user.is_admin;
            user.is_admin = rawIsAdmin === true || rawIsAdmin === 1 || rawIsAdmin === '1';
            session.user = user;
        }
        session.authenticated = Boolean(data.authenticated && session.user);
        session.raw = data;
    }
    return session;
}

function cloneSession(session) {
    if (!session) return createGuestSession();
    return {
        ...session,
        user: session.user ? { ...session.user } : null,
    };
}

function shouldUseCache(forceRefresh) {
    if (forceRefresh) return false;
    if (!cachedSession) return false;
    return (Date.now() - cacheTimestamp) < CACHE_TTL_MS;
}

function toggleElementVisibility(element, shouldShow) {
    if (!element) return;
    if (shouldShow) {
        if (element.dataset.originalDisplay) {
            element.style.display = element.dataset.originalDisplay;
        } else {
            element.style.removeProperty('display');
        }
        element.removeAttribute('aria-hidden');
    } else {
        if (!element.dataset.originalDisplay) {
            element.dataset.originalDisplay = element.style.display || '';
        }
        element.style.display = 'none';
        element.setAttribute('aria-hidden', 'true');
    }
}

export function applyRoleVisibility(session) {
    if (typeof document === 'undefined') return;
    const context = session || createGuestSession();
    const isAuthenticated = Boolean(context.authenticated);
    const isAdmin = Boolean(context.user?.is_admin);
    const isTrader = isAuthenticated && !isAdmin;

    document.querySelectorAll('[data-role-required]').forEach((element) => {
        const raw = element.dataset.roleRequired || '';
        const requirements = raw.split(',').map((part) => part.trim().toLowerCase()).filter(Boolean);
        if (!requirements.length) {
            toggleElementVisibility(element, true);
            return;
        }
        let canShow = false;
        for (const requirement of requirements) {
            if (requirement === 'admin' && isAdmin) {
                canShow = true;
                break;
            }
            if (requirement === 'trader' && isTrader) {
                canShow = true;
                break;
            }
            if (requirement === 'auth' && isAuthenticated) {
                canShow = true;
                break;
            }
            if (requirement === 'guest' && !isAuthenticated) {
                canShow = true;
                break;
            }
            if (requirement === 'any') {
                canShow = true;
                break;
            }
        }
        toggleElementVisibility(element, canShow);
    });
}

async function resolveSession(options = {}) {
    const forceRefresh = Boolean(options.forceRefresh);
    if (shouldUseCache(forceRefresh)) {
        return cloneSession(cachedSession);
    }
    if (inflightSessionPromise && !forceRefresh) {
        return inflightSessionPromise;
    }
    const request = (async () => {
        try {
            const data = await getMe();
            const session = normalizeSession(data);
            cachedSession = session;
            cacheTimestamp = Date.now();
            return cloneSession(session);
        } catch (error) {
            console.warn('Не вдалося завантажити інформацію про сесію', error);
            cachedSession = createGuestSession();
            cachedSession.error = error;
            cacheTimestamp = Date.now();
            return cloneSession(cachedSession);
        } finally {
            inflightSessionPromise = null;
        }
    })();
    inflightSessionPromise = request;
    return request;
}

export async function initAccessControl(options = {}) {
    const settings = {
        requireAuth: false,
        requireAdmin: false,
        redirectTo: null,
        onDenied: null,
        forceRefresh: false,
        suppressErrors: false,
        ...options,
    };

    if (!cachedSession) {
        applyRoleVisibility(createGuestSession());
    } else {
        applyRoleVisibility(cachedSession);
    }

    let session;
    try {
        session = await resolveSession({ forceRefresh: settings.forceRefresh });
    } catch (error) {
        if (!settings.suppressErrors) {
            console.error('Не вдалося ініціалізувати контроль доступу', error);
        }
        session = createGuestSession();
    }

    applyRoleVisibility(session);

    const isAuthenticated = Boolean(session.authenticated);
    const isAdmin = Boolean(session.user?.is_admin);
    let denied = false;
    if (settings.requireAuth && !isAuthenticated) {
        denied = true;
    }
    if (!denied && settings.requireAdmin && !isAdmin) {
        denied = true;
    }

    if (denied) {
        if (typeof settings.onDenied === 'function') {
            try {
                settings.onDenied(session);
            } catch (callbackError) {
                console.error('зворотний виклик onDenied викликав помилку', callbackError);
            }
        }
        if (settings.redirectTo && typeof window !== 'undefined') {
            try {
                const target = settings.redirectTo;
                const current = window.location ? window.location.href : '';
                const resolvedTarget = new URL(target, current).href;
                if (resolvedTarget !== current) {
                    window.location.href = resolvedTarget;
                }
            } catch (navigationError) {
                console.error('Не вдалося перенаправити після відмови в доступі', navigationError);
            }
        }
    }

    return session;
}

export async function fetchSession(options = {}) {
    return resolveSession(options);
}

export function getCachedSession() {
    return cloneSession(cachedSession);
}

export function clearCachedSession() {
    cachedSession = null;
    cacheTimestamp = 0;
    if (typeof document !== 'undefined') {
        applyRoleVisibility(createGuestSession());
    }
}
