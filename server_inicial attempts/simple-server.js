const express = require('express');
const fs = require('fs');
const path = require('path');

// Initialize Express app
const app = express();
const PORT = 3000;

// Middleware to parse JSON
app.use(express.json());

// Load sounds data from a local JSON file
const soundsFilePath = path.join(__dirname, 'sounds.json');
let soundsData = [];

// Load the sounds data into memory
try {
    const fileContent = fs.readFileSync(soundsFilePath, 'utf-8');
    soundsData = JSON.parse(fileContent);
    console.log('Sounds data loaded successfully.');
} catch (error) {
    console.error('Error loading sounds data:', error.message);
}

// Endpoint to fetch all sounds
app.get('/api/sounds', (req, res) => {
    res.json(soundsData);
});

// Endpoint to search for sounds by query
app.get('/api/sounds/search', (req, res) => {
    const { query } = req.query;

    if (!query) {
        return res.status(400).json({ error: 'Query parameter is required' });
    }

    const results = soundsData.filter(sound =>
        sound.name.toLowerCase().includes(query.toLowerCase())
    );

    res.json(results);
});

// Endpoint to fetch a specific sound by ID
app.get('/api/sounds/:id', (req, res) => {
    const soundId = req.params.id;
    const sound = soundsData.find(s => s.id === soundId);

    if (!sound) {
        return res.status(404).json({ error: 'Sound not found' });
    }

    res.json(sound);
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Fetch all sounds: http://localhost:${PORT}/api/sounds`);
    console.log(`Search sounds: http://localhost:${PORT}/api/sounds/search?query=yourquery`);
});