import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  try {
    console.log('🔧 Firebase Admin initialization starting...');
    console.log('🔧 Environment:', process.env.NODE_ENV);
    
    let credential;
    
    // Try to get credentials from environment variable first
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
      try {
        const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
        credential = admin.credential.cert(serviceAccount);
        console.log('🔧 Using credentials from GOOGLE_APPLICATION_CREDENTIALS_JSON');
      } catch (parseError) {
        console.warn('⚠️ Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON:', parseError);
      }
    }
    
    // Fallback to default credentials (works in Firebase hosting)
    if (!credential) {
      console.log('🔧 Using default application credentials');
      credential = admin.credential.applicationDefault();
    }
    
    const firebaseConfig = process.env.FIREBASE_CONFIG ? JSON.parse(process.env.FIREBASE_CONFIG) : {};
    const projectId = firebaseConfig.projectId || process.env.FIREBASE_PROJECT_ID || 'studio-2881432245-f1d94';
    
    console.log('🔧 Project ID:', projectId);
    
    admin.initializeApp({
      credential: credential,
      projectId: projectId,
      databaseURL: firebaseConfig.databaseURL || process.env.FIREBASE_DATABASE_URL,
      storageBucket: firebaseConfig.storageBucket || process.env.FIREBASE_STORAGE_BUCKET || 'studio-2881432245-f1d94.firebasestorage.app',
    });
    
    console.log('✅ Firebase Admin initialized successfully');
    
  } catch (error) {
    console.error('❌ Firebase Admin initialization error:', error);
    
    // For development, create a minimal app without credentials for basic functionality
    if (process.env.NODE_ENV === 'development') {
      console.log('🔧 Development mode: Creating app without credentials for basic functionality');
      try {
        admin.initializeApp({
          projectId: 'studio-2881432245-f1d94',
          storageBucket: 'studio-2881432245-f1d94.firebasestorage.app',
        });
        console.log('✅ Firebase Admin initialized in development mode (limited functionality)');
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