// Import required packages
const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const session = require('express-session');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Enable JSON parsing for request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware for storing OAuth tokens
app.use(session({
    secret: 'freesound-oauth-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS
}));

// Freesound OAuth2 configuration
const FREESOUND = {
    CLIENT_ID: process.env.FREESOUND_CLIENT_ID,
    CLIENT_SECRET: process.env.FREESOUND_CLIENT_SECRET,
    REDIRECT_URI: process.env.FREESOUND_REDIRECT_URI || 'http://localhost:3000/callback',
    AUTH_URL: 'https://freesound.org/apiv2/oauth2/authorize/',
    TOKEN_URL: 'https://freesound.org/apiv2/oauth2/access_token/',
    API_BASE: 'https://freesound.org/apiv2'
};

// Create a directory to store downloaded sounds
const soundsDir = path.join(__dirname, 'sounds');
if (!fs.existsSync(soundsDir)) {
    fs.mkdirSync(soundsDir);
    console.log(`Created sounds directory at ${soundsDir}`);
}

// Add these constants at the top of your file (after other constants)
const UNITY_BASE_PATH = path.join(__dirname, 'Unity');
const UNITY_STREAMING_ASSETS_PATH = path.join(UNITY_BASE_PATH, 'Assets', 'StreamingAssets');
const UNITY_SOUNDS_PATH = path.join(UNITY_STREAMING_ASSETS_PATH, 'Sounds');
const SCENE_FOLDER_NAME = 'current_scene';

// Create necessary folders if they don't exist
if (!fs.existsSync(UNITY_STREAMING_ASSETS_PATH)) {
    fs.mkdirSync(UNITY_STREAMING_ASSETS_PATH, { recursive: true });
    console.log(`Created Unity StreamingAssets directory at ${UNITY_STREAMING_ASSETS_PATH}`);
}
if (!fs.existsSync(UNITY_SOUNDS_PATH)) {
    fs.mkdirSync(UNITY_SOUNDS_PATH, { recursive: true });
    console.log(`Created Unity Sounds directory at ${UNITY_SOUNDS_PATH}`);
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

// Function to create an API client with the access token
function createApiClient(accessToken) {
    return axios.create({
        baseURL: FREESOUND.API_BASE,
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });
}

// Middleware to check if the user is logged in
const requireAuth = (req, res, next) => {
    if (!req.session.accessToken) {
        return res.redirect('/login');
    }
    next();
};

// ROUTES

app.get('/', (req, res) => {
    const loggedIn = !!req.session.accessToken;

    res.send(`
        <h1>Freesound OAuth2 API Connection</h1>
        ${loggedIn ?
            `<p>✅ You are logged in! Your access token is active.</p>
             <p><a href="/me">View your profile</a> | <a href="/logout">Log out</a></p>` :
            `<p>❌ You are not logged in. <a href="/login">Log in with Freesound</a> to download full sounds.</p>`
        }
        <ul>
          ${loggedIn ? `
          <li><a href="/my-downloads">View my downloaded sounds</a></li>
          <li><a href="/process-audio-json"><strong>Process audio.json file</strong></a></li>
          ` : ''}
        </ul>
    `);
});

// Login - Step 1 of OAuth2 flow
app.get('/login', (req, res) => {
    // Generate a random state for security
    const state = Math.random().toString(36).substring(2);
    req.session.oauthState = state;

    // Redirect to Freesound authorization page
    const authUrl = `${FREESOUND.AUTH_URL}?client_id=${FREESOUND.CLIENT_ID}&response_type=code&state=${state}`;
    res.redirect(authUrl);
});

// OAuth2 callback - Step 2 and 3 of OAuth2 flow
app.get('/callback', async (req, res) => {
    try {
        const { code, error, state } = req.query;

        // Verify state to prevent CSRF attacks
        if (state !== req.session.oauthState) {
            return res.status(403).send('Invalid state parameter');
        }

        if (error) {
            return res.send(`<h1>Authorization Failed</h1><p>Error: ${error}</p><p><a href="/">Return home</a></p>`);
        }

        if (!code) {
            return res.send('<h1>No authorization code received</h1><p><a href="/">Return home</a></p>');
        }

        // Exchange authorization code for access token
        const params = new URLSearchParams({
            client_id: FREESOUND.CLIENT_ID,
            client_secret: FREESOUND.CLIENT_SECRET,
            grant_type: 'authorization_code',
            code: code
        });

        const tokenResponse = await axios.post(
            FREESOUND.TOKEN_URL,
            params.toString(),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        // Store tokens in session
        req.session.accessToken = tokenResponse.data.access_token;
        req.session.refreshToken = tokenResponse.data.refresh_token;
        req.session.tokenExpires = Date.now() + (tokenResponse.data.expires_in * 1000);

        // Redirect to home page
        res.redirect('/');
    } catch (error) {
        console.error('OAuth callback error:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
        res.status(500).send(`
            <h1>Authentication Error</h1>
            <p>Failed to authenticate with Freesound. Please try again.</p>
            <p>Error: ${error.message}</p>
            <p><a href="/login">Retry login</a> | <a href="/">Return home</a></p>
        `);
    }
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// Function to refresh the access token
async function refreshAccessToken(req) {
    try {
        const params = new URLSearchParams({
            client_id: FREESOUND.CLIENT_ID,
            client_secret: FREESOUND.CLIENT_SECRET,
            grant_type: 'refresh_token',
            refresh_token: req.session.refreshToken
        });

        const response = await axios.post(
            FREESOUND.TOKEN_URL,
            params.toString(),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        // Update session with new tokens
        req.session.accessToken = response.data.access_token;
        req.session.refreshToken = response.data.refresh_token;
        req.session.tokenExpires = Date.now() + (response.data.expires_in * 1000);

        return req.session.accessToken;
    } catch (error) {
        console.error('Error refreshing token:', error.message);
        throw error;
    }
}

// Middleware to ensure token is fresh
const ensureFreshToken = async (req, res, next) => {
    try {
        if (!req.session.accessToken) {
            return res.redirect('/login');
        }

        // Check if token is about to expire (within 5 minutes)
        if (req.session.tokenExpires && req.session.tokenExpires - Date.now() < 300000) {
            console.log('Access token is about to expire, refreshing...');
            await refreshAccessToken(req);
        }

        next();
    } catch (error) {
        console.error('Token refresh error:', error);
        req.session.destroy();
        res.redirect('/login');
    }
};

// User profile route
app.get('/me', ensureFreshToken, async (req, res) => {
    try {
        const apiClient = createApiClient(req.session.accessToken);
        const response = await apiClient.get('/me/');

        res.send(`
            <h1>Your Freesound Profile</h1>
            <p><strong>Username:</strong> ${response.data.username}</p>
            <p><strong>Full Name:</strong> ${response.data.about || 'Not provided'}</p>
            <p><strong>Homepage:</strong> ${response.data.homepage || 'Not provided'}</p>
            <p><img src="${response.data.avatar.medium}" alt="Avatar" style="border-radius: 50%;" /></p>
            <p><a href="/">Return to home</a></p>
        `);
    } catch (error) {
        handleError(res, error);
    }
});

// Download endpoint with fallback URL construction
app.get('/download/:id', ensureFreshToken, async (req, res) => {
    try {
        const soundId = req.params.id;
        console.log(`Fetching download for sound #${soundId}`);

        // Create API client with OAuth access token
        const apiClient = createApiClient(req.session.accessToken);

        // Get sound info first
        const soundResponse = await apiClient.get(`/sounds/${soundId}/`);
        const sound = soundResponse.data;

        console.log('Sound info retrieved:', sound.name);

        // Try to get download URL (requires OAuth2)
        console.log('Getting download URL...');
        const downloadResponse = await apiClient.get(`/sounds/${soundId}/download/`);
        console.log('Download response:', downloadResponse.data);

        // Determine the download URL
        let downloadUrl;

        if (downloadResponse.data && downloadResponse.data.download) {
            // Use the URL provided in the response
            downloadUrl = downloadResponse.data.download;
            console.log('Using provided download URL:', downloadUrl);
        } else {
            // Construct a fallback URL based on the Freesound pattern
            downloadUrl = `https://freesound.org/apiv2/sounds/${soundId}/download/`;
            console.log('Using fallback download URL:', downloadUrl);
        }

        // Create a clean filename
        const cleanName = sound.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const soundExt = sound.type.split('/')[1] || 'wav'; // Get file extension from MIME type
        const soundName = `${cleanName}_${sound.id}.${soundExt}`;
        const savePath = path.join(soundsDir, soundName);

        // Download the sound file
        console.log('Initiating download...');
        const writer = fs.createWriteStream(savePath);

        // Download the file using axios with Authorization header
        const soundDownloadResponse = await axios({
            method: 'get',
            url: downloadUrl,
            responseType: 'stream',
            maxRedirects: 5, // Allow redirects
            headers: {
                'Authorization': `Bearer ${req.session.accessToken}`
            }
        });

        console.log('Download started, piping to file...');
        soundDownloadResponse.data.pipe(writer);

        // Store download in session history
        if (!req.session.downloads) req.session.downloads = [];
        req.session.downloads.unshift({
            id: sound.id,
            name: sound.name,
            path: soundName,
            date: new Date().toISOString()
        });

        // Keep only the last 10 downloads in history
        if (req.session.downloads.length > 10) {
            req.session.downloads = req.session.downloads.slice(0, 10);
        }

        writer.on('finish', () => {
            console.log(`Sound saved to ${savePath}`);

            res.send(`
                <html>
                <head>
                    <style>
                        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
                        .button { display: inline-block; padding: 8px 15px; background: #4a90e2; color: white; 
                                  text-decoration: none; border-radius: 4px; margin-right: 10px; }
                        .download-success { background: #e7f7e7; border-left: 5px solid #4CAF50; padding: 15px; }
                    </style>
                </head>
                <body>
                    <div class="download-success">
                        <h1>Download Successful!</h1>
                        <p>Sound "${sound.name}" has been downloaded successfully.</p>
                    </div>
                    
                    <h2>Sound Details:</h2>
                    <p><strong>Name:</strong> ${sound.name}</p>
                    <p><strong>ID:</strong> ${sound.id}</p>
                    <p><strong>By:</strong> ${sound.username || 'Unknown'}</p>
                    <p><strong>Saved as:</strong> ${soundName}</p>
                    
                    <h3>Listen to preview:</h3>
                    <audio controls style="width: 100%; margin-bottom: 20px;">
                        <source src="${sound.previews['preview-hq-mp3']}" type="audio/mpeg">
                        Your browser does not support the audio element.
                    </audio>
                    
                    <p style="margin-top: 30px;">
                        <a href="/sound/${sound.id}" class="button">Back to Sound Details</a>
                        <a href="/my-downloads" class="button">My Downloads</a>
                        <a href="/" class="button">Return to Home</a>
                    </p>
                </body>
                </html>
            `);
        });

        writer.on('error', (err) => {
            console.error('Error writing sound file:', err);
            res.status(500).send(`
                <h1>Download Error</h1>
                <p>Failed to save sound file: ${err.message}</p>
                <p><a href="/">Return to Home</a></p>
            `);
        });
    } catch (error) {
        console.error('Download error details:', error);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response headers:', error.response.headers);
            console.error('Response data:', error.response.data);
        }

        // Provide a detailed error page
        res.status(500).send(`
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
                    .button { display: inline-block; padding: 8px 15px; background: #4a90e2; color: white; 
                            text-decoration: none; border-radius: 4px; margin-right: 10px; }
                    .error-box { background: #ffebee; border-left: 5px solid #f44336; padding: 15px; }
                    pre { background: #f5f5f5; padding: 10px; overflow: auto; max-height: 400px; }
                </style>
            </head>
            <body>
                <div class="error-box">
                    <h1>Download Error</h1>
                    <p>There was an error downloading the sound:</p>
                    <pre>${error.message}</pre>
                </div>
                
                <h2>Troubleshooting Steps:</h2>
                <ol>
                    <li>Try <a href="/login">logging in again</a> to refresh your access token.</li>
                </ol>
                
                <p style="margin-top: 30px;">
                    <a href="/" class="button">Return to Home</a>
                </p>
            </body>
            </html>
        `);
    }
});

// Show download history
app.get('/my-downloads', requireAuth, (req, res) => {
    const downloads = req.session.downloads || [];

    let downloadsHtml = '';
    if (downloads.length === 0) {
        downloadsHtml = '<p>You haven\'t downloaded any sounds yet.</p>';
    } else {
        downloadsHtml = '<ul style="list-style-type: none; padding: 0;">';
        downloads.forEach(download => {
            downloadsHtml += `
                <li style="margin-bottom: 15px; padding: 10px; border: 1px solid #ddd; border-radius: 5px;">
                    <strong>${download.name}</strong> (ID: ${download.id})<br/>
                    Downloaded: ${new Date(download.date).toLocaleString()}<br/>
                    Saved as: ${download.path}<br/>
                    <a href="/sound/${download.id}" class="button">View Sound Details</a>
                </li>
            `;
        });
        downloadsHtml += '</ul>';
    }

    res.send(`
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
                .button { display: inline-block; padding: 6px 12px; background: #4a90e2; color: white; 
                          text-decoration: none; border-radius: 4px; margin-right: 10px; font-size: 14px; }
            </style>
        </head>
        <body>
            <h1>My Downloaded Sounds</h1>
            <p>Here are the sounds you've downloaded in this session:</p>
            
            ${downloadsHtml}
            
            <p style="margin-top: 30px;">
                <a href="/" class="button">Return to Home</a>
            </p>
        </body>
        </html>
    `);
});

// Update your process-audio-json endpoint to reuse the download functionality
app.get('/process-audio-json', ensureFreshToken, async (req, res) => {
    try {
        // Path to the audio.json file
        const audioJsonPath = path.join(__dirname, 'audio.json');

        if (!fs.existsSync(audioJsonPath)) {
            return res.status(404).send('audio.json file not found!');
        }

        // Read and parse the file
        const jsonContent = fs.readFileSync(audioJsonPath, 'utf8');

        // Remove comments if present (since JSON doesn't technically support comments)
        const cleanedJson = jsonContent
            .replace(/\/\/.*$/gm, '')
            .replace(/,(\s*[\]}])/g, '$1'); // Remove trailing commas

        let sceneData;
        try {
            sceneData = JSON.parse(cleanedJson);
        } catch (error) {
            return res.status(400).send(`Error parsing audio.json: ${error.message}`);
        }

        if (!sceneData || !sceneData.scene) {
            return res.status(400).send('Invalid scene data in audio.json. Must contain a "scene" object.');
        }

        // Create folder for this scene
        // Create folder directly in Unity StreamingAssets/Sounds
        const scenePath = path.join(UNITY_SOUNDS_PATH, SCENE_FOLDER_NAME);

        // Remove existing folder if it exists
        if (fs.existsSync(scenePath)) {
            console.log(`Removing existing scene folder: ${scenePath}`);
            fs.rmSync(scenePath, { recursive: true, force: true });
        }

        fs.mkdirSync(scenePath, { recursive: true });
        console.log(`Created scene folder directly in Unity: ${scenePath}`);
        // Results object
        const results = {
            successful: [],
            failed: []
        };

        // Create API client
        const apiClient = createApiClient(req.session.accessToken);

        // Verify token is working
        try {
            const testResponse = await apiClient.get('/me/');
            console.log(`Token verification successful - logged in as: ${testResponse.data.username}`);
        } catch (err) {
            console.error('Token verification failed:', err.message);
            return res.redirect('/login?redirect=/process-audio-json');
        }

        // Process interaction sounds
        if (sceneData.scene.interactions && Array.isArray(sceneData.scene.interactions)) {
            console.log(`Processing ${sceneData.scene.interactions.length} interaction sounds...`);

            for (const interaction of sceneData.scene.interactions) {
                try {
                    console.log(`Searching for "${interaction.title}" (${interaction.object})`);

                    // Basic search without filters
                    const searchResponse = await apiClient.get('/search/text/', {
                        params: {
                            query: interaction.freesound_query,
                            fields: 'id,name,username,duration,previews',
                            page_size: 1,
                            sort: 'score'
                        }
                    });

                    if (searchResponse.data.count === 0) {
                        throw new Error(`No sounds found for query: ${interaction.freesound_query}`);
                    }

                    // Get the best match
                    const sound = searchResponse.data.results[0];
                    console.log(`Found sound: "${sound.name}" (ID: ${sound.id})`);

                    // Create filename for saving in the scene folder
                    const sanitizedTitle = interaction.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                    const sanitizedObject = interaction.object.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                    const filename = `${sanitizedObject}_${sanitizedTitle}_${sound.id}`;

                    // *** Use the existing download endpoint logic ***
                    console.log(`Getting sound info and download URL for sound #${sound.id}`);

                    // Get complete sound info 
                    const soundResponse = await apiClient.get(`/sounds/${sound.id}/`);
                    const soundDetail = soundResponse.data;

                    // Get download URL
                    console.log('Getting download URL...');
                    const downloadResponse = await apiClient.get(`/sounds/${sound.id}/download/`);

                    // Determine the download URL (same logic as your download endpoint)
                    let downloadUrl;
                    if (downloadResponse.data && downloadResponse.data.download) {
                        // Use the URL provided in the response
                        downloadUrl = downloadResponse.data.download;
                        console.log('Using provided download URL:', downloadUrl);
                    } else {
                        // Construct a fallback URL
                        downloadUrl = `https://freesound.org/apiv2/sounds/${sound.id}/download/`;
                        console.log('Using fallback download URL:', downloadUrl);
                    }

                    // Create final filename with extension
                    const soundExt = soundDetail.type.split('/')[1] || 'wav';
                    const finalFilename = `${filename}.${soundExt}`;
                    const savePath = path.join(scenePath, finalFilename);

                    // Download the file
                    console.log(`Downloading to ${finalFilename}...`);
                    const writer = fs.createWriteStream(savePath);

                    const soundDownloadResponse = await axios({
                        method: 'get',
                        url: downloadUrl,
                        responseType: 'stream',
                        maxRedirects: 5,
                        headers: {
                            'Authorization': `Bearer ${req.session.accessToken}`
                        }
                    });

                    // Pipe the download to the file
                    soundDownloadResponse.data.pipe(writer);

                    // Wait for download to complete
                    await new Promise((resolve, reject) => {
                        writer.on('finish', () => {
                            console.log(`Sound saved to ${savePath}`);
                            resolve();
                        });
                        writer.on('error', (err) => {
                            console.error(`Error writing file: ${err.message}`);
                            reject(err);
                        });
                    });

                    // Add to session history (same as in download endpoint)
                    if (!req.session.downloads) req.session.downloads = [];
                    req.session.downloads.unshift({
                        id: sound.id,
                        name: sound.name,
                        path: finalFilename,
                        date: new Date().toISOString()
                    });

                    // Keep only the last 10 downloads in history
                    if (req.session.downloads.length > 10) {
                        req.session.downloads = req.session.downloads.slice(0, 10);
                    }

                    // Add to results
                    results.successful.push({
                        type: 'interaction',
                        title: interaction.title,
                        object: interaction.object,
                        soundId: sound.id,
                        soundName: sound.name,
                        filename: finalFilename,
                        duration: soundDetail.duration,
                        preview: soundDetail.previews ? soundDetail.previews['preview-hq-mp3'] : null
                    });

                } catch (err) {
                    console.error(`Failed to process sound for ${interaction.title}:`, err.message);
                    results.failed.push({
                        type: 'interaction',
                        title: interaction.title,
                        object: interaction.object,
                        error: err.message
                    });
                }
            }
        }

        // Process background sound (if present) using the same approach
        if (sceneData.scene.background) {
            try {
                const bg = sceneData.scene.background;
                console.log(`Processing background sound "${bg.title}"...`);

                // Basic search
                const searchResponse = await apiClient.get('/search/text/', {
                    params: {
                        query: bg.freesound_query,
                        fields: 'id,name,username,duration,previews',
                        page_size: 1,
                        sort: 'score'
                    }
                });

                if (searchResponse.data.count === 0) {
                    throw new Error(`No sounds found for background query: ${bg.freesound_query}`);
                }

                // Get the best match
                const sound = searchResponse.data.results[0];
                console.log(`Found sound: "${sound.name}" (ID: ${sound.id})`);

                // Create filename
                const sanitizedTitle = bg.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                const filename = `background_${sanitizedTitle}_${sound.id}`;

                // *** Use the existing download endpoint logic ***
                // Get complete sound info 
                const soundResponse = await apiClient.get(`/sounds/${sound.id}/`);
                const soundDetail = soundResponse.data;

                // Get download URL
                console.log('Getting download URL for background...');
                const downloadResponse = await apiClient.get(`/sounds/${sound.id}/download/`);

                // Determine the download URL
                let downloadUrl;
                if (downloadResponse.data && downloadResponse.data.download) {
                    downloadUrl = downloadResponse.data.download;
                } else {
                    downloadUrl = `https://freesound.org/apiv2/sounds/${sound.id}/download/`;
                }

                // Create final filename with extension
                const soundExt = soundDetail.type.split('/')[1] || 'wav';
                const finalFilename = `${filename}.${soundExt}`;
                const savePath = path.join(scenePath, finalFilename);

                // Download the file
                console.log(`Downloading background to ${finalFilename}...`);
                const writer = fs.createWriteStream(savePath);

                const soundDownloadResponse = await axios({
                    method: 'get',
                    url: downloadUrl,
                    responseType: 'stream',
                    maxRedirects: 5,
                    headers: {
                        'Authorization': `Bearer ${req.session.accessToken}`
                    }
                });

                soundDownloadResponse.data.pipe(writer);

                // Wait for download to complete
                await new Promise((resolve, reject) => {
                    writer.on('finish', () => {
                        console.log(`Background sound saved to ${savePath}`);
                        resolve();
                    });
                    writer.on('error', (err) => {
                        console.error(`Error writing background file: ${err.message}`);
                        reject(err);
                    });
                });

                // Add to session history
                if (!req.session.downloads) req.session.downloads = [];
                req.session.downloads.unshift({
                    id: sound.id,
                    name: sound.name,
                    path: finalFilename,
                    date: new Date().toISOString()
                });

                results.successful.push({
                    type: 'background',
                    title: bg.title,
                    soundId: sound.id,
                    soundName: sound.name,
                    filename: finalFilename,
                    duration: soundDetail.duration,
                    preview: soundDetail.previews ? soundDetail.previews['preview-hq-mp3'] : null
                });

            } catch (err) {
                console.error(`Failed to process background sound:`, err.message);
                results.failed.push({
                    type: 'background',
                    title: sceneData.scene.background.title,
                    error: err.message
                });
            }
        }

        // Create sound mappings for Unity
        const unityMapping = {
            soundMappings: results.successful.map(sound => {
                // Get the volume based on sound type
                let volume = 0.5; // Default volume
                let loop = false; // Default loop setting

                if (sound.type === 'background') {
                    // Background is a single object, not an array
                    if (sceneData.scene.background) {
                        volume = sceneData.scene.background.volume || 0.5;
                        loop = sceneData.scene.background.loop || true;
                    }
                } else {
                    // For interaction sounds, find the matching interaction data
                    const interactionData = sceneData.scene.interactions?.find(
                        item => item.title === sound.title
                    );

                    if (interactionData) {
                        volume = interactionData.volume || 0.5;
                        loop = interactionData.loop || false;
                    }
                }

                // Return the mapping object with objectName (not object)
                return {
                    title: sound.title,
                    type: sound.type,
                    objectName: sound.object || (sound.type === 'background' ? 'Background' : 'Unknown'),
                    filename: sound.filename,
                    duration: sound.duration || 0,
                    loop: loop,
                    volume: volume
                };
            })
        };

        // Save the mappings directly to Unity StreamingAssets
        fs.writeFileSync(
            path.join(UNITY_STREAMING_ASSETS_PATH, 'unity_sound_mappings.json'),
            JSON.stringify(unityMapping, null, 2)
        );
        console.log('Saved sound mappings directly to Unity StreamingAssets folder');

        // Also copy this file to StreamingAssets for easier Unity access
        const unityStreamingAssetsPath = path.join(__dirname, 'Unity', 'Assets', 'StreamingAssets');
        if (fs.existsSync(unityStreamingAssetsPath)) {
            fs.writeFileSync(
                path.join(unityStreamingAssetsPath, 'unity_sound_mappings.json'),
                JSON.stringify(unityMapping, null, 2)
            );
            console.log('Copied sound mappings to Unity StreamingAssets folder');
        }

        // Return a simple success page with download links and previews
        res.send(`
            <html>
            <head>
                <title>Scene Sounds Downloaded</title>
                <style>
                    body { font-family: sans-serif; max-width: 800px; margin: 20px auto; padding: 0 20px; }
                    .success { color: green; }
                    .error { color: red; }
                    pre { background: #f5f5f5; padding: 10px; overflow: auto; }
                    .sound-item { margin: 10px 0; padding: 10px; border: 1px solid #ddd; border-radius: 5px; }
                    audio { width: 250px; }
                </style>
            </head>
            <body>
                <h1>Sounds Downloaded from audio.json</h1>
                
                <p class="${results.failed.length === 0 ? 'success' : 'error'}">
                    <strong>Results:</strong> ${results.successful.length} sounds downloaded 
                    ${results.failed.length > 0 ? `(${results.failed.length} failed)` : '✓'}
                </p>
                
<p><strong>Folder:</strong> ${SCENE_FOLDER_NAME}</p>                
<p><strong>Path:</strong> ${scenePath}</p>
                
                <h3>Successfully Downloaded:</h3>
                ${results.successful.map(item => `
                    <div class="sound-item">
                        <strong>${item.title}</strong> (${item.type})<br>
                        ${item.object ? `Object: ${item.object}<br>` : ''}
                        File: ${item.filename}<br>
                        Duration: ${item.duration ? Math.round(item.duration * 10) / 10 + 's' : 'Unknown'}<br>
                        ${item.preview ? `
                            <audio controls>
                                <source src="${item.preview}" type="audio/mpeg">
                                Your browser does not support the audio element.
                            </audio>
                        ` : ''}
                    </div>
                `).join('')}
                
                ${results.failed.length > 0 ? `
                    <h3 class="error">Failed:</h3>
                    <ul>
                        ${results.failed.map(item =>
            `<li><strong>${item.title}</strong> - Error: ${item.error}</li>`
        ).join('')}
                    </ul>
                ` : ''}
                
                <h3>Unity Sound Mappings</h3>
<p>A Unity-compatible sound mapping file has been created at: <code>Unity/Assets/StreamingAssets/Sounds/${SCENE_FOLDER_NAME}/unity_sound_mappings.json</code></p>                
                <p>
                    <a href="/">Return to home</a> | 
                    <a href="/my-downloads">My downloads</a>
                </p>
            </body>
            </html>
        `);
    } catch (error) {
        console.error('Error processing audio.json:', error);
        res.status(500).send(`
            <h1>Error Processing audio.json</h1>
            <p>An error occurred: ${error.message}</p>
            <pre>${error.stack}</pre>
            <p><a href="/">Return to home</a></p>
        `);
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Using Freesound API with OAuth2 authentication`);
    console.log(`Redirect URI: ${FREESOUND.REDIRECT_URI}`);
});