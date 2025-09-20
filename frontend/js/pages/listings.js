import { getListings } from '../api.js';
import { createListingCard } from '../ui/listingCard.js';

document.addEventListener('DOMContentLoaded', async () => {
    const container = document.getElementById('listings-container');
    if (!container) {
        console.error('Listings container not found');
        return;
    }
    try {
        const listings = await getListings();
        if (listings && listings.length > 0) {
            listings.forEach(item => {
                const card = createListingCard(item);
                container.appendChild(card);
            });
        } else {
            container.textContent = 'No listings found.';
        }
    } catch (error) {
        console.error('Error fetching listings:', error);
        container.textContent = 'Failed to load listings.';
    }
});
