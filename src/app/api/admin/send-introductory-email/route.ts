import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import admin from 'firebase-admin';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import introEmailSenderUtils from '@/lib/intro-email-sender';

const APP_BASE_URL = 'https://connectcalaim.com';
const EMAIL_TEMPLATE = 'introductory_application_invite';
const EMAIL_SOURCE = '/api/admin/send-introductory-email';
const DEFAULT_FROM_EMAIL = 'noreply@carehomefinders.com';
const VERIFIED_SENDER_DOMAIN = String(process.env.RESEND_VERIFIED_SENDER_DOMAIN || 'carehomefinders.com')
  .trim()
  .toLowerCase();

const {
  normalizeEmail,
  isValidEmail,
  resolvePreferredSenderIdentity,
  buildIntroEmailSender,
} = introEmailSenderUtils as any;

type IntroEmailMode = 'preview' | 'send';

function parseEmailList(value: unknown): string[] {
  const raw = String(value || '').trim();
  if (!raw) return [];
  const deduped = new Map<string, string>();
  raw
    .split(/[;,]/)
    .map((part) => normalizeEmail(part))
    .filter((email) => isValidEmail(email))
    .forEach((email) => {
      const key = email.toLowerCase();
      if (!deduped.has(key)) deduped.set(key, email);
    });
  return Array.from(deduped.values());
}

function htmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function toHtmlBody(message: string): string {
  return `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #0f172a; line-height: 1.6; max-width: 640px;">
      ${htmlEscape(message).replaceAll('\n', '<br/>')}
    </div>
  `;
}

function getAppBaseUrl(): string {
  return APP_BASE_URL;
}

async function resolveAssignedCaseManagerSender(args: {
  adminDb: any;
  appData: Record<string, unknown>;
  fallbackName: string;
  fallbackEmail: string;
}): Promise<{ senderName: string; senderEmail: string; senderSource: string }> {
  const { adminDb, appData, fallbackName, fallbackEmail } = args;
  const assignedStaffId = String(appData.assignedStaffId || '').trim();
  const assignedStaffName = String(appData.assignedStaffName || '').trim();
  const assignedStaffEmailFromApp = normalizeEmail(appData.assignedStaffEmail);

  const fallback = resolvePreferredSenderIdentity({
    assignedProfileName: assignedStaffName,
    assignedProfileEmail: '',
    assignedAppName: assignedStaffName,
    assignedAppEmail: assignedStaffEmailFromApp,
    fallbackName,
    fallbackEmail,
  });

  if (!assignedStaffId) return fallback;

  try {
    const staffSnap = await adminDb.collection('users').doc(assignedStaffId).get();
    if (!staffSnap.exists) return fallback;
    const staffData = (staffSnap.data() || {}) as Record<string, unknown>;
    const profileEmail = normalizeEmail(staffData.email);
    const profileName = String(
      staffData.displayName ||
        `${String(staffData.firstName || '').trim()} ${String(staffData.lastName || '').trim()}`
    )
      .trim()
      .replace(/\s+/g, ' ');

    return resolvePreferredSenderIdentity({
      assignedProfileName: profileName,
      assignedProfileEmail: profileEmail,
      assignedAppName: assignedStaffName,
      assignedAppEmail: assignedStaffEmailFromApp,
      fallbackName,
      fallbackEmail,
    });
  } catch {
    return fallback;
  }
}

function getMissingRequestedDocuments(appData: Record<string, unknown>): string[] {
  const forms = Array.isArray(appData?.forms) ? (appData.forms as Array<Record<string, unknown>>) : [];
  const internalExclusions = new Set([
    'eligibility screenshot',
    'eligibility check',
    'room and board/tier level agreement',
    'room and board/tier level commitment',
    'room and board commitment',
  ]);
  const items = forms
    .filter((form) => {
      const name = String(form?.name || '').trim();
      if (!name) return false;
      const normalizedName = name.toLowerCase();
      if (normalizedName === 'cs member summary' || normalizedName === 'cs summary') return false;
      if (internalExclusions.has(normalizedName)) return false;
      if (String(form?.type || '').trim().toLowerCase() === 'info') return false;
      const status = String(form?.status || '').trim().toLowerCase();
      return status !== 'completed';
    })
    .map((form) => String(form?.name || '').trim())
    .filter(Boolean);

  return Array.from(new Set(items));
}

function getFirstNameOnly(name: string): string {
  const cleaned = String(name || '').trim();
  if (!cleaned) return '';
  return cleaned.split(/\s+/)[0] || '';
}

function buildDefaultDraft(params: {
  applicationId: string;
  memberName: string;
  contactName: string;
  memberMrn: string;
  hasKaiserAuthorizationAtIntake: boolean;
  hasPriorIntroEmail: boolean;
  baseUrl: string;
  missingDocuments: string[];
  senderName: string;
  senderEmail: string;
}): { subject: string; message: string } {
  const {
    applicationId,
    memberName,
    contactName,
    memberMrn,
    hasKaiserAuthorizationAtIntake,
    hasPriorIntroEmail,
    baseUrl,
    missingDocuments,
    senderName,
    senderEmail,
  } = params;
  const greetingFirstName = getFirstNameOnly(contactName) || 'there';
  const loginUrl = `${baseUrl}/login`;
  const signupUrl = `${baseUrl}/signup`;
  const inviteUrl = `${baseUrl}/invite/continue?applicationId=${encodeURIComponent(applicationId)}`;
  const kaiserAuthorizationLine = hasKaiserAuthorizationAtIntake
    ? hasPriorIntroEmail
      ? `This is a reminder to sign in and continue the existing Kaiser-authorized CalAIM Assisted Living Transitions application for ${memberName}${memberMrn ? ` (MRN: ${memberMrn})` : ''}.`
      : `We have received Kaiser authorization for ${memberName} for the California Advancing and Innovating Medi-Cal (CalAIM) program for Assisted Living Transitions${memberMrn ? ` (MRN: ${memberMrn})` : ''}. We need the required documents below to move forward.`
    : hasPriorIntroEmail
      ? `This is a reminder to continue the CalAIM application for ${memberName}.`
      : `We started a CalAIM application for ${memberName} and we are ready for next steps.`;
  const missingDocumentsSection = missingDocuments.length
    ? [
        '',
        'Missing documents requested:',
        ...missingDocuments.map((item) => `- ${item}`),
      ]
    : [];
  const supportLine = `For any questions, please contact ${senderName || 'our team'}${senderEmail ? ` at ${senderEmail}` : ''} or call 800-330-5993.`;

  return {
    subject: hasPriorIntroEmail
      ? `Reminder: ${memberName} CalAIM Assisted Living Transitions - Portal Action Needed`
      : `To ${contactName || 'Primary Contact'}, Re: ${memberName} For Kaiser CalAIM Assisted Living Transitions Program - Next Steps`,
    message: [
      `Hello ${greetingFirstName},`,
      '',
      kaiserAuthorizationLine,
      '',
      'Please sign in to the Connect CalAIM portal to continue and upload required documents:',
      `- Sign in: ${loginUrl}`,
      `- Create account (if new): ${signupUrl}`,
      '',
      'Please use this same email address for your account so we can match it correctly.',
      ...missingDocumentsSection,
      '',
      'After signing in, open My Applications and select the member application.',
      '',
      "If you do not see the application, use this secure link to connect it:",
      inviteUrl,
      '',
      'You may be asked to verify:',
      '- Application ID',
      '- Member last name',
      '- Member date of birth',
      '',
      supportLine,
      '',
      'Thank you,',
      'Connections Care Home Consultants',
    ].join('\n'),
  };
}

export async function POST(request: NextRequest) {
  const adminCheck = await requireAdminApiAuth(request, { requireSuperAdmin: false, requireTwoFactor: true });
  if (!adminCheck.ok) {
    return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const mode = String(body.mode || 'preview').trim().toLowerCase() as IntroEmailMode;
    if (mode !== 'preview' && mode !== 'send') {
      return NextResponse.json({ success: false, error: 'Invalid mode. Use preview or send.' }, { status: 400 });
    }

    const applicationId = String(body.applicationId || '').trim();
    if (!applicationId) {
      return NextResponse.json({ success: false, error: 'Application ID is required.' }, { status: 400 });
    }

    const appRef = adminCheck.adminDb.collection('applications').doc(applicationId);
    const appSnap = await appRef.get();
    if (!appSnap.exists) {
      return NextResponse.json({ success: false, error: 'Application not found.' }, { status: 404 });
    }

    const appData = (appSnap.data() || {}) as Record<string, unknown>;
    const assignedStaffId = String(appData.assignedStaffId || '').trim();
    const memberName = String(
      `${appData.memberFirstName || ''} ${appData.memberLastName || ''}`
    ).trim() || 'CalAIM Member';
    const contactName = String(
      `${appData.bestContactFirstName || ''} ${appData.bestContactLastName || ''}`
    ).trim();
    const memberMrn = String(appData.memberMrn || '').trim();
    const kaiserAuthorizationMode = String(appData.kaiserAuthorizationMode || '').trim().toLowerCase();
    const intakeType = String(appData.intakeType || '').trim().toLowerCase();
    const hasKaiserAuthorizationAtIntake =
      kaiserAuthorizationMode === 'authorization_received' ||
      Boolean(appData.kaiserAuthReceivedViaIls) ||
      intakeType === 'kaiser_auth_received_via_ils';
    const toEmailDefault = normalizeEmail(appData.bestContactEmail);
    const primaryContactEmail = normalizeEmail(appData.bestContactEmail);
    const fallbackSenderName = String(adminCheck.name || adminCheck.email || 'Staff').trim();
    const fallbackSenderEmail = normalizeEmail(adminCheck.email);
    const senderResolved = await resolveAssignedCaseManagerSender({
      adminDb: adminCheck.adminDb,
      appData,
      fallbackName: fallbackSenderName,
      fallbackEmail: fallbackSenderEmail,
    });
    const senderName = senderResolved.senderName;
    const senderEmail = senderResolved.senderEmail;
    const senderTransport = buildIntroEmailSender({
      senderName,
      senderEmail,
      fallbackName: fallbackSenderName || 'CalAIM Pathfinder',
      fallbackEmail: fallbackSenderEmail || DEFAULT_FROM_EMAIL,
      verifiedSenderDomain: VERIFIED_SENDER_DOMAIN,
      defaultFromEmail: DEFAULT_FROM_EMAIL,
    });
    const fromEmail = String(senderTransport.fromEmail || '').trim();
    const replyToEmail = String(senderTransport.replyTo || '').trim();
    const baseUrl = getAppBaseUrl();
    const missingDocuments = getMissingRequestedDocuments(appData);
    const hasPriorIntroEmail = Boolean(
      appData.introEmailLastSentAt ||
        (Array.isArray(appData.introEmailSendHistory) && (appData.introEmailSendHistory as unknown[]).length > 0)
    );
    const defaults = buildDefaultDraft({
      applicationId,
      memberName,
      contactName,
      memberMrn,
      hasKaiserAuthorizationAtIntake,
      hasPriorIntroEmail,
      baseUrl,
      missingDocuments,
      senderName,
      senderEmail,
    });

    const to = String(body.to || toEmailDefault).trim();
    const subject = String(body.subject || defaults.subject).trim();
    const message = String(body.message || defaults.message).trim();
    const toRecipients = parseEmailList(to);
    const requestedCc = parseEmailList(body.cc);
    const senderShouldBeCc =
      isValidEmail(senderEmail) &&
      !toRecipients.some((email) => email.toLowerCase() === senderEmail.toLowerCase());
    const ccBase = requestedCc.length > 0 ? requestedCc : senderShouldBeCc ? [senderEmail] : [];
    const ccDedup = new Map<string, string>();
    ccBase.forEach((email) => {
      if (!toRecipients.some((toEmail) => toEmail.toLowerCase() === email.toLowerCase())) {
        ccDedup.set(email.toLowerCase(), email);
      }
    });
    const ccRecipients = Array.from(ccDedup.values());
    const sentToPrimaryContact =
      Boolean(primaryContactEmail) &&
      toRecipients.some((email) => email.toLowerCase() === primaryContactEmail.toLowerCase());

    if (mode === 'preview') {
      return NextResponse.json({
        success: true,
        draft: { to: toRecipients.join(', '), cc: ccRecipients.join(', '), subject, message },
        sender: {
          name: senderName || null,
          email: senderEmail || null,
          from: fromEmail,
          source: senderResolved.senderSource || null,
          usesFallbackFrom: Boolean(senderTransport.usesFallbackFrom),
          canSendAsResolvedSender: Boolean(senderTransport.canSendAsResolvedSender),
          warning: String(senderTransport.warning || ''),
          verifiedSenderDomain: VERIFIED_SENDER_DOMAIN || null,
        },
      });
    }

    if (!assignedStaffId) {
      return NextResponse.json(
        { success: false, error: 'Assigned case manager is required before sending an introductory invite.' },
        { status: 400 }
      );
    }

    if (toRecipients.length === 0 || !subject || !message) {
      return NextResponse.json(
        { success: false, error: 'Recipient, subject, and message are required to send.' },
        { status: 400 }
      );
    }

    const resendApiKey = String(process.env.RESEND_API_KEY || '').trim();
    if (!resendApiKey) {
      return NextResponse.json({ success: false, error: 'RESEND_API_KEY is not configured.' }, { status: 500 });
    }

    const resend = new Resend(resendApiKey);
    const html = toHtmlBody(message);
    const text = message;

    let providerMessageId = '';
    try {
      const result = await resend.emails.send({
        from: fromEmail,
        to: toRecipients,
        ...(ccRecipients.length > 0 ? { cc: ccRecipients } : {}),
        ...(isValidEmail(replyToEmail) ? { replyTo: replyToEmail } : {}),
        subject,
        html,
        text,
      });

      const sendError = (result as any)?.error;
      if (sendError) {
        throw new Error(String(sendError?.message || 'Resend email send failed.'));
      }
      providerMessageId = String((result as any)?.data?.id || '').trim();

      await adminCheck.adminDb.collection('emailLogs').add({
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'success',
        template: EMAIL_TEMPLATE,
        source: EMAIL_SOURCE,
        from: fromEmail,
        to: toRecipients,
        cc: ccRecipients.length > 0 ? ccRecipients : null,
        subject,
        provider: 'resend',
        providerMessageId: providerMessageId || null,
        errorMessage: null,
        metadata: {
          applicationId,
          memberName,
          primaryContactEmail: primaryContactEmail || null,
          sentToPrimaryContact,
          sentByUid: adminCheck.uid,
          sentByEmail: adminCheck.email,
          sentByName: adminCheck.name,
          senderEmail,
          senderName,
          senderSource: senderResolved.senderSource || null,
          senderUsesFallbackFrom: Boolean(senderTransport.usesFallbackFrom),
          senderWarning: String(senderTransport.warning || ''),
          replyToEmail: isValidEmail(replyToEmail) ? replyToEmail : null,
          ccRecipients,
        },
      });

      await appRef.set(
        {
          introEmailLastSentAt: admin.firestore.FieldValue.serverTimestamp(),
          introEmailLastSentTo: toRecipients.join(', '),
          introEmailLastSentByUid: adminCheck.uid,
          introEmailLastSentByEmail: adminCheck.email,
          introEmailSendHistory: admin.firestore.FieldValue.arrayUnion({
            sentAtIso: new Date().toISOString(),
            to: toRecipients.join(', '),
            sentByUid: adminCheck.uid,
            sentByEmail: adminCheck.email,
            sentByName: adminCheck.name,
          }),
        },
        { merge: true }
      );
    } catch (sendError: any) {
      const errorMessage = String(sendError?.message || 'Failed to send introductory email.');
      await adminCheck.adminDb.collection('emailLogs').add({
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'failure',
        template: EMAIL_TEMPLATE,
        source: EMAIL_SOURCE,
        from: fromEmail,
        to: toRecipients,
        cc: ccRecipients.length > 0 ? ccRecipients : null,
        subject,
        provider: 'resend',
        providerMessageId: providerMessageId || null,
        errorMessage,
        metadata: {
          applicationId,
          memberName,
          primaryContactEmail: primaryContactEmail || null,
          sentToPrimaryContact,
          sentByUid: adminCheck.uid,
          sentByEmail: adminCheck.email,
          sentByName: adminCheck.name,
          senderEmail,
          senderName,
          senderSource: senderResolved.senderSource || null,
          senderUsesFallbackFrom: Boolean(senderTransport.usesFallbackFrom),
          senderWarning: String(senderTransport.warning || ''),
          replyToEmail: isValidEmail(replyToEmail) ? replyToEmail : null,
          ccRecipients,
        },
      });
      throw sendError;
    }

    return NextResponse.json({
      success: true,
      message: 'Introductory email sent successfully.',
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Unexpected send-introductory-email error.') },
      { status: 500 }
    );
  }
}
