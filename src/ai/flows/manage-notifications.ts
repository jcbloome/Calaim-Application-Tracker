
'use server';
/**
 * @fileOverview Server-side flows for managing staff email notification settings.
 *
 * - getNotificationRecipients: Retrieves the list of staff UIDs subscribed to notifications.
 * - updateNotificationRecipients: Sets the list of staff UIDs subscribed to notifications.
 */
import { config } from 'dotenv';
config();

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

// ========== GET RECIPIENTS FLOW ==========

const GetRecipientsOutputSchema = z.object({
  uids: z.array(z.string()),
});
export type GetRecipientsOutput = z.infer<typeof GetRecipientsOutputSchema>;


export async function getNotificationRecipients(): Promise<GetRecipientsOutput> {
  return getNotificationRecipientsFlow();
}


const getNotificationRecipientsFlow = ai.defineFlow(
  {
    name: 'getNotificationRecipientsFlow',
    outputSchema: GetRecipientsOutputSchema,
  },
  async () => {
    const firestore = admin.firestore();
    const settingsRef = firestore.collection('system_settings').doc('notifications');
    
    try {
        const docSnap = await settingsRef.get();
        if (docSnap.exists) {
            const data = docSnap.data();
            return { uids: data?.recipientUids || [] };
        }
        return { uids: [] };
    } catch (error: any) {
        console.error('[getNotificationRecipientsFlow] Error fetching recipients:', error);
        throw new Error(`Failed to fetch recipients. Server error: ${error.message}`);
    }
  }
);


// ========== UPDATE RECIPIENTS FLOW ==========

const UpdateRecipientsInputSchema = z.object({
  uids: z.array(z.string()),
});
export type UpdateRecipientsInput = z.infer<typeof UpdateRecipientsInputSchema>;

const UpdateRecipientsOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});
export type UpdateRecipientsOutput = z.infer<typeof UpdateRecipientsOutputSchema>;


export async function updateNotificationRecipients(input: UpdateRecipientsInput): Promise<UpdateRecipientsOutput> {
  return updateNotificationRecipientsFlow(input);
}


const updateNotificationRecipientsFlow = ai.defineFlow(
  {
    name: 'updateNotificationRecipientsFlow',
    inputSchema: UpdateRecipientsInputSchema,
    outputSchema: UpdateRecipientsOutputSchema,
  },
  async ({ uids }) => {
    const firestore = admin.firestore();
    const settingsRef = firestore.collection('system_settings').doc('notifications');

    try {
      await settingsRef.set({ recipientUids: uids }, { merge: true });
      return { success: true, message: `Notification recipients updated successfully.` };
    } catch (error: any) {
      console.error('[updateNotificationRecipientsFlow] Error updating recipients:', error);
      throw new Error(`Failed to update recipients. Server error: ${error.message}`);
    }
  }
);
