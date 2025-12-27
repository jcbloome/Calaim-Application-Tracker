
'use server';
/**
 * @fileOverview This file is being deprecated.
 * The server-side flows for managing notifications are no longer used for UI actions.
 * Getting and setting notification recipients is now handled directly on the client
 * in the /admin/super page, secured by Firestore security rules.
 * The `sendReminderEmails` flow remains for triggered jobs.
 */
import { ai } from '@/ai/genkit';
import { z } from 'zod';
import * as admin from 'firebase-admin';

// DEPRECATED FLOWS - No longer used by the UI
const GetRecipientsInputSchema = z.object({});
const GetRecipientsOutputSchema = z.object({ uids: z.array(z.string()) });

const UpdateRecipientsInputSchema = z.object({ uids: z.array(z.string()) });
const UpdateRecipientsOutputSchema = z.object({ success: z.boolean(), message: z.string() });
