import { state, setQuery, setFilterUnit, setSortBy, nextPage, prevPage } from '../state.js';
import { createListingCard } from '../ui/listingCard.js';

function seedItems() {
  const units = ['kg', 'm', 'liters', 'pcs', 'other'];
  const now = Date.now();
state.items = Array.from({ length: 24 }).map((_, index) => ({
    id: index + 1,
    title: `Test Item ${index + 1}`,
    description: `Description for test item ${index + 1}`,
    startingBid: +(Math.random() * 500000 + 50).toFixed(2),
    currentBid: index % 3 === 0 ? +(Math.random() * 100000 + 100).toFixed(2) : null,
    unit: units[index % units.length],
    createdAt: new Date(now - index * 1000 * 60 * 60 * 24).toISOString(),
    image: 'images/test-item.jpg',
}));
}
function renderListings() {
    const listingsContainer = document.getElementById('listings');
    state.items.forEach(item => {
        const card = createListingCard(item);
        listingsContainer.appendChild(card);
    });
}

seedItems();
renderListings();