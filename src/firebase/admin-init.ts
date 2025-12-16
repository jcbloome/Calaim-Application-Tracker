
import { initializeApp, getApps, App, cert, ServiceAccount } from 'firebase-admin/app';

// This is a guard to prevent re-initializing the app on hot reloads.
export function initializeAdminApp(): App {
  const adminApp = getApps().find(app => app.name === 'firebase-admin');
  if (adminApp) {
    return adminApp;
  }
  
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY as string);
    return initializeApp({
      credential: cert(serviceAccount)
    }, 'firebase-admin');

  } catch (error: any) {
    console.error("Firebase Admin SDK initialization failed:", error);
    // If parsing fails, fall back to default credentials for environments
    // where it might be configured automatically.
     return initializeApp({}, 'firebase-admin');
  }
}
