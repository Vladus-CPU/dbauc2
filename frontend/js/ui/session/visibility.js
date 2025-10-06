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
    const context = session || { authenticated: false, user: null };
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
