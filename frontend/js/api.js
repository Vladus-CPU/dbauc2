const API_BASE_URL = 'http://localhost:5000';

export async function getListings() {
    try {
        let response = await fetch(`${API_BASE_URL}/api/listings`);
        if (!response.ok) {
            response = await fetch(`${API_BASE_URL}/listings`);
        }
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Failed to fetch listings:', error);
        return [];
    }
}

export async function createListing(data) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/listings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Create listing failed: ${response.status} ${text}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Failed to create listing:', error);
        throw error;
    }
}
