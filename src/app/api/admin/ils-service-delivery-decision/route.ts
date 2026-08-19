import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import {
  ILS_DECISION_CC,
  ILS_DECISION_TO,
  buildIlsBulkOutOfCountyDeclineHtmlBody,
  buildIlsBulkOutOfCountyDeclineSubject,
  buildIlsBulkOutOfCountyDeclineTextBody,
  buildIlsDecisionHtmlBody,
  buildIlsDecisionSubject,
  buildIlsDecisionTextBody,
  normalizeIlsDecisionCustomText,
  validateIlsDecisionCustomText,
  validateIlsDecisionIdempotencyKey,
  type IlsBulkDeclineMember,
} from '@/lib/ils-decision-email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (value: unknown) => String(value || '').trim();
const normalizeEmail = (value: unknown) => clean(value).toLowerCase();

let resendClient: Resend | null = null;
const getResendClient = () => {
  if (resendClient) return resendClient;
  const apiKey = clean(process.env.RESEND_API_KEY);
  if (!apiKey) return null;
  resendClient = new Resend(apiKey);
  return resendClient;
};

const parseBulkMembers = (raw: unknown): IlsBulkDeclineMember[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const row = (item || {}) as Record<string, unknown>;
      const memberName =
        clean(row.memberName) ||
        `${clean(row.memberFirstName)} ${clean(row.memberLastName)}`.trim();
      return {
        memberName,
        memberMrn: clean(row.memberMrn),
        memberCounty: clean(row.memberCounty),
      };
    })
    .filter((member) => member.memberName);
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
    const bulkMembers = parseBulkMembers(body?.members);
    const isBulkDecline = bulkMembers.length > 0;
    const customTextError = validateIlsDecisionCustomText(body?.customText);
    if (customTextError) {
      return NextResponse.json(
        { success: false, error: customTextError },
        { status: 400 }
      );
    }
    const customText = normalizeIlsDecisionCustomText(body?.customText);
    if (!isBulkDecline && !memberName) {
      return NextResponse.json({ success: false, error: 'memberName is required.' }, { status: 400 });
    }
    if (choice !== 'accept' && choice !== 'decline') {
      return NextResponse.json({ success: false, error: "choice must be 'accept' or 'decline'." }, { status: 400 });
    }
    if (isBulkDecline && choice !== 'decline') {
      return NextResponse.json(
        { success: false, error: 'Bulk member lists are only supported for decline emails.' },
        { status: 400 }
      );
    }
    const idempotencyError = validateIlsDecisionIdempotencyKey(idempotencyKey);
    if (idempotencyError) {
      return NextResponse.json(
        { success: false, error: idempotencyError },
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
        memberName: isBulkDecline ? `bulk:${bulkMembers.length}` : memberName,
        memberCount: isBulkDecline ? bulkMembers.length : 1,
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
            memberCount: Number(existing.memberCount || (isBulkDecline ? bulkMembers.length : 1)),
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

    const declineReasonRaw = clean(body?.declineReason).toLowerCase();
    const declineReason = declineReasonRaw === 'out_of_county' ? 'out_of_county' : '';
    const normalizedChoice = choice as 'accept' | 'decline';
    const actedByName = clean(authCheck.name) || normalizeEmail(authCheck.email) || 'Staff';
    const actedByEmail = normalizeEmail(authCheck.email);

    let subject = '';
    let message = '';
    let html = '';
    let logMemberName = memberName;
    let logMemberMrn = memberMrn || '';
    let logMemberCounty = memberCounty || '';

    if (isBulkDecline) {
      subject = buildIlsBulkOutOfCountyDeclineSubject(bulkMembers.length);
      message = buildIlsBulkOutOfCountyDeclineTextBody({
        members: bulkMembers,
        customText,
      });
      html = buildIlsBulkOutOfCountyDeclineHtmlBody({
        members: bulkMembers,
        customText,
      });
      logMemberName = `Northern California declines (${bulkMembers.length})`;
      logMemberMrn = '';
      logMemberCounty = 'Northern CA (bulk)';
    } else {
      subject = buildIlsDecisionSubject(memberName, memberMrn || 'N/A');
      message = buildIlsDecisionTextBody({
        choice: normalizedChoice,
        memberName,
        memberMrn: memberMrn || 'N/A',
        memberCounty: memberCounty || 'N/A',
        customText,
        declineReason,
      });
      html = buildIlsDecisionHtmlBody({
        choice: normalizedChoice,
        memberName,
        memberMrn: memberMrn || 'N/A',
        memberCounty: memberCounty || 'N/A',
        customText,
        declineReason,
      });
    }

    const sendResult = await resend.emails.send({
      from: 'Connections CalAIM <noreply@carehomefinders.com>',
      to: [...ILS_DECISION_TO],
      cc: [...ILS_DECISION_CC],
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
      memberName: logMemberName,
      memberMrn: logMemberMrn,
      memberCounty: logMemberCounty,
      memberClientId: memberClientId || '',
      choice,
      declineReason: isBulkDecline ? 'out_of_county' : declineReason || '',
      subject,
      recipients: [...ILS_DECISION_TO, ...ILS_DECISION_CC],
      to: [...ILS_DECISION_TO],
      cc: [...ILS_DECISION_CC],
      message,
      customText: customText || '',
      idempotencyKey,
      emailId: clean(sendResult.data?.id),
      actedByUid: clean(authCheck.uid),
      actedByName,
      actedByEmail,
      memberCount: isBulkDecline ? bulkMembers.length : 1,
      members: isBulkDecline ? bulkMembers : [],
      bulk: isBulkDecline,
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
        memberName: logMemberName,
        memberMrn: logMemberMrn,
        memberCounty: logMemberCounty,
        choice,
        subject,
        createdAtIso,
        actedByName,
        actedByEmail,
        memberCount: isBulkDecline ? bulkMembers.length : 1,
        message,
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
