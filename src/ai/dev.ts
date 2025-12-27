
'use server';
import { config } from 'dotenv';
config();

import * as admin from 'firebase-admin';
import { onLog } from 'firebase-functions/logger';

// In a secure server-side environment like App Hosting,
// the Admin SDK can automatically detect credentials.
// For local development, we might need to be more explicit.
if (!admin.apps.length) {
  try {
    // This will use Application Default Credentials (ADC).
    // In a local dev environment, this is often tied to `gcloud auth application-default login`.
    // The error suggests these credentials might be stale.
    console.log("Initializing Firebase Admin SDK...");
    admin.initializeApp();
    console.log("Firebase Admin SDK initialized successfully.");
  } catch (e: any) {
    console.error("Firebase Admin SDK initialization failed:", e);
    
    // As a fallback for local dev, re-running the auth login programmatically can sometimes help,
    // though this is an advanced-use case and depends on the environment setup.
    // For now, we will log the error and let it fail to make the issue visible.
    // The primary solution for a developer seeing this would be to run
    // `gcloud auth application-default login` in their terminal.
  }
} else {
    console.log("Firebase Admin SDK already initialized.");
}


// Import flows after initialization
import '@/ai/flows/ai-prioritize-form-fields.ts';
import '@/ai/flows/ai-suggest-next-steps.ts';
import '@/ai/flows/manage-staff.ts';
import '@/ai/flows/manage-notifications.ts';
import '@/ai/flows/make-webhook.ts';
import '@/ai/flows/manage-reminders.ts';
import '@/ai/flows/send-to-make-flow.ts';
