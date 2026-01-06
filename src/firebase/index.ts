'use client';

// This file is now primarily for re-exporting hooks and types for convenience.
// The core client-side initialization logic has been moved to `client-init.ts`.

export * from './provider';
export * from './client-provider';
export * from './firestore/use-collection';
export * from './firestore/use-doc';
export * from './non-blocking-updates';
export * from './non-blocking-login';
export * from './errors';
export * from './error-emitter';
export { initializeFirebase } from './client-init';
export type { FirebaseSdks } from './client-init';
