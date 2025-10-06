import { resolveSession } from './session/resolver.js';
import { applyRoleVisibility } from './session/visibility.js';
import { createGuestSession } from './session/normalize.js';
import { getCachedSession, clearCache } from './session/cache.js';

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
    const cached = getCachedSession();
    if (!cached) {
        applyRoleVisibility(createGuestSession());
    } else {
        applyRoleVisibility(cached);
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
                console.error('Зворотний виклик onDenied викликав помилку', callbackError);
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

export function clearCachedSession() {
    clearCache();
    if (typeof document !== 'undefined') {
        applyRoleVisibility(createGuestSession());
    }
}
