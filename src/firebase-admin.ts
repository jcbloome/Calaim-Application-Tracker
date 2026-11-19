import * as admin from 'firebase-admin';
import fs from 'fs';

const isProduction = process.env.NODE_ENV === 'production';
const logInfo = (...args: unknown[]) => {
  if (!isProduction) console.log(...args);
};
const logWarn = (...args: unknown[]) => {
  if (!isProduction) console.warn(...args);
};

/** Strip gs:// and trailing slashes — Admin SDK rejects protocol-prefixed bucket names. */
export function normalizeStorageBucketName(value: unknown): string {
  return String(value || '')
    .trim()
    .replace(/^gs:\/\//i, '')
    .replace(/\/+$/, '');
}

const FALLBACK_STORAGE_BUCKET = 'studio-2881432245-f1d94.firebasestorage.app';

function resolveDefaultStorageBucket(firebaseConfig: Record<string, unknown> = {}): string {
  return (
    normalizeStorageBucketName(firebaseConfig.storageBucket) ||
    normalizeStorageBucketName(process.env.FIREBASE_STORAGE_BUCKET) ||
    normalizeStorageBucketName(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET) ||
    FALLBACK_STORAGE_BUCKET
  );
}

function parseFirebaseConfigEnv(): Record<string, unknown> {
  if (!process.env.FIREBASE_CONFIG) return {};
  try {
    return JSON.parse(process.env.FIREBASE_CONFIG) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export const DEFAULT_STORAGE_BUCKET = resolveDefaultStorageBucket(parseFirebaseConfigEnv());

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  try {
    logInfo('🔧 Firebase Admin initialization starting...');
    logInfo('🔧 Environment:', process.env.NODE_ENV);
    
    let credential;
    
    // Try to get credentials from environment variable first
    const inlineServiceAccountJson =
      process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON ||
      process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (inlineServiceAccountJson) {
      try {
        const serviceAccount = JSON.parse(inlineServiceAccountJson);
        credential = admin.credential.cert(serviceAccount);
        logInfo('🔧 Using credentials from inline service account JSON env var');
      } catch (parseError) {
        logWarn('⚠️ Failed to parse inline service account JSON env var:', parseError);
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
    
    const firebaseConfig = parseFirebaseConfigEnv();
    const projectId =
      String(firebaseConfig.projectId || process.env.FIREBASE_PROJECT_ID || 'studio-2881432245-f1d94');
    const storageBucket = resolveDefaultStorageBucket(firebaseConfig);
    const databaseURL =
      String(firebaseConfig.databaseURL || process.env.FIREBASE_DATABASE_URL || '').trim() || undefined;
    
    logInfo('🔧 Project ID:', projectId);
    logInfo('🔧 Storage bucket:', storageBucket);
    
    admin.initializeApp({
      credential: credential,
      projectId: projectId,
      databaseURL,
      storageBucket,
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
          storageBucket: FALLBACK_STORAGE_BUCKET,
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

/**
 * Always pass an explicit bucket name. Other modules sometimes call
 * `admin.initializeApp()` with no storageBucket first; `bucket()` then throws
 * "Bucket name not specified or invalid" (breaks ISP download archive).
 */
export function getAdminBucket(bucketName?: string) {
  const name =
    normalizeStorageBucketName(bucketName) ||
    normalizeStorageBucketName(admin.app().options.storageBucket) ||
    DEFAULT_STORAGE_BUCKET;
  return adminStorage.bucket(name);
}

// Export admin for direct use if needed
export default admin;