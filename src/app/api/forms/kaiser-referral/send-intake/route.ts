import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import admin, { adminDb } from '@/firebase-admin';

type SendPayload = {
  to: string;
  region: string;
  applicationId?: string;
  userId?: string;
  taskId?: string;
  memberClientId?: string;
  referralContext?: string;
  memberName?: string;
  memberMrn?: string;
  memberCounty?: string;
  referrerName?: string;
  referrerEmail?: string;
  customSubject?: string;
  customMessage?: string;
  pdfBase64: string;
  fileName?: string;
  overrideResubmit?: boolean;
  overrideReason?: string;
};

const ILS_CC_EMAIL = 'ils-calaim@ilshealth.com';
const ALBERTO_COPY_EMAIL = 'alberto@carehomefinders.com';
const DEYDRY_COPY_EMAIL = 'deydry@carehomefinders.com';
const KAISER_REFERRAL_FROM = 'alberto@carehomefinders.com';

function getKaiserReferralCcRecipients() {
  return Array.from(
    new Set(
      [ILS_CC_EMAIL, ALBERTO_COPY_EMAIL, DEYDRY_COPY_EMAIL]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  );
}

function getKaiserReferralCcRecipientsWithSubmitter(submitterEmail?: string) {
  const normalizedSubmitterEmail = String(submitterEmail || '').trim().toLowerCase();
  return Array.from(
    new Set(
      [...getKaiserReferralCcRecipients(), normalizedSubmitterEmail]
        .map((value) => String(value || '').trim())
        .filter((value) => Boolean(value) && value.includes('@'))
    )
  );
}

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

function hasPriorKaiserSubmission(data: Record<string, any> | undefined): boolean {
  if (!data) return false;
  const submission = (data as any).kaiserReferralSubmission;
  if (!submission || typeof submission !== 'object') return false;
  return Boolean(
    submission.submitted ||
      submission.submittedAt ||
      submission.submittedAtIso ||
      submission.providerMessageId
  );
}

function formatSubmissionDate(value: unknown): string | null {
  if (!value) return null;
  const ts = value as { toDate?: () => Date };
  if (ts && typeof ts.toDate === 'function') {
    try {
      return ts.toDate().toISOString();
    } catch {
      return null;
    }
  }
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return raw;
}

function isKaiserAuthReceivedIntake(data: Record<string, any> | undefined): boolean {
  if (!data) return false;
  const mode = String(data?.kaiserAuthorizationMode || '').trim().toLowerCase();
  if (mode === 'authorization_received') return true;
  if (mode === 'authorization_needed') return false;
  return (
    Boolean(data?.kaiserAuthReceivedViaIls) ||
    String(data?.intakeType || '').trim().toLowerCase() === 'kaiser_auth_received_via_ils' ||
    String(data?.status || '').trim().toLowerCase() === 'authorization received (doc collection)'
  );
}

async function resolveApplicationDoc(params: {
  applicationId: string;
  userId?: string;
}): Promise<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, any> } | null> {
  const applicationId = String(params.applicationId || '').trim();
  const userId = String(params.userId || '').trim();
  if (!applicationId) return null;

  if (userId) {
    const userAppRef = adminDb.doc(`users/${userId}/applications/${applicationId}`);
    const userAppSnap = await userAppRef.get();
    if (userAppSnap.exists) {
      return { ref: userAppRef, data: (userAppSnap.data() || {}) as Record<string, any> };
    }
  }

  const adminAppRef = adminDb.collection('applications').doc(applicationId);
  const adminAppSnap = await adminAppRef.get();
  if (adminAppSnap.exists) {
    return { ref: adminAppRef, data: (adminAppSnap.data() || {}) as Record<string, any> };
  }

  const groupSnap = await adminDb
    .collectionGroup('applications')
    .where(admin.firestore.FieldPath.documentId(), '==', applicationId)
    .limit(1)
    .get();

  if (!groupSnap.empty) {
    const snap = groupSnap.docs[0];
    return { ref: snap.ref, data: (snap.data() || {}) as Record<string, any> };
  }

  return null;
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
        cc: ccRecipients,
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
        cc: ccRecipients,
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
    const referrerEmail = String(body?.referrerEmail || '').trim();
    const ccRecipients = getKaiserReferralCcRecipientsWithSubmitter(referrerEmail);
    const appId = String(body?.applicationId || '').trim();
    const userId = String(body?.userId || '').trim();
    const overrideResubmit = Boolean(body?.overrideResubmit);
    const overrideReason = String(body?.overrideReason || '').trim();
    const taskId = String(body?.taskId || '').trim();
    const memberClientId = String(body?.memberClientId || '').trim();
    const referralContext = String(body?.referralContext || '').trim();
    const metadata = {
      region,
      applicationId: appId || null,
      userId: userId || null,
      taskId: taskId || null,
      memberClientId: memberClientId || null,
      referralContext: referralContext || null,
      memberName: memberName || null,
      memberMrn: memberMrn || null,
      memberCounty: memberCounty || null,
      referrerName: referrerName || null,
      referrerEmail: referrerEmail || null,
      fileName,
      overrideResubmit,
      overrideReason: overrideReason || null,
    };

    let resolvedApp: { ref: FirebaseFirestore.DocumentReference; data: Record<string, any> } | null = null;
    if (appId) {
      resolvedApp = await resolveApplicationDoc({ applicationId: appId, userId });
      if (resolvedApp && hasPriorKaiserSubmission(resolvedApp.data) && !overrideResubmit) {
        const alreadySubmittedAt =
          formatSubmissionDate(resolvedApp.data?.kaiserReferralSubmission?.submittedAtIso) ||
          formatSubmissionDate(resolvedApp.data?.kaiserReferralSubmission?.submittedAt) ||
          null;

        await logKaiserReferralEmail({
          status: 'failure',
          from: fromAddress,
          to,
          cc: ccRecipients,
          subject: 'Kaiser referral resend blocked (already submitted)',
          errorMessage: 'Blocked duplicate referral send without override.',
          metadata: {
            ...metadata,
            alreadySubmittedAt,
            blockedByDuplicateGuard: true,
          },
        });

        return NextResponse.json(
          {
            success: false,
            error:
              'This Kaiser referral has already been submitted. Enable override to resend.',
            alreadySubmittedAt,
          },
          { status: 409 }
        );
      }
    }

    if (overrideResubmit && !overrideReason) {
      return NextResponse.json(
        { success: false, error: 'Override reason is required when resubmitting.' },
        { status: 400 }
      );
    }

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
      cc: ccRecipients,
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
        cc: ccRecipients,
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
      cc: ccRecipients,
      subject,
      providerMessageId: String(data?.id || ''),
      metadata,
    });

    const submittedAtIso = new Date().toISOString();

    if (resolvedApp) {
      const step5Required = !isKaiserAuthReceivedIntake(resolvedApp.data);
      await resolvedApp.ref.set(
        {
          kaiserReferralSubmission: {
            submitted: true,
            submittedAt: admin.firestore.FieldValue.serverTimestamp(),
            submittedAtIso,
            from: fromAddress,
            to,
            cc: ccRecipients,
            subject,
            region: region || null,
            providerMessageId: String(data?.id || ''),
            submittedByName: referrerName || null,
            submittedByEmail: referrerEmail || null,
            overrideResubmit,
            overrideReason: overrideReason || null,
          },
          kaiserStatus: 'T2038 Requested',
          kaiserStatusUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          kaiserStatusUpdatedAtIso: submittedAtIso,
          kaiserStatusUpdatedBy: referrerName || referrerEmail || null,
          kaiserReferralStep5: {
            required: step5Required,
            acknowledged: true,
            acknowledgedAt: admin.firestore.FieldValue.serverTimestamp(),
            acknowledgedAtIso: submittedAtIso,
            acknowledgedBy: referrerName || referrerEmail || null,
            note: step5Required
              ? 'Kaiser referral sent and Step 5 acknowledged.'
              : 'Step 5 not required because authorization was already received at intake.',
          },
          kaiserReferralSubmissionCount: admin.firestore.FieldValue.increment(1),
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    return NextResponse.json({ success: true, submittedAtIso });
  } catch (error: any) {
    await logKaiserReferralEmail({
      status: 'failure',
      from: KAISER_REFERRAL_FROM,
      to: 'unknown',
      cc: getKaiserReferralCcRecipients(),
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

