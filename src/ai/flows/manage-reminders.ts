
'use server';
/**
 * @fileOverview A server action for sending reminder emails.
 * This function receives a list of applications from the client and sends emails.
 */
// DO NOT MOVE THIS IMPORT. It must be the first line to initialize Firebase Admin.
import '@/ai/firebase';

import { sendReminderEmail } from '@/app/actions/send-email';
import type { Application, FormStatus } from '@/lib/definitions';
import * as admin from 'firebase-admin';
import 'firebase-admin/auth'; // <--- CRITICAL FIX: Import the auth module

interface SendRemindersOutput {
    success: boolean;
    sentCount: number;
    message: string;
    sentApplicationIds?: string[];
}

/**
 * Iterates over a list of applications and sends reminder emails.
 * This is a standard Next.js Server Action, not a Genkit flow.
 */
export async function sendReminderEmails(applications: Application[]): Promise<SendRemindersOutput> {
    let sentCount = 0;
    const sentApplicationIds: string[] = [];
    try {
        const firestore = admin.firestore();

        for (const app of applications) {
            // Find pending forms or uploads
            const incompleteItems = app.forms
                ?.filter((item: FormStatus) => item.status === 'Pending')
                .map((item: FormStatus) => item.name);
            
            // Fetch user data to get email and name
            let userEmail: string | undefined;
            let userName: string = 'there';

            if (app.userId) {
                try {
                    const userDoc = await firestore.collection('users').doc(app.userId).get();
                    if (userDoc.exists) {
                        const userData = userDoc.data();
                        userEmail = userData?.email;
                        userName = userData?.displayName || userData?.firstName || 'there';
                    } else {
                        // Fallback to auth user if firestore doc is missing
                        const authUser = await admin.auth().getUser(app.userId);
                        userEmail = authUser.email;
                        userName = authUser.displayName || 'there';
                    }
                } catch (userFetchError) {
                    console.error(`[sendReminderEmails] Could not fetch user data for userId ${app.userId}:`, userFetchError);
                    // As a last resort, try the referrerEmail field on the app itself
                    userEmail = app.referrerEmail;
                    userName = app.referrerName || 'there';
                }
            } else if(app.referrerEmail) {
                 userEmail = app.referrerEmail;
                 userName = app.referrerName || 'there';
            }
            
            // Only send if there are incomplete items and an email to send to
            if (incompleteItems && incompleteItems.length > 0 && userEmail) {
                await sendReminderEmail({
                    to: userEmail,
                    subject: `Reminder: Action needed for CalAIM application for ${app.memberFirstName} ${app.memberLastName}`,
                    referrerName: userName,
                    memberName: `${app.memberFirstName} ${app.memberLastName}`,
                    applicationId: app.id,
                    incompleteItems,
                });
                sentCount++;
                if (app.id) {
                    sentApplicationIds.push(app.id);
                }
            }
        }
        
        return { success: true, sentCount, sentApplicationIds, message: `Sent ${sentCount} reminder emails.` };

    } catch (error: any) {
        console.error('[sendReminderEmails] Error:', error);
        return { success: false, sentCount: 0, sentApplicationIds, message: `Failed to send reminders: ${error.message}` };
    }
}
