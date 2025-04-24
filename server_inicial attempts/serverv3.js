const express = require('express');
const axios = require('axios');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs').promises; // Use promises version of file system module
const fsSync = require('fs'); // Sync version for stream creation
const path = require('path');

// Load environment variables from freesound.env
dotenv.config({ path: './freesound.env' });

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// --- Configuration ---
const DOWNLOAD_DIR = path.join(__dirname, 'downloaded_sounds'); // Folder to save sounds
const DURATION_TOLERANCE = 0.75; // Search +/- this many seconds around target duration
// --- End Configuration ---

// Enable CORS and JSON body parsing
app.use(cors());
app.use(express.json());

// Freesound API configuration
const FREESOUND_CLIENT_ID = process.env.FREESOUND_CLIENT_ID;
const FREESOUND_CLIENT_SECRET = process.env.FREESOUND_CLIENT_SECRET;
const FREESOUND_API_URL = 'https://freesound.org/apiv2';

// Token storage
let apiToken = null;
let tokenExpiry = 0;

// --- Utility: Sanitize Filename ---
function sanitizeFilename(name) {
    // Remove characters not allowed in filenames and limit length
    return name.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_').substring(0, 100);
}

// --- Function to get a valid API token ---
async function getApiToken() {
    if (apiToken && tokenExpiry > Date.now()) {
        return apiToken;
    }
    try {
        console.log('[AUTH] Requesting new API token...');
        const response = await axios.post(`${FREESOUND_API_URL}/oauth2/access_token/`, null, {
            params: {
                client_id: FREESOUND_CLIENT_ID,
                client_secret: FREESOUND_CLIENT_SECRET,
                grant_type: 'client_credentials'
            }
        });
        apiToken = response.data.access_token;
        tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000;
        console.log(`[AUTH] New token acquired, expires in ${response.data.expires_in} seconds`);
        return apiToken;
    } catch (error) {
        console.error('[AUTH] FATAL: Token acquisition error:', error.response?.data || error.message);
        throw new Error('Failed to get API token');
    }
}

// --- The New Batch Processing Endpoint ---
app.post('/api/batch-download-sounds', async (req, res) => {
    console.log('\n--- Batch Download Request Received ---');
    const soundEffectsList = req.body.soundEffects;

    // 1. Validate Input
    if (!Array.isArray(soundEffectsList) || soundEffectsList.length === 0) {
        console.error('[BATCH] Invalid input: "soundEffects" array not found or empty in request body.');
        return res.status(400).json({ error: 'Invalid input: Expected a JSON object with a "soundEffects" array.' });
    }

    // 2. Ensure Download Directory Exists
    try {
        await fs.mkdir(DOWNLOAD_DIR, { recursive: true });
        console.log(`[SETUP] Download directory ensured: ${DOWNLOAD_DIR}`);
    } catch (error) {
        console.error(`[SETUP] FATAL: Could not create download directory "${DOWNLOAD_DIR}":`, error);
        return res.status(500).json({ error: 'Failed to create download directory on server.' });
    }

    const results = []; // To store results for the final response

    // 3. Process Each Sound Effect Sequentially
    for (const effect of soundEffectsList) {
        const { sequence, title, description, duration: targetDuration } = effect;
        console.log(`\n[PROCESSING #${sequence}] Title: "${title}", Target Duration: ${targetDuration}s`);

        let selectedSound = null;
        let errorOccurred = false;
        let statusMessage = '';

        try {
            const token = await getApiToken(); // Get fresh token if needed

            // 3a. Search Freesound
            const minDur = Math.max(0, targetDuration - DURATION_TOLERANCE).toFixed(1);
            const maxDur = (targetDuration + DURATION_TOLERANCE).toFixed(1);
            const searchQuery = title; // Use title directly as query
            const searchFilter = `duration:[${minDur} TO ${maxDur}]`;
            // Request fields needed for selection and download
            const searchFields = "id,name,duration,type,license,download,username";

            console.log(`[#${sequence} SEARCH] Query: "${searchQuery}", Filter: "${searchFilter}"`);

            let searchResponse;
            try {
                searchResponse = await axios.get(`${FREESOUND_API_URL}/search/text/`, {
                    params: {
                        query: searchQuery,
                        filter: searchFilter,
                        fields: searchFields,
                        page_size: 20 // Get a few results to choose from
                    },
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                console.log(`[#${sequence} SEARCH] Found ${searchResponse.data.count} potential matches.`);
            } catch (searchError) {
                statusMessage = `Search API Error: ${searchError.response?.data?.detail || searchError.message}`;
                console.error(`[#${sequence} SEARCH] FAILED. ${statusMessage}`);
                errorOccurred = true;
                results.push({ sequence, title, status: 'Search Failed', error: statusMessage });
                continue; // Move to the next effect in the list
            }


            // 3b. Select Best Match
            if (!searchResponse.data.results || searchResponse.data.results.length === 0) {
                statusMessage = 'No sounds found matching criteria.';
                console.warn(`[#${sequence} SELECT] ${statusMessage}`);
                errorOccurred = true;
                results.push({ sequence, title, status: 'No Match Found', error: statusMessage });
                continue;
            }

            let bestMatch = null;
            let minDiff = Infinity;

            searchResponse.data.results.forEach(sound => {
                const diff = Math.abs(sound.duration - targetDuration);
                if (diff < minDiff) {
                    minDiff = diff;
                    bestMatch = sound;
                }
            });

            if (bestMatch) {
                selectedSound = bestMatch; // Contains id, name, duration, type, license, download URL
                console.log(`[#${sequence} SELECT] Best match: "${selectedSound.name}" (ID: ${selectedSound.id}, Duration: ${selectedSound.duration.toFixed(2)}s, Diff: ${minDiff.toFixed(2)}s, Type: ${selectedSound.type}, License: ${selectedSound.license})`);
            } else {
                // Should not happen if results length > 0, but defensively check
                statusMessage = 'Could not select a best match from results.';
                console.error(`[#${sequence} SELECT] ${statusMessage}`);
                errorOccurred = true;
                results.push({ sequence, title, status: 'Selection Failed', error: statusMessage });
                continue;
            }

            // 3c. Download the File
            if (!selectedSound.download) {
                statusMessage = `Selected sound "${selectedSound.name}" (ID: ${selectedSound.id}) has no download URL provided by API. Possible license restriction or API issue.`;
                console.error(`[#${sequence} DOWNLOAD] FAILED. ${statusMessage}`);
                errorOccurred = true;
                results.push({ sequence, title, status: 'Download URL Missing', selectedSound: { id: selectedSound.id, name: selectedSound.name }, error: statusMessage });
                continue;
            }

            // **Crucially, use the token for the download request itself**
            const downloadUrl = selectedSound.download;
            const fileExtension = selectedSound.type || 'wav'; // Default to wav if type unknown
            const baseFilename = sanitizeFilename(`${sequence}_${title}_${selectedSound.id}`);
            const finalFilename = `${baseFilename}.${fileExtension}`;
            const filePath = path.join(DOWNLOAD_DIR, finalFilename);

            console.log(`[#${sequence} DOWNLOAD] Attempting download from: ${downloadUrl}`);
            console.log(`[#${sequence} DOWNLOAD] Saving to: ${filePath}`);

            try {
                const responseStream = await axios({
                    method: 'get',
                    url: downloadUrl,
                    responseType: 'stream',
                    headers: {
                        'Authorization': `Bearer ${token}` // Use the same token for download
                    }
                });

                // Pipe the download stream to a file
                const writer = fsSync.createWriteStream(filePath);
                responseStream.data.pipe(writer);

                // Wait for download to finish or error
                await new Promise((resolve, reject) => {
                    writer.on('finish', resolve);
                    writer.on('error', reject);
                    responseStream.data.on('error', reject); // Also catch errors on the read stream
                });

                statusMessage = `Successfully downloaded and saved as ${finalFilename}`;
                console.log(`[#${sequence} DOWNLOAD] SUCCESS. ${statusMessage}`);
                results.push({
                    sequence,
                    title,
                    status: 'Downloaded',
                    selectedSound: {
                        id: selectedSound.id,
                        name: selectedSound.name,
                        duration: selectedSound.duration,
                        license: selectedSound.license,
                        username: selectedSound.username
                    },
                    savedPath: filePath
                });

            } catch (downloadError) {
                statusMessage = `Download failed: ${downloadError.message}`;
                if (downloadError.response) {
                    statusMessage += ` (Status: ${downloadError.response.status})`;
                    console.error(`[#${sequence} DOWNLOAD] FAILED. Status: ${downloadError.response.status}, Data:`, downloadError.response.data); // Log detailed error data if available
                    if (downloadError.response.status === 401 || downloadError.response.status === 403) {
                        statusMessage += ` - Possible permission issue (e.g., non-CC0 license requires different auth).`;
                        console.warn(`[#${sequence} DOWNLOAD] Authorization error likely due to license restrictions or invalid token scope.`);
                    }
                } else {
                    console.error(`[#${sequence} DOWNLOAD] FAILED. ${statusMessage}`);
                }
                errorOccurred = true;
                // Attempt to clean up partially downloaded file
                try { await fs.unlink(filePath); } catch (e) { /* Ignore cleanup error */ }
                results.push({ sequence, title, status: 'Download Failed', selectedSound: { id: selectedSound.id, name: selectedSound.name }, error: statusMessage });
                continue; // Move to next effect
            }

        } catch (generalError) {
            // Catch unexpected errors during the processing of one effect
            statusMessage = `Unexpected error: ${generalError.message}`;
            console.error(`[#${sequence} PROCESS] FAILED UNEXPECTEDLY. ${statusMessage}`, generalError);
            errorOccurred = true;
            results.push({ sequence, title, status: 'Processing Error', error: statusMessage });
            continue; // Move to next effect
        }

        // Optional: Add a small delay to avoid hitting rate limits aggressively
        // await new Promise(resolve => setTimeout(resolve, 500)); // 0.5 second delay

    } // End loop through soundEffectsList

    console.log('\n--- Batch Download Request Finished ---');
    res.status(200).json({
        message: 'Batch processing finished. Check results array for details.',
        downloadDirectory: DOWNLOAD_DIR,
        results: results // Send summary back to client
    });
});

// --- Keep Existing Endpoints (Optional) ---
// You can keep the original /search, /:id, /:id/download endpoints if they are
// still useful for other purposes (e.g., testing, individual lookups).
// If not needed, you can remove them. Let's keep them for now.

// Endpoint to search for sounds (Original - useful for testing)
app.get('/api/sounds/search', async (req, res) => {
    // ... (previous search endpoint code remains here) ...
    // Ensure it uses getApiToken and handles errors
    try {
        const token = await getApiToken();
        const { query, filter, page, page_size } = req.query;
        const fieldsToFetch = "id,name,duration,previews,download,license,username,type";
        console.log(`[SINGLE SEARCH] Query: "${query}", Filter: "${filter || 'none'}"`);
        const response = await axios.get(`${FREESOUND_API_URL}/search/text/`, {
            params: { query, filter, page: page || 1, page_size: page_size || 15, fields: fieldsToFetch },
            headers: { 'Authorization': `Bearer ${token}` }
        });
        console.log(`[SINGLE SEARCH] Found ${response.data.count} results.`);
        if (response.data?.results?.length > 0) {
            console.log("--- Top Search Results ---");
            response.data.results.forEach(s => console.log(`  - ID: ${s.id}, Name: ${s.name}, Duration: ${s.duration?.toFixed(2)}s, Type: ${s.type}`));
            console.log("--------------------------");
        }
        res.json(response.data);
    } catch (error) {
        console.error('[SINGLE SEARCH] API request error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({ error: 'Error fetching sounds', details: error.response?.data || error.message });
    }
});

// Endpoint to get a specific sound by ID (Original - useful for testing)
app.get('/api/sounds/:id', async (req, res) => {
    // ... (previous get by id endpoint code remains here) ...
    // Ensure it uses getApiToken and handles errors
    try {
        const token = await getApiToken();
        const soundId = req.params.id;
        const fieldsToFetch = "id,name,duration,previews,download,license,username,description,tags,type";
        console.log(`[SINGLE DETAIL] Fetching sound ID: ${soundId}`);
        const response = await axios.get(`${FREESOUND_API_URL}/sounds/${soundId}/`, {
            params: { fields: fieldsToFetch },
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.data) {
            console.log("--- Fetched Sound Details ---");
            console.log(`  - Name: ${response.data.name || '[No Name]'}`);
            console.log(`  - Duration: ${response.data.duration !== undefined ? `${response.data.duration.toFixed(2)}s` : '[No Duration]'}`);
            console.log(`  - Type: ${response.data.type || '[No Type]'}`);
            console.log(`  - Username: ${response.data.username || '[No Username]'}`);
            console.log(`  - License: ${response.data.license || '[No License]'}`);
            console.log("---------------------------");
        }
        res.json(response.data);
    } catch (error) {
        console.error('[SINGLE DETAIL] API request error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({ error: 'Error fetching sound', details: error.response?.data || error.message });
    }
});

// Endpoint to get download URL for a sound (Original - less useful now, but maybe for testing)
// NOTE: This might not work reliably for downloads due to permissions as mentioned before.
app.get('/api/sounds/:id/download', async (req, res) => {
    // ... (previous download endpoint code remains here) ...
    // Ensure it uses getApiToken and handles errors
    try {
        const token = await getApiToken();
        const soundId = req.params.id;
        const fieldsToFetch = "id,name,duration,license,type";
        console.log(`[SINGLE DOWNLOAD URL] Getting URL for sound ID: ${soundId}`);
        const soundResponse = await axios.get(`${FREESOUND_API_URL}/sounds/${soundId}/`, {
            params: { fields: fieldsToFetch }, headers: { 'Authorization': `Bearer ${token}` }
        });

        if (soundResponse.data) {
            console.log(`--- Sound Details (for Download URL Req) ---`);
            console.log(`  - Preparing URL for Name: ${soundResponse.data.name || '[No Name]'}`);
            console.log(`--------------------------------------`);
        }

        // Try fetching the download URL info (might fail with 401/403)
        // The actual URL might be in soundResponse.data.download already if requested!
        let finalDownloadUrl = soundResponse.data.download; // Check if field provides it directly

        if (!finalDownloadUrl) {
            console.warn(`[SINGLE DOWNLOAD URL] Download URL not directly available in sound details for ID ${soundId}. Attempting /download/ endpoint (may fail)...`);
            // Fallback: try hitting the /download/ endpoint (less reliable with client_credentials)
            const downloadEpResponse = await axios.get(`${FREESOUND_API_URL}/sounds/${soundId}/download/`, {
                headers: { 'Authorization': `Bearer ${token}` },
                maxRedirects: 0, // Handle redirects manually if needed, or expect URL in body/headers
                validateStatus: status => status < 500 // Treat 4xx as non-throwing errors
            });

            if (downloadEpResponse.status >= 200 && downloadEpResponse.status < 300) {
                finalDownloadUrl = downloadEpResponse.data?.download_url || downloadEpResponse.headers?.location || 'URL found but format unknown';
            } else if (downloadEpResponse.status === 401 || downloadEpResponse.status === 403) {
                finalDownloadUrl = 'Permission Denied (Likely non-CC0 license)';
                console.error(`[SINGLE DOWNLOAD URL] Permission denied for ID ${soundId} via /download/ endpoint.`);
            } else {
                finalDownloadUrl = `Failed to get URL via /download/ endpoint (Status: ${downloadEpResponse.status})`;
                console.error(`[SINGLE DOWNLOAD URL] Error hitting /download/ endpoint for ID ${soundId}: Status ${downloadEpResponse.status}`);
            }
        }

        console.log(`[SINGLE DOWNLOAD URL] Download URL info for "${soundResponse.data.name || 'N/A'}": ${finalDownloadUrl}`);
        res.json({
            name: soundResponse.data.name || '[No Name]',
            download_url_info: finalDownloadUrl // Renamed to reflect it might be URL or error msg
        });
    } catch (error) {
        console.error(`[SINGLE DOWNLOAD URL] Request error for ID ${req.params.id}:`, error.response?.data || error.message);
        res.status(error.response?.status || 500).json({ error: 'Error getting download URL info', details: error.response?.data || error.message });
    }
});


// Simple test endpoint
app.get('/test', (req, res) => {
    res.json({ status: 'ok', message: 'Server is working', env_test: FREESOUND_CLIENT_ID ? 'Env vars loaded' : 'Env vars NOT loaded' });
});

// Start the server
app.listen(PORT, () => {
    console.log(`\nServer running on port ${PORT}`);
    console.log(`Download folder: ${DOWNLOAD_DIR}`);
    console.log(`--- Endpoints ---`);
    console.log(`  POST /api/batch-download-sounds  (Processes JSON body: { "soundEffects": [...] })`);
    console.log(`  GET  /test                      (Basic health check)`);
    console.log(`  GET  /api/sounds/search?query=... (Original search)`);
    console.log(`  GET  /api/sounds/:id            (Original detail lookup)`);
    console.log(`  GET  /api/sounds/:id/download   (Original download URL lookup - may fail often)`);
    console.log(`---------------`);

});