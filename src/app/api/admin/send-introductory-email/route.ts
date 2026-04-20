import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import admin from 'firebase-admin';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';

const DEFAULT_APP_BASE_URL = 'https://connectcalaim.com';
const FROM_EMAIL = 'CalAIM Pathfinder <noreply@carehomefinders.com>';
const EMAIL_TEMPLATE = 'introductory_application_invite';
const EMAIL_SOURCE = '/api/admin/send-introductory-email';

type IntroEmailMode = 'preview' | 'send';

function normalizeEmail(value: unknown): string {
  return String(value || '').trim();
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
  const raw = String(process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || DEFAULT_APP_BASE_URL).trim();
  if (!raw) return DEFAULT_APP_BASE_URL;
  try {
    const parsed = new URL(raw);
    return `${parsed.origin}`.replace(/\/$/, '');
  } catch {
    return DEFAULT_APP_BASE_URL;
  }
}

function buildDefaultDraft(params: {
  applicationId: string;
  memberName: string;
  contactName: string;
  baseUrl: string;
}): { subject: string; message: string } {
  const { applicationId, memberName, contactName, baseUrl } = params;
  const greeting = contactName || 'there';
  const loginUrl = `${baseUrl}/login`;
  const signupUrl = `${baseUrl}/signup`;
  const inviteUrl = `${baseUrl}/invite/continue?applicationId=${encodeURIComponent(applicationId)}`;

  return {
    subject: `Welcome to Connect CalAIM - Next Steps for ${memberName}`,
    message: [
      `Hello ${greeting},`,
      '',
      `We started a CalAIM application for ${memberName} and we are ready for next steps.`,
      '',
      'Please sign in to the Connect CalAIM portal to continue and upload required documents:',
      `- Sign in: ${loginUrl}`,
      `- Create account (if new): ${signupUrl}`,
      '',
      'Please use this same email address for your account so we can match it correctly.',
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
      'If you need help, reply to this email and our team will assist.',
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
    const toEmailDefault =
      normalizeEmail(appData.bestContactEmail) ||
      normalizeEmail(appData.referrerEmail) ||
      normalizeEmail(appData.repEmail) ||
      normalizeEmail(appData.secondaryContactEmail);
    const baseUrl = getAppBaseUrl();
    const defaults = buildDefaultDraft({ applicationId, memberName, contactName, baseUrl });

    const to = String(body.to || toEmailDefault).trim();
    const subject = String(body.subject || defaults.subject).trim();
    const message = String(body.message || defaults.message).trim();

    if (mode === 'preview') {
      return NextResponse.json({
        success: true,
        draft: { to, subject, message },
      });
    }

    if (!to || !subject || !message) {
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
        to: [to],
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
        to: [to],
        subject,
        provider: 'resend',
        providerMessageId: providerMessageId || null,
        errorMessage: null,
        metadata: {
          applicationId,
          memberName,
          sentByUid: adminCheck.uid,
          sentByEmail: adminCheck.email,
          sentByName: adminCheck.name,
        },
      });

      await appRef.set(
        {
          introEmailLastSentAt: admin.firestore.FieldValue.serverTimestamp(),
          introEmailLastSentTo: to,
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
        to: [to],
        subject,
        provider: 'resend',
        providerMessageId: providerMessageId || null,
        errorMessage,
        metadata: {
          applicationId,
          memberName,
          sentByUid: adminCheck.uid,
          sentByEmail: adminCheck.email,
          sentByName: adminCheck.name,
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
