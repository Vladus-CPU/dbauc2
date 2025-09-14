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
    img.width = 300;
    img.height = 100;
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
    if (data.currentBid && typeof data.currentBid === 'number' && data.currentBid > 0 && data.currentBid > data.startingBid) {
        bits.push(`Current Bid: $${data.currentBid.toFixed(2)}`);
    }
    if (typeof data.unit === 'string' && data.unit.trim()) {
        bits.push(`Unit: ${data.unit}`);
    }
    metadata.textContent = bits.join(' | ');
    metadata.style.fontSize = '0.95em';
    metadata.style.color = '#555';
    card.appendChild(metadata);
    
    const footer = document.createElement('div');
    footer.className = 'footer';
    footer.style.display = 'flex';
    footer.style.justifyContent = 'space-between';
    footer.style.marginTop = '8px';
    footer.style.fontSize = '0.85em';
    footer.style.color = '#777';

    const checkButton = document.createElement('button');
    checkButton.type = 'button';
    checkButton.className = 'button';
    checkButton.textContent = 'View Details';
    checkButton.addEventListener('click', function () {
        window.location.href = `item.html?id=${data.id || ''}`;
    });
    checkButton.style.backgroundColor = '#28a745';
    checkButton.style.color = '#fff';
    checkButton.style.border = 'none';
    checkButton.style.borderRadius = '4px';
    checkButton.style.padding = '4px 8px';
    checkButton.style.cursor = 'pointer';
    checkButton.style.transition = 'background-color 0.3s';
    checkButton.style.transform = 'scale(1)';
    checkButton.addEventListener('click', function (e) {
        e.stopPropagation();
        window.location.href = `item.html?id=${data.id || ''}`;
    });
    checkButton.onmouseover = function () {
        checkButton.style.backgroundColor = '#218838';
        checkButton.style.transform = 'scale(1.05)';
    };
    checkButton.onmouseout = function () {
        checkButton.style.backgroundColor = '#28a745';
        checkButton.style.transform = 'scale(1)';
    };
    footer.appendChild(checkButton);

    card.appendChild(footer);
    return card;
}