
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
  try {
    // Option 1: Automatic initialization using Application Default Credentials.
    // This is the preferred method for deployed Google Cloud environments.
    console.log('[firebase.ts] Attempting to initialize Firebase Admin SDK with ADC...');
    admin.initializeApp();
    console.log('[firebase.ts] Firebase Admin SDK initialized successfully with ADC.');

  } catch (adcError: any) {
    console.warn(`[firebase.ts] ADC initialization failed: ${adcError.message}. Falling back to service account JSON.`);
    
    // Option 2: Fallback to a service account JSON string from environment variables.
    // This is useful for local development or environments without ADC.
    const serviceAccountJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

    if (serviceAccountJson) {
      try {
        const serviceAccount = JSON.parse(serviceAccountJson);
        console.log('[firebase.ts] Attempting to initialize Firebase Admin SDK with service account JSON...');
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
        console.log('[firebase.ts] Firebase Admin SDK initialized successfully with service account.');
      } catch (jsonError: any) {
        console.error(
          '[firebase.ts] CRITICAL: Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON or initialize with it.',
          jsonError
        );
        throw new Error(`Firebase Admin SDK failed to initialize: ${jsonError.message}`);
      }
    } else {
      // If both methods fail, log a critical error.
      console.error(
        '[firebase.ts] CRITICAL: Firebase Admin SDK initialization failed. ADC failed and GOOGLE_APPLICATION_CREDENTIALS_JSON is not set.'
      );
      throw new Error(
        `Firebase Admin SDK failed to initialize. Application Default Credentials were not found, and no service account was provided.`
      );
    }
  }
} else {
  // This message is helpful for debugging to confirm that the singleton
  // pattern is working as expected during hot-reloads in development.
  console.log('[firebase.ts] Firebase Admin SDK was already initialized.');
}
