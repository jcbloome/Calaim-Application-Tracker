
'use server';

import { Resend } from 'resend';
import ApplicationStatusEmail from '@/components/emails/ApplicationStatusEmail';

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

export const sendApplicationStatusEmail = async (payload: ApplicationStatusPayload) => {
    const { to, subject, memberName, staffName, message, status } = payload;

    if (!process.env.RESEND_API_KEY) {
        throw new Error('Resend API key is not configured.');
    }

    try {
        const { data, error } = await resend.emails.send({
            from: 'CalAIM Pathfinder <onboarding@resend.dev>',
            to: [to],
            subject: subject,
            react: ApplicationStatusEmail({
                memberName,
                staffName,
                message,
                status,
            }),
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
