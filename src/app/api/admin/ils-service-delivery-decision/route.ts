import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (value: unknown) => String(value || '').trim();
const normalizeEmail = (value: unknown) => clean(value).toLowerCase();
const escapeHtml = (value: unknown) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
const toHtmlWithBreaks = (value: string) => escapeHtml(value).replace(/\r?\n/g, '<br/>');
const ILS_DECISION_RECIPIENTS = ['ils-calaim@ilshealth.com', 'jason@carehomefinders.com'];
const ILS_DECISION_SIGNATURE = ['Jason Bloome', 'Connections Care Home Consultants', '800-330-5993'].join('\n');
const ILS_DECISION_CUSTOM_TEXT_MAX = 1000;
const ILS_DECISION_IDEMPOTENCY_KEY_MAX = 120;

let resendClient: Resend | null = null;
const getResendClient = () => {
  if (resendClient) return resendClient;
  const apiKey = clean(process.env.RESEND_API_KEY);
  if (!apiKey) return null;
  resendClient = new Resend(apiKey);
  return resendClient;
};

export async function POST(req: NextRequest) {
  let processingIdempotencyRef: any = null;
  let processingLockActive = false;
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
    const idempotencyKey = clean(body?.idempotencyKey);
    const rawCustomText = String(body?.customText || '').replace(/\r\n/g, '\n');
    if (rawCustomText.length > ILS_DECISION_CUSTOM_TEXT_MAX) {
      return NextResponse.json(
        { success: false, error: `customText must be ${ILS_DECISION_CUSTOM_TEXT_MAX} characters or less.` },
        { status: 400 }
      );
    }
    const customText = rawCustomText.trim();
    if (!memberName) {
      return NextResponse.json({ success: false, error: 'memberName is required.' }, { status: 400 });
    }
    if (choice !== 'accept' && choice !== 'decline') {
      return NextResponse.json({ success: false, error: "choice must be 'accept' or 'decline'." }, { status: 400 });
    }
    if (!idempotencyKey || idempotencyKey.length > ILS_DECISION_IDEMPOTENCY_KEY_MAX) {
      return NextResponse.json(
        {
          success: false,
          error: `idempotencyKey is required and must be ${ILS_DECISION_IDEMPOTENCY_KEY_MAX} characters or less.`,
        },
        { status: 400 }
      );
    }

    const idempotencyDocId = `ils-service-decision__${idempotencyKey}`;
    const idempotencyRef = authCheck.adminDb.collection('api_idempotency').doc(idempotencyDocId);
    try {
      await idempotencyRef.create({
        key: idempotencyKey,
        endpoint: 'ils-service-delivery-decision',
        status: 'processing',
        rowId,
        choice,
        memberName,
        actedByUid: clean(authCheck.uid),
        createdAt: (await import('@/firebase-admin')).default.firestore.FieldValue.serverTimestamp(),
        createdAtIso: new Date().toISOString(),
      });
      processingIdempotencyRef = idempotencyRef;
      processingLockActive = true;
    } catch {
      const existingSnap = await authCheck.adminDb
        .collection('ils_service_delivery_decision_logs')
        .where('idempotencyKey', '==', idempotencyKey)
        .limit(1)
        .get();
      if (!existingSnap.empty) {
        const existingDoc = existingSnap.docs[0];
        const existing = (existingDoc.data() || {}) as Record<string, any>;
        return NextResponse.json({
          success: true,
          duplicate: true,
          log: {
            id: existingDoc.id,
            rowId: clean(existing.rowId) || rowId,
            memberName: clean(existing.memberName) || memberName,
            memberMrn: clean(existing.memberMrn) || memberMrn || '',
            memberCounty: clean(existing.memberCounty) || memberCounty || '',
            choice: clean(existing.choice) || choice,
            subject: clean(existing.subject),
            createdAtIso: clean(existing.createdAtIso) || '',
            actedByName: clean(existing.actedByName) || '',
            actedByEmail: clean(existing.actedByEmail) || '',
          },
        });
      }
      return NextResponse.json(
        {
          success: false,
          error: 'A matching request is already processing. Please wait a few seconds and retry.',
        },
        { status: 409 }
      );
    }

    const decisionText =
      choice === 'accept'
        ? 'Please note we have STARTED service delivery for this member.'
        : 'Please note we have DECLINED service delivery for this member.';
    const subject = `To ILS RE: ${memberName}: MRN: ${memberMrn || 'N/A'}`;
    const actedByName = clean(authCheck.name) || normalizeEmail(authCheck.email) || 'Staff';
    const actedByEmail = normalizeEmail(authCheck.email);
    const signatureLines = ILS_DECISION_SIGNATURE
      .split('\n')
      .map((line) => clean(line))
      .filter(Boolean);
    const message = [
      'Dear ILS,',
      decisionText,
      customText || null,
      [`Member: ${memberName}`, `MRN: ${memberMrn || 'N/A'}`, `County: ${memberCounty || 'N/A'}`].join('\n'),
      ILS_DECISION_SIGNATURE,
    ]
      .filter((block): block is string => Boolean(block))
      .join('\n\n');
    const html = `<div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #0f172a;">
      <p style="margin: 0 0 14px 0; line-height: 1.6;">Dear ILS,</p>
      <p style="margin: 0 0 14px 0; line-height: 1.6;">${escapeHtml(decisionText)}</p>
      ${
        customText
          ? `<p style="margin: 0 0 14px 0; line-height: 1.6;">${toHtmlWithBreaks(customText)}</p>`
          : ''
      }
      <p style="margin: 0 0 14px 0; line-height: 1.6;">
        <strong>Member:</strong> ${escapeHtml(memberName)}<br/>
        <strong>MRN:</strong> ${escapeHtml(memberMrn || 'N/A')}<br/>
        <strong>County:</strong> ${escapeHtml(memberCounty || 'N/A')}
      </p>
      <p style="margin: 0; line-height: 1.6;">${signatureLines.map((line) => escapeHtml(line)).join('<br/>')}</p>
    </div>`;

    const sendResult = await resend.emails.send({
      from: 'Connections CalAIM <noreply@carehomefinders.com>',
      to: ILS_DECISION_RECIPIENTS,
      subject,
      text: message,
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
      customText: customText || '',
      idempotencyKey,
      emailId: clean(sendResult.data?.id),
      actedByUid: clean(authCheck.uid),
      actedByName,
      actedByEmail,
      createdAt: (await import('@/firebase-admin')).default.firestore.FieldValue.serverTimestamp(),
      createdAtIso,
    });
    await idempotencyRef.set(
      {
        status: 'completed',
        completedAt: (await import('@/firebase-admin')).default.firestore.FieldValue.serverTimestamp(),
        completedAtIso: createdAtIso,
        logId: logRef.id,
      },
      { merge: true }
    );
    processingLockActive = false;

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
    if (processingLockActive && processingIdempotencyRef) {
      await processingIdempotencyRef.delete().catch(() => {});
    }
    console.error('ils-service-delivery-decision failed:', error);
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to send ILS service delivery decision') },
      { status: 500 }
    );
  }
}

