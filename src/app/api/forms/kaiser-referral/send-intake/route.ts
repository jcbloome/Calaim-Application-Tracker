import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import admin, { adminDb, adminStorage } from '@/firebase-admin';

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
  submitterName?: string;
  submitterEmail?: string;
  customSubject?: string;
  customMessage?: string;
  pdfBase64: string;
  fileName?: string;
  overrideResubmit?: boolean;
  overrideReason?: string;
  testSend?: boolean;
  testRecipientEmail?: string;
  formSnapshot?: Record<string, unknown>;
};

const ILS_CC_EMAIL = 'ils-calaim@ilshealth.com';
const KAISER_REFERRALS_COPY_EMAIL = 'kpreferrals@ilshealth.com';
const ALBERTO_COPY_EMAIL = 'alberto@carehomefinders.com';
const DEYDRY_COPY_EMAIL = 'deydry@carehomefinders.com';
const KAISER_REFERRAL_FROM = 'Connections CalAIM <noreply@carehomefinders.com>';
const KAISER_NORTH_INTAKE_EMAIL = 'REGMCDURNs-KPNC@KP.org';
const KAISER_SOUTH_INTAKE_EMAIL = 'RegCareCoordCaseMgmt@KP.org';
const PDF_RETENTION_URL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function sanitizePathComponent(value: unknown) {
  return String(value || '')
    .trim()
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}

function getKaiserReferralCcRecipients() {
  return Array.from(
    new Set(
      [KAISER_REFERRALS_COPY_EMAIL, ILS_CC_EMAIL, ALBERTO_COPY_EMAIL, DEYDRY_COPY_EMAIL]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  );
}

function resolveKaiserIntakeEmail(regionRaw: unknown): string {
  const normalizedRegion = String(regionRaw || '').trim().toLowerCase();
  if (normalizedRegion === 'kaiser north' || normalizedRegion === 'north') {
    return KAISER_NORTH_INTAKE_EMAIL;
  }
  return KAISER_SOUTH_INTAKE_EMAIL;
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
  const baseCcRecipients = getKaiserReferralCcRecipients();
  let failureLogTo = 'unknown';
  let failureLogCc = baseCcRecipients;
  let failureLogSubject = 'Kaiser referral send failed (unexpected error)';
  let failureLogMetadata: Record<string, unknown> = {
    route: '/api/forms/kaiser-referral/send-intake',
    memberName: 'Unknown member',
    memberMrn: 'Unknown MRN',
    submitterName: 'Unknown staff',
    submitterEmail: 'Unknown staff email',
  };
  try {
    const body = (await request.json()) as SendPayload;
    const requestedTo = String(body?.to || '').trim();
    const region = String(body?.region || '').trim();
    const to = resolveKaiserIntakeEmail(region);
    const pdfBase64 = String(body?.pdfBase64 || '').trim();
    const fileName = String(body?.fileName || 'kaiser_referral.pdf').trim();
    const testSend = Boolean(body?.testSend);
    failureLogTo = to || requestedTo || 'unknown';

    if (!pdfBase64) {
      await logKaiserReferralEmail({
        status: 'failure',
        from: KAISER_REFERRAL_FROM,
        to,
        cc: baseCcRecipients,
        subject: 'Kaiser referral send failed (invalid payload)',
        errorMessage: 'Missing required email payload.',
        metadata: {
          route: '/api/forms/kaiser-referral/send-intake',
          testSend,
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
        cc: baseCcRecipients,
        subject: 'Kaiser referral send failed (missing RESEND_API_KEY)',
        errorMessage: 'RESEND_API_KEY is not configured.',
        metadata: {
          route: '/api/forms/kaiser-referral/send-intake',
          testSend,
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
    const submitterName = String(body?.submitterName || '').trim();
    const submitterEmail = String(body?.submitterEmail || '').trim().toLowerCase();
    const resolvedSubmitterName = submitterName || 'Unknown staff';
    const resolvedSubmitterEmail = submitterEmail || 'Unknown staff email';
    const ccRecipients = getKaiserReferralCcRecipientsWithSubmitter(submitterEmail);
    failureLogCc = ccRecipients;
    const testRecipientEmail = String(body?.testRecipientEmail || '').trim().toLowerCase();
    const appId = String(body?.applicationId || '').trim();
    const userId = String(body?.userId || '').trim();
    const overrideResubmit = Boolean(body?.overrideResubmit);
    const overrideReason = String(body?.overrideReason || '').trim();
    const taskId = String(body?.taskId || '').trim();
    const memberClientId = String(body?.memberClientId || '').trim();
    const referralContext = String(body?.referralContext || '').trim();
    const subject =
      String(body?.customSubject || '').trim() ||
      `CS Referral for Member Name: ${memberName} and MRN: ${memberMrn || 'N/A'}`;
    failureLogSubject = subject || failureLogSubject;
    failureLogMetadata = {
      route: '/api/forms/kaiser-referral/send-intake',
      testSend,
      applicationId: appId || 'N/A',
      userId: userId || 'N/A',
      taskId: taskId || 'N/A',
      memberClientId: memberClientId || 'N/A',
      referralContext: referralContext || 'N/A',
      memberName: memberName || 'Unknown member',
      memberMrn: memberMrn || 'Unknown MRN',
      memberCounty: memberCounty || 'N/A',
      submitterName: resolvedSubmitterName,
      submitterEmail: resolvedSubmitterEmail,
      referrerName: referrerName || 'N/A',
      referrerEmail: referrerEmail || 'N/A',
      fileName: fileName || 'kaiser_referral.pdf',
      overrideResubmit,
      overrideReason: overrideReason || null,
    };
    const customMessage = String(body?.customMessage || '').trim();
    const formSnapshot =
      body?.formSnapshot && typeof body.formSnapshot === 'object' && !Array.isArray(body.formSnapshot)
        ? (body.formSnapshot as Record<string, unknown>)
        : null;
    const resolvedAttachmentName = fileName.toLowerCase().endsWith('.pdf') ? fileName : `${fileName}.pdf`;
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    if (!pdfBuffer.length) {
      return NextResponse.json({ success: false, error: 'Invalid PDF payload.' }, { status: 400 });
    }
    if (pdfBuffer.length > 25 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: 'PDF payload too large.' }, { status: 413 });
    }

    let pdfStoragePath = '';
    let pdfStorageSignedUrl = '';
    try {
      const ts = Date.now();
      const appSegment = sanitizePathComponent(appId || 'standalone');
      const memberSegment = sanitizePathComponent(memberName || 'member');
      const nameSegment = sanitizePathComponent(resolvedAttachmentName) || 'kaiser-referral.pdf';
      pdfStoragePath = `kaiser-referrals/${appSegment}/${memberSegment}/${ts}-${nameSegment}`;
      const bucket = adminStorage.bucket();
      await bucket.file(pdfStoragePath).save(pdfBuffer, {
        resumable: false,
        contentType: 'application/pdf',
        metadata: {
          cacheControl: 'private, max-age=0, no-store',
        },
      });
      const [signedUrl] = await bucket.file(pdfStoragePath).getSignedUrl({
        action: 'read',
        expires: Date.now() + PDF_RETENTION_URL_MS,
      });
      pdfStorageSignedUrl = String(signedUrl || '').trim();
    } catch (storageError) {
      // Storage persistence is best-effort; do not block outgoing email if this fails.
      console.warn('[kaiser-referral/send-intake] failed to persist generated PDF to storage', storageError);
      pdfStoragePath = '';
      pdfStorageSignedUrl = '';
    }

    const metadata = {
      region,
      testSend,
      testRecipientEmail: testRecipientEmail || null,
      applicationId: appId || null,
      userId: userId || null,
      taskId: taskId || null,
      memberClientId: memberClientId || null,
      referralContext: referralContext || null,
      memberName: memberName || 'Unknown member',
      memberMrn: memberMrn || 'Unknown MRN',
      memberCounty: memberCounty || null,
      submitterName: resolvedSubmitterName,
      submitterEmail: resolvedSubmitterEmail,
      referrerName: referrerName || 'N/A',
      referrerEmail: referrerEmail || 'N/A',
      fileName,
      pdfStoragePath: pdfStoragePath || null,
      pdfStorageSignedUrl: pdfStorageSignedUrl || null,
      overrideResubmit,
      overrideReason: overrideReason || null,
      formSnapshot: formSnapshot || null,
    };

    if (testSend) {
      const testTo = testRecipientEmail || String(referrerEmail || '').trim().toLowerCase();
      if (!testTo || !testTo.includes('@')) {
        return NextResponse.json(
          { success: false, error: 'Referrer email is required for test send.' },
          { status: 400 }
        );
      }
      const testSubject = `[TEST PREVIEW] ${subject}`;
      const testHtml = `
      <div style="font-family: Arial, sans-serif; font-size: 14px; color: #111827;">
        <p>Hello ${referrerName || 'Staff'},</p>
        <p>This is a pre-send test copy of the Kaiser referral email and attachment for formatting review.</p>
        <p>
          <strong>Kaiser intake destination:</strong> ${to}<br/>
          <span style="color:#4b5563;">Copy this email address if you want to forward this request manually after review.</span>
        </p>
        <p>${(customMessage || 'Please find attached the reviewed Kaiser Community Supports referral PDF.').replace(/\n/g, '<br/>')}</p>
        <p>
          <strong>Member:</strong> ${memberName}<br/>
          <strong>MRN:</strong> ${memberMrn || 'N/A'}<br/>
          <strong>County:</strong> ${memberCounty || 'N/A'}<br/>
          <strong>Application ID:</strong> ${appId || 'N/A'}<br/>
          <strong>Submitted by:</strong> ${resolvedSubmitterName || 'N/A'}
        </p>
        <p>This was sent only to staff for verification and has not been sent to Kaiser intake.</p>
      </div>
    `;
      const { data: testData, error: testError } = await resend.emails.send({
        from: fromAddress,
        to: [testTo],
        cc: [],
        subject: testSubject,
        html: testHtml,
        attachments: [{ filename: resolvedAttachmentName, content: pdfBase64 }],
      });
      if (testError) {
        await logKaiserReferralEmail({
          status: 'failure',
          from: fromAddress,
          to: testTo,
          cc: [],
          subject: testSubject,
          errorMessage: String(testError.message || 'Test email send failed.'),
          metadata,
        });
        return NextResponse.json(
          { success: false, error: String(testError.message || 'Test email send failed.') },
          { status: 500 }
        );
      }
      await logKaiserReferralEmail({
        status: 'success',
        from: fromAddress,
        to: testTo,
        cc: [],
        subject: testSubject,
        providerMessageId: String(testData?.id || ''),
        metadata,
      });
      return NextResponse.json({ success: true, testSent: true, testRecipientEmail: testTo });
    }

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

    const html = `
      <div style="font-family: Arial, sans-serif; font-size: 14px; color: #111827;">
        <p>Hello ${region},</p>
        <p>${(customMessage || 'Please find attached the reviewed Kaiser Community Supports referral PDF.').replace(/\n/g, '<br/>')}</p>
        <p>
          <strong>Member:</strong> ${memberName}<br/>
          <strong>MRN:</strong> ${memberMrn || 'N/A'}<br/>
          <strong>County:</strong> ${memberCounty || 'N/A'}<br/>
          <strong>Application ID:</strong> ${appId || 'N/A'}<br/>
          <strong>Submitted by:</strong> ${resolvedSubmitterName || 'N/A'}
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
          filename: resolvedAttachmentName,
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
            submittedByName: resolvedSubmitterName || null,
            submittedByEmail: resolvedSubmitterEmail || null,
            pdfStoragePath: pdfStoragePath || null,
            pdfStorageSignedUrl: pdfStorageSignedUrl || null,
            overrideResubmit,
            overrideReason: overrideReason || null,
          },
          kaiserStatus: 'T2038 Requested',
          kaiserStatusUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          kaiserStatusUpdatedAtIso: submittedAtIso,
          kaiserStatusUpdatedBy: resolvedSubmitterName || resolvedSubmitterEmail || null,
          kaiserReferralStep5: {
            required: step5Required,
            acknowledged: true,
            acknowledgedAt: admin.firestore.FieldValue.serverTimestamp(),
            acknowledgedAtIso: submittedAtIso,
            acknowledgedBy: resolvedSubmitterName || resolvedSubmitterEmail || null,
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

    return NextResponse.json({
      success: true,
      submittedAtIso,
      pdfStoragePath: pdfStoragePath || null,
    });
  } catch (error: any) {
    await logKaiserReferralEmail({
      status: 'failure',
      from: KAISER_REFERRAL_FROM,
      to: failureLogTo,
      cc: failureLogCc,
      subject: failureLogSubject,
      errorMessage: String(error?.message || 'Unexpected error while sending.'),
      metadata: failureLogMetadata,
    });
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Unexpected error while sending.') },
      { status: 500 }
    );
  }
}

