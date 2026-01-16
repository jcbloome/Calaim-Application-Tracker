
'use server';

// DO NOT MOVE THIS IMPORT. It must be the first line to initialize Firebase Admin.
import '@/ai/firebase';

import { Resend } from 'resend';
import { renderAsync } from '@react-email/render';
import ApplicationStatusEmail from '@/components/emails/ApplicationStatusEmail';
import ReminderEmail from '@/components/emails/ReminderEmail';
import StaffAssignmentEmail from '@/components/emails/StaffAssignmentEmail';
import * as admin from 'firebase-admin';

// Note: Firebase Admin is initialized in a central file (e.g., src/ai/dev.ts).
// No need to initialize it here.

if (!process.env.RESEND_API_KEY) {
  console.warn("RESEND_API_KEY is not set. Email functionality will be disabled.");
}

const resend = new Resend(process.env.RESEND_API_KEY);

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

    if (!process.env.RESEND_API_KEY) {
        throw new Error('Resend API key is not configured.');
    }

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
    const { to, subject, referrerName, memberName, applicationId, incompleteItems } = payload;

    if (!process.env.RESEND_API_KEY) {
        throw new Error('Resend API key is not configured.');
    }

    try {
        const emailHtml = await renderAsync(ReminderEmail({
            referrerName,
            memberName,
            applicationId,
            incompleteItems,
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

    if (!process.env.RESEND_API_KEY) {
        throw new Error('Resend API key is not configured.');
    }

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
