import { initAccessControl } from '../ui/session.js';

document.addEventListener('DOMContentLoaded', async () => {
    await initAccessControl();
});
