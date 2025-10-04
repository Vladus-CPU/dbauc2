import { getListings } from '../api.js';
import { createListingCard } from '../ui/listingCard.js';
import { initAccessControl } from '../ui/session.js';

document.addEventListener('DOMContentLoaded', async () => {
    await initAccessControl();
    const container = document.getElementById('featured-listings');
    if (!container) return;
    container.innerHTML = '';
    try {
        const listings = await getListings();
        const featured = (listings || []).slice(0, 6);
        if (featured.length === 0) {
            container.textContent = 'No listings yet. Be the first to create one!';
            return;
        }
        for (const item of featured) {
            container.appendChild(createListingCard(item));
        }
    } catch (err) {
        console.error('Failed to load featured listings', err);
        container.textContent = 'Failed to load featured listings.';
    }
});