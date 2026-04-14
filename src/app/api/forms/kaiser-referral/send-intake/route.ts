import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import admin, { adminDb } from '@/firebase-admin';

type SendPayload = {
  to: string;
  region: string;
  applicationId?: string;
  memberName?: string;
  memberMrn?: string;
  memberCounty?: string;
  referrerName?: string;
  customSubject?: string;
  customMessage?: string;
  pdfBase64: string;
  fileName?: string;
};

const ILS_CC_EMAIL = 'ils-calaim@ilshealth.com';
const KAISER_REFERRAL_FROM = 'alberto@carehomefinders.com';

async function logKaiserReferralEmail(params: {
  status: 'success' | 'failure';
  from: string;
  to: string;
  cc: string[];
  subject: string;
  providerMessageId?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    await adminDb.collection('emailLogs').add({
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      status: params.status,
      template: 'kaiser-referral-intake',
      source: '/api/forms/kaiser-referral/send-intake',
      from: params.from,
      to: [params.to],
      cc: params.cc,
      subject: params.subject,
      provider: 'resend',
      providerMessageId: params.providerMessageId || null,
      errorMessage: params.errorMessage || null,
      metadata: params.metadata || {},
    });
  } catch (error) {
    console.error('Failed to write Kaiser referral email log:', error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SendPayload;
    const to = String(body?.to || '').trim();
    const region = String(body?.region || '').trim();
    const pdfBase64 = String(body?.pdfBase64 || '').trim();
    const fileName = String(body?.fileName || 'kaiser_referral.pdf').trim();

    if (!to || !pdfBase64) {
      await logKaiserReferralEmail({
        status: 'failure',
        from: KAISER_REFERRAL_FROM,
        to,
        cc: [ILS_CC_EMAIL],
        subject: 'Kaiser referral send failed (invalid payload)',
        errorMessage: 'Missing required email payload.',
        metadata: {
          route: '/api/forms/kaiser-referral/send-intake',
        },
      });
      return NextResponse.json({ success: false, error: 'Missing required email payload.' }, { status: 400 });
    }

    const resendKey = String(process.env.RESEND_API_KEY || '').trim();
    if (!resendKey) {
      await logKaiserReferralEmail({
        status: 'failure',
        from: KAISER_REFERRAL_FROM,
        to,
        cc: [ILS_CC_EMAIL],
        subject: 'Kaiser referral send failed (missing RESEND_API_KEY)',
        errorMessage: 'RESEND_API_KEY is not configured.',
        metadata: {
          route: '/api/forms/kaiser-referral/send-intake',
        },
      });
      return NextResponse.json({ success: false, error: 'RESEND_API_KEY is not configured.' }, { status: 500 });
    }

    const fromAddress = KAISER_REFERRAL_FROM;
    const resend = new Resend(resendKey);
    const memberName = String(body?.memberName || 'Member').trim();
    const memberMrn = String(body?.memberMrn || '').trim();
    const memberCounty = String(body?.memberCounty || '').trim();
    const referrerName = String(body?.referrerName || '').trim();
    const appId = String(body?.applicationId || '').trim();
    const metadata = {
      region,
      applicationId: appId || null,
      memberName: memberName || null,
      memberMrn: memberMrn || null,
      memberCounty: memberCounty || null,
      referrerName: referrerName || null,
      fileName,
    };

    const subject = String(body?.customSubject || '').trim() || `CS Referral for Member Name: ${memberName} and MRN: ${memberMrn || 'N/A'}`;
    const customMessage = String(body?.customMessage || '').trim();
    const html = `
      <div style="font-family: Arial, sans-serif; font-size: 14px; color: #111827;">
        <p>Hello ${region},</p>
        <p>${(customMessage || 'Please find attached the reviewed Kaiser Community Supports referral PDF.').replace(/\n/g, '<br/>')}</p>
        <p>
          <strong>Member:</strong> ${memberName}<br/>
          <strong>MRN:</strong> ${memberMrn || 'N/A'}<br/>
          <strong>County:</strong> ${memberCounty || 'N/A'}<br/>
          <strong>Application ID:</strong> ${appId || 'N/A'}<br/>
          <strong>Referrer:</strong> ${referrerName || 'N/A'}
        </p>
        <p>Thank you.</p>
      </div>
    `;

    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: [to],
      cc: [ILS_CC_EMAIL],
      subject,
      html,
      attachments: [
        {
          filename: fileName.toLowerCase().endsWith('.pdf') ? fileName : `${fileName}.pdf`,
          content: pdfBase64,
        },
      ],
    });

    if (error) {
      await logKaiserReferralEmail({
        status: 'failure',
        from: fromAddress,
        to,
        cc: [ILS_CC_EMAIL],
        subject,
        errorMessage: String(error.message || 'Email send failed.'),
        metadata,
      });
      return NextResponse.json({ success: false, error: String(error.message || 'Email send failed.') }, { status: 500 });
    }

    await logKaiserReferralEmail({
      status: 'success',
      from: fromAddress,
      to,
      cc: [ILS_CC_EMAIL],
      subject,
      providerMessageId: String(data?.id || ''),
      metadata,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    await logKaiserReferralEmail({
      status: 'failure',
      from: KAISER_REFERRAL_FROM,
      to: 'unknown',
      cc: [ILS_CC_EMAIL],
      subject: 'Kaiser referral send failed (unexpected error)',
      errorMessage: String(error?.message || 'Unexpected error while sending.'),
      metadata: {
        route: '/api/forms/kaiser-referral/send-intake',
      },
    });
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Unexpected error while sending.') },
      { status: 500 }
    );
  }
}

