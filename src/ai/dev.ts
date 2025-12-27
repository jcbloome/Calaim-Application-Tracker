
'use server';
import { config } from 'dotenv';
config();

import * as admin from 'firebase-admin';

// In a secure server-side environment like App Hosting,
// the Admin SDK can automatically detect credentials.
if (!admin.apps.length) {
  admin.initializeApp();
}

// Import flows after initialization
import '@/ai/flows/ai-prioritize-form-fields.ts';
import '@/ai/flows/ai-suggest-next-steps.ts';
import '@/ai/flows/manage-staff.ts';
import '@/ai/flows/manage-notifications.ts';
import '@/ai/flows/make-webhook.ts';
import '@/ai/flows/manage-reminders.ts';
import '@/ai/flows/send-to-make-flow.ts';

    
