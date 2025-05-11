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

// Update home page with more options
app.get('/', (req, res) => {
    const loggedIn = !!req.session.accessToken;

    res.send(`
        <h1>Freesound OAuth2 API Connection</h1>
        ${loggedIn ?
            `<p>✅ You are logged in! Your access token is active.</p>
             <p><a href="/me">View your profile</a> | <a href="/logout">Log out</a></p>` :
            `<p>❌ You are not logged in. <a href="/login">Log in with Freesound</a> to download full sounds.</p>`
        }
        <p>Try these endpoints:</p>
        <ul>
          <li><a href="/search?query=piano">Search for piano sounds</a></li>
          <li><a href="/sound/1234">Get details of sound #1234</a></li>
          ${loggedIn ? `
          <li><a href="/download-piano">Download a full piano sound</a></li>
          <li><a href="/direct-download/665621">Try direct download method for sound #665621</a></li>
          <li><a href="/my-downloads">View my downloaded sounds</a></li>
          <li><a href="/debug-download/665621">Enhanced debug for sound #665621</a></li>
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

// Search endpoint
app.get('/search', async (req, res) => {
    try {
        // We can use token-based auth for search (public endpoint)
        const query = req.query.query || 'piano';
        console.log(`Searching for sounds matching: "${query}"`);

        const response = await axios.get(`${FREESOUND.API_BASE}/search/text/`, {
            params: {
                query,
                fields: 'id,name,url,previews,duration,tags,username',
                page_size: 10,
                token: FREESOUND.CLIENT_SECRET
            }
        });

        // Format results with a nice HTML display
        let resultsHtml = '';
        response.data.results.forEach(sound => {
            resultsHtml += `
                <div style="margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px;">
                    <h3>${sound.name}</h3>
                    <p><strong>ID:</strong> ${sound.id} | <strong>By:</strong> ${sound.username || 'Unknown'}</p>
                    <p><strong>Duration:</strong> ${sound.duration ? sound.duration.toFixed(1) + 's' : 'Unknown'}</p>
                    
                    <audio controls style="width: 100%;">
                        <source src="${sound.previews['preview-hq-mp3']}" type="audio/mpeg">
                        Your browser does not support the audio element.
                    </audio>
                    
                    <p>
                        <a href="/sound/${sound.id}" class="button">View Details</a>
                        ${req.session.accessToken ?
                    `<a href="/download/${sound.id}" class="button">Download Full Sound</a>` :
                    `<a href="/login" class="button">Log in to Download</a>`}
                    </p>
                </div>
            `;
        });

        res.send(`
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
                    .button { display: inline-block; padding: 8px 15px; background: #4a90e2; color: white; 
                              text-decoration: none; border-radius: 4px; margin-right: 10px; }
                    .search-box { width: 100%; padding: 10px; font-size: 16px; border-radius: 4px; border: 1px solid #ddd; }
                    .search-button { padding: 10px 20px; background: #4a90e2; color: white; border: none; 
                                     border-radius: 4px; cursor: pointer; font-size: 16px; }
                </style>
            </head>
            <body>
                <h1>Sound Search: "${query}"</h1>
                <p>Found ${response.data.count} results. Showing top 10.</p>
                
                <form action="/search" method="get" style="margin: 20px 0;">
                    <input type="text" name="query" placeholder="Search for sounds..." value="${query}" class="search-box">
                    <button type="submit" class="search-button">Search</button>
                </form>
                
                ${resultsHtml}
                
                <p><a href="/" class="button">Return to Home</a></p>
            </body>
            </html>
        `);
    } catch (error) {
        handleError(res, error);
    }
});

// Sound details endpoint
app.get('/sound/:id', async (req, res) => {
    try {
        const soundId = req.params.id;
        console.log(`Fetching details for sound #${soundId}`);

        // Public endpoint, can use token auth
        const response = await axios.get(`${FREESOUND.API_BASE}/sounds/${soundId}/`, {
            params: {
                token: FREESOUND.CLIENT_SECRET
            }
        });

        const sound = response.data;

        // Format tags
        const tagsHtml = sound.tags ? sound.tags.map(tag =>
            `<span style="background: #eee; padding: 3px 8px; border-radius: 3px; margin-right: 5px;">${tag}</span>`
        ).join(' ') : 'None';

        res.send(`
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
                    .button { display: inline-block; padding: 8px 15px; background: #4a90e2; color: white; 
                              text-decoration: none; border-radius: 4px; margin-right: 10px; }
                    .tag-list { margin: 15px 0; }
                    .download-box { background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0; }
                </style>
            </head>
            <body>
                <h1>${sound.name}</h1>
                
                <p><strong>By:</strong> ${sound.username || 'Unknown'}</p>
                <p><strong>Duration:</strong> ${sound.duration ? sound.duration.toFixed(1) + 's' : 'Unknown'}</p>
                <p><strong>Date:</strong> ${new Date(sound.created).toLocaleDateString()}</p>
                
                <div class="tag-list">
                    <strong>Tags:</strong> ${tagsHtml}
                </div>
                
                <div style="margin: 20px 0;">
                    <h3>Description:</h3>
                    <p>${sound.description || 'No description provided.'}</p>
                </div>
                
                <h3>Preview:</h3>
                <audio controls style="width: 100%; margin-bottom: 20px;">
                    <source src="${sound.previews['preview-hq-mp3']}" type="audio/mpeg">
                    Your browser does not support the audio element.
                </audio>
                
<div class="download-box">
    <h3>Download Full Sound:</h3>
    ${req.session.accessToken ?
                `<p>
        <a href="/download/${sound.id}" class="button">Download Full Sound</a>
        <a href="/direct-download/${sound.id}" class="button">Try Direct Download</a>
     </p>` :
                `<p>You need to <a href="/login">log in with Freesound</a> to download the full quality sound.</p>`}
</div>
                
                <p style="margin-top: 30px;">
                    <a href="/search?query=piano" class="button">Back to Search</a>
                    <a href="/" class="button">Return to Home</a>
                </p>
            </body>
            </html>
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
                    <li>Check the enhanced debug information: <a href="/debug-download/${req.params.id}">Debug Sound #${req.params.id}</a></li>
                    <li>Try downloading a different sound from the <a href="/search?query=piano">search results</a>.</li>
                </ol>
                
                <p style="margin-top: 30px;">
                    <a href="/" class="button">Return to Home</a>
                </p>
            </body>
            </html>
        `);
    }
});

// Direct download endpoint (alternative method)
app.get('/direct-download/:id', ensureFreshToken, async (req, res) => {
    try {
        const soundId = req.params.id;
        console.log(`[DIRECT] Downloading sound #${soundId}`);

        // Get sound info first (using token auth for this request)
        const soundResponse = await axios.get(`${FREESOUND.API_BASE}/sounds/${soundId}/`, {
            params: { token: FREESOUND.CLIENT_SECRET }
        });
        const sound = soundResponse.data;
        console.log('Sound info retrieved:', sound.name);

        // Create a clean filename
        const cleanName = sound.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const soundExt = sound.type.split('/')[1] || 'wav'; // Get file extension from MIME type
        const soundName = `direct_${cleanName}_${sound.id}.${soundExt}`;
        const savePath = path.join(soundsDir, soundName);

        // Direct download URL with oauth token as parameter
        const directUrl = `https://freesound.org/apiv2/sounds/${soundId}/download/oauth2/?access_token=${req.session.accessToken}`;
        console.log('Using direct download URL with access token as parameter');

        // Download the file
        const writer = fs.createWriteStream(savePath);
        console.log('Initiating direct download...');

        const downloadResponse = await axios({
            method: 'get',
            url: directUrl,
            responseType: 'stream',
            maxRedirects: 5 // Allow redirects
        });

        console.log('Download started, piping to file...');
        downloadResponse.data.pipe(writer);

        writer.on('finish', () => {
            console.log(`Sound saved to ${savePath}`);
            res.send(`
                <h1>Direct Download Successful!</h1>
                <p>Sound "${sound.name}" has been downloaded using the direct method.</p>
                <p><strong>Saved as:</strong> ${soundName}</p>
                <p><a href="/">Return to Home</a></p>
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
        console.error('[DIRECT] Download error:', error);
        res.status(500).send(`
            <h1>Direct Download Error</h1>
            <p>Error: ${error.message}</p>
            <p><a href="/">Return to Home</a></p>
        `);
    }
});

// Enhanced debug endpoint with more information
app.get('/debug-download/:id', ensureFreshToken, async (req, res) => {
    try {
        const soundId = req.params.id;
        console.log(`[DEBUG] Detailed checking for sound #${soundId}`);

        // Create API client with OAuth access token
        const apiClient = createApiClient(req.session.accessToken);

        // Get sound info first
        const soundResponse = await apiClient.get(`/sounds/${soundId}/`);
        const sound = soundResponse.data;

        // Get raw download response
        console.log('[DEBUG] Requesting download URL...');
        const downloadResponse = await apiClient.get(`/sounds/${soundId}/download/`, {
            validateStatus: status => true // Accept any status code for debugging
        });

        // Display all headers and full response information
        res.send(`
            <html>
            <head>
                <style>
                    body { font-family: monospace; max-width: 1000px; margin: 0 auto; padding: 20px; }
                    pre { background: #f5f5f5; padding: 10px; overflow: auto; white-space: pre-wrap; }
                    .section { margin-bottom: 30px; border: 1px solid #ddd; padding: 10px; border-radius: 5px; }
                </style>
            </head>
            <body>
                <h1>Detailed Debug for Sound #${soundId}</h1>
                
                <div class="section">
                    <h2>Sound Info</h2>
                    <pre>${JSON.stringify(sound, null, 2)}</pre>
                </div>
                
                <div class="section">
                    <h2>Download Request</h2>
                    <p>URL: ${FREESOUND.API_BASE}/sounds/${soundId}/download/</p>
                    <p>Headers: Authorization: Bearer ${req.session.accessToken.substring(0, 5)}...</p>
                </div>
                
                <div class="section">
                    <h2>Download Response</h2>
                    <p>Status: ${downloadResponse.status}</p>
                    <p>Status Text: ${downloadResponse.statusText}</p>
                    <h3>Headers:</h3>
                    <pre>${JSON.stringify(downloadResponse.headers, null, 2)}</pre>
                    <h3>Data:</h3>
                    <pre>${JSON.stringify(downloadResponse.data, null, 2)}</pre>
                </div>
                
                <div class="section">
                    <h2>Session Info</h2>
                    <p>Access Token: ${req.session.accessToken ? 'Present (first 5 chars): ' + req.session.accessToken.substring(0, 5) + '...' : 'Not present'}</p>
                    <p>Token Expires: ${req.session.tokenExpires ? new Date(req.session.tokenExpires).toLocaleString() + ' (' + Math.floor((req.session.tokenExpires - Date.now()) / 1000) + ' seconds left)' : 'Unknown'}</p>
                </div>
                
                <p><a href="/">Return to Home</a></p>
            </body>
            </html>
        `);
    } catch (error) {
        console.error('[DEBUG] Error:', error);
        res.status(500).send(`
            <h1>Debug Error</h1>
            <p>Error: ${error.message}</p>
            <pre>${error.stack}</pre>
        `);
    }
});

// Download a specific piano sound
app.get('/download-piano', ensureFreshToken, async (req, res) => {
    try {
        // Search for piano sounds
        console.log('Searching for piano sounds...');
        const response = await axios.get(`${FREESOUND.API_BASE}/search/text/`, {
            params: {
                query: 'piano',
                fields: 'id,name,previews,duration,username,tags',
                page_size: 5,
                filter: 'duration:[1 TO 10]', // Piano sounds between 1 and 10 seconds
                token: FREESOUND.CLIENT_SECRET
            }
        });

        if (response.data.results.length === 0) {
            return res.status(404).json({ success: false, error: 'No piano sounds found' });
        }

        // Get the first result
        const sound = response.data.results[0];

        // Redirect to the download endpoint for this sound
        res.redirect(`/download/${sound.id}`);
    } catch (error) {
        handleError(res, error);
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
                <a href="/search?query=piano" class="button">Search for More Sounds</a>
                <a href="/" class="button">Return to Home</a>
            </p>
        </body>
        </html>
    `);
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Using Freesound API with OAuth2 authentication`);
    console.log(`Redirect URI: ${FREESOUND.REDIRECT_URI}`);
});