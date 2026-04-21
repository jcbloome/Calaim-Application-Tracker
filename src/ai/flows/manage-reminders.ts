
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

const INTERNAL_REMINDER_EXCLUSIONS = new Set([
  'eligibility screenshot',
  'eligibility check',
]);

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
                ?.filter((item: FormStatus) => {
                    if (item.status !== 'Pending') return false;
                    const name = String(item.name || '').trim().toLowerCase();
                    if (!name) return false;
                    if (name === 'cs member summary' || name === 'cs summary') return false;
                    if (INTERNAL_REMINDER_EXCLUSIONS.has(name)) return false;
                    return true;
                })
                .map((item: FormStatus) => item.name);
            
            // Primary contact should receive member-facing reminders.
            const primaryContactEmail = String(app.bestContactEmail || '').trim();
            const primaryContactName = String(`${app.bestContactFirstName || ''} ${app.bestContactLastName || ''}`).trim() || 'there';
            const normalizedStatus = String((app as any)?.status || '').trim().toLowerCase();
            const normalizedIntakeType = String((app as any)?.intakeType || '').trim().toLowerCase();
            const isStaffDraftPathway = Boolean((app as any)?.createdByAdmin) && (
                normalizedStatus === 'draft' ||
                normalizedIntakeType === 'kaiser_auth_received_via_ils'
            );
            let userEmail: string | undefined = primaryContactEmail || undefined;
            let userName: string = primaryContactName;

            if (!userEmail && !isStaffDraftPathway && app.userId) {
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
            } else if(!userEmail && !isStaffDraftPathway && app.referrerEmail) {
                 userEmail = app.referrerEmail;
                 userName = app.referrerName || 'there';
            }

            const recipients: Array<{ email: string; name: string }> = [];
            if (userEmail) {
                recipients.push({ email: userEmail, name: userName });
            }
            const shouldAlsoNotifySubmitter = Boolean((app as any)?.submitterAlsoReceivesDocRequests) && !isStaffDraftPathway;
            const submitterEmail = String((app as any)?.referrerEmail || '').trim();
            const submitterName = String((app as any)?.referrerName || '').trim() || 'there';
            if (shouldAlsoNotifySubmitter && submitterEmail) {
                recipients.push({ email: submitterEmail, name: submitterName });
            }

            const dedupedRecipients = Array.from(
                new Map(
                    recipients
                        .filter((entry) => Boolean(String(entry.email || '').trim()))
                        .map((entry) => [String(entry.email || '').trim().toLowerCase(), entry])
                ).values()
            );

            // Only send if there are incomplete items and recipient emails.
            if (incompleteItems && incompleteItems.length > 0 && dedupedRecipients.length > 0) {
                for (const recipient of dedupedRecipients) {
                    await sendReminderEmail({
                        to: recipient.email,
                        subject: `Reminder: Action needed for CalAIM application for ${app.memberFirstName} ${app.memberLastName}`,
                        referrerName: recipient.name,
                        memberName: `${app.memberFirstName} ${app.memberLastName}`,
                        applicationId: app.id,
                        incompleteItems,
                    });
                    sentCount++;
                }
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
