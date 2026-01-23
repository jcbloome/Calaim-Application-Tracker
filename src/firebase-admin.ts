import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  try {
    // In Firebase App Hosting, credentials are automatically provided
    // The FIREBASE_CONFIG environment variable contains the project configuration
    const firebaseConfig = process.env.FIREBASE_CONFIG ? JSON.parse(process.env.FIREBASE_CONFIG) : {};
    
    // Log initialization details for debugging
    console.log('🔧 Firebase Admin initialization starting...');
    console.log('🔧 Project ID:', firebaseConfig.projectId || process.env.FIREBASE_PROJECT_ID || 'studio-2881432245-f1d94');
    console.log('🔧 Environment:', process.env.NODE_ENV);
    
    admin.initializeApp({
      projectId: firebaseConfig.projectId || process.env.FIREBASE_PROJECT_ID || 'studio-2881432245-f1d94',
      databaseURL: firebaseConfig.databaseURL || process.env.FIREBASE_DATABASE_URL,
      storageBucket: firebaseConfig.storageBucket || process.env.FIREBASE_STORAGE_BUCKET || 'studio-2881432245-f1d94.firebasestorage.app',
    });
    
    console.log('✅ Firebase Admin initialized successfully');
    
    // Test auth access
    try {
      await admin.auth().listUsers(1);
      console.log('✅ Firebase Auth access confirmed');
    } catch (authTestError) {
      console.warn('⚠️ Firebase Auth access test failed:', authTestError);
    }
    
  } catch (error) {
    console.error('❌ Firebase Admin initialization error:', error);
    // In case of initialization error, try with minimal config
    try {
      admin.initializeApp({
        projectId: 'studio-2881432245-f1d94',
        storageBucket: 'studio-2881432245-f1d94.firebasestorage.app',
      });
      console.log('✅ Firebase Admin initialized with fallback config');
    } catch (fallbackError) {
      console.error('❌ Firebase Admin fallback initialization failed:', fallbackError);
    }
  }
}

// Export the admin database instance
export const adminDb = admin.firestore();
export const adminAuth = admin.auth();
export const adminStorage = admin.storage();

// Export admin for direct use if needed
export default admin;