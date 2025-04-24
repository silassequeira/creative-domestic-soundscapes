const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Freesound configuration
const FREESOUND = {
    CLIENT_ID: process.env.FREESOUND_CLIENT_ID,
    API_BASE: 'https://freesound.org/apiv2'
};

// Verify credentials
if (!FREESOUND.CLIENT_ID) {
    console.error('Missing Freesound Client ID in .env file');
    process.exit(1);
}

// Simple error handler
const handleError = (res, error) => {
    console.error('API Error:', error.message);
    res.status(500).json({ error: error.message });
};

// Basic interface
app.get('/', (req, res) => {
    res.send(`
    <h1>Freesound Simple API Access</h1>
    <p>Try these endpoints:</p>
    <ul>
      <li><a href="/search?query=piano">/search?query=piano</a></li>
      <li><a href="/sound/1234">/sound/1234</a></li>
    </ul>
  `);
});

// Search endpoint
app.get('/search', async (req, res) => {
    try {
        const response = await axios.get(`${FREESOUND.API_BASE}/search/text/`, {
            params: {
                query: req.query.query || 'test',
                token: FREESOUND.CLIENT_ID,
                fields: 'id,name,previews,duration',
                page_size: 10,
                // Add filter to ensure valid results
                filter: 'license:("Creative Commons 0" OR "Attribution")'
            }
        });

        res.json(response.data);
    } catch (error) {
        console.error('Full error object:', error);
        handleError(res, error);
    }
});
// Get single sound
app.get('/sound/:id', async (req, res) => {
    try {
        const response = await axios.get(`${FREESOUND.API_BASE}/sounds/${req.params.id}/`, {
            params: {
                token: FREESOUND.CLIENT_ID,
                fields: 'id,name,description,previews,tags'
            }
        });

        res.json(response.data);

    } catch (error) {
        handleError(res, error);
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Using Freesound Client ID: ${FREESOUND.CLIENT_ID}`);
});