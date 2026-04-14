import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

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

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SendPayload;
    const to = String(body?.to || '').trim();
    const region = String(body?.region || '').trim();
    const pdfBase64 = String(body?.pdfBase64 || '').trim();
    const fileName = String(body?.fileName || 'kaiser_referral.pdf').trim();

    if (!to || !pdfBase64) {
      return NextResponse.json({ success: false, error: 'Missing required email payload.' }, { status: 400 });
    }

    const resendKey = String(process.env.RESEND_API_KEY || '').trim();
    if (!resendKey) {
      return NextResponse.json({ success: false, error: 'RESEND_API_KEY is not configured.' }, { status: 500 });
    }

    const fromAddress = String(process.env.EMAIL_FROM || 'Connections CalAIM <notifications@calaim-app.com>').trim();
    const resend = new Resend(resendKey);
    const memberName = String(body?.memberName || 'Member').trim();
    const memberMrn = String(body?.memberMrn || '').trim();
    const memberCounty = String(body?.memberCounty || '').trim();
    const referrerName = String(body?.referrerName || '').trim();
    const appId = String(body?.applicationId || '').trim();

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

    const { error } = await resend.emails.send({
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
      return NextResponse.json({ success: false, error: String(error.message || 'Email send failed.') }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Unexpected error while sending.') },
      { status: 500 }
    );
  }
}

