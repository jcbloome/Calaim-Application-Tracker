
'use server';
/**
 * @fileOverview A simple server action for sending reminder emails.
 * This function receives a list of applications from the client and sends emails.
 */
import { sendReminderEmail } from '@/app/actions/send-email';
import type { Application } from '@/lib/definitions';

interface SendRemindersOutput {
    success: boolean;
    sentCount: number;
    message: string;
}

/**
 * Iterates over a list of applications and sends reminder emails.
 * This is a standard Next.js Server Action, not a Genkit flow.
 */
export async function sendReminderEmails(applications: Application[]): Promise<SendRemindersOutput> {
    let sentCount = 0;
    try {
        for (const app of applications) {
            // Find pending forms or uploads
            const incompleteItems = app.forms
                ?.filter((form: any) => form.status === 'Pending')
                .map((form: any) => form.name);
            
            // Only send if there are incomplete items and an email to send to
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
        console.error('[sendReminderEmails] Error:', error);
        return { success: false, sentCount: 0, message: `Failed to send reminders: ${error.message}` };
    }
}
