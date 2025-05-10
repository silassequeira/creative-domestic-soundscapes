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
        <ul>
          ${loggedIn ? `
          <li><a href="/my-downloads">View my downloaded sounds</a></li>
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

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Using Freesound API with OAuth2 authentication`);
    console.log(`Redirect URI: ${FREESOUND.REDIRECT_URI}`);
});