
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
import { formatIspAssessmentTypeLabel, formatIspContactBlockForSwEmail, formatIspVisitTypeForSwEmail } from '@/lib/isp-visit-location';
import {
  DEFAULT_APP_BASE_URL,
  linkifyAppPathsInPlainText,
  resolveAppBaseUrl as resolveAppBaseUrlFromLib,
} from '@/lib/app-urls';

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

const DEFAULT_APP_BASE_URL_LEGACY = DEFAULT_APP_BASE_URL;
const DEFAULT_PORTAL_LOGIN_URL = `${DEFAULT_APP_BASE_URL_LEGACY}/login`;
const DEFAULT_SIGNATURE_PHONE = '800-330-5993';
const DEFAULT_ALFT_REVIEWER_NAME = 'John';
const DEFAULT_ALFT_REVIEWER_EMAIL = 'john@carehomefinders.com';
const REQUIREMENT_TITLE_TO_ID: Record<string, string> = {
    'cs member summary': 'cs-summary',
    'cs summary': 'cs-summary',
    'waivers & authorizations': 'waivers',
    'proof of income': 'proof-of-income',
    "lic 602a - physician's report": 'lic-602a',
    'medicine list': 'medicine-list',
    'declaration of eligibility': 'declaration-of-eligibility',
    'snf facesheet': 'snf-facesheet',
};

function resolvePortalLoginUrl(rawPortalUrl?: string): string {
    const raw = String(rawPortalUrl || '').trim();
    if (!raw) return DEFAULT_PORTAL_LOGIN_URL;

    try {
        const parsed = new URL(raw);
        const host = parsed.hostname.toLowerCase();
        if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) {
            return DEFAULT_PORTAL_LOGIN_URL;
        }
        const path = parsed.pathname || '';
        if (/\/login\/?$/i.test(path)) {
            return parsed.toString();
        }
        parsed.pathname = `${path.replace(/\/$/, '')}/login`;
        parsed.search = '';
        parsed.hash = '';
        return parsed.toString();
    } catch {
        return DEFAULT_PORTAL_LOGIN_URL;
    }
}

function resolveAppBaseUrl(rawBaseUrl?: string): string {
    return resolveAppBaseUrlFromLib(rawBaseUrl || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL);
}

const escapeHtml = (value: string) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatSwEmailBodyHtml = (value: string, baseUrl?: string) =>
  escapeHtml(linkifyAppPathsInPlainText(String(value || '').trim(), baseUrl))
    .replace(/\r?\n/g, '<br/>')
    .replace(/((?:^|<br\/>)\s*)(Client:|ISP Location:|ISP Contact:)/gi, (_, lead, label) => `${lead}<strong>${label}</strong>`);

function getRequirementFocusId(incompleteItems: string[] = []): string {
    for (const item of incompleteItems) {
        const key = String(item || '').trim().toLowerCase();
        if (REQUIREMENT_TITLE_TO_ID[key]) return REQUIREMENT_TITLE_TO_ID[key];
    }
    return '';
}

interface ApplicationStatusPayload {
  to: string;
  subject: string;
  memberName: string;
  staffName: string;
  staffTitle?: string;
  staffEmail?: string;
  message: string;
  status: 'Deleted' | 'Approved' | 'Submitted' | 'Requires Revision' | 'In Progress' | 'Completed & Submitted';
  includeBcc?: boolean;
  portalUrl?: string;
  surveyUrl?: string;
  healthPlan?: string;
}

interface ReminderPayload {
    to: string;
    subject: string;
    referrerName: string;
    memberName: string;
    applicationId: string;
    incompleteItems: string[];
    baseUrl?: string;
    focusRequirementId?: string;
}

interface StaffAssignmentPayload {
    to: string;
    staffName: string;
    memberName: string;
    memberMrn: string;
    memberCounty: string;
    serviceDeliveryFormUrl?: string;
    serviceDeliveryFormFileName?: string;
    serviceDeliveryFormFilePath?: string;
    kaiserStatus: string;
    calaimStatus: string;
    assignedBy: string;
    nextStepsDate?: string;
    dashboardUrl?: string;
    alreadyPushedToCaspio?: boolean;
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
    result: 'eligible' | 'not-eligible' | 'undetermined';
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
    trackerUrl?: string;
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

interface AlftFinalApprovalSwClaimPayload {
    to: string;
    socialWorkerName?: string;
    memberName: string;
    mrn?: string;
}

interface AlftWorkflowStartPayload {
    to: string;
    socialWorkerName: string;
    memberName: string;
    mrn?: string;
    portalUrl?: string;
    assignedBy?: string;
    assignedByEmail?: string;
    assignedByPhone?: string;
    senderCopyEmail?: string;
    customEmailBody?: string;
    ispContactName?: string;
    ispContactRelationship?: string;
    ispAddress?: string;
    facilityName?: string;
    facilityType?: string;
    ispLocation?: string;
    ispContactPhone?: string;
    ispContactEmail?: string;
    ispContact2First?: string;
    ispContact2Last?: string;
    ispContact2Relationship?: string;
    ispContact2Phone?: string;
    ispContact2Email?: string;
    ispLastVerified?: string;
    assessmentPurpose?: string;
    visitLocationSource?: string;
    askCaregiverOnArrival?: boolean;
}

interface AlftManagerWorkflowStagePayload {
    to: string;
    managerName?: string;
    memberName: string;
    mrn?: string;
    stageLabel: string;
    nextAction: string;
    actionUrl: string;
    triggeredBy?: string;
    assessmentPurpose?: string;
}

interface AlftReturnToSwPayload {
    to: string;
    socialWorkerName?: string;
    memberName: string;
    mrn?: string;
    reason: string;
    actionUrl?: string;
    returnedBy?: string;
}

interface IspDailyActionReminderPayload {
    to: string;
    recipientName?: string;
    recipientRole: 'msw' | 'admin' | 'rn';
    memberName: string;
    mrn?: string;
    stageLabel: string;
    nextAction: string;
    actionUrl: string;
}

interface SwClinicalFilesUpdatedPayload {
    to: string;
    socialWorkerName?: string;
    memberName: string;
    mrn?: string;
    fileLabels?: string[];
    uploadedBy?: string;
    portalUrl?: string;
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

const APPLICATION_STATUS_REPLY_TO = 'calaim@carehomefinders.com';
const HEALTH_NET_MANAGER_REPLY_TO = 'leidy@carehomefinders.com';

function deriveMemberCaseName(subject: string, fallback: string): string {
    const safeSubject = String(subject || '').trim();
    const safeFallback = String(fallback || '').trim();
    const match = safeSubject.match(/\bfor\s+(.+)$/i);
    const fromSubject = String(match?.[1] || '').trim();
    return fromSubject || safeFallback || 'Member';
}

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
    replyTo?: string[];
    attachments?: Array<{ filename: string; content: Buffer | string }>;
}) {
    const { resend, from, to, bcc = [], subject, html, text, template, source, metadata, replyTo = [], attachments = [] } = params;
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
            ...(replyTo.length ? { replyTo } : {}),
            subject,
            html,
            ...(text ? { text } : {}),
            ...(attachments.length ? { attachments } : {}),
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
    const { to, subject, memberName, staffName, staffTitle, staffEmail, message, status, includeBcc = true, portalUrl, surveyUrl, healthPlan } = payload;

    const resend = getResendClient();
    if (!resend) throw new Error('Resend API key is not configured.');

    const bccList = includeBcc ? await getBccRecipients() : [];
    const memberCaseName = deriveMemberCaseName(subject, memberName);
    const supportSubject = `CalAIM Question Regarding ${memberCaseName}`;
    const normalizedPlan = String(healthPlan || '').trim().toLowerCase();
    const isKaiser = normalizedPlan.includes('kaiser');
    const isHealthNet = normalizedPlan.includes('health net') || normalizedPlan.includes('healthnet');
    const supportEmail = isHealthNet ? HEALTH_NET_MANAGER_REPLY_TO : APPLICATION_STATUS_REPLY_TO;
    const resolvedStaffTitle =
      String(staffTitle || '').trim() ||
      (isHealthNet ? 'Health Net Care Coordinator' : isKaiser ? 'Kaiser Care Coordinator' : 'Care Coordinator');
    const resolvedStaffEmail = String(staffEmail || '').trim() || supportEmail;
    const resolvedPortalUrl = resolvePortalLoginUrl(
        portalUrl ||
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.NEXT_PUBLIC_BASE_URL ||
        DEFAULT_PORTAL_LOGIN_URL
    );

    try {
        const emailHtml = await renderAsync(ApplicationStatusEmail({
            memberName,
            staffName,
            message,
            status,
            surveyUrl,
            portalUrl: resolvedPortalUrl,
            supportEmail,
            supportSubject,
            staffTitle: resolvedStaffTitle,
            staffEmail: resolvedStaffEmail,
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
            metadata: { status, includeBcc, healthPlan: healthPlan || '' },
            replyTo: [supportEmail],
        });
    } catch (error) {
        console.error('Failed to send email:', error);
        throw error;
    }
};

export const sendReminderEmail = async (payload: ReminderPayload) => {
    const { to, subject, referrerName, memberName, applicationId, incompleteItems, baseUrl, focusRequirementId } = payload;

    const resend = getResendClient();
    if (!resend) throw new Error('Resend API key is not configured.');

    try {
        const resolvedFocusRequirementId = String(focusRequirementId || '').trim() || getRequirementFocusId(incompleteItems);
        const emailHtml = await renderAsync(ReminderEmail({
            referrerName,
            memberName,
            applicationId,
            incompleteItems,
            baseUrl,
            focusRequirementId: resolvedFocusRequirementId || undefined,
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
    const { to, staffName, memberName, memberMrn, memberCounty, serviceDeliveryFormUrl, serviceDeliveryFormFileName, serviceDeliveryFormFilePath, kaiserStatus, calaimStatus, assignedBy, nextStepsDate, dashboardUrl, alreadyPushedToCaspio } = payload;

    const resend = getResendClient();
    if (!resend) throw new Error('Resend API key is not configured.');
    const baseUrl = resolveAppBaseUrl(process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL);
    const dashboardUrlRaw = String(dashboardUrl || '').trim();
    const resolvedDashboardUrl = dashboardUrlRaw
      ? (dashboardUrlRaw.startsWith('http')
          ? dashboardUrlRaw
          : `${baseUrl}${dashboardUrlRaw.startsWith('/') ? '' : '/'}${dashboardUrlRaw}`)
      : `${baseUrl}/admin/kaiser-tracker`;

    const attachments: Array<{ filename: string; content: Buffer }> = [];
    const formUrl = String(serviceDeliveryFormUrl || '').trim();
    const formPath = String(serviceDeliveryFormFilePath || '').trim();
    try {
      let bytes: Buffer | null = null;
      if (formPath) {
        try {
          const { getStorage } = await import('firebase-admin/storage');
          const [fileBytes] = await getStorage().bucket().file(formPath).download();
          if (fileBytes?.length) bytes = Buffer.from(fileBytes);
        } catch (storageError) {
          console.warn('Could not load Service Delivery Form from Storage path:', storageError);
        }
      }
      if (!bytes && formUrl) {
        const fileRes = await fetch(formUrl);
        if (fileRes.ok) {
          const fetched = Buffer.from(await fileRes.arrayBuffer());
          if (fetched.length > 0) bytes = fetched;
        }
      }
      if (bytes) {
        attachments.push({
          filename: String(serviceDeliveryFormFileName || '').trim() || 'Service Delivery Form.pdf',
          content: bytes,
        });
      }
    } catch (attachError) {
      console.warn('Could not attach Service Delivery Form PDF to assignment email:', attachError);
    }

    try {
        const emailHtml = await renderAsync(StaffAssignmentEmail({
            staffName,
            memberName,
            memberMrn,
            memberCounty,
            serviceDeliveryFormUrl,
            kaiserStatus,
            calaimStatus,
            assignedBy,
            nextStepsDate,
            dashboardUrl: resolvedDashboardUrl,
            alreadyPushedToCaspio: Boolean(alreadyPushedToCaspio),
        }));

        return await sendViaResendWithLog({
            resend,
            from: 'CalAIM Pathfinder <noreply@carehomefinders.com>',
            to: [to],
            subject: `New CalAIM Member Assignment: ${memberName}`,
            html: emailHtml,
            template: 'staff_assignment',
            source: 'sendStaffAssignmentEmail',
            metadata: { memberMrn, memberCounty, attachedServiceDeliveryForm: attachments.length > 0 },
            attachments,
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
    const baseUrl = resolveAppBaseUrl(process.env.NEXT_PUBLIC_APP_URL);
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

export const sendAlftWorkflowStartEmail = async (payload: AlftWorkflowStartPayload) => {
    const resend = getResendClient();
    if (!resend) throw new Error('Resend API key is not configured.');

    const to = String(payload.to || '').trim();
    if (!to) throw new Error('Email recipient is required.');

    const baseUrl = resolveAppBaseUrl(process.env.NEXT_PUBLIC_APP_URL);
    const loginUrl = `${baseUrl}/sw-login`;

    const socialWorkerName = String(payload.socialWorkerName || '').trim() || 'Social Worker';
    const socialWorkerFirstName = String(
      socialWorkerName.includes(',')
        ? socialWorkerName.split(',', 2)[1]
        : socialWorkerName.split(/\s+/, 2)[0]
    )
      .trim()
      .split(/\s+/, 2)[0] || 'Social Worker';
    const memberName = String(payload.memberName || '').trim() || 'Member';
    const mrn = String(payload.mrn || '').trim();
    const assignedBy = String(payload.assignedBy || '').trim();
    const assignedByEmail = String(payload.assignedByEmail || '').trim();
    const assignedByPhone = String(payload.assignedByPhone || '').trim();
    const senderCopyEmail = String(payload.senderCopyEmail || '').trim().toLowerCase();
    const customEmailBody = String(payload.customEmailBody || '').trim();
    const customEmailBodyHtml = customEmailBody ? formatSwEmailBodyHtml(customEmailBody, baseUrl) : '';
    const signaturePhone = DEFAULT_SIGNATURE_PHONE || assignedByPhone;
    const ispContactName = String(payload.ispContactName || '').trim();
    const ispContactRelationship = String(payload.ispContactRelationship || '').trim();
    const ispAddress = String(payload.ispAddress || '').trim();
    const facilityName = String(payload.facilityName || '').trim();
    const facilityType = String(payload.facilityType || '').trim();
    const ispLocation = String(payload.ispLocation || '').trim();
    const ispContactPhone = String(payload.ispContactPhone || '').trim();
    const ispContactEmail = String(payload.ispContactEmail || '').trim();
    const ispContact2First = String(payload.ispContact2First || '').trim();
    const ispContact2Last = String(payload.ispContact2Last || '').trim();
    const ispContact2Relationship = String(payload.ispContact2Relationship || '').trim();
    const ispContact2Phone = String(payload.ispContact2Phone || '').trim();
    const ispContact2Email = String(payload.ispContact2Email || '').trim();
    const ispLastVerified = String(payload.ispLastVerified || '').trim();
    const assessmentPurpose = String(payload.assessmentPurpose || '').trim();
    const visitLocationSource = String(payload.visitLocationSource || '').trim();
    const askCaregiverOnArrival = Boolean(payload.askCaregiverOnArrival);
    const visitType = formatIspVisitTypeForSwEmail({
      purpose: assessmentPurpose,
      visitLocationSource,
      facilityType,
      facilityName: facilityName || ispLocation,
      askCaregiverOnArrival,
    });
    const visitTypeDetailsHtml = visitType.detailLines.length
      ? `<ul style="margin: 0 0 16px 20px; padding: 0;">${visitType.detailLines
          .map((line) => `<li style="margin: 0 0 6px;">${line}</li>`)
          .join('')}</ul>`
      : '';
    const ispContact2Name = [ispContact2First, ispContact2Last].filter(Boolean).join(' ').trim();
    const formattedAddress = ispAddress || 'Address not provided';
    const secondaryRelationship = ispContact2Relationship || 'Relationship not provided';
    const secondaryContactName = ispContact2Name || 'Not provided';
    const logoUrl = `${baseUrl}/calaimlogopdf.png`;
    const hasSecondaryIspContact = Boolean(ispContact2Name || ispContact2Relationship || ispContact2Phone || ispContact2Email);
    const signatureName = assignedBy || DEFAULT_ALFT_REVIEWER_NAME;
    const signatureEmail = assignedByEmail || DEFAULT_ALFT_REVIEWER_EMAIL;
    const ispContactBlock = formatIspContactBlockForSwEmail({
      contactName: ispContactName,
      relationship: ispContactRelationship,
      phone: ispContactPhone,
      email: ispContactEmail,
      locationType: facilityType,
      facilityName: facilityName || ispLocation,
      visitLocationSource,
      askCaregiverOnArrival,
    });
    const ispContactBlockHtml = ispContactBlock.html;

    const defaultHtml = `
      <div style="font-family: Arial, Helvetica, sans-serif; color: #111827; line-height: 1.5; max-width: 720px; margin: 0 auto; background: #ffffff;">
        <p style="margin: 0 0 16px;">Hi ${socialWorkerFirstName},</p>
        <p style="margin: 0 0 16px;">We have a client who needs a Kaiser ALFT Care Assessment.</p>

        <p style="margin: 0; font-weight: 700;">${visitType.headline}</p>
        ${visitTypeDetailsHtml}

        <p style="margin: 0; font-weight: 700;">Client:</p>
        <p style="margin: 0;"><strong>${memberName}</strong></p>

        <p style="margin: 0 0 16px;"><strong>Medical Record Number:</strong> ${mrn || 'Not provided'}</p>

        <p style="margin: 0; font-weight: 700;">ISP Location:</p>
        <p style="margin: 0;">${facilityName || ispLocation || 'Not provided'}</p>
        <p style="margin: 0;">Type: ${facilityType || 'Not provided'}</p>
        <p style="margin: 0 0 16px;">Address: ${formattedAddress}</p>

        ${ispContactBlockHtml}
        ${hasSecondaryIspContact ? `
        <p style="margin: 0; font-weight: 700;">Secondary ISP Contact:</p>
        <p style="margin: 0;">${secondaryContactName} (${secondaryRelationship})</p>
        <p style="margin: 0;">Tel: ${ispContact2Phone || 'Not provided'}</p>
        <p style="margin: 0 0 16px;">Email: ${ispContact2Email || 'Not provided'}</p>
        ` : ''}

        <p style="margin: 0 0 12px;">
          Please call the ISP contact to confirm the member is still at the RCFE before you visit.
        </p>

        <p style="margin: 0 0 12px;">
          Please let me know about the assessment:
        </p>
        <ul style="margin: 0 0 16px 20px; padding: 0;">
          <li style="margin: 0 0 6px;">When it’s scheduled</li>
          <li style="margin: 0 0 6px;">When it’s completed</li>
        </ul>

        <p style="margin: 0 0 16px;">
          After you receive an email that this ALFT has final approval, log into Caspio and submit your claim for this visit.
        </p>

        <p style="margin: 0 0 16px;">
          To complete the ALFT and signature workflow, sign in here:
          <a href="${loginUrl}" style="margin-left: 6px; color: #1d4ed8;">${loginUrl}</a>
        </p>

        <p style="margin: 0 0 10px;">If you have any questions, please feel free to contact me.</p>
        <p style="margin: 0;">Regards,</p>
        <p style="margin: 0;">—</p>
        <p style="margin: 0;">${signatureName}</p>
        <p style="margin: 0;">${signatureEmail}</p>
        <p style="margin: 0;">${signaturePhone || 'No sender phone listed'}</p>
        <p style="margin: 0;">Connections Care Home Consultants</p>
        <div style="margin: 10px 0 0;">
          <img src="${logoUrl}" alt="Connections CalAIM" style="height: 44px; width: auto; display: block;" />
        </div>
      </div>
    `;
    const html = customEmailBodyHtml
      ? `
      <div style="font-family: Arial, Helvetica, sans-serif; color: #111827; line-height: 1.5; max-width: 720px; margin: 0 auto; background: #ffffff;">
        <div style="white-space: normal; font-size: 14px; line-height: 1.5; margin-bottom: 12px;">${customEmailBodyHtml}</div>
        <p style="margin: 0 0 16px;">
          To complete the ALFT and signature workflow, sign in here:
          <a href="${loginUrl}" style="margin-left: 6px; color: #1d4ed8; font-weight: 600;">${loginUrl}</a>
        </p>
        <p style="margin: 0 0 10px;">If you have any questions, please feel free to contact me.</p>
        <p style="margin: 0;">Regards,</p>
        <p style="margin: 0;">—</p>
        <p style="margin: 0;">${signatureName}</p>
        <p style="margin: 0;">${signatureEmail}</p>
        <p style="margin: 0;">${signaturePhone || 'No sender phone listed'}</p>
        <p style="margin: 0;">Connections Care Home Consultants</p>
        <div style="margin: 10px 0 0;">
          <img src="${logoUrl}" alt="Connections CalAIM" style="height: 44px; width: auto; display: block;" />
        </div>
      </div>
    `
      : defaultHtml;

    const bccList = senderCopyEmail && senderCopyEmail !== to.toLowerCase() ? [senderCopyEmail] : [];

    return await sendViaResendWithLog({
        resend,
        from: 'CalAIM Tracker <noreply@carehomefinders.com>',
        to: [to],
        bcc: bccList,
        subject: `ALFT assigned (${visitType.subjectTag}): ${memberName}`,
        html,
        template: 'alft_workflow_start',
        source: 'sendAlftWorkflowStartEmail',
        metadata: {
          memberName,
          mrn,
          assessmentPurpose: assessmentPurpose || null,
          visitLocationSource: visitLocationSource || null,
          visitSubjectTag: visitType.subjectTag,
        },
    });
};

export const sendAlftManagerWorkflowStageEmail = async (payload: AlftManagerWorkflowStagePayload) => {
    const resend = getResendClient();
    if (!resend) throw new Error('Resend API key is not configured.');

    const to = String(payload.to || '').trim();
    if (!to) throw new Error('Email recipient is required.');

    const baseUrl = resolveAppBaseUrl(process.env.NEXT_PUBLIC_APP_URL);
    const actionUrlRaw = String(payload.actionUrl || '').trim();
    const actionUrl = actionUrlRaw.startsWith('http')
      ? actionUrlRaw
      : `${baseUrl}${actionUrlRaw.startsWith('/') ? '' : '/'}${actionUrlRaw}`;

    const managerName = String(payload.managerName || '').trim() || 'Manager';
    const memberName = String(payload.memberName || '').trim() || 'Member';
    const mrn = String(payload.mrn || '').trim();
    const stageLabel = String(payload.stageLabel || '').trim() || 'Workflow update';
    const nextAction = String(payload.nextAction || '').trim() || 'Please review and continue workflow.';
    const triggeredBy = String(payload.triggeredBy || '').trim();
    const assessmentTypeLabel = formatIspAssessmentTypeLabel(payload.assessmentPurpose);
    const assessmentTypeHtml = assessmentTypeLabel
      ? `<p style="margin: 0 0 14px; color: #334155;"><strong>Assessment type:</strong> ${assessmentTypeLabel}</p>`
      : '';

    const html = `
      <div style="font-family: Arial, Helvetica, sans-serif; color: #0f172a; line-height: 1.5; max-width: 620px;">
        <div style="background: linear-gradient(135deg, #f0f9ff 0%, #ede9fe 100%); border-radius: 12px 12px 0 0; border: 1px solid #c4b5fd; border-bottom: none; padding: 20px 24px;">
          <p style="margin: 0; color: #6d28d9; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700;">CalAIM ALFT Workflow</p>
          <h2 style="margin: 6px 0 0; color: #0f172a; font-size: 20px;">Manager workflow update</h2>
        </div>
        <div style="border: 1px solid #c4b5fd; border-top: none; border-radius: 0 0 12px 12px; padding: 24px; background: #ffffff;">
          <p style="margin: 0 0 10px;">Hi ${managerName},</p>
          <p style="margin: 0 0 14px;">
            <strong>${memberName}</strong>${mrn ? ` (MRN: ${mrn})` : ''} reached:
            <strong> ${stageLabel}</strong>
          </p>
          ${assessmentTypeHtml}
          <p style="margin: 0 0 14px; color: #334155;">
            <strong>Next action:</strong> ${nextAction}
          </p>
          ${triggeredBy ? `<p style="margin: 0 0 14px; color: #334155;">Triggered by: <strong>${triggeredBy}</strong></p>` : ''}
          <p style="margin: 0 0 14px;">
            <a href="${actionUrl}" style="background: #4338ca; color: #fff; text-decoration: none; padding: 10px 14px; border-radius: 8px; display: inline-block; font-weight: 600;">
              Open ALFT Detail Tracker
            </a>
          </p>
          <p style="margin: 0; color: #64748b; font-size: 12px;">${actionUrl}</p>
        </div>
      </div>
    `;

    return await sendViaResendWithLog({
        resend,
        from: 'CalAIM Tracker <noreply@carehomefinders.com>',
        to: [to],
        subject: assessmentTypeLabel
          ? `ALFT manager update (${assessmentTypeLabel}): ${memberName} — ${stageLabel}`
          : `ALFT manager update: ${memberName} — ${stageLabel}`,
        html,
        template: 'alft_manager_workflow_stage',
        source: 'sendAlftManagerWorkflowStageEmail',
        metadata: { memberName, stageLabel, assessmentPurpose: payload.assessmentPurpose || null },
    });
};

export const sendAlftReturnToSwEmail = async (payload: AlftReturnToSwPayload) => {
    const resend = getResendClient();
    if (!resend) throw new Error('Resend API key is not configured.');

    const to = String(payload.to || '').trim();
    if (!to) throw new Error('Email recipient is required.');

    const baseUrl = resolveAppBaseUrl(process.env.NEXT_PUBLIC_APP_URL);
    const actionUrlRaw = String(payload.actionUrl || '/sw-portal/alft-upload').trim();
    const actionUrl = actionUrlRaw.startsWith('http')
      ? actionUrlRaw
      : `${baseUrl}${actionUrlRaw.startsWith('/') ? '' : '/'}${actionUrlRaw}`;

    const socialWorkerName = String(payload.socialWorkerName || '').trim() || 'Social Worker';
    const memberName = String(payload.memberName || '').trim() || 'Member';
    const mrn = String(payload.mrn || '').trim();
    const reason = String(payload.reason || '').trim() || 'Manager requested revisions before approval.';
    const returnedBy = String(payload.returnedBy || '').trim() || 'Manager';

    const html = `
      <div style="font-family: Arial, Helvetica, sans-serif; color: #0f172a; line-height: 1.5; max-width: 620px;">
        <div style="background: linear-gradient(135deg, #dbeafe 0%, #e0f2fe 100%); border: 1px solid #bfdbfe; border-bottom: none; border-radius: 12px 12px 0 0; padding: 20px 24px;">
          <p style="margin: 0; color: #1d4ed8; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700;">CalAIM ALFT Workflow</p>
          <h2 style="margin: 6px 0 0; color: #0f172a; font-size: 20px;">ALFT update requested</h2>
        </div>
        <div style="border: 1px solid #bfdbfe; border-top: none; border-radius: 0 0 12px 12px; padding: 24px; background: #ffffff;">
          <p style="margin: 0 0 10px;">Hi ${socialWorkerName},</p>
          <p style="margin: 0 0 14px;">
            Please make a few updates to the ALFT form for <strong>${memberName}</strong>${mrn ? ` (MRN: ${mrn})` : ''}, then resubmit.
          </p>
          <p style="margin: 0 0 14px; color: #334155;">
            <strong>Requested updates:</strong> ${reason}
          </p>
          <p style="margin: 0 0 14px; color: #334155;">
            Requested by: <strong>${returnedBy}</strong>
          </p>
          <p style="margin: 0 0 14px;">
            <a href="${actionUrl}" style="background: #2563eb; color: #fff; text-decoration: none; padding: 10px 14px; border-radius: 8px; display: inline-block; font-weight: 600;">
              Open SW Portal ALFT Form
            </a>
          </p>
          <p style="margin: 0; color: #64748b; font-size: 12px;">${actionUrl}</p>
        </div>
      </div>
    `;

    return await sendViaResendWithLog({
        resend,
        from: 'CalAIM Tracker <noreply@carehomefinders.com>',
        to: [to],
        subject: `ALFT update requested: ${memberName}`,
        html,
        template: 'alft_return_to_sw',
        source: 'sendAlftReturnToSwEmail',
        metadata: { memberName, mrn },
    });
};

export const sendIspDailyActionReminderEmail = async (payload: IspDailyActionReminderPayload) => {
    const resend = getResendClient();
    if (!resend) throw new Error('Resend API key is not configured.');

    const to = String(payload.to || '').trim();
    if (!to) throw new Error('Email recipient is required.');

    const baseUrl = resolveAppBaseUrl(process.env.NEXT_PUBLIC_APP_URL);
    const actionUrlRaw = String(payload.actionUrl || '').trim();
    const actionUrl = actionUrlRaw.startsWith('http')
      ? actionUrlRaw
      : `${baseUrl}${actionUrlRaw.startsWith('/') ? '' : '/'}${actionUrlRaw || '/'}`;

    const recipientName = String(payload.recipientName || '').trim() || 'Team member';
    const memberName = String(payload.memberName || '').trim() || 'Member';
    const mrn = String(payload.mrn || '').trim();
    const stageLabel = String(payload.stageLabel || '').trim() || 'Action needed';
    const nextAction = String(payload.nextAction || '').trim() || 'Please complete your next ISP step.';
    const role = String(payload.recipientRole || '').trim().toLowerCase();
    const roleLabel = role === 'msw' ? 'Social Worker' : role === 'rn' ? 'RN' : 'Admin reviewer';
    const ctaLabel =
      role === 'msw' ? 'Open SW Portal' : role === 'rn' ? 'Open RN review' : 'Open ALFT Detail Tracker';

    const html = `
      <div style="font-family: Arial, Helvetica, sans-serif; color: #0f172a; line-height: 1.5; max-width: 620px;">
        <div style="background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%); border: 1px solid #fdba74; border-bottom: none; border-radius: 12px 12px 0 0; padding: 20px 24px;">
          <p style="margin: 0; color: #c2410c; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700;">CalAIM ISP Action Reminder</p>
          <h2 style="margin: 6px 0 0; color: #0f172a; font-size: 20px;">Daily reminder — action needed</h2>
        </div>
        <div style="border: 1px solid #fdba74; border-top: none; border-radius: 0 0 12px 12px; padding: 24px; background: #ffffff;">
          <p style="margin: 0 0 10px;">Hi ${recipientName},</p>
          <p style="margin: 0 0 14px;">
            You are the <strong>${roleLabel}</strong> with the next step for
            <strong>${memberName}</strong>${mrn ? ` (MRN: ${mrn})` : ''}.
          </p>
          <p style="margin: 0 0 8px; color: #334155;"><strong>Current stage:</strong> ${stageLabel}</p>
          <p style="margin: 0 0 14px; color: #334155;"><strong>Next action:</strong> ${nextAction}</p>
          <p style="margin: 0 0 14px;">
            <a href="${actionUrl}" style="background: #ea580c; color: #fff; text-decoration: none; padding: 10px 14px; border-radius: 8px; display: inline-block; font-weight: 600;">
              ${ctaLabel}
            </a>
          </p>
          <p style="margin: 0; color: #64748b; font-size: 12px;">${actionUrl}</p>
          <p style="margin: 14px 0 0; color: #94a3b8; font-size: 11px;">
            Daily reminders can be turned off per member on the ISP Tracker page.
          </p>
        </div>
      </div>
    `;

    return await sendViaResendWithLog({
        resend,
        from: 'CalAIM Tracker <noreply@carehomefinders.com>',
        to: [to],
        subject: `ISP action needed: ${memberName} — ${stageLabel}`,
        html,
        template: 'isp_daily_action_reminder',
        source: 'sendIspDailyActionReminderEmail',
        metadata: { memberName, mrn, role, stageLabel },
    });
};

export const sendSwClinicalFilesUpdatedEmail = async (payload: SwClinicalFilesUpdatedPayload) => {
    const resend = getResendClient();
    if (!resend) throw new Error('Resend API key is not configured.');

    const to = String(payload.to || '').trim();
    if (!to) throw new Error('Email recipient is required.');

    const baseUrl = resolveAppBaseUrl(process.env.NEXT_PUBLIC_APP_URL);
    const portalUrlRaw = String(payload.portalUrl || '/sw-login').trim();
    const portalUrl = portalUrlRaw.startsWith('http')
      ? portalUrlRaw
      : `${baseUrl}${portalUrlRaw.startsWith('/') ? '' : '/'}${portalUrlRaw}`;

    const socialWorkerName = String(payload.socialWorkerName || '').trim() || 'Social Worker';
    const memberName = String(payload.memberName || '').trim() || 'Member';
    const mrn = String(payload.mrn || '').trim();
    const uploadedBy = String(payload.uploadedBy || '').trim() || 'Admin';
    const fileLabels = (Array.isArray(payload.fileLabels) ? payload.fileLabels : [])
      .map((label) => String(label || '').trim())
      .filter(Boolean);
    const fileListHtml = fileLabels.length
      ? `<ul style="margin: 0 0 14px 18px; padding: 0;">${fileLabels
          .map((label) => `<li style="margin: 0 0 4px;">${label}</li>`)
          .join('')}</ul>`
      : `<p style="margin: 0 0 14px;">A new clinical file was uploaded for this member.</p>`;

    const html = `
      <div style="font-family: Arial, Helvetica, sans-serif; color: #0f172a; line-height: 1.5; max-width: 620px;">
        <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-bottom: none; border-radius: 12px 12px 0 0; padding: 20px 24px;">
          <p style="margin: 0; color: #047857; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700;">CalAIM ISP / ALFT</p>
          <h2 style="margin: 6px 0 0; color: #0f172a; font-size: 20px;">New clinical file uploaded</h2>
        </div>
        <div style="border: 1px solid #a7f3d0; border-top: none; border-radius: 0 0 12px 12px; padding: 24px; background: #ffffff;">
          <p style="margin: 0 0 10px;">Hi ${socialWorkerName},</p>
          <p style="margin: 0 0 14px;">
            New clinical file(s) were uploaded for <strong>${memberName}</strong>${mrn ? ` (MRN: ${mrn})` : ''} for your ISP / ALFT review.
          </p>
          ${fileListHtml}
          <p style="margin: 0 0 14px; color: #334155;">Uploaded by: <strong>${uploadedBy}</strong></p>
          <p style="margin: 0 0 14px;">
            Please sign in to the social worker portal to review the file(s) with the member assessment.
          </p>
          <p style="margin: 0 0 8px;">
            <a href="${portalUrl}" style="background: #059669; color: #fff; text-decoration: none; padding: 10px 14px; border-radius: 8px; display: inline-block; font-weight: 600;">
              Open social worker portal
            </a>
          </p>
          <p style="margin: 0; color: #64748b; font-size: 12px;">${portalUrl}</p>
        </div>
      </div>
    `;

    return await sendViaResendWithLog({
        resend,
        from: 'CalAIM Tracker <noreply@carehomefinders.com>',
        to: [to],
        subject: `New clinical file uploaded: ${memberName}`,
        html,
        template: 'sw_clinical_files_updated',
        source: 'sendSwClinicalFilesUpdatedEmail',
        metadata: { memberName, mrn, fileCount: fileLabels.length },
    });
};

export const sendAlftSignatureRequestEmail = async (payload: AlftSignatureRequestPayload) => {
    const resend = getResendClient();
    if (!resend) throw new Error('Resend API key is not configured.');

    const to = String(payload.to || '').trim();
    if (!to) throw new Error('Email recipient is required.');

    const baseUrl = resolveAppBaseUrl(process.env.NEXT_PUBLIC_APP_URL);
    const signUrlRaw = String(payload.signUrl || '').trim();
    const signUrl = signUrlRaw.startsWith('http') ? signUrlRaw : `${baseUrl}${signUrlRaw.startsWith('/') ? '' : '/'}${signUrlRaw}`;
    const trackerUrlRaw = String(payload.trackerUrl || '').trim();
    const trackerUrl = trackerUrlRaw
      ? trackerUrlRaw.startsWith('http')
        ? trackerUrlRaw
        : `${baseUrl}${trackerUrlRaw.startsWith('/') ? '' : '/'}${trackerUrlRaw}`
      : undefined;

    const emailHtml = await renderAsync(
        AlftSignatureRequestEmail({
            recipientName: String(payload.recipientName || '').trim() || 'Staff',
            recipientRoleLabel: payload.recipientRoleLabel,
            memberName: String(payload.memberName || '').trim() || 'Member',
            mrn: String(payload.mrn || '').trim() || undefined,
            reviewedDateLabel: String(payload.reviewedDateLabel || '').trim() || undefined,
            signUrl,
            trackerUrl,
            logoUrl: `${baseUrl}/ils-logo.png`,
        })
    );

    const memberName = String(payload.memberName || '').trim() || 'Member';
    const isRn = String(payload.recipientRoleLabel || '').toUpperCase() === 'RN';
    return await sendViaResendWithLog({
        resend,
        from: 'CalAIM Tracker <noreply@carehomefinders.com>',
        to: [to],
        subject: isRn ? `Ready for RN review — ${memberName}` : `Signature requested (${payload.recipientRoleLabel}) — ${memberName}`,
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

/** Notify SW that ALFT received final approval — log into Caspio and submit claim. */
export const sendAlftFinalApprovalSwClaimEmail = async (payload: AlftFinalApprovalSwClaimPayload) => {
    const resend = getResendClient();
    if (!resend) throw new Error('Resend API key is not configured.');

    const to = String(payload.to || '').trim();
    if (!to) throw new Error('Email recipient is required.');

    const socialWorkerName = String(payload.socialWorkerName || '').trim() || 'Social Worker';
    const firstName =
      (socialWorkerName.includes(',')
        ? socialWorkerName.split(',', 2)[1]
        : socialWorkerName.split(/\s+/, 2)[0]
      )
        ?.trim()
        .split(/\s+/, 2)[0] || 'Social Worker';
    const memberName = String(payload.memberName || '').trim() || 'Member';
    const mrn = String(payload.mrn || '').trim();
    const caspioHost = String(process.env.CASPIO_BASE_URL || 'https://c7ebl500.caspio.com')
      .replace(/\/integrations\/rest\/v\d+\/?$/i, '')
      .replace(/\/$/, '');

    const html = `
      <div style="font-family: Arial, Helvetica, sans-serif; color: #0f172a; line-height: 1.5; max-width: 620px;">
        <div style="background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border: 1px solid #6ee7b7; border-bottom: none; border-radius: 12px 12px 0 0; padding: 20px 24px;">
          <p style="margin: 0; color: #047857; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700;">CalAIM ALFT Workflow</p>
          <h2 style="margin: 6px 0 0; color: #0f172a; font-size: 20px;">Final approval — submit your claim in Caspio</h2>
        </div>
        <div style="border: 1px solid #6ee7b7; border-top: none; border-radius: 0 0 12px 12px; padding: 24px; background: #ffffff;">
          <p style="margin: 0 0 10px;">Hi ${firstName},</p>
          <p style="margin: 0 0 14px;">
            The ALFT for <strong>${memberName}</strong>${mrn ? ` (MRN: ${mrn})` : ''} has received
            <strong>final approval</strong>.
          </p>
          <p style="margin: 0 0 14px; color: #334155;">
            Please <strong>log into Caspio</strong> and <strong>submit your claim</strong> for this visit.
          </p>
          <p style="margin: 0 0 14px;">
            <a href="${caspioHost}" style="background: #059669; color: #fff; text-decoration: none; padding: 10px 14px; border-radius: 8px; display: inline-block; font-weight: 600;">
              Open Caspio
            </a>
          </p>
          <p style="margin: 0; color: #64748b; font-size: 12px;">${caspioHost}</p>
        </div>
      </div>
    `;

    return await sendViaResendWithLog({
        resend,
        from: 'CalAIM Tracker <noreply@carehomefinders.com>',
        to: [to],
        subject: `ALFT final approval — submit claim in Caspio: ${memberName}`,
        html,
        template: 'alft_final_approval_sw_claim',
        source: 'sendAlftFinalApprovalSwClaimEmail',
        metadata: { memberName, mrn: mrn || null },
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

const ILS_SERVICE_STARTED_TO = 'ils-calaim@ilshealth.com';
const DEFAULT_CLAIMS_EMAIL_TO = 'alberto@carehomefinders.com';
const DEFAULT_CLAIMS_EMAIL_NAME = 'Alberto';

const escapeEmailHtml = (value: string) =>
  String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const toEmailHtmlParagraphs = (text: string) =>
  text
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeEmailHtml(para).replace(/\n/g, '<br/>')}</p>`)
    .join('');

const buildSenderSignatureBlock = (params: {
  senderName?: string;
  senderEmail?: string;
  senderPhone?: string;
}) => {
  const senderName = String(params.senderName || '').trim() || 'CalAIM Team';
  const senderEmail = String(params.senderEmail || '').trim();
  const senderPhone = String(params.senderPhone || '').trim() || '800-330-5993';
  return ['Thank You!', '', senderName, senderEmail || null, senderPhone || null]
    .filter((line) => line !== null)
    .join('\n');
};

const ensureSenderSignature = (body: string, signature: string) => {
  const normalized = String(body || '').trim();
  const normalizedSignature = String(signature || '').trim();
  if (!normalizedSignature) return normalized;
  if (/thank\s*you!?/i.test(normalized)) return normalized;
  return `${normalized}\n\n${normalizedSignature}`;
};

export type IlsServiceStartedEmailPayload = {
  memberName: string;
  memberMrn?: string;
  applicationId?: string;
  replyTo?: string;
  ilsSubject?: string;
  ilsBody?: string;
  senderName?: string;
  senderEmail?: string;
  senderPhone?: string;
};

export const sendIlsServiceStartedEmails = async (payload: IlsServiceStartedEmailPayload) => {
  const resend = getResendClient();
  if (!resend) throw new Error('Resend API key is not configured.');

  const memberName = String(payload.memberName || '').trim() || 'Member';
  const memberMrn = String(payload.memberMrn || '').trim();
  const senderName = String(payload.senderName || '').trim() || 'CalAIM Team';
  const senderEmail = String(payload.senderEmail || payload.replyTo || '').trim();
  const senderPhone = String(payload.senderPhone || '').trim() || '800-330-5993';
  const signature = buildSenderSignatureBlock({ senderName, senderEmail, senderPhone });

  const ilsSubject =
    String(payload.ilsSubject || '').trim() ||
    `To ILS: Re: ${memberName}${memberMrn ? `: ${memberMrn}` : ''}`;
  const ilsText = ensureSenderSignature(
    String(payload.ilsBody || '').trim() ||
      [
        'Hi ILS,',
        '',
        'Please note we have STARTED service delivery for this member.',
        '',
        `Member: ${memberName}${memberMrn ? ` | MRN: ${memberMrn}` : ''}`,
      ].join('\n'),
    signature
  );
  const ilsHtml = `
    <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.5; max-width: 640px;">
      ${toEmailHtmlParagraphs(ilsText)}
    </div>
  `;

  const replyTo = String(payload.replyTo || senderEmail || '').trim();
  const replyToList = replyTo && replyTo.includes('@') ? [replyTo] : [];
  const metadata = {
    applicationId: String(payload.applicationId || '').trim() || undefined,
    memberName,
    memberMrn: memberMrn || undefined,
    senderName,
    senderEmail: senderEmail || undefined,
  };

  const ilsResult = await sendViaResendWithLog({
    resend,
    from: 'CalAIM Pathfinder <noreply@carehomefinders.com>',
    to: [ILS_SERVICE_STARTED_TO],
    subject: ilsSubject,
    html: ilsHtml,
    text: ilsText,
    template: 'ils_service_started',
    source: 'sendIlsServiceStartedEmails',
    metadata,
    ...(replyToList.length ? { replyTo: replyToList } : {}),
  });

  return {
    success: true,
    ilsTo: ILS_SERVICE_STARTED_TO,
    ilsSubject,
    ilsResult,
  };
};

export type ClaimsDepartmentEmailPayload = {
  memberName: string;
  memberMrn?: string;
  applicationId?: string;
  replyTo?: string;
  staffName?: string;
  staffEmail?: string;
  staffSubject?: string;
  staffBody?: string;
  senderName?: string;
  senderEmail?: string;
  senderPhone?: string;
};

export const sendClaimsDepartmentEmail = async (payload: ClaimsDepartmentEmailPayload) => {
  const resend = getResendClient();
  if (!resend) throw new Error('Resend API key is not configured.');

  const memberName = String(payload.memberName || '').trim() || 'Member';
  const memberMrn = String(payload.memberMrn || '').trim();
  const staffName = String(payload.staffName || '').trim() || DEFAULT_CLAIMS_EMAIL_NAME;
  const staffEmail =
    String(payload.staffEmail || DEFAULT_CLAIMS_EMAIL_TO).trim().toLowerCase() || DEFAULT_CLAIMS_EMAIL_TO;
  if (!staffEmail.includes('@')) {
    throw new Error('Claims email recipient is invalid.');
  }

  const senderName = String(payload.senderName || '').trim() || 'CalAIM Team';
  const senderEmail = String(payload.senderEmail || payload.replyTo || '').trim();
  const senderPhone = String(payload.senderPhone || '').trim() || '800-330-5993';
  const signature = buildSenderSignatureBlock({ senderName, senderEmail, senderPhone });

  const staffSubject =
    String(payload.staffSubject || '').trim() ||
    `Start claims: ${memberName}${memberMrn ? ` (MRN ${memberMrn})` : ''}`;
  const staffText = ensureSenderSignature(
    String(payload.staffBody || '').trim() ||
      [
        `Hi ${staffName.split(/\s+/)[0] || DEFAULT_CLAIMS_EMAIL_NAME},`,
        '',
        'Please start submitting claims for this member.',
        '',
        `Member: ${memberName}${memberMrn ? ` | MRN: ${memberMrn}` : ''}`,
      ].join('\n'),
    signature
  );
  const staffHtml = `
    <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.5; max-width: 640px;">
      ${toEmailHtmlParagraphs(staffText)}
    </div>
  `;

  const replyTo = String(payload.replyTo || senderEmail || '').trim();
  const replyToList = replyTo && replyTo.includes('@') ? [replyTo] : [];
  const metadata = {
    applicationId: String(payload.applicationId || '').trim() || undefined,
    memberName,
    memberMrn: memberMrn || undefined,
    staffEmail,
    staffName,
    senderName,
    senderEmail: senderEmail || undefined,
  };

  const staffResult = await sendViaResendWithLog({
    resend,
    from: 'CalAIM Pathfinder <noreply@carehomefinders.com>',
    to: [staffEmail],
    subject: staffSubject,
    html: staffHtml,
    text: staffText,
    template: 'claims_department_start_claims',
    source: 'sendClaimsDepartmentEmail',
    metadata,
    ...(replyToList.length ? { replyTo: replyToList } : {}),
  });

  return {
    success: true,
    staffTo: staffEmail,
    staffSubject,
    staffResult,
  };
};
