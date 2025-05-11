import { Ollama } from 'ollama';
import express from 'express';
import cookieSession from 'cookie-session';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'node:crypto';

// Configuration constants
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3000;
const MAX_HISTORY_MESSAGES = 10;

// Initialize Express application with middleware chain
const createApp = () => {
    const app = express();
    return app
        .use(express.static(path.join(__dirname, 'public')))
        .use(cookieSession({
            name: 'session',
            keys: Array(3).fill().map(() => randomBytes(32).toString('hex')),
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        }))
        .use(ensureClientId);
};

// Client ID middleware
const ensureClientId = (req, res, next) => {
    if (!req.session.clientId) {
        req.session.clientId = randomBytes(16).toString('hex');
    }
    next();
};

// Initialize Ollama client
const createOllamaClient = () => new Ollama({
    host: 'http://127.0.0.1:11434',
    timeout: 60000
});

// History management with pure functions
const addToHistory = (history, role, content, clientId) =>
    [...history, { role, content, client: clientId }];

const getClientHistory = (history, clientId) =>
    history.filter(item => item.client === clientId);

const trimHistory = (history, clientId) => {
    const clientHistory = getClientHistory(history, clientId);

    if (clientHistory.length <= MAX_HISTORY_MESSAGES) return history;

    const otherClientsHistory = history.filter(item => item.client !== clientId);
    const trimmedClientHistory = clientHistory.slice(-MAX_HISTORY_MESSAGES);

    return [...otherClientsHistory, ...trimmedClientHistory];
};

const cleanClientHistory = (history, clientId) =>
    history.filter(item => item.client !== clientId);

// File management with composition
const generateFilePath = (num = '') => path.join(__dirname, `output${num}.txt`);

const fileExists = async (filePath) => {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
};

const findAvailableFilename = async (num = '') => {
    const filePath = generateFilePath(num);
    const exists = await fileExists(filePath);

    return exists
        ? findAvailableFilename(num === '' ? '1' : String(Number(num) + 1))
        : filePath;
};

const saveResponseToFile = async (content) => {
    try {
        const filePath = await findAvailableFilename();
        await fs.writeFile(filePath, content);
        return { success: true, filePath };
    } catch {
        return { success: false };
    }
};

// Model configuration based on message complexity
const getModelOptions = (msg) => {
    const isComplexOperation =
        msg.toLowerCase().includes('bedroom') ||
        msg.toLowerCase().includes('json') ||
        msg.length > 500;

    return {
        temperature: isComplexOperation ? 0.2 : 0.7,
        num_predict: isComplexOperation ? 2048 : 1024,
        top_k: 40,
        num_ctx: 2048
    };
};

// Response handling with functional composition
const handleChatResponse = (history, clientId) => async (response) => {
    const updatedHistory = addToHistory(
        history,
        response.message.role,
        response.message.content,
        clientId
    );

    const { success, filePath } = await saveResponseToFile(response.message.content);

    return {
        updatedHistory,
        response: {
            ...response,
            ...(success && { savedToFile: filePath })
        }
    };
};

// Main application setup
const main = () => {
    const app = createApp();
    const ollama = createOllamaClient();
    let history = [];

    // Route handlers
    app.get('/', (_, res) => {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    app.get('/history', (req, res) => {
        res.send(getClientHistory(history, req.session.clientId));
    });

    app.get('/clean', (req, res) => {
        history = cleanClientHistory(history, req.session.clientId);
        res.send('History cleared');
    });

    app.get('/destroy', (req, res) => {
        history = cleanClientHistory(history, req.session.clientId);
        req.session.clientId = null;
        res.send('Session cleared. Please refresh the page to start a new session.');
    });

    app.get('/sessionId', (req, res) => {
        res.send(req.session.clientId);
    });

    app.get('/models', async (_, res) => {
        try {
            const list = await ollama.list();
            const models = list.models.filter(m => m.model).map(m => m.model);
            res.send(`The available models are: ${models.join(', ')}`);
        } catch (err) {
            res.status(500).send(`Error: ${err.message}`);
        }
    });

    app.get('/user/:model/:msg', async (req, res) => {
        const { model, msg } = req.params;
        const { clientId } = req.session;

        // Update and trim history
        history = addToHistory(history, 'user', msg, clientId);
        history = trimHistory(history, clientId);

        const clientHistory = getClientHistory(history, clientId);
        const modelOptions = getModelOptions(msg);

        // Chat request with error handling and fallback
        try {
            const response = await ollama.chat({
                model,
                messages: clientHistory,
                options: modelOptions
            });

            const { updatedHistory, response: processedResponse } =
                await handleChatResponse(history, clientId)(response);

            history = updatedHistory;
            res.send(processedResponse);
        } catch (err) {
            // Try fallback with simplified context
            if (clientHistory.length > 2) {
                try {
                    const simplifiedHistory = [{ role: 'user', content: msg }];
                    const response = await ollama.chat({
                        model,
                        messages: simplifiedHistory,
                        options: { ...modelOptions, temperature: 0.5 }
                    });

                    const { updatedHistory, response: processedResponse } =
                        await handleChatResponse(history, clientId)(response);

                    history = updatedHistory;
                    res.send({ ...processedResponse, note: "Used fallback with simplified context" });
                } catch (fallbackErr) {
                    res.status(500).send(`Error: ${fallbackErr.message}`);
                }
            } else {
                res.status(500).send(`Error: ${err.message}`);
            }
        }
    });

    // Start server
    app.listen(PORT, () => {
        console.log(`Server is listening at http://localhost:${PORT}`);
    });
};

// Launch application
main();