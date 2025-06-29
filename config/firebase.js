const admin = require('firebase-admin');

const initializeFirebase = () => {
    // Ensure Firebase is initialized only once
    if (admin.apps.length === 0) {
        try {
            let serviceAccount;
            if (process.env.ENVIRONMENT === 'production') {
                console.log('Initializing Firebase in production mode...');
                // The path to the secret in production environment
                serviceAccount = '/etc/secrets/wholesalelaunchpad-6708c-firebase-adminsdk-fbsvc-857ed9a66c.json';
            } else {
                console.log('Initializing Firebase in development mode...');
                // The path to the key file for local development
                serviceAccount = './keys/wholesalelaunchpad-6708c-firebase-adminsdk-fbsvc-857ed9a66c.json';
            }

            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            console.log('Firebase Admin SDK initialized successfully.');

        } catch (error) {
            console.error('Firebase Admin SDK initialization error:', error);
            process.exit(1);
        }
    }
};

module.exports = initializeFirebase; 