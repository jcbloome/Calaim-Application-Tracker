// This file is exclusively for client-side Firebase initialization.
// It should ONLY be imported by top-level client components (e.g., FirebaseClientProvider).
import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, browserLocalPersistence } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

export interface FirebaseSdks {
  firebaseApp: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
}

let firebaseSdks: FirebaseSdks | null = null;

function getSdks(firebaseApp: FirebaseApp): FirebaseSdks {
  const auth = getAuth(firebaseApp);
  // Set persistence at the time of initialization
  auth.setPersistence(browserLocalPersistence);
  
  return {
    firebaseApp,
    auth: auth,
    firestore: getFirestore(firebaseApp),
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
