// Import required packages
const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Enable JSON parsing for request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Freesound API configuration with your credentials
// For token-based authentication, we use the CLIENT_SECRET as the API key
const FREESOUND = {
    API_KEY: process.env.FREESOUND_CLIENT_SECRET,
    API_BASE: 'https://freesound.org/apiv2'
};

// Create a directory to store downloaded sounds
const soundsDir = path.join(__dirname, 'sounds');
if (!fs.existsSync(soundsDir)) {
    fs.mkdirSync(soundsDir);
    console.log(`Created sounds directory at ${soundsDir}`);
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

// Create API client with token-based authentication
const apiClient = axios.create({
    baseURL: FREESOUND.API_BASE,
    headers: {
        'Authorization': `Token ${FREESOUND.API_KEY}`
    }
});

// ROUTES

// Basic interface
app.get('/', (req, res) => {
    res.send(`
    <h1>Freesound API Connection</h1>
    <p>Connection established with token authentication!</p>
    <p>Try these endpoints:</p>
    <ul>
      <li><a href="/search?query=piano">Search for piano sounds</a></li>
      <li><a href="/sound/1234">Get details of sound #1234</a></li>
      <li><a href="/download-piano">Download a piano sound</a></li>
    </ul>
  `);
});

// Search endpoint
app.get('/search', async (req, res) => {
    try {
        const query = req.query.query || 'piano';
        console.log(`Searching for sounds matching: "${query}"`);

        const response = await apiClient.get('/search/text/', {
            params: {
                query,
                fields: 'id,name,url,previews,duration,tags',
                page_size: 10
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

// Download a piano sound
app.get('/download-piano', async (req, res) => {
    try {
        // Search for piano sounds
        console.log('Searching for piano sounds...');
        const searchResponse = await apiClient.get('/search/text/', {
            params: {
                query: 'piano',
                fields: 'id,name,previews',
                page_size: 1,
                filter: 'duration:[1 TO 10]' // Piano sounds between 1 and 10 seconds
            }
        });

        if (searchResponse.data.results.length === 0) {
            return res.status(404).json({ success: false, error: 'No piano sounds found' });
        }

        const sound = searchResponse.data.results[0];
        console.log(`Found piano sound: ${sound.name} (ID: ${sound.id})`);

        // Get download URL
        const downloadResponse = await apiClient.get(`/sounds/${sound.id}/download/`);

        // Create a filename
        const soundName = `piano_${sound.id}_${Date.now()}.wav`;
        const savePath = path.join(soundsDir, soundName);

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

            // Build a response with an audio player
            res.send(`
                <h1>Piano Sound Downloaded</h1>
                <p><strong>Name:</strong> ${sound.name}</p>
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

// Alternative way to use the API key as a URL parameter
app.get('/search-alt', async (req, res) => {
    try {
        const query = req.query.query || 'piano';
        console.log(`Searching with token as URL parameter: "${query}"`);

        // Use token as URL parameter instead of header
        const response = await axios.get(`${FREESOUND.API_BASE}/search/text/`, {
            params: {
                query,
                fields: 'id,name',
                page_size: 5,
                token: FREESOUND.API_KEY
            }
        });

        res.json({
            success: true,
            method: 'URL parameter token',
            results: response.data.results
        });
    } catch (error) {
        handleError(res, error);
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Using Freesound API with token authentication (API key: ${FREESOUND.API_KEY.substring(0, 5)}...)`);
});