export function createListingCard(item) {
    const data = (item && typeof item === 'object') ? item : {};
    const titleText = (data.title || 'Без назви');

    const card = document.createElement('article');
    card.className = 'listing-card';
    const wrapper = document.createElement('div');
    wrapper.className = 'image-wrapper';
    const img = document.createElement('img');
    const placeholderImg = 'images/placeholder.svg';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.src = (typeof data.image === 'string' && data.image.trim()) ? data.image : placeholderImg;
    img.alt = titleText || 'Зображення товару';
    img.onerror = function () {
        img.onerror = null;
        img.src = placeholderImg;
        img.alt = 'Немає зображення';
    };
    wrapper.appendChild(img);
    card.appendChild(wrapper);
    const title = document.createElement('h3');
    title.textContent = titleText;
    card.appendChild(title);
    const metadata = document.createElement('div');
    metadata.className = 'listing-card__meta';
    const bits = [];
    if (typeof data.startingBid === 'number') {
        bits.push({ label: 'Початкова ставка', value: `₴${data.startingBid.toFixed(2)}` });
    }
    if (data.currentBid && typeof data.currentBid === 'number' && data.currentBid > 0 && data.currentBid > data.startingBid) {
        bits.push({ label: 'Поточна ставка', value: `₴${data.currentBid.toFixed(2)}` });
    }
    if (typeof data.unit === 'string' && data.unit.trim()) {
        bits.push({ label: 'Одиниця', value: data.unit });
    }
    if (bits.length) {
        bits.forEach(bit => {
            const line = document.createElement('div');
            const label = document.createElement('span');
            label.className = 'listing-card__price';
            label.textContent = `${bit.label}: `;
            const value = document.createElement('span');
            value.textContent = bit.value;
            line.append(label, value);
            metadata.appendChild(line);
        });
        card.appendChild(metadata);
    }
    
    const footer = document.createElement('div');
    footer.className = 'listing-card__footer';

    const checkButton = document.createElement('button');
    checkButton.type = 'button';
    checkButton.className = 'btn btn-primary btn-compact';
    checkButton.textContent = 'Переглянути деталі';
    checkButton.addEventListener('click', function (e) {
        e.stopPropagation();
        window.location.href = `item.html?id=${data.id || ''}`;
    });
    footer.appendChild(checkButton);

    card.appendChild(footer);
    return card;
}