import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import admin from 'firebase-admin';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';

const APP_BASE_URL = 'https://connectcalaim.com';
const FROM_EMAIL = 'CalAIM Pathfinder <noreply@carehomefinders.com>';
const EMAIL_TEMPLATE = 'introductory_application_invite';
const EMAIL_SOURCE = '/api/admin/send-introductory-email';

type IntroEmailMode = 'preview' | 'send';

function normalizeEmail(value: unknown): string {
  return String(value || '').trim();
}

function isValidEmail(value: string): boolean {
  const email = String(value || '').trim();
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

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

function getMissingRequestedDocuments(appData: Record<string, unknown>): string[] {
  const forms = Array.isArray(appData?.forms) ? (appData.forms as Array<Record<string, unknown>>) : [];
  const internalExclusions = new Set(['eligibility screenshot', 'eligibility check']);
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
    ? `We have received Kaiser authorization for ${memberName} for the California Advancing and Innovating Medi-Cal (CalAIM) program for Assisted Living Transitions${memberMrn ? ` (MRN: ${memberMrn})` : ''}. We need the required documents below to move forward.`
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
    subject: `To ${contactName || 'Primary Contact'}, Re: ${memberName} For Kaiser CalAIM Assisted Living Transitions Program - Next Steps`,
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
    const memberName = String(
      `${appData.memberFirstName || ''} ${appData.memberLastName || ''}`
    ).trim() || 'CalAIM Member';
    const contactName = String(
      `${appData.bestContactFirstName || appData.referrerFirstName || ''} ${appData.bestContactLastName || appData.referrerLastName || ''}`
    ).trim();
    const memberMrn = String(appData.memberMrn || '').trim();
    const kaiserAuthorizationMode = String(appData.kaiserAuthorizationMode || '').trim().toLowerCase();
    const intakeType = String(appData.intakeType || '').trim().toLowerCase();
    const hasKaiserAuthorizationAtIntake =
      kaiserAuthorizationMode === 'authorization_received' ||
      Boolean(appData.kaiserAuthReceivedViaIls) ||
      intakeType === 'kaiser_auth_received_via_ils';
    const toEmailDefault =
      normalizeEmail(appData.bestContactEmail) ||
      normalizeEmail(appData.referrerEmail) ||
      normalizeEmail(appData.repEmail) ||
      normalizeEmail(appData.secondaryContactEmail);
    const primaryContactEmail = normalizeEmail(appData.bestContactEmail);
    const senderName = String(adminCheck.name || adminCheck.email || 'Staff').trim();
    const senderEmail = normalizeEmail(adminCheck.email);
    const baseUrl = getAppBaseUrl();
    const missingDocuments = getMissingRequestedDocuments(appData);
    const defaults = buildDefaultDraft({
      applicationId,
      memberName,
      contactName,
      memberMrn,
      hasKaiserAuthorizationAtIntake,
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
      });
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
        from: FROM_EMAIL,
        to: toRecipients,
        ...(ccRecipients.length > 0 ? { cc: ccRecipients } : {}),
        ...(isValidEmail(senderEmail) ? { replyTo: senderEmail } : {}),
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
        from: FROM_EMAIL,
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
          ccRecipients,
        },
      });

      await appRef.set(
        {
          introEmailLastSentAt: admin.firestore.FieldValue.serverTimestamp(),
          introEmailLastSentTo: toRecipients.join(', '),
          introEmailLastSentByUid: adminCheck.uid,
          introEmailLastSentByEmail: adminCheck.email,
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
        from: FROM_EMAIL,
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
