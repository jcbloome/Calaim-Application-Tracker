
'use server';

/**
 * @fileOverview This file contains the server-side Firebase Admin SDK initialization logic.
 * It ensures that the Admin SDK is initialized only once across all server-side
 * functions, flows, and components.
 *
 * It should be the VERY FIRST import in any server-side entry point (e.g., dev.ts).
 */

import * as admin from 'firebase-admin';

const FALLBACK_STORAGE_BUCKET = 'studio-2881432245-f1d94.firebasestorage.app';

function resolveStorageBucket(): string {
  try {
    const firebaseConfig = process.env.FIREBASE_CONFIG ? JSON.parse(process.env.FIREBASE_CONFIG) : {};
    const fromConfig = String(firebaseConfig?.storageBucket || '')
      .trim()
      .replace(/^gs:\/\//i, '')
      .replace(/\/+$/, '');
    if (fromConfig) return fromConfig;
  } catch {
    // ignore bad FIREBASE_CONFIG
  }
  return (
    String(process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '')
      .trim()
      .replace(/^gs:\/\//i, '')
      .replace(/\/+$/, '') || FALLBACK_STORAGE_BUCKET
  );
}

// Check if the app is already initialized to prevent errors.
if (!admin.apps.length) {
  const serviceAccountJson =
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  let initialized = false;
  const storageBucket = resolveStorageBucket();
  const projectId =
    process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'studio-2881432245-f1d94';

  if (serviceAccountJson) {
    try {
      const serviceAccount = JSON.parse(serviceAccountJson);
      const hasRequiredFields =
        !!serviceAccount?.project_id && !!serviceAccount?.client_email && !!serviceAccount?.private_key;

      if (!hasRequiredFields) {
        console.warn(
          '[firebase.ts] Service account JSON missing required fields. Falling back to ADC.'
        );
      } else {
        console.log('[firebase.ts] Initializing Firebase Admin SDK with service account JSON...');
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: serviceAccount.project_id || projectId,
          storageBucket,
        });
        initialized = true;
        console.log('[firebase.ts] ✅ Firebase Admin SDK initialized successfully with service account.');
      }
    } catch (jsonError: any) {
      console.error(
        '[firebase.ts] Failed to parse service account JSON. Falling back to ADC.',
        jsonError
      );
    }
  }

  if (!initialized) {
    try {
      console.log('[firebase.ts] Attempting to initialize Firebase Admin SDK with ADC...');
      admin.initializeApp({
        projectId,
        storageBucket,
      });
      initialized = true;
      console.log('[firebase.ts] ✅ Firebase Admin SDK initialized successfully with ADC.');
    } catch (adcError: any) {
      console.error(
        '[firebase.ts] Firebase Admin SDK initialization failed via ADC.',
        'Error:',
        adcError?.message || adcError
      );

      if (process.env.NODE_ENV === 'development') {
        try {
          admin.initializeApp({
            projectId,
            storageBucket: FALLBACK_STORAGE_BUCKET,
          });
          initialized = true;
          console.log('[firebase.ts] ✅ Firebase Admin SDK initialized in development fallback mode.');
        } catch (fallbackError: any) {
          console.error('[firebase.ts] Development fallback initialization failed.', fallbackError);
          throw new Error(
            `Firebase Admin SDK failed to initialize. Please provide valid service account JSON or ADC.`
          );
        }
      } else {
        throw new Error(
          `Firebase Admin SDK failed to initialize. Please set GOOGLE_APPLICATION_CREDENTIALS_JSON or FIREBASE_SERVICE_ACCOUNT_KEY with your service account JSON.`
        );
      }
    }
  }
} else {
  // This message is helpful for debugging to confirm that the singleton
  // pattern is working as expected during hot-reloads in development.
  console.log('[firebase.ts] Firebase Admin SDK was already initialized.');
}
