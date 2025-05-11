// Import required packages
const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
const qs = require('querystring');
const fs = require('fs');
const path = require('path');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Enable JSON parsing for request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Freesound API configuration
const FREESOUND = {
    CLIENT_ID: process.env.FREESOUND_CLIENT_ID,
    CLIENT_SECRET: process.env.FREESOUND_CLIENT_SECRET,
    REDIRECT_URI: process.env.FREESOUND_REDIRECT_URI,
    API_BASE: 'https://freesound.org/apiv2',
    // Store the access token that you received
    ACCESS_TOKEN: '28kpWZA4WrYSIUGE6fvLwsV9ZHftmb',
    REFRESH_TOKEN: '0IyqfYHe1pD6yfB0g5o6F1tO8TTm9z'
};

// Create a directory to store downloaded sounds
const soundsDir = path.join(__dirname, 'sounds');
if (!fs.existsSync(soundsDir)) {
    fs.mkdirSync(soundsDir);
    console.log(`Created sounds directory at ${soundsDir}`);
}

// Verify credentials
if (!FREESOUND.CLIENT_ID || !FREESOUND.CLIENT_SECRET) {
    console.error('Missing Freesound credentials in .env file');
    process.exit(1);
}

// Simple error handler
const handleError = (res, error) => {
    console.error('API Error:', error.message);
    if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
    }
    res.status(500).json({ error: error.message });
};

// Function to refresh the access token if needed
async function refreshAccessToken() {
    try {
        console.log('Refreshing access token...');
        const formData = qs.stringify({
            client_id: FREESOUND.CLIENT_ID,
            client_secret: FREESOUND.CLIENT_SECRET,
            grant_type: 'refresh_token',
            refresh_token: FREESOUND.REFRESH_TOKEN
        });

        const response = await axios.post(`${FREESOUND.API_BASE}/oauth2/access_token/`, formData, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        console.log('Access token refreshed successfully');

        // Update the tokens
        FREESOUND.ACCESS_TOKEN = response.data.access_token;
        FREESOUND.REFRESH_TOKEN = response.data.refresh_token;

        return response.data.access_token;
    } catch (error) {
        console.error('Error refreshing access token:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
        throw new Error('Failed to refresh access token');
    }
}

// Main API client with automatic token handling
const apiClient = axios.create({
    baseURL: FREESOUND.API_BASE
});

// Add a request interceptor to handle authentication
apiClient.interceptors.request.use(async (config) => {
    // Always use the stored access token for OAuth2
    config.headers.Authorization = `Bearer ${FREESOUND.ACCESS_TOKEN}`;
    return config;
}, (error) => {
    return Promise.reject(error);
});

// Add a response interceptor to handle token expiration
apiClient.interceptors.response.use((response) => {
    return response;
}, async (error) => {
    const originalRequest = error.config;

    // If 401 error and we haven't tried refreshing token yet
    if (error.response && error.response.status === 401 && !originalRequest._retry) {
        originalRequest._retry = true;
        try {
            const token = await refreshAccessToken();
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return apiClient(originalRequest);
        } catch (refreshError) {
            return Promise.reject(refreshError);
        }
    }
    return Promise.reject(error);
});

// ROUTES

// Basic interface
app.get('/', (req, res) => {
    res.send(`
    <h1>Freesound API Demo</h1>
    <p>Try these endpoints:</p>
    <ul>
      <li><a href="/search?query=piano">Search for piano sounds</a></li>
      <li><a href="/sound/1234">Get details of sound #1234</a></li>
      <li><a href="/me">My user info (OAuth2)</a></li>
      <li><a href="/download-random">Download a random sound</a></li>
      <li><a href="/download-piano">Download a piano sound</a></li>
    </ul>
  `);
});

// OAuth2 callback endpoint
app.get('/callback', async (req, res) => {
    try {
        const { code, error } = req.query;

        if (error) {
            return res.send(`<h1>Authorization Failed</h1><p>Error: ${error}</p>`);
        }

        if (!code) {
            return res.send('<h1>No authorization code received</h1>');
        }

        // Exchange code for access token
        const formData = qs.stringify({
            client_id: FREESOUND.CLIENT_ID,
            client_secret: FREESOUND.CLIENT_SECRET,
            grant_type: 'authorization_code',
            code: code
        });

        const response = await axios.post(
            `${FREESOUND.API_BASE}/oauth2/access_token/`,
            formData,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        // Store the tokens
        FREESOUND.ACCESS_TOKEN = response.data.access_token;
        FREESOUND.REFRESH_TOKEN = response.data.refresh_token;

        res.send(`
            <h1>Authorization Successful</h1>
            <p>Access token obtained! You can now use the API.</p>
            <p><a href="/">Return to home</a></p>
        `);
    } catch (error) {
        handleError(res, error);
    }
});

// Search endpoint
app.get('/search', async (req, res) => {
    try {
        const query = req.query.query || 'test';
        console.log(`Searching for sounds matching: "${query}"`);

        const response = await apiClient.get('/search/text/', {
            params: {
                query,
                fields: 'id,name,url,previews,duration,tags',
                page_size: 10,
                filter: 'license:("Creative Commons 0" OR "Attribution")'
            }
        });

        res.json({
            success: true,
            query,
            count: response.data.count,
            results: response.data.results
        });
    } catch (error) {
        handleError(res, error);
    }
});

// Sound details endpoint
app.get('/sound/:id', async (req, res) => {
    try {
        const soundId = req.params.id;
        console.log(`Fetching details for sound #${soundId}`);

        const response = await apiClient.get(`/sounds/${soundId}/`);

        res.json({
            success: true,
            sound: response.data
        });
    } catch (error) {
        handleError(res, error);
    }
});

// Get user info (requires OAuth2)
app.get('/me', async (req, res) => {
    try {
        const response = await apiClient.get('/me/');
        res.json({
            success: true,
            user: response.data
        });
    } catch (error) {
        handleError(res, error);
    }
});

// Download a piano sound
app.get('/download-piano', async (req, res) => {
    try {
        // First search for piano sounds
        console.log('Searching for piano sounds...');
        const searchResponse = await apiClient.get('/search/text/', {
            params: {
                query: 'piano',
                sort: 'rating_desc', // Get highly-rated piano sounds first
                fields: 'id,name,download,previews,duration,tags',
                page_size: 5,
                filter: 'duration:[1 TO 10]' // Piano sounds between 1 and 10 seconds
            }
        });

        if (searchResponse.data.results.length === 0) {
            return res.status(404).json({ success: false, error: 'No piano sounds found' });
        }

        // Select first result (highest rated)
        const sound = searchResponse.data.results[0];
        console.log(`Found piano sound: ${sound.name} (ID: ${sound.id})`);

        // Get download URL (requires OAuth2)
        console.log('Requesting download URL...');
        const downloadResponse = await apiClient.get(`/sounds/${sound.id}/download/`);

        // Create a meaningful filename based on the sound name
        const cleanName = sound.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const soundName = `piano_${cleanName}_${sound.id}.wav`;
        const savePath = path.join(soundsDir, soundName);

        console.log(`Downloading to ${savePath}...`);

        // Download the sound file
        const writer = fs.createWriteStream(savePath);

        const soundResponse = await axios({
            method: 'get',
            url: downloadResponse.data.download,
            responseType: 'stream'
        });

        soundResponse.data.pipe(writer);

        writer.on('finish', () => {
            console.log(`Piano sound saved to ${savePath}`);

            // Send a nice HTML response with audio player
            res.send(`
                <h1>Piano Sound Downloaded</h1>
                <p><strong>Name:</strong> ${sound.name}</p>
                <p><strong>Duration:</strong> ${sound.duration} seconds</p>
                <p><strong>Tags:</strong> ${sound.tags ? sound.tags.join(', ') : 'None'}</p>
                <p><strong>Saved as:</strong> ${soundName}</p>
                
                <h3>Listen to preview:</h3>
                <audio controls>
                    <source src="${sound.previews['preview-hq-mp3']}" type="audio/mpeg">
                    Your browser does not support the audio element.
                </audio>
                
                <p><a href="/">Return to home</a></p>
            `);
        });

        writer.on('error', (err) => {
            console.error('Error writing sound file:', err);
            res.status(500).json({ success: false, error: 'Failed to save sound file' });
        });

    } catch (error) {
        handleError(res, error);
    }
});

// Download a random sound
app.get('/download-random', async (req, res) => {
    try {
        // First search for a random sound
        const searchResponse = await apiClient.get('/search/text/', {
            params: {
                query: '*',
                sort: 'random',
                fields: 'id,name,download,previews',
                page_size: 1,
                filter: 'duration:[1 TO 5]' // Sounds between 1 and 5 seconds
            }
        });

        if (searchResponse.data.results.length === 0) {
            return res.status(404).json({ success: false, error: 'No sounds found' });
        }

        const sound = searchResponse.data.results[0];
        console.log(`Found random sound: ${sound.name} (ID: ${sound.id})`);

        // Get download URL (requires OAuth2)
        const downloadResponse = await apiClient.get(`/sounds/${sound.id}/download/`);

        // Download the sound file
        const soundName = `sound_${sound.id}_${Date.now()}.wav`;
        const savePath = path.join(soundsDir, soundName);

        const writer = fs.createWriteStream(savePath);

        const soundResponse = await axios({
            method: 'get',
            url: downloadResponse.data.download,
            responseType: 'stream'
        });

        soundResponse.data.pipe(writer);

        writer.on('finish', () => {
            console.log(`Sound saved to ${savePath}`);
            res.json({
                success: true,
                sound: sound,
                downloadPath: savePath,
                message: `Sound '${sound.name}' downloaded successfully`
            });
        });

        writer.on('error', (err) => {
            console.error('Error writing sound file:', err);
            res.status(500).json({ success: false, error: 'Failed to save sound file' });
        });

    } catch (error) {
        handleError(res, error);
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Using Freesound OAuth2 with stored access token`);
});