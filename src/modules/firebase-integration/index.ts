// Firebase Integration Module - Barrel Export
// Centralized access point for all Firebase functionality

// Services
export { FirebaseService } from './services/FirebaseService';
export { AuthService } from './services/AuthService';
export { FirestoreService } from './services/FirestoreService';
export { FunctionsService } from './services/FunctionsService';
export { StorageService } from './services/StorageService';

// Hooks
export { useFirebaseAuth } from './hooks/useFirebaseAuth';
export { useFirestoreCollection } from './hooks/useFirestoreCollection';
export { useFirestoreDocument } from './hooks/useFirestoreDocument';
export { useFirebaseFunctions } from './hooks/useFirebaseFunctions';
export { useFirebaseStorage } from './hooks/useFirebaseStorage';
export { useAdminPermissions } from './hooks/useAdminPermissions';

// Types
export type {
  FirebaseUser,
  FirestoreDocument,
  FirestoreCollection,
  AdminRole,
  FirebaseError,
  QueryOptions,
  DocumentOptions,
  StorageOptions,
  FunctionCallOptions
} from './types';

// Constants
export { FIREBASE_CONFIG } from './config/constants';

// Utils
export { FirebaseErrorHandler } from './utils/errorHandler';
export { FirebaseDataValidator } from './utils/dataValidator';
export { FirebaseQueryBuilder } from './utils/queryBuilder';