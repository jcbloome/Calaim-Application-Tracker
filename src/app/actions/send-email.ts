
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
import SwClaimReminderEmail, { type SwClaimReminderItem } from '@/components/emails/SwClaimReminderEmail';
import AlftUploadEmail from '@/components/emails/AlftUploadEmail';
import AlftSignatureRequestEmail from '@/components/emails/AlftSignatureRequestEmail';
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
  includeBcc?: boolean;
  portalUrl?: string;
  surveyUrl?: string;
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

interface SwClaimReminderPayload {
    to: string;
    socialWorkerName: string;
    items: SwClaimReminderItem[];
    portalUrl?: string;
}

interface AlftUploadPayload {
    to: string;
    memberName: string;
    uploadDate: string;
    kaiserMrn?: string;
    uploaderName: string;
    uploaderEmail?: string;
    intakeUrl: string;
}

interface AlftSignatureRequestPayload {
    to: string;
    recipientName: string;
    recipientRoleLabel: 'RN' | 'MSW';
    memberName: string;
    mrn?: string;
    reviewedDateLabel?: string;
    signUrl: string;
}

interface AlftCompletedWorkflowPayload {
    to: string;
    memberName: string;
    mrn?: string;
    intakeId: string;
    summary?: string;
    packetUrl?: string;
    signaturePageUrl?: string;
    originalFiles?: Array<{ fileName?: string; downloadURL?: string }>;
    revisionFiles?: Array<{ fileName?: string; downloadURL?: string }>;
}

interface RoomBoardTierAgreementInvitePayload {
    to: string;
    recipientName: string;
    recipientRoleLabel: 'Member/Authorized Representative' | 'RCFE';
    memberName: string;
    mrn?: string;
    rcfeName?: string;
    mcoAndTier?: string;
    assistedLivingDailyRate?: string;
    assistedLivingMonthlyRate?: string;
    agreedRoomBoardAmount?: string;
    signUrl: string;
}

interface RoomBoardIlsSubmissionPayload {
    to: string;
    memberName: string;
    mrn?: string;
    rcfeName?: string;
    mcoAndTier?: string;
    agreedRoomBoardAmount?: string;
    agreementDownloadUrl: string;
    proofIncomeDownloadUrl: string;
}

type EmailLogStatus = 'success' | 'failure';

async function logEmailDelivery(params: {
    status: EmailLogStatus;
    template: string;
    source: string;
    to: string[];
    bcc?: string[];
    subject: string;
    providerMessageId?: string;
    errorMessage?: string;
    metadata?: Record<string, unknown>;
}) {
    try {
        await admin.firestore().collection('emailLogs').add({
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            status: params.status,
            template: params.template,
            source: params.source,
            to: params.to,
            bcc: params.bcc || [],
            subject: params.subject,
            provider: 'resend',
            providerMessageId: params.providerMessageId || null,
            errorMessage: params.errorMessage || null,
            metadata: params.metadata || {},
        });
    } catch (error) {
        console.error('Failed to write email log:', error);
    }
}

async function sendViaResendWithLog(params: {
    resend: Resend | null;
    from: string;
    to: string[];
    subject: string;
    html: string;
    text?: string;
    bcc?: string[];
    template: string;
    source: string;
    metadata?: Record<string, unknown>;
}) {
    const { resend, from, to, bcc = [], subject, html, text, template, source, metadata } = params;
    if (!resend) {
        await logEmailDelivery({
            status: 'failure',
            template,
            source,
            to,
            bcc,
            subject,
            errorMessage: 'Resend API key is not configured.',
            metadata,
        });
        throw new Error('Resend API key is not configured.');
    }

    let alreadyLoggedFailure = false;
    try {
        const { data, error } = await resend.emails.send({
            from,
            to,
            bcc,
            subject,
            html,
            ...(text ? { text } : {}),
        });

        if (error) {
            const message = String(error.message || 'Unknown Resend error');
            await logEmailDelivery({
                status: 'failure',
                template,
                source,
                to,
                bcc,
                subject,
                errorMessage: message,
                metadata,
            });
            alreadyLoggedFailure = true;
            throw new Error(message);
        }

        await logEmailDelivery({
            status: 'success',
            template,
            source,
            to,
            bcc,
            subject,
            providerMessageId: (data as any)?.id ? String((data as any).id) : undefined,
            metadata,
        });
        return data;
    } catch (error: any) {
        if (!alreadyLoggedFailure) {
            await logEmailDelivery({
                status: 'failure',
                template,
                source,
                to,
                bcc,
                subject,
                errorMessage: String(error?.message || 'Unknown send error'),
                metadata,
            });
        }
        throw error;
    }
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
    const { to, subject, memberName, staffName, message, status, includeBcc = true, portalUrl, surveyUrl } = payload;

    const resend = getResendClient();
    if (!resend) throw new Error('Resend API key is not configured.');

    const bccList = includeBcc ? await getBccRecipients() : [];

    try {
        const emailHtml = await renderAsync(ApplicationStatusEmail({
            memberName,
            staffName,
            message,
            status,
            surveyUrl,
            portalUrl: String(
              portalUrl ||
              process.env.NEXT_PUBLIC_APP_URL ||
              process.env.NEXT_PUBLIC_BASE_URL ||
              'https://connectcalaim.com/login'
            ).replace(/\/$/, '').includes('/login')
              ? String(
                  portalUrl ||
                  process.env.NEXT_PUBLIC_APP_URL ||
                  process.env.NEXT_PUBLIC_BASE_URL ||
                  'https://connectcalaim.com/login'
                )
              : `${String(
                  portalUrl ||
                  process.env.NEXT_PUBLIC_APP_URL ||
                  process.env.NEXT_PUBLIC_BASE_URL ||
                  'https://connectcalaim.com'
                ).replace(/\/$/, '')}/login`,
        }));

        return await sendViaResendWithLog({
            resend,
            from: 'CalAIM Pathfinder <noreply@carehomefinders.com>',
            to: [to],
            bcc: bccList,
            subject,
            html: emailHtml,
            template: 'application_status',
            source: 'sendApplicationStatusEmail',
            metadata: { status, includeBcc },
        });
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

        return await sendViaResendWithLog({
            resend,
            from: 'CalAIM Pathfinder <noreply@carehomefinders.com>',
            to: [to],
            subject,
            html: emailHtml,
            template: 'missing_docs_reminder',
            source: 'sendReminderEmail',
            metadata: { applicationId },
        });
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

        return await sendViaResendWithLog({
            resend,
            from: 'CalAIM Pathfinder <noreply@carehomefinders.com>',
            to: [to],
            bcc: bccList,
            subject: `New CalAIM Member Assignment: ${memberName}`,
            html: emailHtml,
            template: 'staff_assignment',
            source: 'sendStaffAssignmentEmail',
            metadata: { memberMrn, memberCounty },
        });
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

        const data = await sendViaResendWithLog({
            resend,
            from: 'CalAIM Notes <noreply@carehomefinders.com>',
            to: [to],
            bcc: bccList,
            subject: `📝 New ${priority.toUpperCase()} Priority Note Assignment: ${memberName}`,
            html: emailHtml,
            template: 'note_assignment',
            source: 'sendNoteAssignmentEmail',
            metadata: { priority, noteType, source, clientId2 },
        });

        console.log(`✅ Note assignment email sent successfully to ${to}`);
        return data;
    } catch (error) {
        console.error('Failed to send note assignment email:', error);
        throw error;
    }
};

export const sendSwClaimReminderEmail = async (payload: SwClaimReminderPayload) => {
    const resend = getResendClient();
    if (!resend) throw new Error('Resend API key is not configured.');

    const to = String(payload.to || '').trim();
    if (!to) throw new Error('Email recipient is required.');

    const portalUrl = String(payload.portalUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').trim();
    const socialWorkerName = String(payload.socialWorkerName || '').trim() || 'Social Worker';
    const items = Array.isArray(payload.items) ? payload.items : [];

    const emailHtml = await renderAsync(
        SwClaimReminderEmail({
            socialWorkerName,
            items,
            portalUrl,
        })
    );

    return await sendViaResendWithLog({
        resend,
        from: 'CalAIM Pathfinder <noreply@carehomefinders.com>',
        to: [to],
        subject: 'Reminder: submit your CalAIM SW claim(s)',
        html: emailHtml,
        template: 'sw_claim_reminder',
        source: 'sendSwClaimReminderEmail',
        metadata: { itemCount: items.length },
    });
};

export const sendCsSummaryReminderEmail = async (payload: CsSummaryReminderPayload) => {
    const { to, userName, memberName, applicationId, confirmationUrl, supportEmail } = payload;
    const resend = getResendClient();

    if (!resend) {
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

        const data = await sendViaResendWithLog({
            resend,
            from: 'CalAIM Pathfinder <noreply@carehomefinders.com>',
            to: [to],
            subject: `Action Required: Complete Your CalAIM Application for ${memberName}`,
            html: emailHtml,
            text: emailText,
            template: 'cs_summary_reminder',
            source: 'sendCsSummaryReminderEmail',
            metadata: { applicationId },
        });

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

        return await sendViaResendWithLog({
            resend,
            from: 'CalAIM Pathfinder <noreply@carehomefinders.com>',
            to: [to],
            subject: `CalAIM Eligibility Check Confirmation (ID: ${checkId})`,
            html: emailHtml,
            template: 'eligibility_check_confirmation',
            source: 'sendEligibilityCheckConfirmationEmail',
            metadata: { checkId, healthPlan, county },
        });
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

        return await sendViaResendWithLog({
            resend,
            from: 'CalAIM Pathfinder <noreply@carehomefinders.com>',
            to: [to],
            subject: `CalAIM Eligibility Check Results (ID: ${checkId})`,
            html: emailHtml,
            template: 'eligibility_check_result',
            source: 'sendEligibilityCheckResultEmail',
            metadata: { checkId, result, healthPlan, county },
        });
    } catch (error) {
        console.error('Failed to send eligibility result email:', error);
        throw error;
    }
};

export const sendAlftUploadEmail = async (payload: AlftUploadPayload) => {
    const resend = getResendClient();
    if (!resend) throw new Error('Resend API key is not configured.');

    const to = String(payload.to || '').trim();
    if (!to) throw new Error('Email recipient is required.');

    const intakeUrlRaw = String(payload.intakeUrl || '').trim();
    const baseUrl = String(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').trim();
    const intakeUrl = intakeUrlRaw.startsWith('http') ? intakeUrlRaw : `${baseUrl}${intakeUrlRaw.startsWith('/') ? '' : '/'}${intakeUrlRaw}`;

    const memberName = String(payload.memberName || '').trim() || 'Member';
    const uploaderName = String(payload.uploaderName || '').trim() || 'Social Worker';

    const emailHtml = await renderAsync(
        AlftUploadEmail({
            memberName,
            uploadDate: String(payload.uploadDate || '').trim(),
            kaiserMrn: String(payload.kaiserMrn || '').trim() || undefined,
            uploaderName,
            uploaderEmail: String(payload.uploaderEmail || '').trim() || undefined,
            intakeUrl,
        })
    );

    return await sendViaResendWithLog({
        resend,
        from: 'CalAIM Tracker <noreply@carehomefinders.com>',
        to: [to],
        subject: `ALFT Tool uploaded: ${memberName}`,
        html: emailHtml,
        template: 'alft_upload',
        source: 'sendAlftUploadEmail',
        metadata: { memberName },
    });
};

export const sendAlftSignatureRequestEmail = async (payload: AlftSignatureRequestPayload) => {
    const resend = getResendClient();
    if (!resend) throw new Error('Resend API key is not configured.');

    const to = String(payload.to || '').trim();
    if (!to) throw new Error('Email recipient is required.');

    const baseUrl = String(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').trim();
    const signUrlRaw = String(payload.signUrl || '').trim();
    const signUrl = signUrlRaw.startsWith('http') ? signUrlRaw : `${baseUrl}${signUrlRaw.startsWith('/') ? '' : '/'}${signUrlRaw}`;

    const emailHtml = await renderAsync(
        AlftSignatureRequestEmail({
            recipientName: String(payload.recipientName || '').trim() || 'Staff',
            recipientRoleLabel: payload.recipientRoleLabel,
            memberName: String(payload.memberName || '').trim() || 'Member',
            mrn: String(payload.mrn || '').trim() || undefined,
            reviewedDateLabel: String(payload.reviewedDateLabel || '').trim() || undefined,
            signUrl,
        })
    );

    const memberName = String(payload.memberName || '').trim() || 'Member';
    return await sendViaResendWithLog({
        resend,
        from: 'CalAIM Tracker <noreply@carehomefinders.com>',
        to: [to],
        subject: `Signature requested (${payload.recipientRoleLabel}) — ${memberName}`,
        html: emailHtml,
        template: 'alft_signature_request',
        source: 'sendAlftSignatureRequestEmail',
        metadata: { recipientRole: payload.recipientRoleLabel, memberName },
    });
};

export const sendAlftCompletedWorkflowEmail = async (payload: AlftCompletedWorkflowPayload) => {
    const resend = getResendClient();
    if (!resend) throw new Error('Resend API key is not configured.');

    const to = String(payload.to || '').trim();
    if (!to) throw new Error('Email recipient is required.');

    const memberName = String(payload.memberName || '').trim() || 'Member';
    const mrn = String(payload.mrn || '').trim();
    const intakeId = String(payload.intakeId || '').trim();
    const summary = String(payload.summary || '').trim();
    const packetUrl = String(payload.packetUrl || '').trim();
    const signaturePageUrl = String(payload.signaturePageUrl || '').trim();
    const originals = Array.isArray(payload.originalFiles) ? payload.originalFiles : [];
    const revisions = Array.isArray(payload.revisionFiles) ? payload.revisionFiles : [];

    const listItems = [
        ...(packetUrl ? [`<li><a href="${packetUrl}">Final packet PDF</a></li>`] : []),
        ...(signaturePageUrl ? [`<li><a href="${signaturePageUrl}">Signature page PDF</a></li>`] : []),
        ...originals
            .slice(0, 10)
            .map((f) => {
                const name = String(f?.fileName || 'Original attachment');
                const url = String(f?.downloadURL || '').trim();
                return url ? `<li><a href="${url}">Original: ${name}</a></li>` : '';
            })
            .filter(Boolean),
        ...revisions
            .slice(0, 10)
            .map((f) => {
                const name = String(f?.fileName || 'Revision attachment');
                const url = String(f?.downloadURL || '').trim();
                return url ? `<li><a href="${url}">Revision: ${name}</a></li>` : '';
            })
            .filter(Boolean),
    ];

    const html = `
      <div style="font-family: Arial, Helvetica, sans-serif; color: #0f172a; line-height: 1.5; max-width: 600px;">
        <div style="background: #0f172a; border-radius: 10px 10px 0 0; padding: 20px 24px;">
          <p style="margin: 0; color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em;">ILS Health — CalAIM ALFT Workflow</p>
          <h2 style="margin: 6px 0 0; color: #ffffff; font-size: 20px;">Completed ALFT Assessment</h2>
        </div>

        <div style="border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 10px 10px; padding: 24px;">
          <p style="margin: 0 0 16px; color: #334155;">
            Hi Jocelyn — the following Kaiser member's ALF Transition Assessment has been completed, reviewed, and signed by the MSW and RN.
            The Kaiser manager (Deydry) has approved it for submission. Please find the documents below.
          </p>

          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
            <tr>
              <td style="padding: 10px 14px; font-size: 12px; color: #64748b; width: 110px; border-bottom: 1px solid #e2e8f0;">Member</td>
              <td style="padding: 10px 14px; font-size: 14px; font-weight: 600; border-bottom: 1px solid #e2e8f0;">${memberName}</td>
            </tr>
            ${mrn ? `
            <tr>
              <td style="padding: 10px 14px; font-size: 12px; color: #64748b; border-bottom: 1px solid #e2e8f0;">Kaiser MRN</td>
              <td style="padding: 10px 14px; font-size: 14px; font-family: monospace; border-bottom: 1px solid #e2e8f0;">${mrn}</td>
            </tr>` : ''}
            ${summary ? `
            <tr>
              <td style="padding: 10px 14px; font-size: 12px; color: #64748b; vertical-align: top;">Summary</td>
              <td style="padding: 10px 14px; font-size: 13px; color: #334155;">${summary}</td>
            </tr>` : ''}
          </table>

          <h3 style="margin: 0 0 10px; font-size: 14px; color: #0f172a;">Documents</h3>
          ${listItems.length > 0
            ? `<ul style="margin: 0 0 20px; padding-left: 20px; font-size: 14px; line-height: 2;">
                ${listItems.join('')}
               </ul>`
            : `<p style="color: #94a3b8; font-size: 13px; margin-bottom: 20px;">
                No PDF links generated — the assessment was submitted as a digital form.
                Log in to the admin portal to access the form data directly.
               </p>`
          }

          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px; margin-bottom: 20px;">
            <p style="margin: 0; font-size: 13px; color: #166534;">
              <strong>Action needed:</strong> Please download the final packet PDF and submit it to Kaiser per ILS protocol.
              If you have any questions, contact Deydry or the ILS admin team.
            </p>
          </div>

          <p style="font-size: 11px; color: #94a3b8; margin: 0;">
            Intake ID: ${intakeId || '—'} &nbsp;·&nbsp; Sent automatically by CalAIM Tracker ALFT workflow.
          </p>
        </div>
      </div>
    `;

    return await sendViaResendWithLog({
        resend,
        from: 'CalAIM Tracker <noreply@carehomefinders.com>',
        to: [to],
        subject: `ALFT completed: ${memberName}`,
        html,
        template: 'alft_completed_workflow',
        source: 'sendAlftCompletedWorkflowEmail',
        metadata: { intakeId, memberName },
    });
};

export const sendRoomBoardTierAgreementInviteEmail = async (payload: RoomBoardTierAgreementInvitePayload) => {
    const resend = getResendClient();
    if (!resend) throw new Error('Resend API key is not configured.');

    const to = String(payload.to || '').trim();
    if (!to) throw new Error('Email recipient is required.');

    const baseUrl = String(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').trim();
    const signUrlRaw = String(payload.signUrl || '').trim();
    const signUrl = signUrlRaw.startsWith('http') ? signUrlRaw : `${baseUrl}${signUrlRaw.startsWith('/') ? '' : '/'}${signUrlRaw}`;

    const memberName = String(payload.memberName || '').trim() || 'Member';
    const recipientName = String(payload.recipientName || '').trim() || 'Signer';
    const role = payload.recipientRoleLabel;
    const mrn = String(payload.mrn || '').trim();
    const rcfeName = String(payload.rcfeName || '').trim();
    const mcoAndTier = String(payload.mcoAndTier || '').trim();
    const dailyRate = String(payload.assistedLivingDailyRate || '').trim();
    const monthlyRate = String(payload.assistedLivingMonthlyRate || '').trim();
    const agreedRoomBoardAmount = String(payload.agreedRoomBoardAmount || '').trim();

    const html = `
      <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.5; max-width: 640px; margin: 0 auto;">
        <h2 style="margin-bottom: 8px;">Room and Board/Tier Level Agreement Signature Requested</h2>
        <p style="margin-top: 0;">Hello ${recipientName},</p>
        <p>Please review and complete your portion of the Room and Board/Tier Level Agreement.</p>
        <p><strong>Signer Role:</strong> ${role}</p>
        <p><strong>Member:</strong> ${memberName}${mrn ? ` &nbsp; | &nbsp; <strong>MRN:</strong> ${mrn}` : ''}</p>
        ${rcfeName ? `<p><strong>RCFE:</strong> ${rcfeName}</p>` : ''}
        ${mcoAndTier ? `<p><strong>MCO and Tier:</strong> ${mcoAndTier}</p>` : ''}
        ${(dailyRate || monthlyRate) ? `<p><strong>Assisted Living Rate:</strong> ${monthlyRate ? `$${monthlyRate} monthly` : ''}${monthlyRate && dailyRate ? ' / ' : ''}${dailyRate ? `$${dailyRate} daily` : ''}</p>` : ''}
        ${agreedRoomBoardAmount ? `<p><strong>Agreed Room and Board Payment:</strong> $${agreedRoomBoardAmount}</p>` : ''}
        <p style="margin: 20px 0;">
          <a href="${signUrl}" style="background: #0f766e; color: #ffffff; text-decoration: none; padding: 10px 14px; border-radius: 6px; display: inline-block; font-weight: 600;">
            Review and Sign Agreement
          </a>
        </p>
        <p style="font-size: 12px; color: #475569;">
          If the button does not work, copy and paste this link into your browser:<br/>
          <a href="${signUrl}">${signUrl}</a>
        </p>
      </div>
    `;

    return await sendViaResendWithLog({
        resend,
        from: 'CalAIM Tracker <noreply@carehomefinders.com>',
        to: [to],
        subject: `Room and Board/Tier Level Agreement Signature Request — ${memberName}`,
        html,
        template: 'room_board_tier_invite',
        source: 'sendRoomBoardTierAgreementInviteEmail',
        metadata: { memberName, role },
    });
};

export const sendRoomBoardIlsSubmissionEmail = async (payload: RoomBoardIlsSubmissionPayload) => {
    const resend = getResendClient();
    if (!resend) throw new Error('Resend API key is not configured.');

    const to = String(payload.to || '').trim();
    if (!to) throw new Error('Email recipient is required.');

    const memberName = String(payload.memberName || '').trim() || 'Member';
    const mrn = String(payload.mrn || '').trim();
    const rcfeName = String(payload.rcfeName || '').trim();
    const mcoAndTier = String(payload.mcoAndTier || '').trim();
    const agreedAmount = String(payload.agreedRoomBoardAmount || '').trim();
    const agreementUrl = String(payload.agreementDownloadUrl || '').trim();
    const proofUrl = String(payload.proofIncomeDownloadUrl || '').trim();
    if (!agreementUrl || !proofUrl) {
      throw new Error('Both agreement and proof-of-income file links are required.');
    }

    const html = `
      <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.5; max-width: 680px; margin: 0 auto;">
        <h2 style="margin-bottom: 8px;">Room and Board Agreement + Proof of Income</h2>
        <p style="margin-top: 0;">Hello ILS Team,</p>
        <p>The Room and Board/Tier Level Agreement is fully signed and Proof of Income is attached for review.</p>
        <p><strong>Member:</strong> ${memberName}${mrn ? ` &nbsp; | &nbsp; <strong>MRN:</strong> ${mrn}` : ''}</p>
        ${rcfeName ? `<p><strong>RCFE:</strong> ${rcfeName}</p>` : ''}
        ${mcoAndTier ? `<p><strong>MCO and Tier:</strong> ${mcoAndTier}</p>` : ''}
        ${agreedAmount ? `<p><strong>Agreed Room and Board Amount:</strong> $${agreedAmount}</p>` : ''}
        <p><strong>Documents:</strong></p>
        <ul>
          <li><a href="${agreementUrl}">Signed Room and Board/Tier Level Agreement</a></li>
          <li><a href="${proofUrl}">Proof of Income</a></li>
        </ul>
      </div>
    `;

    return await sendViaResendWithLog({
        resend,
        from: 'CalAIM Tracker <noreply@carehomefinders.com>',
        to: [to],
        subject: `ILS submission: ${memberName} — signed agreement + proof of income`,
        html,
        template: 'room_board_ils_submission',
        source: 'sendRoomBoardIlsSubmissionEmail',
        metadata: { memberName, rcfeName },
    });
};
