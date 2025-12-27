
'use server';
/**
 * @fileOverview Server-side flows for managing and sending reminder emails.
 * - sendReminderEmails: A flow to find incomplete applications and send reminder emails.
 */
import { ai } from '@/ai/genkit';
import { z } from 'zod';
import * as admin from 'firebase-admin';
import { sendReminderEmail } from '@/app/actions/send-email';

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

        try {
            const applicationsSnapshot = await firestore.collectionGroup('applications')
                .where('status', 'in', ['In Progress', 'Requires Revision'])
                .get();
            
            let sentCount = 0;

            for (const doc of applicationsSnapshot.docs) {
                const app = doc.data() as any;
                
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
