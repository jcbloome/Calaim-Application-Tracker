// This file is exclusively for SERVER-SIDE Firebase Admin initialization.
import { initializeApp, getApps, App } from 'firebase-admin/app';

const adminAppId = 'firebase-admin-app-grant-role';

/**
 * Initializes and returns a Firebase Admin App instance.
 * It ensures that the app is initialized only once (singleton pattern).
 * This function is intended for use in server-side environments (e.g., Genkit flows).
 */
export function initializeAdminApp(): App {
  const existingApp = getApps().find(app => app.name === adminAppId);
  if (existingApp) {
    return existingApp;
  }

  // When deployed in a Google Cloud environment (like Cloud Functions, App Engine, or App Hosting),
  // the Admin SDK can automatically discover the service account credentials.
  // Passing an empty object to initializeApp() achieves this.
  return initializeApp({}, adminAppId);
}
