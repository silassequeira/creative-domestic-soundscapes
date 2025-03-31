const express = require('express');
const axios = require('axios');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables from freesound.env
dotenv.config({ path: './freesound.env' });

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for Unity to connect
app.use(cors());
app.use(express.json());

// Freesound API configuration
const FREESOUND_CLIENT_ID = process.env.FREESOUND_CLIENT_ID;
const FREESOUND_CLIENT_SECRET = process.env.FREESOUND_CLIENT_SECRET;
const FREESOUND_API_URL = 'https://freesound.org/apiv2';

// Token storage - in production you'd want to use a proper cache or database
let apiToken = null;
let tokenExpiry = 0;

// Function to get a valid API token
async function getApiToken() {
    // Check if we have a valid token
    if (apiToken && tokenExpiry > Date.now()) {
        return apiToken;
    }

    try {
        console.log('Requesting new API token...');
        // Get a new token using client credentials
        const response = await axios.post('https://freesound.org/apiv2/oauth2/access_token/', null, {
            params: {
                client_id: FREESOUND_CLIENT_ID,
                client_secret: FREESOUND_CLIENT_SECRET,
                grant_type: 'client_credentials'
            }
        });

        apiToken = response.data.access_token;
        // Set expiry (typically 24 hours, but we subtract a minute for safety)
        tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000;

        console.log('New token acquired, expires in', response.data.expires_in, 'seconds');
        return apiToken;
    } catch (error) {
        console.error('Token acquisition error:', error.response?.data || error.message);
        throw new Error('Failed to get API token');
    }
}

// Endpoint to search for sounds
app.get('/api/sounds/search', async (req, res) => {
    try {
        const token = await getApiToken();
        const { query, filter, page, page_size } = req.query;

        console.log(`Searching for sounds with query: "${query}"`);

        const response = await axios.get(`${FREESOUND_API_URL}/search/text/`, {
            params: {
                query,
                filter,
                page: page || 1,
                page_size: page_size || 15
            },
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        console.log(`Found ${response.data.count} results`);
        res.json(response.data);
    } catch (error) {
        console.error('API request error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: 'Error fetching sounds',
            details: error.response?.data || error.message
        });
    }
});

// Endpoint to get a specific sound by ID
app.get('/api/sounds/:id', async (req, res) => {
    try {
        const token = await getApiToken();
        const soundId = req.params.id;

        console.log(`Fetching sound with ID: ${soundId}`);

        const response = await axios.get(`${FREESOUND_API_URL}/sounds/${soundId}/`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        console.log(`Retrieved sound: "${response.data.name}"`);
        res.json(response.data);
    } catch (error) {
        console.error('API request error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: 'Error fetching sound',
            details: error.response?.data || error.message
        });
    }
});

// Endpoint to get download URL for a sound
app.get('/api/sounds/:id/download', async (req, res) => {
    try {
        const token = await getApiToken();
        const soundId = req.params.id;

        console.log(`Getting download URL for sound ID: ${soundId}`);

        // First get the sound info to get the download link
        const soundResponse = await axios.get(`${FREESOUND_API_URL}/sounds/${soundId}/`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        // Get the download info
        const downloadResponse = await axios.get(`${FREESOUND_API_URL}/sounds/${soundId}/download/`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        console.log(`Download URL acquired for "${soundResponse.data.name}"`);
        // Return just the direct download URL to Unity
        res.json({
            name: soundResponse.data.name,
            download_url: downloadResponse.data.download_url
        });
    } catch (error) {
        console.error('Download request error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: 'Error getting download URL',
            details: error.response?.data || error.message
        });
    }
});

// Simple test endpoint
app.get('/test', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Server is working',
        env_test: FREESOUND_CLIENT_ID ? 'Environment variables loaded' : 'Environment variables NOT loaded'
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Test endpoint available at http://localhost:${PORT}/test`);
    console.log(`Search API endpoint: http://localhost:${PORT}/api/sounds/search?query=yourquery`);
});