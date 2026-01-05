'use client';

// This file is now primarily a "barrel" file for re-exporting.
// The actual initialization logic is split into client-init.ts and client-provider.tsx.

export * from './provider';
export * from './client-provider';
export * from './firestore/use-collection';
export * from './firestore/use-doc';
export * from './auth/use-user';
export * from './errors';
export * from './error-emitter';
export * from './non-blocking-updates';
export * from './non-blocking-login';
