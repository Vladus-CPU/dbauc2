import { getListings, createListing } from '../api.js';
import { createListingCard } from '../ui/listingCard.js';

async function renderListings() {
    const container = document.getElementById('listings-container');
    if (!container) return;
    container.innerHTML = '';
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
}

document.addEventListener('DOMContentLoaded', async () => {
    await renderListings();

    const form = document.getElementById('create-listing-form');
    const feedback = document.getElementById('create-feedback');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            feedback.textContent = '';
            const formData = new FormData(form);
            const payload = {
                title: String(formData.get('title') || '').trim(),
                startingBid: Number(formData.get('startingBid')),
                unit: String(formData.get('unit') || '').trim(),
                description: String(formData.get('description') || '').trim() || undefined,
                image: String(formData.get('image') || '').trim() || undefined,
            };
            if (!payload.title || isNaN(payload.startingBid) || !payload.unit) {
                feedback.style.color = 'crimson';
                feedback.textContent = 'Please fill in Title, Starting Bid, and Unit.';
                return;
            }
            try {
                const created = await createListing(payload);
                feedback.style.color = 'green';
                feedback.textContent = `Created: ${created?.title || 'Listing'} (#${created?.id ?? ''})`;
                form.reset();
                await renderListings();
            } catch (err) {
                feedback.style.color = 'crimson';
                feedback.textContent = String(err?.message || err || 'Failed to create listing');
            }
        });
    }
});
