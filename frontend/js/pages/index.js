import { state, setQuery, setFilterUnit, setSortBy, nextPage, prevPage } from '../state.js';
import { createListingCard } from '../ui/listingCard.js';

function seedItems() {
  const units = ['kg', 'm', 'liters', 'pcs', 'other'];
  const now = Date.now();
  state.items = Array.from({ length: 24 }).map((_, i) => ({
    id: i + 1,
    title: `Test Item ${i + 1}`,
    description: `Description for test item ${i + 1}`,
    startingBid: +(Math.random() * 500000 + 50).toFixed(2),
    unit: units[i % units.length],
    createdAt: new Date(now - i * 1000 * 60 * 60 * 24).toISOString(),
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