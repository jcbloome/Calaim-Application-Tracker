
'use server';

/**
 * @fileOverview This file contains the server-side Firebase Admin SDK initialization logic.
 * It ensures that the Admin SDK is initialized only once across all server-side
 * functions, flows, and components.
 *
 * It should be the VERY FIRST import in any server-side entry point (e.g., dev.ts).
 */

import * as admin from 'firebase-admin';

// Check if the app is already initialized to prevent errors.
if (!admin.apps.length) {
  // Check for service account JSON first (for local development)
  const serviceAccountJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  
  if (serviceAccountJson) {
    // Use service account JSON (local development or explicit credentials)
    try {
      const serviceAccount = JSON.parse(serviceAccountJson);
      console.log('[firebase.ts] Initializing Firebase Admin SDK with service account JSON...');
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log('[firebase.ts] ✅ Firebase Admin SDK initialized successfully with service account.');
    } catch (jsonError: any) {
      console.error(
        '[firebase.ts] CRITICAL: Failed to parse service account JSON or initialize with it.',
        jsonError
      );
      throw new Error(`Firebase Admin SDK failed to initialize: ${jsonError.message}`);
    }
  } else {
    // Try Application Default Credentials (for Google Cloud environments)
    try {
      console.log('[firebase.ts] Attempting to initialize Firebase Admin SDK with ADC...');
      admin.initializeApp();
      console.log('[firebase.ts] ✅ Firebase Admin SDK initialized successfully with ADC.');
    } catch (adcError: any) {
      console.error(
        '[firebase.ts] CRITICAL: Firebase Admin SDK initialization failed.',
        'ADC failed and no service account JSON provided.',
        'Error:', adcError.message
      );
      throw new Error(
        `Firebase Admin SDK failed to initialize. Please set GOOGLE_APPLICATION_CREDENTIALS_JSON or FIREBASE_SERVICE_ACCOUNT_KEY environment variable with your service account JSON.`
      );
    }
  }
} else {
  // This message is helpful for debugging to confirm that the singleton
  // pattern is working as expected during hot-reloads in development.
  console.log('[firebase.ts] Firebase Admin SDK was already initialized.');
}
