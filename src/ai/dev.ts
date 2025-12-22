
'use server';
import { config } from 'dotenv';
config();

import * as admin from 'firebase-admin';
import serviceAccount from '../../service-account_key.json';

// Initialize Firebase Admin SDK only if it hasn't been already.
// This single initialization is used by all server-side functions.
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
  });
}

// Import flows after initialization
import '@/ai/flows/ai-prioritize-form-fields.ts';
import '@/ai/flows/ai-suggest-next-steps.ts';
import '@/ai/flows/send-to-make-flow.ts';
import '@/ai/flows/manage-staff.ts';
import '@/ai/flows/manage-notifications.ts';
import '@/ai/flows/make-webhook.ts';
import '@/ai/flows/manage-reminders.ts';

    