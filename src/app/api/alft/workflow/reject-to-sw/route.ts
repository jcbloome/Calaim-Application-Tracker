import { NextRequest, NextResponse } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';
import { sendAlftReturnToSwEmail } from '@/app/actions/send-email';
import {
  ispWorkflowActionUrl,
  notifyAlftWorkflowParties,
  swPortalAlftUrl,
} from '@/lib/alft-workflow-notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  idToken?: string;
  intakeId?: string;
  reason?: string;
};

const clean = (v: unknown, max = 500) => String(v ?? '').trim().slice(0, max);

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const idToken = clean(body?.idToken, 12000);
    const intakeId = clean(body?.intakeId, 220);
    const reason = clean(body?.reason, 2000);
    if (!idToken) return NextResponse.json({ success: false, error: 'Missing idToken' }, { status: 400 });
    if (!intakeId) return NextResponse.json({ success: false, error: 'Missing intakeId' }, { status: 400 });
    if (!reason) return NextResponse.json({ success: false, error: 'Rejection reason is required' }, { status: 400 });

    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;
    const adminDb = adminModule.adminDb;
    const adminAuth = adminModule.adminAuth;

    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = clean(decoded?.uid, 128);
    const email = clean((decoded as any)?.email, 220).toLowerCase();
    const name = clean((decoded as any)?.name, 160) || email || 'Manager';
    if (!uid) return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 });

    let isAdmin = Boolean((decoded as any)?.admin) || Boolean((decoded as any)?.superAdmin);
    if (!isAdmin && isHardcodedAdminEmail(email)) isAdmin = true;
    if (!isAdmin) {
      const [adminRole, superAdminRole] = await Promise.all([
        adminDb.collection('roles_admin').doc(uid).get(),
        adminDb.collection('roles_super_admin').doc(uid).get(),
      ]);
      isAdmin = adminRole.exists || superAdminRole.exists;
    }

    const [meSnap, intakeSnap] = await Promise.all([
      adminDb.collection('users').doc(uid).get().catch(() => null),
      adminDb.collection('standalone_upload_submissions').doc(intakeId).get(),
    ]);

    if (!intakeSnap.exists) return NextResponse.json({ success: false, error: 'ALFT intake not found' }, { status: 404 });
    const intakeRef = adminDb.collection('standalone_upload_submissions').doc(intakeId);
    const intake = intakeSnap.data() || {};

    const me = meSnap?.exists ? (meSnap.data() as any) : null;
    const isKaiserAssignmentManager = Boolean(me?.isKaiserAssignmentManager);
    const isKaiserStaff = Boolean(me?.isKaiserStaff);

    // The assigned RN (Leslie) may also kick back for revisions.
    const rnUid = clean((intake as any)?.alftRnUid, 128);
    const rnEmail = clean((intake as any)?.alftRnEmail, 220).toLowerCase();
    const isAssignedRn = (uid && uid === rnUid) || (email && email === rnEmail);

    const canReview = isAdmin || isKaiserAssignmentManager || isKaiserStaff || isAssignedRn;
    if (!canReview) {
      return NextResponse.json(
        { success: false, error: 'Kaiser staff/manager, assigned RN, or admin access is required to return an ALFT to the SW.' },
        { status: 403 }
      );
    }

    const toolCode = clean((intake as any)?.toolCode, 50).toUpperCase();
    const docType = clean((intake as any)?.documentType, 120).toLowerCase();
    const isAlft = toolCode === 'ALFT' || docType.includes('alft');
    if (!isAlft) return NextResponse.json({ success: false, error: 'This intake is not an ALFT upload' }, { status: 400 });

    const requestId = clean((intake as any)?.alftSignature?.requestId, 220);
    if (requestId) {
      await adminDb
        .collection('alft_signature_requests')
        .doc(requestId)
        .set(
          {
            status: 'rejected_returned_to_sw',
            rejection: {
              reason,
              rejectedByUid: uid,
              rejectedByName: name,
              rejectedByEmail: email || null,
              rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            // Invalidate previous links so a fresh signature request is required.
            'signers.rn.tokenHash': null,
            'signers.msw.tokenHash': null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
        .catch(() => null);
    }

    await intakeRef.set(
      {
        alftManagerReview: {
          status: 'rejected_returned_to_sw',
          rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
          rejectedByUid: uid,
          rejectedByEmail: email || null,
          rejectedByName: name || null,
          rejectedByRole: isAdmin ? 'admin' : isKaiserAssignmentManager ? 'kaiser_manager' : 'rn',
          rejectionReason: reason,
        },
        alftSignature: {
          requestId: null,
          status: 'reset_required_new_sw_signature',
          requestedAt: null,
          rnRequestedAt: null,
          mswRequestedAt: null,
          rnSignedAt: null,
          mswSignedAt: null,
          completedAt: null,
          signaturePagePdfStoragePath: null,
          packetPdfStoragePath: null,
        },
        workflowStatus: 'returned_to_sw_for_revision',
        workflowStage: 'manager_rejected_waiting_sw_revision',
        workflowUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const uploaderUid = clean((intake as any)?.uploaderUid, 128);
    const uploaderName = clean((intake as any)?.uploaderName, 160) || 'Social Worker';
    const memberName = clean((intake as any)?.memberName, 160) || 'Member';
    const memberId = clean((intake as any)?.memberId, 220);
    const mrn = clean((intake as any)?.medicalRecordNumber || (intake as any)?.kaiserMrn, 80);
    let uploaderEmail = clean((intake as any)?.uploaderEmail, 220).toLowerCase();
    const swActionUrl = swPortalAlftUrl();
    const staffActionUrl = ispWorkflowActionUrl(intakeId);

    if (!uploaderEmail && memberId) {
      try {
        const assignmentSnap = await adminDb.collection('alft_assignments').doc(memberId).get();
        if (assignmentSnap.exists) {
          const a = assignmentSnap.data() || {};
          uploaderEmail =
            clean((a as any)?.assignedSwEmail, 220).toLowerCase() ||
            clean((a as any)?.swEmail, 220).toLowerCase() ||
            uploaderEmail;
        }
      } catch {
        // best-effort only
      }
    }

    const activityEntry = {
      event: 'returned_to_sw',
      atIso: new Date().toISOString(),
      byName: name || null,
      byEmail: email || null,
      details: reason.slice(0, 500),
      recipientEmail: uploaderEmail || null,
      noteSentToSw: true,
    };

    await intakeRef.set(
      {
        ispWorkflowActivityLog: admin.firestore.FieldValue.arrayUnion(activityEntry),
      },
      { merge: true }
    ).catch(() => null);

    if (memberId) {
      await adminDb
        .collection('alft_assignments')
        .doc(memberId)
        .set(
          {
            latestIntakeId: intakeId,
            workflowStatus: 'returned_to_sw_for_revision',
            workflowStage: 'manager_rejected_waiting_sw_revision',
            ispWorkflowActivityLog: admin.firestore.FieldValue.arrayUnion(activityEntry),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
        .catch(() => null);
    }

    // MSW in-app notification (portal link).
    if (uploaderUid) {
      await adminDb.collection('staff_notifications').add({
        userId: uploaderUid,
        recipientName: uploaderName,
        title: 'ALFT returned for revision',
        message: `${memberName} • MRN ${mrn || '—'}\nStaff requested edits. Please revise, re-sign, and re-submit.\nReason: ${reason}`,
        memberName,
        type: 'alft_returned_to_sw',
        priority: 'Priority',
        status: 'Open',
        isRead: false,
        source: 'system',
        createdBy: uid,
        createdByName: name,
        senderName: name,
        senderId: uid,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        actionUrl: swActionUrl,
        standaloneUploadId: intakeId,
      });
    }

    let swEmailSent = false;
    if (uploaderEmail) {
      try {
        await sendAlftReturnToSwEmail({
          to: uploaderEmail,
          socialWorkerName: uploaderName,
          memberName,
          mrn: mrn || undefined,
          reason,
          actionUrl: swActionUrl,
          returnedBy: name,
        });
        swEmailSent = true;
      } catch (emailErr: any) {
        console.warn('[alft/workflow/reject-to-sw] failed to email SW', emailErr?.message || emailErr);
      }
    }

    // Admin / ALFT reviewers notified that packet was returned to MSW.
    try {
      await notifyAlftWorkflowParties({
        admin,
        adminDb,
        intakeId,
        memberName,
        mrn: mrn || undefined,
        title: 'ALFT returned to MSW for edits',
        message: `${memberName} • MRN ${mrn || '—'}\nReturned by ${name}.\nReason: ${reason}`,
        type: 'alft_returned_to_sw_staff',
        stageLabel: 'Returned to MSW for revision',
        nextAction: 'Waiting on MSW edits, re-sign, and resubmit. Track progress in ISP Workflow.',
        triggeredBy: name,
        assignedStaff: {
          uid: clean((intake as any)?.alftStaffUid, 128) || undefined,
          email: clean((intake as any)?.alftStaffEmail, 220).toLowerCase() || undefined,
          name: clean((intake as any)?.alftStaffName, 160) || 'ALFT Reviewer',
        },
        includeAlftReviewers: true,
        sendEmails: true,
        actionUrl: staffActionUrl,
        createdBy: uid,
        createdByName: name,
      });
    } catch {
      // best-effort only
    }

    return NextResponse.json({ success: true, intakeId, swEmailSent });
  } catch (e: any) {
    console.error('[alft/workflow/reject-to-sw] error', e);
    return NextResponse.json({ success: false, error: e?.message || 'Failed to reject ALFT to SW' }, { status: 500 });
  }
}
