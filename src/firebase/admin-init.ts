
import { initializeApp, getApps, type App } from 'firebase-admin/app';

const adminAppId = 'firebase-admin-app-e1a2b3c4d5';

/**
 * Initializes and returns the Firebase Admin App instance, ensuring it's a singleton.
 * This version relies on Google Application Default Credentials for authentication,
 * which is the standard practice for server-side environments like App Hosting.
 */
export function initializeAdminApp(): App {
  // Check if the admin app has already been initialized to avoid re-initialization.
  const existingApp = getApps().find(app => app.name === adminAppId);
  if (existingApp) {
    return existingApp;
  }

  // Initialize the app with a unique name.
  // No credentials are passed; the SDK will automatically find them from the environment.
  return initializeApp({}, adminAppId);
}
