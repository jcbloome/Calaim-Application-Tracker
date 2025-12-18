
import { config } from 'dotenv';
config();

import * as admin from 'firebase-admin';
if (!admin.apps.length) {
  admin.initializeApp();
}

import '@/ai/flows/ai-prioritize-form-fields.ts';
import '@/ai/flows/ai-suggest-next-steps.ts';
import '@/ai/flows/send-to-make-flow.ts';
import '@/ai/flows/manage-staff.ts';
import '@/ai/flows/manage-notifications.ts';
