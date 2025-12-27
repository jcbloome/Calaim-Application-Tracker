
'use server';
/**
 * @fileOverview This file is being deprecated in favor of client-side logic.
 * The server-side flows for managing staff are no longer used.
 * All staff management actions are now handled directly on the client
 * in the /admin/super page, secured by Firestore security rules.
 */
import { ai } from '@/ai/genkit';
import { z } from 'zod';
import * as admin from 'firebase-admin';

// All flows below are deprecated and no longer called by the application.
// They are kept here for reference but will be removed in a future cleanup.
