
/**
 * @fileOverview This is the main server-side entry point for Genkit development.
 * It is responsible for importing all flows and tools to make them available
 * to the Genkit development UI.
 *
 * CRITICAL: The very first import MUST be the Firebase Admin initializer to
 * ensure all other modules have access to a properly configured Firebase instance.
 */

// DO NOT MOVE THIS IMPORT. It must be the first line to initialize Firebase Admin.
import '@/ai/firebase';

// Import all flows and tools after Firebase has been initialized.
import '@/ai/flows/ai-prioritize-form-fields.ts';
import '@/ai/flows/ai-suggest-next-steps.ts';
import '@/ai/flows/manage-staff.ts';
import '@/ai/flows/manage-notifications.ts';
import '@/ai/flows/make-webhook.ts';
import '@/ai/flows/manage-reminders.ts';
import '@/ai/flows/send-to-make-flow.ts';
