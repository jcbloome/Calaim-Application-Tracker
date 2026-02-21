
'use server';

// DO NOT MOVE THIS IMPORT. It must be the first line to initialize Firebase Admin.
import '@/ai/firebase';

import { Resend } from 'resend';
import { renderAsync } from '@react-email/render';
import ApplicationStatusEmail from '@/components/emails/ApplicationStatusEmail';
import ReminderEmail from '@/components/emails/ReminderEmail';
import StaffAssignmentEmail from '@/components/emails/StaffAssignmentEmail';
import NoteAssignmentEmail from '@/components/emails/NoteAssignmentEmail';
import { CsSummaryReminderEmail, getCsSummaryReminderEmailText } from '@/components/emails/CsSummaryReminderEmail';
import EligibilityCheckConfirmationEmail from '@/components/emails/EligibilityCheckConfirmationEmail';
import EligibilityCheckResultEmail from '@/components/emails/EligibilityCheckResultEmail';
import * as admin from 'firebase-admin';

// Note: Firebase Admin is initialized in a central file (e.g., src/ai/dev.ts).
// No need to initialize it here.

if (!process.env.RESEND_API_KEY) {
  console.warn("RESEND_API_KEY is not set. Email functionality will be disabled.");
}

let resendClient: Resend | null = null;
function getResendClient(): Resend | null {
  if (resendClient) return resendClient;
  const key = String(process.env.RESEND_API_KEY || '').trim();
  if (!key) return null;
  resendClient = new Resend(key);
  return resendClient;
}

interface ApplicationStatusPayload {
  to: string;
  subject: string;
  memberName: string;
  staffName: string;
  message: string;
  status: 'Deleted' | 'Approved' | 'Submitted' | 'Requires Revision' | 'In Progress' | 'Completed & Submitted';
}

interface ReminderPayload {
    to: string;
    subject: string;
    referrerName: string;
    memberName: string;
    applicationId: string;
    incompleteItems: string[];
    baseUrl?: string;
}

interface StaffAssignmentPayload {
    to: string;
    staffName: string;
    memberName: string;
    memberMrn: string;
    memberCounty: string;
    kaiserStatus: string;
    calaimStatus: string;
    assignedBy: string;
    nextStepsDate?: string;
}

interface NoteAssignmentPayload {
    to: string;
    staffName: string;
    memberName: string;
    noteContent: string;
    priority: 'low' | 'medium' | 'high';
    assignedBy: string;
    noteType?: string;
    source?: 'portal' | 'caspio';
    clientId2?: string;
}

interface CsSummaryReminderPayload {
    to: string;
    userName: string;
    memberName: string;
    applicationId: string;
    confirmationUrl: string;
    supportEmail: string;
}

interface EligibilityCheckConfirmationPayload {
    to: string;
    requesterName: string;
    requesterEmail: string;
    memberName: string;
    healthPlan: string;
    county: string;
    checkId: string;
}

interface EligibilityCheckResultPayload {
    to: string;
    requesterName: string;
    memberName: string;
    healthPlan: string;
    county: string;
    checkId: string;
    result: 'eligible' | 'not-eligible';
    resultMessage: string;
}

async function getBccRecipients(): Promise<string[]> {
    try {
        const firestore = admin.firestore();
        const settingsDoc = await firestore.collection('system_settings').doc('notifications').get();
        if (!settingsDoc.exists) return [];

        const recipientUids = settingsDoc.data()?.recipientUids || [];
        if (recipientUids.length === 0) return [];
        
        const userRecords = await admin.auth().getUsers(recipientUids.map((uid: string) => ({ uid })));
        
        return userRecords.users
            .map(user => user.email)
            .filter((email): email is string => !!email);

    } catch (error) {
        console.error("Error fetching BCC recipients:", error);
        return [];
    }
}


export const sendApplicationStatusEmail = async (payload: ApplicationStatusPayload) => {
    const { to, subject, memberName, staffName, message, status } = payload;

    const resend = getResendClient();
    if (!resend) throw new Error('Resend API key is not configured.');

    const bccList = await getBccRecipients();

    try {
        const emailHtml = await renderAsync(ApplicationStatusEmail({
            memberName,
            staffName,
            message,
            status,
        }));

        const { data, error } = await resend.emails.send({
            from: 'CalAIM Pathfinder <noreply@carehomefinders.com>',
            to: [to],
            bcc: bccList,
            subject: subject,
            html: emailHtml,
        });

        if (error) {
            console.error('Resend Error:', error);
            throw new Error(error.message);
        }

        return data;
    } catch (error) {
        console.error('Failed to send email:', error);
        throw error;
    }
};

export const sendReminderEmail = async (payload: ReminderPayload) => {
    const { to, subject, referrerName, memberName, applicationId, incompleteItems, baseUrl } = payload;

    const resend = getResendClient();
    if (!resend) throw new Error('Resend API key is not configured.');

    try {
        const emailHtml = await renderAsync(ReminderEmail({
            referrerName,
            memberName,
            applicationId,
            incompleteItems,
            baseUrl,
        }));

        const { data, error } = await resend.emails.send({
            from: 'CalAIM Pathfinder <noreply@carehomefinders.com>',
            to: [to],
            subject: subject,
            html: emailHtml,
        });

        if (error) {
            console.error('Resend Reminder Error:', error);
            throw new Error(error.message);
        }

        return data;
    } catch (error) {
        console.error('Failed to send reminder email:', error);
        throw error;
    }
};

export const sendStaffAssignmentEmail = async (payload: StaffAssignmentPayload) => {
    const { to, staffName, memberName, memberMrn, memberCounty, kaiserStatus, calaimStatus, assignedBy, nextStepsDate } = payload;

    const resend = getResendClient();
    if (!resend) throw new Error('Resend API key is not configured.');

    const bccList = await getBccRecipients();

    try {
        const emailHtml = await renderAsync(StaffAssignmentEmail({
            staffName,
            memberName,
            memberMrn,
            memberCounty,
            kaiserStatus,
            calaimStatus,
            assignedBy,
            nextStepsDate,
        }));

        const { data, error } = await resend.emails.send({
            from: 'CalAIM Pathfinder <noreply@carehomefinders.com>',
            to: [to],
            bcc: bccList,
            subject: `New CalAIM Member Assignment: ${memberName}`,
            html: emailHtml,
        });

        if (error) {
            console.error('Resend Staff Assignment Error:', error);
            throw new Error(error.message);
        }

        return data;
    } catch (error) {
        console.error('Failed to send staff assignment email:', error);
        throw error;
    }
};

export const sendNoteAssignmentEmail = async (payload: NoteAssignmentPayload) => {
    const resend = getResendClient();
    if (!resend) {
        console.warn("RESEND_API_KEY is not set. Skipping note assignment email.");
        return null;
    }

    try {
        const { 
            to, 
            staffName, 
            memberName, 
            noteContent, 
            priority, 
            assignedBy, 
            noteType = 'General',
            source = 'portal',
            clientId2 
        } = payload;

        console.log(`📧 Sending note assignment email to ${staffName} (${to})`);

        const emailHtml = await renderAsync(
            NoteAssignmentEmail({
                staffName,
                memberName,
                noteContent,
                priority,
                assignedBy,
                noteType,
                source,
                clientId2
            })
        );

        // BCC admin emails for tracking
        const bccList = [
            'jason@carehomefinders.com'
        ].filter(email => email !== to); // Don't BCC if it's the same as TO

        const { data, error } = await resend.emails.send({
            from: 'CalAIM Notes <noreply@carehomefinders.com>',
            to: [to],
            bcc: bccList,
            subject: `📝 New ${priority.toUpperCase()} Priority Note Assignment: ${memberName}`,
            html: emailHtml,
        });

        if (error) {
            console.error('Resend Note Assignment Error:', error);
            throw new Error(error.message);
        }

        console.log(`✅ Note assignment email sent successfully to ${to}`);
        return data;
    } catch (error) {
        console.error('Failed to send note assignment email:', error);
        throw error;
    }
};

export const sendCsSummaryReminderEmail = async (payload: CsSummaryReminderPayload) => {
    const { to, userName, memberName, applicationId, confirmationUrl, supportEmail } = payload;

    if (!process.env.RESEND_API_KEY) {
        throw new Error('Resend API key is not configured.');
    }

    try {
        const emailHtml = await renderAsync(CsSummaryReminderEmail({
            userName,
            memberName,
            applicationId,
            confirmationUrl,
            supportEmail,
        }));

        const emailText = getCsSummaryReminderEmailText({
            userName,
            memberName,
            applicationId,
            confirmationUrl,
            supportEmail,
        });

        const { data, error } = await resend.emails.send({
            from: 'CalAIM Pathfinder <noreply@carehomefinders.com>',
            to: [to],
            subject: `Action Required: Complete Your CalAIM Application for ${memberName}`,
            html: emailHtml,
            text: emailText,
        });

        if (error) {
            console.error('Resend CS Summary Reminder Error:', error);
            throw new Error(error.message);
        }

        console.log(`✅ CS Summary reminder email sent successfully to ${to}`);
        return data;
    } catch (error) {
        console.error('Failed to send CS Summary reminder email:', error);
        throw error;
    }
};

export const sendEligibilityCheckConfirmationEmail = async (payload: EligibilityCheckConfirmationPayload) => {
    const resend = getResendClient();
    if (!resend) {
        console.warn("RESEND_API_KEY is not set. Skipping eligibility confirmation email.");
        return null;
    }

    const { to, requesterName, requesterEmail, memberName, healthPlan, county, checkId } = payload;

    try {
        const emailHtml = await renderAsync(
            EligibilityCheckConfirmationEmail({
                requesterName,
                requesterEmail,
                memberName,
                healthPlan,
                county,
                checkId,
            })
        );

        const { data, error } = await resend.emails.send({
            from: 'CalAIM Pathfinder <noreply@carehomefinders.com>',
            to: [to],
            subject: `CalAIM Eligibility Check Confirmation (ID: ${checkId})`,
            html: emailHtml,
        });

        if (error) {
            console.error('Resend Eligibility Confirmation Error:', error);
            throw new Error(error.message);
        }

        return data;
    } catch (error) {
        console.error('Failed to send eligibility confirmation email:', error);
        throw error;
    }
};

export const sendEligibilityCheckResultEmail = async (payload: EligibilityCheckResultPayload) => {
    const resend = getResendClient();
    if (!resend) {
        console.warn("RESEND_API_KEY is not set. Skipping eligibility result email.");
        return null;
    }

    const { to, requesterName, memberName, healthPlan, county, checkId, result, resultMessage } = payload;

    try {
        const emailHtml = await renderAsync(
            EligibilityCheckResultEmail({
                requesterName,
                memberName,
                healthPlan,
                county,
                checkId,
                result,
                resultMessage,
            })
        );

        const { data, error } = await resend.emails.send({
            from: 'CalAIM Pathfinder <noreply@carehomefinders.com>',
            to: [to],
            subject: `CalAIM Eligibility Check Results (ID: ${checkId})`,
            html: emailHtml,
        });

        if (error) {
            console.error('Resend Eligibility Result Error:', error);
            throw new Error(error.message);
        }

        return data;
    } catch (error) {
        console.error('Failed to send eligibility result email:', error);
        throw error;
    }
};
