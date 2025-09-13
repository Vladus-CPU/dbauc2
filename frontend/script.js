// Lightweight listing renderer for the frontend
const state = {
  items: [],
  page: 1,
  perPage: 6,
  query: '',
  filterUnit: '',
  sortBy: 'newest'
};

function seedItems() {
  const units = ['kg', 'm', 'liters', 'pcs', 'other'];
  const now = Date.now();
  state.items = Array.from({length: 18}).map((_, i) => ({
    id: i + 1,
    title: `Sample Item ${i + 1}`,
    description: `Description for sample item ${i + 1}`,
    startingBid: +(Math.random() * 500 + 5).toFixed(2),
    unit: units[i % units.length],
    createdAt: new Date(now - i * 1000 * 60 * 60 * 24).toISOString(),
    image: 'images/sample-item.jpg'
  }));
}

function createCard(item) {
  const card = document.createElement('article');
  card.className = 'card';

  const img = document.createElement('img');
  img.src = item.image;
  img.alt = item.title;
  img.loading = 'lazy';

  const h3 = document.createElement('h3');
  h3.textContent = item.title;

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `${item.unit} • ${new Date(item.createdAt).toLocaleDateString()}`;

  const desc = document.createElement('p');
  desc.className = 'item-description';
  desc.textContent = item.description;

  const price = document.createElement('div');
  price.className = 'price';
  price.textContent = `Starting: $${item.startingBid}`;

  const btn = document.createElement('button');
  btn.className = 'btn';
  btn.textContent = 'View Details';
  btn.addEventListener('click', () => window.alert(`Open details for ${item.title}`));

  const footer = document.createElement('div');
  footer.style.display = 'flex';
  footer.style.justifyContent = 'space-between';
  footer.appendChild(price);
  footer.appendChild(btn);

  card.appendChild(img);
  card.appendChild(h3);
  card.appendChild(meta);
  card.appendChild(desc);
  card.appendChild(footer);

  return card;
}

function render() {
  const container = document.getElementById('listings');
  if (!container) return;

  let list = state.items.slice();
  if (state.query) {
    const q = state.query.toLowerCase();
    list = list.filter(i => i.title.toLowerCase().includes(q) || i.description.toLowerCase().includes(q));
  }
  if (state.filterUnit) list = list.filter(i => i.unit === state.filterUnit);

  if (state.sortBy === 'newest') list.sort((a,b)=> new Date(b.createdAt)-new Date(a.createdAt));
  else if (state.sortBy === 'oldest') list.sort((a,b)=> new Date(a.createdAt)-new Date(b.createdAt));
  else if (state.sortBy === 'highestprice') list.sort((a,b)=> b.startingBid - a.startingBid);
  else if (state.sortBy === 'lowestprice') list.sort((a,b)=> a.startingBid - b.startingBid);

  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / state.perPage));
  if (state.page > totalPages) state.page = totalPages;

  const start = (state.page - 1) * state.perPage;
  const pageItems = list.slice(start, start + state.perPage);

  container.innerHTML = '';
  if (!pageItems.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No listings found';
    container.appendChild(empty);
  } else {
    pageItems.forEach(it => container.appendChild(createCard(it)));
  }

  document.getElementById('currentpage').textContent = state.page;
  document.getElementById('totalpages').textContent = totalPages;
  document.getElementById('prevpage').disabled = state.page <= 1;
  document.getElementById('nextpage').disabled = state.page >= totalPages;
}

function setup() {
  const s = document.getElementById('searchinput');
  const f = document.getElementById('filter-unit');
  const so = document.getElementById('sortby');
  const prev = document.getElementById('prevpage');
  const next = document.getElementById('nextpage');

  if (s) s.addEventListener('input', e => { state.query = e.target.value; state.page = 1; render(); });
  if (f) f.addEventListener('change', e => { state.filterUnit = e.target.value; state.page = 1; render(); });
  if (so) so.addEventListener('change', e => { state.sortBy = e.target.value; render(); });
  if (prev) prev.addEventListener('click', () => { if (state.page>1){ state.page--; render(); } });
  if (next) next.addEventListener('click', () => { state.page++; render(); });
}

document.addEventListener('DOMContentLoaded', () => { seedItems(); setup(); render(); });

export {};
