require('dotenv').config();
const express = require('express');
const cors = require('cors');
const initializeFirebase = require('./config/firebase');

// Initialize Firebase *before* requiring modules that depend on it.
initializeFirebase();

const registerRoutes = require('./routes');

const app = express();

const environment = process.env.ENVIRONMENT || 'development';
let frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

if (environment === 'development') {
    frontendUrl = 'http://localhost:5173';
} else if (environment === 'production') {
    // In production, the URL must be set via environment variable
    if (!process.env.FRONTEND_URL) {
        console.error("FATAL: FRONTEND_URL environment variable is not set in production.");
        process.exit(1);
    }
    frontendUrl = process.env.FRONTEND_URL;
}

app.use(cors({
    origin: frontendUrl,
}));

// Middleware to parse JSON request bodies
app.use(express.json());

// Register all application routes
registerRoutes(app);

const PORT = process.env.PORT || 8000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://0.0.0.0:${PORT}`);
}); 