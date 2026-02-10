import * as admin from 'firebase-admin';
import fs from 'fs';

const isProduction = process.env.NODE_ENV === 'production';
const logInfo = (...args: unknown[]) => {
  if (!isProduction) console.log(...args);
};
const logWarn = (...args: unknown[]) => {
  if (!isProduction) console.warn(...args);
};

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  try {
    logInfo('🔧 Firebase Admin initialization starting...');
    logInfo('🔧 Environment:', process.env.NODE_ENV);
    
    let credential;
    
    // Try to get credentials from environment variable first
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
      try {
        const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
        credential = admin.credential.cert(serviceAccount);
        logInfo('🔧 Using credentials from GOOGLE_APPLICATION_CREDENTIALS_JSON');
      } catch (parseError) {
        logWarn('⚠️ Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON:', parseError);
      }
    }

    if (!credential && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      try {
        const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
        const serviceAccountJson = fs.readFileSync(serviceAccountPath, 'utf8');
        const serviceAccount = JSON.parse(serviceAccountJson);
        credential = admin.credential.cert(serviceAccount);
        logInfo('🔧 Using credentials from GOOGLE_APPLICATION_CREDENTIALS file');
      } catch (fileError) {
        logWarn('⚠️ Failed to read GOOGLE_APPLICATION_CREDENTIALS file:', fileError);
      }
    }
    
    // Fallback to default credentials (works in Firebase hosting)
    if (!credential) {
      logInfo('🔧 Using default application credentials');
      credential = admin.credential.applicationDefault();
    }
    
    const firebaseConfig = process.env.FIREBASE_CONFIG ? JSON.parse(process.env.FIREBASE_CONFIG) : {};
    const projectId = firebaseConfig.projectId || process.env.FIREBASE_PROJECT_ID || 'studio-2881432245-f1d94';
    
    logInfo('🔧 Project ID:', projectId);
    
    admin.initializeApp({
      credential: credential,
      projectId: projectId,
      databaseURL: firebaseConfig.databaseURL || process.env.FIREBASE_DATABASE_URL,
      storageBucket: firebaseConfig.storageBucket || process.env.FIREBASE_STORAGE_BUCKET || 'studio-2881432245-f1d94.firebasestorage.app',
    });
    
    logInfo('✅ Firebase Admin initialized successfully');
    
  } catch (error) {
    console.error('❌ Firebase Admin initialization error:', error);
    
    // For development, create a minimal app without credentials for basic functionality
    if (process.env.NODE_ENV === 'development') {
      logInfo('🔧 Development mode: Creating app without credentials for basic functionality');
      try {
        admin.initializeApp({
          projectId: 'studio-2881432245-f1d94',
          storageBucket: 'studio-2881432245-f1d94.firebasestorage.app',
        });
        logInfo('✅ Firebase Admin initialized in development mode (limited functionality)');
      } catch (fallbackError) {
        console.error('❌ Firebase Admin fallback initialization failed:', fallbackError);
      }
    }
  }
}

// Export the admin database instance
export const adminDb = admin.firestore();
export const adminAuth = admin.auth();
export const adminStorage = admin.storage();

// Export admin for direct use if needed
export default admin;