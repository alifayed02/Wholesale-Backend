const express = require('express');
const admin = require('firebase-admin');
const { google } = require('googleapis');
const path = require('path');
const axios = require('axios');

const auth = admin.auth();

const ROLE = "internal";

// Middleware to verify the Firebase ID token and check for admin role
const isAdmin = async (req, res, next) => {
    const idToken = (req.headers.authorization || '').replace('Bearer ', '');
    if (!idToken) {
        return res.status(403).json({ error: 'Permission denied. No token provided.' });
    }
    try {
        const decodedToken = await auth.verifyIdToken(idToken);
        if (decodedToken.admin === true) {
            return next();
        }
        return res.status(403).json({ error: 'Permission denied. Not an admin.' });
    } catch (error) {
        return res.status(403).json({ error: 'Permission denied. Invalid token.' });
    }
};

// Middleware to verify the Firebase ID token and check for internal role
const isInternal = async (req, res, next) => {
    const idToken = (req.headers.authorization || '').replace('Bearer ', '');
    if (!idToken) {
        return res.status(403).json({ error: 'Permission denied. No token provided.' });
    }
    try {
        const decodedToken = await auth.verifyIdToken(idToken);
        if (decodedToken.role === 'internal') {
            return next();
        }
        console.log(decodedToken);
        return res.status(403).json({ error: 'Permission denied. Not an internal user.' });
    } catch (error) {
        return res.status(403).json({ error: 'Permission denied. Invalid token.' });
    }
};


const registerRoutes = (app) => {
    // Simple health-check route
    app.get('/', (req, res) => {
        res.json({ message: 'Backend is running.' });
    });

    // Invite a user, making them an internal user
    app.post('/invite', isAdmin, async (req, res) => {
        try {
            const email = (req.body.email || '').trim().toLowerCase();
            if (!email) {
                return res.status(400).json({ error: 'Missing email' });
            }

            let user;
            try {
                user = await auth.getUserByEmail(email);
            } catch (error) {
                if (error.code === 'auth/user-not-found') {
                    user = await auth.createUser({ email });
                } else {
                    throw error; // Rethrow other errors
                }
            }

            await auth.setCustomUserClaims(user.uid, { role: ROLE });

            const apiKey = process.env.FIREBASE_API_KEY;
            if (!apiKey) {
                console.error("FIREBASE_API_KEY is not set.");
                return res.status(500).json({ error: "Server not configured properly" });
            }

            // This call sends the password reset email via Firebase's services
            await axios.post(
                `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`,
                {
                    requestType: "PASSWORD_RESET",
                    email: email,
                },
                {
                    headers: { "Content-Type": "application/json" },
                }
            );

            return res.json({ ok: true });
        } catch (error) {
            console.error('Error in /invite route:', error.response ? error.response.data : error.message);
            res.status(500).json({ error: 'An unexpected error occurred.' });
        }
    });

    // Fetch data from various Google Sheets
    app.get('/data/eoc', isInternal, async (req, res) => {
        try {
            const sheetsConfig = [
                {
                    "id": "1q1MTJZOfFpn4lrF-RKPcVbu8pTZ6RbZEjdYe7c7CP7U",
                    "name": "Form Responses 1",
                    "range": "A1:P",
                }
            ];

            const keyPath = process.env.ENVIRONMENT === 'production'
                ? '/etc/secrets/wholesalelaunchpad-881a8596ee58.json'
                : path.join(__dirname, '..', 'keys/wholesalelaunchpad-881a8596ee58.json');

            const googleAuth = new google.auth.GoogleAuth({
                keyFile: keyPath,
                scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
            });

            const sheets = google.sheets({ version: 'v4', auth: googleAuth });
            const allSheetsData = [];

            for (const config of sheetsConfig) {
                const response = await sheets.spreadsheets.values.get({
                    spreadsheetId: config.id,
                    range: `${config.name}!${config.range}`,
                });

                const values = response.data.values;
                if (!values || values.length <= 1) { // <= 1 to handle empty sheet or header-only
                    allSheetsData.push([]);
                    continue;
                }

                const dataRows = values.slice(1);

                const records = dataRows.reduce((acc, row) => {
                    const record = {
                        "Timestamp": row[0] || '',
                        "Prospect Name": row[2] || '',
                        "Offer Made": row[3] || '',
                        "Call Outcome": row[4] || '',
                        "Cash Collected": row[5] || '',
                        "Revenue Generated": row[6] || '',
                        "Closer Name": row[8] || '',
                        "Setter Name": row[9] || '',
                        "Coach Name": row[10] || '',
                        "Platform": row[11] || '',
                        "Funnel": row[12] || '',
                        "Situation": row[15] || ''
                    };

                    const allEmpty = Object.values(record).every(val => val === '' || val === null || val === undefined);
                    if (!allEmpty) {
                        acc.push(record);
                    }
                    return acc;
                }, []);

                allSheetsData.push(records);
            }

            return res.json(allSheetsData);
        } catch (error) {
            console.error("Error in /data route:", error.message);
            return res.status(500).json({ error: 'Failed to retrieve sheet data.' });
        }
    });

    app.get('/data/leads', isInternal, async (req, res) => {
        try {
            const SPREADSHEET_ID = "1w3dVgdmargwTJecY4ZhGrmFzmSClrNV4J_9QL3Exo5Q";

            // List of sheet (tab) names to extract data from
            const sheetNames = [
                "Wholesale Launchpad Typeform - Email direct - Tanner",
                "Wholesale Launchpad Typeform - Email direct - Davis ",
                "Wholesale Launchpad Typeform - DTA TT - Davis",
                "Wholesale Launchpad Typeform - DTA IG - Davis ",
                "Wholesale Launchpad Typeform - DTA YT - Davis ",
                "Wholesale Launchpad Typeform - DTA TT - Tanner ",
                "Wholesale Launchpad Typeform - DTA IG - Tanner",
                "Wholesale Launchpad Typeform - DTA YT - Tanner",
            ];

            const sources = new Map();
            sources.set("Wholesale Launchpad Typeform - Email direct - Tanner", "Email");
            sources.set("Wholesale Launchpad Typeform - Email direct - Davis ", "Email");
            sources.set("Wholesale Launchpad Typeform - DTA TT - Davis", "TikTok");
            sources.set("Wholesale Launchpad Typeform - DTA IG - Davis ", "Instagram");
            sources.set("Wholesale Launchpad Typeform - DTA YT - Davis ", "YouTube");
            sources.set("Wholesale Launchpad Typeform - DTA TT - Tanner ", "TikTok");
            sources.set("Wholesale Launchpad Typeform - DTA IG - Tanner", "Instagram");
            sources.set("Wholesale Launchpad Typeform - DTA YT - Tanner", "YouTube");

            const funnels = new Map();
            funnels.set("Wholesale Launchpad Typeform - Email direct - Tanner", "Email direct - Tanner");
            funnels.set("Wholesale Launchpad Typeform - Email direct - Davis ", "Email direct - Davis");
            funnels.set("Wholesale Launchpad Typeform - DTA TT - Davis", "DTA TT - Davis");
            funnels.set("Wholesale Launchpad Typeform - DTA IG - Davis ", "DTA IG - Davis");
            funnels.set("Wholesale Launchpad Typeform - DTA YT - Davis ", "DTA YT - Davis");
            funnels.set("Wholesale Launchpad Typeform - DTA TT - Tanner ", "DTA TT - Tanner");
            funnels.set("Wholesale Launchpad Typeform - DTA IG - Tanner", "DTA IG - Tanner");
            funnels.set("Wholesale Launchpad Typeform - DTA YT - Tanner", "DTA YT - Tanner");

            // Determine the service account key path depending on the environment
            const keyPath = process.env.ENVIRONMENT === 'production'
                ? '/etc/secrets/wholesalelaunchpad-881a8596ee58.json'
                : path.join(__dirname, '..', 'keys/wholesalelaunchpad-881a8596ee58.json');

            const googleAuth = new google.auth.GoogleAuth({
                keyFile: keyPath,
                scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
            });

            const sheets = google.sheets({ version: 'v4', auth: googleAuth });

            // Helper to safely access a cell by index, returning null if out of bounds
            const getCell = (row, index) => (row.length > index ? row[index] || null : null);

            // Process each sheet concurrently instead of sequentially
            const sheetPromises = sheetNames.map(async (sheetName) => {
                const response = await sheets.spreadsheets.values.get({
                    spreadsheetId: SPREADSHEET_ID,
                    range: `${sheetName}!A1:W`, // Fetch columns A through Z
                });

                const values = response.data.values;
                if (!values || values.length <= 1) {
                    // Return empty array if sheet is empty or contains only headers
                    return [];
                }

                // Skip header row (index 0)
                const dataRows = values.slice(1);

                return dataRows.map((row) => ({
                    "Timestamp": getCell(row, 21),
                    "First Name": getCell(row, 4),
                    "Last Name": getCell(row, 5),
                    "Phone": getCell(row, 6),
                    "Email": getCell(row, 7),
                    "Desired Income": getCell(row, 12),
                    "Current Income": getCell(row, 15),
                    "Willing to Invest": getCell(row, 18),
                    "Source": sources.get(sheetName),
                    "Funnel": funnels.get(sheetName)
                }));
            });

            // Wait for all sheet processing to finish and flatten the results
            const results = (await Promise.all(sheetPromises)).flat();

            return res.json(results);
        } catch (error) {
            console.error("Error in /data/leads route:", error.message);
            return res.status(500).json({ error: 'Failed to retrieve leads data.' });
        }
    });
};

module.exports = registerRoutes; 