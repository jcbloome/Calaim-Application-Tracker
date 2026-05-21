import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { sendAlftSignatureRequestEmail } from '@/app/actions/send-email';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  idToken?: string;
  intakeId?: string;
  forceDefaultRn?: boolean;
  overrideRnEmail?: string;
  overrideRnName?: string;
};

const clean = (v: unknown, max = 500) => String(v ?? '').trim().slice(0, max);
const DEFAULT_RN_EMAIL = 'leslie@carehomefinders.com';
const DEFAULT_RN_NAME = 'Leslie';

const base64UrlToken = (bytes = 32) =>
  crypto
    .randomBytes(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

const formatDate = (ms: number) => {
  try {
    return new Date(ms).toLocaleDateString();
  } catch {
    return '';
  }
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const forceDefaultRn = Boolean(body?.forceDefaultRn);
    const overrideRnEmail = clean(body?.overrideRnEmail, 200).toLowerCase();
    const overrideRnName = clean(body?.overrideRnName, 160);
    const isRnOverrideTestMode = Boolean(overrideRnEmail);
    const idToken = clean(body?.idToken, 8000);
    const intakeId = clean(body?.intakeId, 200);
    if (!idToken) return NextResponse.json({ success: false, error: 'Missing idToken' }, { status: 400 });
    if (!intakeId) return NextResponse.json({ success: false, error: 'Missing intakeId' }, { status: 400 });

    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;
    const adminDb = adminModule.adminDb;

    const decoded = await admin.auth().verifyIdToken(idToken);
    const requesterUid = clean(decoded?.uid, 128);
    const requesterEmail = clean(decoded?.email, 200).toLowerCase();
    const requesterName = clean((decoded as any)?.name, 160) || requesterEmail || 'Manager';
    if (!requesterUid) return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 });

    // Enforce manager/admin gate before RN phase.
    let isAdmin = Boolean((decoded as any)?.admin) || Boolean((decoded as any)?.superAdmin);
    if (!isAdmin && isHardcodedAdminEmail(requesterEmail)) isAdmin = true;
    if (!isAdmin) {
      const [adminRole, superAdminRole] = await Promise.all([
        adminDb.collection('roles_admin').doc(requesterUid).get(),
        adminDb.collection('roles_super_admin').doc(requesterUid).get(),
      ]);
      isAdmin = adminRole.exists || superAdminRole.exists;
    }
    const meSnap = await adminDb.collection('users').doc(requesterUid).get().catch(() => null);
    const me = meSnap?.exists ? (meSnap.data() as any) : null;
    const isKaiserAssignmentManager = Boolean(me?.isKaiserAssignmentManager);
    const isKaiserStaff = Boolean(me?.isKaiserStaff);
    const canPreReview = isAdmin || isKaiserAssignmentManager || isKaiserStaff;
    if (!canPreReview) {
      return NextResponse.json(
        { success: false, error: 'Kaiser staff/manager (or admin) access is required before sending ALFT to RN.' },
        { status: 403 }
      );
    }

    const intakeSnap = await adminDb.collection('standalone_upload_submissions').doc(intakeId).get();
    if (!intakeSnap.exists) return NextResponse.json({ success: false, error: 'ALFT intake not found' }, { status: 404 });
    const intake = intakeSnap.data() || {};

    const toolCode = clean((intake as any)?.toolCode, 50).toUpperCase();
    const docType = clean((intake as any)?.documentType, 120).toLowerCase();
    const isAlft = toolCode === 'ALFT' || docType.includes('alft');
    if (!isAlft) {
      return NextResponse.json({ success: false, error: 'This intake is not an ALFT upload' }, { status: 400 });
    }
    const workflowStatus = clean((intake as any)?.workflowStatus, 120).toLowerCase();
    const allowedPreReviewStatuses = [
      'awaiting_manager_review_pre_rn',
      'returned_to_sw_for_revision',
      'manager_review_pre_rn_complete_ready_for_rn',
    ];
    const hasAlftFormContent =
      Boolean((intake as any)?.alftForm?.transitionSummary) ||
      Boolean((intake as any)?.alftForm?.requestedActions) ||
      (typeof (intake as any)?.alftForm?.exactPacketAnswers === 'object' &&
        Object.keys(((intake as any)?.alftForm?.exactPacketAnswers || {}) as Record<string, unknown>).length > 0);
    // Keep API gate aligned with tracker UI gate so users do not see false rejections
    // after the form has already been started/edited in manager workflow.
    const canAdvanceToRn = allowedPreReviewStatuses.some((x) => workflowStatus.includes(x)) || hasAlftFormContent;
    if (!canAdvanceToRn) {
      return NextResponse.json(
        {
          success: false,
          error:
            'This ALFT is not in pre-RN manager review state. Ensure SW submission is reviewed by Kaiser manager before sending to RN.',
        },
        { status: 409 }
      );
    }

    const memberName = clean((intake as any)?.memberName, 140) || 'Member';
    const mrn = clean((intake as any)?.medicalRecordNumber || (intake as any)?.kaiserMrn || (intake as any)?.mediCalNumber, 80);

    let rnUid = forceDefaultRn ? '' : clean((intake as any)?.alftRnUid, 128);
    let rnEmail = forceDefaultRn
      ? DEFAULT_RN_EMAIL
      : clean((intake as any)?.alftRnEmail, 200).toLowerCase();
    let rnName = forceDefaultRn ? DEFAULT_RN_NAME : clean((intake as any)?.alftRnName, 160);
    if (overrideRnEmail) {
      rnEmail = overrideRnEmail;
      rnName = overrideRnName || rnName || DEFAULT_RN_NAME;
      rnUid = '';
    }
    if (!forceDefaultRn && (!rnUid || !rnEmail)) {
      try {
        const rnStaffSnap = await adminDb
          .collection('users')
          .where('isRnStaff', '==', true)
          .limit(20)
          .get();
        if (!rnStaffSnap.empty) {
          const rnCandidates = rnStaffSnap.docs
            .map((docSnap: any) => ({
              uid: clean(docSnap.id, 128),
              email: clean((docSnap.data() as any)?.email, 220).toLowerCase(),
              name:
                clean((docSnap.data() as any)?.displayName, 160) ||
                clean(`${clean((docSnap.data() as any)?.firstName, 80)} ${clean((docSnap.data() as any)?.lastName, 80)}`, 160),
            }))
            .filter((r: any) => Boolean(r.email));
          const preferred =
            rnCandidates.find((r: any) => r.email === DEFAULT_RN_EMAIL) ||
            rnCandidates[0] ||
            null;
          if (preferred) {
            rnUid = rnUid || preferred.uid;
            rnEmail = rnEmail || preferred.email;
            rnName = rnName || preferred.name;
          }
        }
      } catch {
        // fallback below
      }
    }
    rnEmail = rnEmail || DEFAULT_RN_EMAIL;
    rnName = rnName || DEFAULT_RN_NAME;
    if (!rnUid) {
      try {
        const byEmailSnap = await adminDb.collection('users').where('email', '==', rnEmail).limit(1).get();
        if (!byEmailSnap.empty) rnUid = clean(byEmailSnap.docs[0]?.id, 128);
      } catch {
        // keep going; email flow still works without UID
      }
    }

    const mswEmail = clean((intake as any)?.uploaderEmail, 200).toLowerCase();
    const mswName = clean((intake as any)?.uploaderName, 160) || mswEmail || 'MSW';
    if (!mswEmail) {
      return NextResponse.json(
        { success: false, error: 'Missing uploader email for MSW signature. (uploaderEmail not found on intake)' },
        { status: 409 }
      );
    }

    const reviewedAtMs =
      (typeof (intake as any)?.alftRnRevisionUploadedAt?.toMillis === 'function'
        ? (intake as any).alftRnRevisionUploadedAt.toMillis()
        : 0) || Date.now();

    const rnToken = base64UrlToken(32);
    const mswToken = base64UrlToken(32);
    const rnTokenHash = sha256(rnToken);
    const mswTokenHash = sha256(mswToken);

    const requestRef = adminDb.collection('alft_signature_requests').doc();
    const requestId = clean(requestRef.id, 200);

    const docPayload = {
      intakeId,
      requestId,
      status: 'requested_signatures',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      reviewedAt: new Date(reviewedAtMs),
      memberName,
      mrn: mrn || null,
      originalFiles: Array.isArray((intake as any)?.files) ? (intake as any).files.slice(0, 5) : [],
      requester: {
        uid: requesterUid,
        email: requesterEmail || null,
        name: clean((decoded as any)?.name, 160) || null,
      },
      signers: {
        rn: {
          uid: rnUid,
          email: rnEmail,
          name: rnName,
          tokenHash: rnTokenHash,
          requestedAt: admin.firestore.FieldValue.serverTimestamp(),
          signedAt: null,
          signatureStoragePath: null,
          signedName: null,
          signedByUid: null,
        },
        msw: {
          uid: null,
          email: mswEmail,
          name: mswName,
          tokenHash: mswTokenHash,
          requestedAt: admin.firestore.FieldValue.serverTimestamp(),
          signedAt: null,
          signatureStoragePath: null,
          signedName: null,
          signedByUid: null,
        },
      },
      outputs: {
        signaturePagePdfStoragePath: null,
        packetPdfStoragePath: null,
      },
    };

    await requestRef.set(docPayload);

    await adminDb
      .collection('standalone_upload_submissions')
      .doc(intakeId)
      .set(
        {
          // First Kaiser manager review (before RN changes/signature cycle).
          alftManagerPreReview: {
            status: 'approved_for_rn',
            approvedAt: admin.firestore.FieldValue.serverTimestamp(),
            approvedByUid: requesterUid,
            approvedByEmail: requesterEmail || null,
            approvedByName: requesterName || null,
          },
          alftSignature: {
            requestId,
            status: 'requested_signatures',
            requestedAt: admin.firestore.FieldValue.serverTimestamp(),
            reviewedAt: new Date(reviewedAtMs),
            rnEmail,
            mswEmail,
            mswRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
            rnRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          workflowStatus: 'awaiting_rn_revision_and_signatures',
          workflowStage: 'manager_pre_review_complete_sent_to_rn',
          alftRnUid: rnUid || null,
          alftRnEmail: rnEmail || null,
          alftRnName: rnName || null,
          workflowUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

    try {
      const settingsSnap = await adminDb.collection('system_settings').doc('review_notifications').get().catch(() => null);
      const recipients = ((settingsSnap?.data() as any)?.recipients || {}) as Record<string, any>;
      const rnVisitAssignerUids = Object.entries(recipients)
        .filter(([, rec]) => Boolean((rec as any)?.enabled) && Boolean((rec as any)?.kaiserRnVisitAssigner))
        .map(([key, rec]) => clean((rec as any)?.uid || key, 128))
        .filter(Boolean);
      if (rnVisitAssignerUids.length > 0) {
        await Promise.all(
          rnVisitAssignerUids.map((recipientUid) =>
            adminDb.collection('staff_notifications').add({
              userId: recipientUid,
              recipientName: 'RN Visit Assigner',
              title: 'ALFT sent to RN',
              message: `${memberName} • MRN ${mrn || '—'}\nRN requested. Follow up if no RN response within 2 days.`,
              memberName,
              type: 'alft_rn_requested',
              priority: 'Priority',
              status: 'Open',
              isRead: false,
              source: 'system',
              createdBy: requesterUid,
              createdByName: requesterName,
              senderName: requesterName,
              senderId: requesterUid,
              timestamp: admin.firestore.FieldValue.serverTimestamp(),
              actionUrl: `/admin/alft-tracker?focus=${encodeURIComponent(intakeId)}`,
              standaloneUploadId: intakeId,
            })
          )
        );
      }
    } catch {
      // best-effort only
    }

    const adminSignUrl = isRnOverrideTestMode
      ? `/admin/alft-tracker?edit=${encodeURIComponent(intakeId)}`
      : `/admin/alft-sign/${encodeURIComponent(rnToken)}`;
    const swSignUrl = `/sw-portal/alft-sign/${encodeURIComponent(mswToken)}`;

    // Notify RN now; signing order is enforced on the signature page (MSW first, RN final).
    try {
      if (rnUid) {
        await adminDb.collection('staff_notifications').add({
          userId: rnUid,
          recipientName: rnName,
          title: 'ALFT final RN sign-off requested',
          message: `${memberName} • MRN ${mrn || '—'}\nPlease complete final RN sign-off after SW signature is done.`,
          memberName,
          type: 'alft_signature_request',
          priority: 'Priority',
          status: 'Open',
          isRead: false,
          source: 'system',
          createdBy: requesterUid,
          createdByName: clean((decoded as any)?.name, 160) || requesterEmail || 'Staff',
          senderName: clean((decoded as any)?.name, 160) || requesterEmail || 'Staff',
          senderId: requesterUid,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          actionUrl: adminSignUrl,
          standaloneUploadId: intakeId,
          alftSignatureRequestId: requestId,
        });
      }
    } catch {
      // ignore notification issues
    }

    const reviewedDateLabel = formatDate(reviewedAtMs);
    const rnEmailResult = await sendAlftSignatureRequestEmail({
      to: rnEmail,
      recipientName: rnName,
      recipientRoleLabel: 'RN',
      memberName,
      mrn: mrn || undefined,
      reviewedDateLabel: reviewedDateLabel || undefined,
      signUrl: adminSignUrl,
    }).catch(() => null);

    const mswEmailResult = isRnOverrideTestMode
      ? null
      : await sendAlftSignatureRequestEmail({
          to: mswEmail,
          recipientName: mswName,
          recipientRoleLabel: 'MSW',
          memberName,
          mrn: mrn || undefined,
          reviewedDateLabel: reviewedDateLabel || undefined,
          signUrl: swSignUrl,
        }).catch(() => null);

    return NextResponse.json({
      success: true,
      requestId,
      rn: { emailSent: Boolean(rnEmailResult), signUrl: adminSignUrl },
      msw: { emailSent: Boolean(mswEmailResult), signUrl: swSignUrl },
      rnRecipient: {
        email: rnEmail,
        name: rnName,
      },
      testMode: isRnOverrideTestMode,
    });
  } catch (e: any) {
    console.error('[alft/signatures/request] error', e);
    return NextResponse.json({ success: false, error: e?.message || 'Request failed' }, { status: 500 });
  }
}

