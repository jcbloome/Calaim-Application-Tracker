
'use server';
/**
 * @fileOverview Server-side flows for managing and sending automated reminder emails.
 *
 * - getReminderSettings: Retrieves the reminder configuration from Firestore.
 * - updateReminderSettings: Updates the reminder configuration in Firestore.
 * - sendReminderEmails: A flow to find incomplete applications and send reminder emails.
 */
import { ai } from '@/ai/genkit';
import { z } from 'zod';
import * as admin from 'firebase-admin';
import serviceAccount from '../../../service-account_key.json';
import { sendReminderEmail } from '@/app/actions/send-email';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
  });
}

// ========== GET REMINDER SETTINGS ==========

const GetRemindersOutputSchema = z.object({
  isEnabled: z.boolean(),
  frequency: z.string(), // 'daily' | 'every_other_day'
});
export type GetRemindersOutput = z.infer<typeof GetRemindersOutputSchema>;

export async function getReminderSettings(): Promise<GetRemindersOutput> {
  return getReminderSettingsFlow();
}

const getReminderSettingsFlow = ai.defineFlow(
  {
    name: 'getReminderSettingsFlow',
    outputSchema: GetRemindersOutputSchema,
  },
  async () => {
    const firestore = admin.firestore();
    const settingsRef = firestore.collection('system_settings').doc('reminders');
    
    try {
        const docSnap = await settingsRef.get();
        if (docSnap.exists) {
            const data = docSnap.data();
            return {
                isEnabled: data?.isEnabled || false,
                frequency: data?.frequency || '',
            };
        }
        return { isEnabled: false, frequency: '' };
    } catch (error: any) {
        console.error('[getReminderSettingsFlow] Error fetching settings:', error);
        throw new Error(`Failed to fetch settings. Server error: ${error.message}`);
    }
  }
);

// ========== UPDATE REMINDER SETTINGS ==========

const UpdateRemindersInputSchema = z.object({
  isEnabled: z.boolean(),
  frequency: z.enum(['daily', 'every_other_day']),
});
export type UpdateRemindersInput = z.infer<typeof UpdateRemindersInputSchema>;

const UpdateRemindersOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});
export type UpdateRemindersOutput = z.infer<typeof UpdateRemindersOutputSchema>;


export async function updateReminderSettings(input: UpdateRemindersInput): Promise<UpdateRemindersOutput> {
  return updateReminderSettingsFlow(input);
}


const updateReminderSettingsFlow = ai.defineFlow(
  {
    name: 'updateReminderSettingsFlow',
    inputSchema: UpdateRemindersInputSchema,
    outputSchema: UpdateRemindersOutputSchema,
  },
  async ({ isEnabled, frequency }) => {
    const firestore = admin.firestore();
    const settingsRef = firestore.collection('system_settings').doc('reminders');

    try {
      await settingsRef.set({ isEnabled, frequency }, { merge: true });
      return { success: true, message: `Reminder settings updated successfully.` };
    } catch (error: any) {
      console.error('[updateReminderSettingsFlow] Error updating settings:', error);
      throw new Error(`Failed to update settings. Server error: ${error.message}`);
    }
  }
);


// ========== SEND REMINDER EMAILS FLOW ==========

const SendRemindersOutputSchema = z.object({
    success: z.boolean(),
    sentCount: z.number(),
    message: z.string(),
});
export type SendRemindersOutput = z.infer<typeof SendRemindersOutputSchema>;

export async function sendReminderEmails(): Promise<SendRemindersOutput> {
    return sendReminderEmailsFlow();
}

const sendReminderEmailsFlow = ai.defineFlow(
    {
        name: 'sendReminderEmailsFlow',
        outputSchema: SendRemindersOutputSchema,
    },
    async () => {
        const firestore = admin.firestore();
        const settings = await getReminderSettings();

        if (!settings.isEnabled) {
            return { success: true, sentCount: 0, message: 'Automated reminders are disabled.' };
        }

        try {
            const applicationsSnapshot = await firestore.collectionGroup('applications')
                .where('status', 'in', ['In Progress', 'Requires Revision'])
                .get();
            
            let sentCount = 0;
            const today = new Date().setHours(0, 0, 0, 0);

            for (const doc of applicationsSnapshot.docs) {
                const app = doc.data() as any;

                const lastUpdated = app.lastUpdated.toDate();

                if (settings.frequency === 'every_other_day') {
                    const diffTime = Math.abs(today - lastUpdated.setHours(0,0,0,0));
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    if (diffDays % 2 !== 0) {
                        continue; // Skip if not an "every other day"
                    }
                }
                
                const incompleteItems = app.forms
                    ?.filter((form: any) => form.status === 'Pending')
                    .map((form: any) => form.name);
                
                if (incompleteItems && incompleteItems.length > 0 && app.referrerEmail) {
                    await sendReminderEmail({
                        to: app.referrerEmail,
                        subject: `Reminder: Action needed for CalAIM application for ${app.memberFirstName} ${app.memberLastName}`,
                        referrerName: app.referrerName || 'there',
                        memberName: `${app.memberFirstName} ${app.memberLastName}`,
                        applicationId: app.id,
                        incompleteItems,
                    });
                    sentCount++;
                }
            }
            
            return { success: true, sentCount, message: `Sent ${sentCount} reminder emails.` };

        } catch (error: any) {
            console.error('[sendReminderEmailsFlow] Error:', error);
            throw new Error(`Failed to send reminders: ${error.message}`);
        }
    }
);

    