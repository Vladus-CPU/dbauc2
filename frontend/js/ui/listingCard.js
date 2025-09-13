export function createListingCard(item) {
    const data = (item && typeof item === 'object') ? item : {};
    const titleText = (data.title || 'No Title');

    const card = document.createElement('article');
    card.className = 'card';
    const img = document.createElement('img');
    const placeholderImg = 'images/placeholder.png';
    img.loading = 'lazy';
    img.src = (typeof data.image === 'string' && data.image.trim()) ? data.image : placeholderImg;
    img.alt = titleText || 'Item Image';
    img.onerror = function () {
        img.onerror = null;
        img.src = placeholderImg;
        img.alt = 'No image';
    };
    card.appendChild(img);
    const title = document.createElement('h3');
    title.textContent = titleText;
    card.appendChild(title);

    const metadata = document.createElement('div');
    metadata.className = 'meta';
    const bits = [];
    if (typeof data.startingBid === 'number') {
        bits.push(`Starting Bid: $${data.startingBid.toFixed(2)}`);
    }
    if (typeof data.unit === 'string' && data.unit.trim()) {
        bits.push(`Unit: ${data.unit}`);
    }
    metadata.textContent = bits.join(' | ');
    metadata.style.fontSize = '0.95em';
    metadata.style.color = '#555';
    card.appendChild(metadata);
    
    return card;
}