import os
import requests  # Ensure 'requests' is installed
from dotenv import load_dotenv  # Ensure 'python-dotenv' is installed

# Load environment variables
load_dotenv()

# Configuration
CLIENT_ID = os.getenv("FREESOUND_CLIENT_ID")
API_BASE = "https://freesound.org/apiv2"


def test_connection():
    """Test basic API connection"""
    url = f"{API_BASE}/sounds/1234/"
    params = {
        "token": CLIENT_ID,
        "fields": "id,name"
    }

    try:
        response = requests.get(url, params=params)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.HTTPError as err:
        print(f"HTTP Error: {err}")
        print(f"Response content: {response.text}")
        return None


def search_sounds(query="piano"):
    """Search for sounds"""
    url = f"{API_BASE}/search/text/"
    params = {
        "token": CLIENT_ID,
        "query": query,
        "fields": "id,name,previews",
        "filter": "downloadable:true",
        "page_size": 3
    }

    try:
        response = requests.get(url, params=params)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.HTTPError as err:
        print(f"Search failed: {err}")
        print(f"Response: {response.text}")
        return None


# Debug output
print(f"Using Client ID: {CLIENT_ID[:6]}...")

# Example usage
if __name__ == "__main__":
    # Test connection
    print("Testing connection...")
    sound_data = test_connection()
    print("Sound 1234:", sound_data)

    # Test search
    print("\nSearching for piano sounds...")
    search_results = search_sounds()
    print("Search results:", search_results)