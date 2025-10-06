export function createGuestSession() {
    return { authenticated: false, user: null };
}

export function normalizeSession(data) {
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

export function cloneSession(session) {
    if (!session) return createGuestSession();
    return {
        ...session,
        user: session.user ? { ...session.user } : null,
    };
}
