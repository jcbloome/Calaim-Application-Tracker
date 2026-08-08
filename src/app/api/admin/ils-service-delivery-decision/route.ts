import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (value: unknown) => String(value || '').trim();
const normalizeEmail = (value: unknown) => clean(value).toLowerCase();
const ILS_DECISION_RECIPIENTS = ['ils-calaim@ilshealth.com', 'jason@carehomefinders.com'];
const ILS_DECISION_SIGNATURE = ['Jason Bloome', 'Connections Care Home Consultants', '800-330-5993'].join('\n');

let resendClient: Resend | null = null;
const getResendClient = () => {
  if (resendClient) return resendClient;
  const apiKey = clean(process.env.RESEND_API_KEY);
  if (!apiKey) return null;
  resendClient = new Resend(apiKey);
  return resendClient;
};

export async function POST(req: NextRequest) {
  try {
    const authCheck = await requireAdminApiAuth(req, { requireTwoFactor: true });
    if (!authCheck.ok) {
      return NextResponse.json({ success: false, error: authCheck.error }, { status: authCheck.status });
    }

    const resend = getResendClient();
    if (!resend) {
      return NextResponse.json({ success: false, error: 'RESEND_API_KEY is not configured.' }, { status: 500 });
    }

    const body = (await req.json().catch(() => ({} as any))) as any;
    const rowId = clean(body?.rowId);
    const sourceType = clean(body?.sourceType);
    const sourceFileName = clean(body?.sourceFileName);
    const memberName = clean(body?.memberName);
    const memberMrn = clean(body?.memberMrn);
    const memberCounty = clean(body?.memberCounty);
    const memberClientId = clean(body?.memberClientId);
    const choice = clean(body?.choice).toLowerCase();
    if (!memberName) {
      return NextResponse.json({ success: false, error: 'memberName is required.' }, { status: 400 });
    }
    if (choice !== 'accept' && choice !== 'decline') {
      return NextResponse.json({ success: false, error: "choice must be 'accept' or 'decline'." }, { status: 400 });
    }

    const decisionText =
      choice === 'accept'
        ? 'Please note we have STARTED service delivery for this member.'
        : 'Please note we have DECLINED service delivery for this member.';
    const subject = `To ILS RE: ${memberName}: MRN: ${memberMrn || 'N/A'}`;
    const actedByName = clean(authCheck.name) || normalizeEmail(authCheck.email) || 'Staff';
    const actedByEmail = normalizeEmail(authCheck.email);
    const messageLines = [
      'Dear ILS,',
      '',
      decisionText,
      '',
      `Member: ${memberName}`,
      `MRN: ${memberMrn || 'N/A'}`,
      `County: ${memberCounty || 'N/A'}`,
      '',
      ILS_DECISION_SIGNATURE,
    ].filter(Boolean);
    const message = messageLines.join('\n');
    const html = `<div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; white-space: pre-wrap; line-height: 1.5;">${message
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br/>')}</div>`;

    const sendResult = await resend.emails.send({
      from: 'Connections CalAIM <noreply@carehomefinders.com>',
      to: ILS_DECISION_RECIPIENTS,
      subject,
      html,
    });
    if (sendResult.error) {
      throw new Error(clean(sendResult.error.message) || 'Failed to send decision email.');
    }

    const createdAtIso = new Date().toISOString();
    const logRef = await authCheck.adminDb.collection('ils_service_delivery_decision_logs').add({
      rowId,
      sourceType,
      sourceFileName,
      memberName,
      memberMrn: memberMrn || '',
      memberCounty: memberCounty || '',
      memberClientId: memberClientId || '',
      choice,
      subject,
      recipients: ILS_DECISION_RECIPIENTS,
      message,
      emailId: clean(sendResult.data?.id),
      actedByUid: clean(authCheck.uid),
      actedByName,
      actedByEmail,
      createdAt: (await import('@/firebase-admin')).default.firestore.FieldValue.serverTimestamp(),
      createdAtIso,
    });

    return NextResponse.json({
      success: true,
      log: {
        id: logRef.id,
        rowId,
        memberName,
        memberMrn: memberMrn || '',
        memberCounty: memberCounty || '',
        choice,
        subject,
        createdAtIso,
        actedByName,
        actedByEmail,
      },
    });
  } catch (error: any) {
    console.error('ils-service-delivery-decision failed:', error);
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to send ILS service delivery decision') },
      { status: 500 }
    );
  }
}

