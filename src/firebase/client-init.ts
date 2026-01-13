// This file is exclusively for client-side Firebase initialization.
// It should ONLY be imported by top-level client components (e.g., FirebaseClientProvider).
import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, browserLocalPersistence } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';

export interface FirebaseSdks {
  firebaseApp: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
  storage: FirebaseStorage;
}

let firebaseSdks: FirebaseSdks | null = null;

function getSdks(firebaseApp: FirebaseApp): FirebaseSdks {
  const auth = getAuth(firebaseApp);
  // Persistence is now handled at login time to ensure it completes before sign-in.
  const storage = getStorage(firebaseApp, "gs://studio-2881432245-f1d94.appspot.com");
  console.log('🔧 [FIREBASE] Storage initialized with bucket:', storage.app.options.storageBucket);
  return {
    firebaseApp,
    auth: auth,
    firestore: getFirestore(firebaseApp),
    storage: storage,
  };
}

export function initializeFirebase(): FirebaseSdks {
  // If the instance already exists, return it.
  if (firebaseSdks) {
    return firebaseSdks;
  }
  
  // If no apps are initialized, initialize a new one.
  if (!getApps().length) {
    const firebaseApp = initializeApp(firebaseConfig);
    firebaseSdks = getSdks(firebaseApp);
    return firebaseSdks;
  }

  // If an app is already initialized (e.g., in another tab), get it and create the SDKs.
  const firebaseApp = getApp();
  firebaseSdks = getSdks(firebaseApp);
  return firebaseSdks;
}
