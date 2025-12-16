// IMPORTANT: This file should not have 'use client' or 'use server' on its own.
// It is a shared utility for server-side code (Genkit flows).

import { initializeApp, getApps, App, cert } from 'firebase-admin/app';

// This is a guard to prevent re-initializing the app on hot reloads.
export function initializeAdminApp(): App {
  const adminApp = getApps().find(app => app.name === 'firebase-admin');
  if (adminApp) {
    return adminApp;
  }

  try {
    // This relies on the FIREBASE_SERVICE_ACCOUNT_KEY environment variable being set.
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY as string);
    return initializeApp({
      credential: cert(serviceAccount)
    }, 'firebase-admin');

  } catch (error: any) {
    console.error("Firebase Admin SDK initialization failed:", error);
    // If parsing fails, fall back to default credentials for environments
    // where it might be configured automatically (e.g., Cloud Functions).
    return initializeApp({}, 'firebase-admin');
  }
}
