// IMPORTANT: This file should not have 'use client' on its own.
// It is a shared utility for server-side code (Genkit flows).

import { initializeApp, getApps, App } from 'firebase-admin/app';

// This is a guard to prevent re-initializing the app on hot reloads.
export function initializeAdminApp(): App {
  const adminApp = getApps().find(app => app.name === 'firebase-admin');
  if (adminApp) {
    return adminApp;
  }

  // In a managed server environment (like Cloud Run, Cloud Functions, or Firebase App Hosting),
  // calling initializeApp() with no arguments allows the SDK to automatically
  // find the service account credentials from the environment.
  // This is the most secure and reliable method.
  return initializeApp({}, 'firebase-admin');
}
