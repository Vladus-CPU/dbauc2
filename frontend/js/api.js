const API_BASE_URL = 'http://localhost:5000';

export async function getListings() {
    try {
        const response = await fetch(`${API_BASE_URL}/listings`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error("Failed to fetch listings:", error);
        return [];
    }
}
