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
                    "id": "12l90jOw8SYMeeeqn6qt9xXD1VxQW7rhA6-9jCwtT5MM",
                    "name": "Form Responses 1",
                    "range": "A1:N",
                }
            ];

            const keyPath = process.env.ENVIRONMENT === 'production'
                ? '/etc/secrets/scalingsociety-44f37d53dfcf.json'
                : path.join(__dirname, '..', 'keys/scalingsociety-44f37d53dfcf.json');

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

                const headers = values[0];
                const records = values.slice(1).map(row => {
                    const record = {};
                    headers.forEach((header, index) => {
                        record[header] = row[index] || null; // Handle empty cells
                    });
                    return record;
                });
                allSheetsData.push(records);
            }

            return res.json(allSheetsData);
        } catch (error) {
            console.error("Error in /data route:", error.message);
            return res.status(500).json({ error: 'Failed to retrieve sheet data.' });
        }
    });

    app.get('/data/leads', async (req, res) => {
        try {
            const SPREADSHEET_ID = "1sDrTpTj_PcjsEFERJDwqdfn4dq4-Edbivr2B-1esqto";

            // List of sheet (tab) names to extract data from
            const sheetNames = [
                "Urban Unity inner circle application form (Eban - TikTok FT) ",
                "Urban Unity inner circle application form (Eban - IG FT) ",
                "Urban Unity inner circle application form (Eban - YT FT) ",
                "Urban Unity inner circle application form (Eban - YT direct) ",
                "Urban Unity inner circle application form (Trey - YT FT)",
                "Urban Unity inner circle application form (Trey - YT direct)",
                "Urban Unity inner circle application form (Trey - IG FT)",
                "Urban Unity inner circle application form (Marsh - TikTok FT) ",
                "Urban Unity inner circle application form (Marsh - IG FT)",
                "Urban Unity inner circle application form (cwm)",
                "Urban Unity inner circle application form (Marsh - emails)",
                "Urban Unity inner circle application form (Marsh - YT Direct)",
                "Urban Unity inner circle application form (Marsh - YT FT)",
            ];

            const sources = new Map();
            sources.set("Urban Unity inner circle application form (Eban - TikTok FT) ", "TikTok");
            sources.set("Urban Unity inner circle application form (Eban - IG FT) ", "Instagram");
            sources.set("Urban Unity inner circle application form (Eban - YT FT) ", "YouTube");
            sources.set("Urban Unity inner circle application form (Eban - YT direct) ", "YouTube");
            sources.set("Urban Unity inner circle application form (Trey - YT FT)", "YouTube");
            sources.set("Urban Unity inner circle application form (Trey - YT direct)", "YouTube");
            sources.set("Urban Unity inner circle application form (Trey - IG FT)", "Instagram");
            sources.set("Urban Unity inner circle application form (Marsh - TikTok FT) ", "TikTok")
            sources.set("Urban Unity inner circle application form (Marsh - IG FT)", "Instagram");
            sources.set("Urban Unity inner circle application form (cwm)", "CWM");
            sources.set("Urban Unity inner circle application form (Marsh - emails)", "Email");
            sources.set("Urban Unity inner circle application form (Marsh - YT Direct)", "YouTube");
            sources.set("Urban Unity inner circle application form (Marsh - YT FT)", "YouTube");

            const coach = new Map();
            coach.set("Urban Unity inner circle application form (Eban - TikTok FT) ", "Eban");
            coach.set("Urban Unity inner circle application form (Eban - IG FT) ", "Eban");
            coach.set("Urban Unity inner circle application form (Eban - YT FT) ", "Eban");
            coach.set("Urban Unity inner circle application form (Eban - YT direct) ", "Eban");
            coach.set("Urban Unity inner circle application form (Trey - YT FT)", "Trey");
            coach.set("Urban Unity inner circle application form (Trey - YT direct)", "Trey");
            coach.set("Urban Unity inner circle application form (Trey - IG FT)", "Trey");
            coach.set("Urban Unity inner circle application form (Marsh - TikTok FT) ", "Marshall")
            coach.set("Urban Unity inner circle application form (Marsh - IG FT)", "Marshall");
            coach.set("Urban Unity inner circle application form (cwm)", "Marshall");
            coach.set("Urban Unity inner circle application form (Marsh - emails)", "Marshall");
            coach.set("Urban Unity inner circle application form (Marsh - YT Direct)", "Marshall");
            coach.set("Urban Unity inner circle application form (Marsh - YT FT)", "Marshall");

            // Determine the service account key path depending on the environment
            const keyPath = process.env.ENVIRONMENT === 'production'
                ? '/etc/secrets/scalingsociety-44f37d53dfcf.json'
                : path.join(__dirname, '..', 'keys/scalingsociety-44f37d53dfcf.json');

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
                    range: `${sheetName}!A1:Z`, // Fetch columns A through Z
                });

                const values = response.data.values;
                if (!values || values.length <= 1) {
                    // Return empty array if sheet is empty or contains only headers
                    return [];
                }

                // Skip header row (index 0)
                const dataRows = values.slice(1);

                return dataRows.map((row) => ({
                    "Timestamp": getCell(row, 24),
                    "First Name": getCell(row, 20),
                    "Last Name": getCell(row, 21),
                    "Phone": getCell(row, 22),
                    "Email": getCell(row, 23),
                    "Income Replace": getCell(row, 12),  // Column M (0-indexed 12)
                    "Confidence": getCell(row, 14),      // Column O (0-indexed 14)
                    "Source": sources.get(sheetName),
                    "Coach": coach.get(sheetName),
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