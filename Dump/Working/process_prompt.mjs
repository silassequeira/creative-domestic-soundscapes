import { Ollama } from 'ollama';
import express from 'express';
import fs from 'fs/promises'; // Using promises version of fs for async/await
import path from 'path';
import { fileURLToPath } from 'url';

// Determine __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APP = express();
const PORT = 3000;
const OLLAMA_HOST = 'http://127.0.0.1:11434';
const OLLAMA = new Ollama({ host: OLLAMA_HOST });

const MODEL_NAME = 'gemma3:1b'; // Using the specified model
const PROMPT_FILE_PATH = path.join(__dirname, 'prompt.txt');

// Middleware to parse JSON request bodies (though not strictly needed for GET)
APP.use(express.json());

// --- Root endpoint ---
APP.get('/', (req, res) => {
    res.send(
        `Server is running. Visit /process-prompt to process '${path.basename(PROMPT_FILE_PATH)}' with model '${MODEL_NAME}'.`
    );
});

// --- Endpoint to list available Ollama models ---
APP.get('/models', async (req, res) => {
    try {
        const list = await OLLAMA.list();
        // Send just the model names and details for clarity
        res.json(list.models.map(m => ({ name: m.name, model: m.model, details: m.details })));
    } catch (err) {
        console.error(`Error listing models: ${err.message}`);
        res.status(500).json({
            error: 'Failed to list Ollama models.',
            details: err.message,
            suggestion: "Ensure the OLLAMA server is running and reachable.",
            ollamaHost: OLLAMA_HOST
        });
    }
});

// --- Endpoint to process the prompt from the file ---
APP.get('/process-prompt', async (req, res) => {
    console.log(`[${new Date().toISOString()}] Received request for /process-prompt`);
    console.log(`  Model: ${MODEL_NAME}`);
    console.log(`  Prompt file: ${PROMPT_FILE_PATH}`);

    let promptText;
    try {
        promptText = await fs.readFile(PROMPT_FILE_PATH, 'utf-8');
        console.log(`  Successfully read prompt from ${path.basename(PROMPT_FILE_PATH)}`);
    } catch (err) {
        console.error(`  Error reading prompt file: ${err.message}`);
        return res.status(500).json({
            error: 'Failed to read prompt file.',
            details: err.message,
            filePath: PROMPT_FILE_PATH
        });
    }

    try {
        console.log("  Sending prompt to Ollama. This may take a moment...");
        const response = await OLLAMA.chat({
            model: MODEL_NAME,
            messages: [{ role: 'user', content: promptText }],
            format: 'json', // Crucial for getting JSON output
        });

        const assistantResponseContent = response.message.content;
        console.log("  Received response from Ollama.");

        // The 'format: json' option should ensure the content is a valid JSON string.
        // We parse it to convert it into a JavaScript object for the HTTP response.
        try {
            const jsonOutput = JSON.parse(assistantResponseContent);
            console.log("  Successfully parsed Ollama response as JSON.");
            res.json(jsonOutput);
        } catch (parseError) {
            console.error("  Ollama's response was not valid JSON:", parseError.message);
            console.error("  Raw response from Ollama:", assistantResponseContent);
            res.status(500).json({
                error: "Ollama's response could not be parsed as JSON.",
                details: parseError.message,
                rawResponse: assistantResponseContent,
                model: MODEL_NAME
            });
        }
    } catch (err) {
        console.error(`  Error interacting with Ollama: ${err.message}`);
        let errorDetails = err.message;
        if (err.cause) { // The 'ollama' library might include more specific causes
            console.error("  Underlying cause:", err.cause);
            errorDetails += ` | Cause: ${err.cause}`;
        }
        res.status(500).json({
            error: 'Failed to get response from Ollama.',
            details: errorDetails,
            suggestion: "Ensure Ollama server is running, the model is pulled, and there are enough system resources.",
            model: MODEL_NAME,
            ollamaHost: OLLAMA_HOST
        });
    }
});

// --- Start the server ---
APP.listen(PORT, async () => {
    console.log(`Server is listening at http://localhost:${PORT}`);
    console.log(`Using Ollama host: ${OLLAMA_HOST}`);
    console.log(`Target model for /process-prompt: ${MODEL_NAME}`);
    console.log(`Prompt file expected at: ${PROMPT_FILE_PATH}`);

    // Check if prompt file exists on startup
    try {
        await fs.access(PROMPT_FILE_PATH);
        console.log(`Prompt file '${path.basename(PROMPT_FILE_PATH)}' found.`);
    } catch (error) {
        console.warn(`Warning: Prompt file '${path.basename(PROMPT_FILE_PATH)}' not found at '${PROMPT_FILE_PATH}'.`);
        console.warn("Please create it with your prompt, or the '/process-prompt' endpoint will fail to read it.");
        // You could create a default prompt.txt here if desired
        const defaultPromptContent = `You are a helpful assistant designed to output JSON.
Create a JSON object with a "greeting" key and a "message" key.
The output must be a single valid JSON object.`;
        try {
            await fs.writeFile(PROMPT_FILE_PATH, defaultPromptContent);
            console.log(`Created a default prompt file at '${PROMPT_FILE_PATH}'. Please review or modify it.`);
        } catch (writeError) {
            console.error(`Could not create default prompt file: ${writeError.message}`);
        }
    }

    // Verify Ollama connection and model availability on startup (optional but helpful)
    try {
        console.log("Verifying connection to Ollama and model availability...");
        const modelsInfo = await OLLAMA.list();
        const modelExists = modelsInfo.models.some(m => m.name.startsWith(MODEL_NAME)); // .startsWith to catch variants like :latest
        if (modelExists) {
            console.log(`Model '${MODEL_NAME}' appears to be available in Ollama.`);
        } else {
            const availableModels = modelsInfo.models.map(m => m.name).join(', ') || 'none';
            console.warn(`Warning: Model '${MODEL_NAME}' not found in Ollama.`);
            console.warn(`Available models: ${availableModels}`);
            console.warn(`Please ensure you have pulled the model (e.g., 'ollama pull ${MODEL_NAME}')`);
        }
    } catch (err) {
        console.error(`Failed to connect to Ollama or list models on startup: ${err.message}`);
        console.error("Please ensure the Ollama server is running and accessible at the configured host.");
    }
});