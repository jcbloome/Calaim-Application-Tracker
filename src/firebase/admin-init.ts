
import { initializeApp, getApps, getApp, type App, cert } from 'firebase-admin/app';

// Check if the service account key is available in environment variables
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
  : null;

const adminAppId = 'firebase-admin-app-e1a2b3c4d5';

// This function initializes the Firebase Admin SDK.
// It is intended to be used only in server-side code (e.g., Server Actions).
export function initializeAdminApp(): App {
  // getApps() returns an array of all initialized apps.
  // We check if an app with our custom ID already exists to prevent re-initialization.
  const existingApp = getApps().find(app => app.name === adminAppId);
  if (existingApp) {
    return existingApp;
  }

  // If the service account is available, use it to initialize.
  // Otherwise, fall back to default credentials (for local dev with gcloud auth).
  const credential = serviceAccount ? cert(serviceAccount) : undefined;

  return initializeApp({ credential }, adminAppId);
}
