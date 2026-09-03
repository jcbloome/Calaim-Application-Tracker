import { NextRequest, NextResponse } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';
import {
  alftRnReviewActionUrl,
  ispWorkflowActionUrl,
  notifyAlftWorkflowParties,
} from '@/lib/alft-workflow-notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ReturnTarget = 'staff' | 'rn';

type Body = {
  idToken?: string;
  intakeId?: string;
  target?: ReturnTarget;
  reason?: string;
};

const clean = (v: unknown, max = 500) => String(v ?? '').trim().slice(0, max);

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const idToken = clean(body?.idToken, 12000);
    const intakeId = clean(body?.intakeId, 220);
    const target = clean(body?.target, 20).toLowerCase() as ReturnTarget;
    const reason = clean(body?.reason, 2000);
    if (!idToken) return NextResponse.json({ success: false, error: 'Missing idToken' }, { status: 400 });
    if (!intakeId) return NextResponse.json({ success: false, error: 'Missing intakeId' }, { status: 400 });
    if (target !== 'staff' && target !== 'rn') {
      return NextResponse.json({ success: false, error: 'target must be staff or rn' }, { status: 400 });
    }
    if (!reason) return NextResponse.json({ success: false, error: 'Revision reason is required' }, { status: 400 });

    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;
    const adminDb = adminModule.adminDb;
    const adminAuth = adminModule.adminAuth;

    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = clean(decoded?.uid, 128);
    const email = clean((decoded as any)?.email, 220).toLowerCase();
    const name = clean((decoded as any)?.name, 160) || email || 'Staff';
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
    const isRnStaff = Boolean(me?.isRnStaff);

    const canReturn =
      isAdmin || isKaiserAssignmentManager || isKaiserStaff || (target === 'rn' && isRnStaff);
    if (!canReturn) {
      return NextResponse.json(
        { success: false, error: 'Admin/Kaiser staff access is required to return an ALFT for edits.' },
        { status: 403 }
      );
    }

    const toolCode = clean((intake as any)?.toolCode, 50).toUpperCase();
    const docType = clean((intake as any)?.documentType, 120).toLowerCase();
    const isAlft = toolCode === 'ALFT' || docType.includes('alft');
    if (!isAlft) return NextResponse.json({ success: false, error: 'This intake is not an ALFT upload' }, { status: 400 });

    const memberName = clean((intake as any)?.memberName, 160) || 'Member';
    const memberId = clean(
      (intake as any)?.memberClientId || (intake as any)?.clientId2 || (intake as any)?.Client_ID2 || (intake as any)?.memberId,
      220
    );
    const mrn = clean((intake as any)?.medicalRecordNumber || (intake as any)?.kaiserMrn, 80);
    const requestId = clean((intake as any)?.alftSignature?.requestId, 220);

    const activityEntry = {
      event: target === 'staff' ? 'returned_to_staff' : 'returned_to_rn',
      atIso: new Date().toISOString(),
      byName: name || null,
      byEmail: email || null,
      details: reason.slice(0, 500),
    };

    if (target === 'staff') {
      await intakeRef.set(
        {
          status: 'pending',
          needsStaffRevision: true,
          needsRnRevision: false,
          needsSwRevision: false,
          returnedToStaffAt: admin.firestore.FieldValue.serverTimestamp(),
          returnedToStaffReason: reason,
          returnedToStaffByName: name || null,
          returnedToStaffByEmail: email || null,
          alftManagerReview: {
            status: 'returned_to_staff_for_revision',
            returnedAt: admin.firestore.FieldValue.serverTimestamp(),
            returnedByUid: uid,
            returnedByName: name || null,
            returnedByEmail: email || null,
            rejectionReason: reason,
          },
          workflowStatus: 'returned_to_staff_for_revision',
          workflowStage: 'waiting_staff_revision',
          workflowRouting: {
            nextStepKey: 'staff_revision',
            nextStepLabel: 'Connections Staff Edits',
            nextRecipientName: clean((intake as any)?.alftStaffName, 160) || 'Connections Staff',
            nextRecipientEmail: clean((intake as any)?.alftStaffEmail, 220).toLowerCase() || null,
          },
          workflowUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          ispWorkflowActivityLog: admin.firestore.FieldValue.arrayUnion(activityEntry),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      if (memberId) {
        await adminDb
          .collection('alft_assignments')
          .doc(memberId)
          .set(
            {
              latestIntakeId: intakeId,
              status: 'pending_staff_revision',
              workflowStatus: 'returned_to_staff_for_revision',
              workflowStage: 'waiting_staff_revision',
              needsStaffRevision: true,
              needsSwRevision: false,
              ispWorkflowActivityLog: admin.firestore.FieldValue.arrayUnion(activityEntry),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          )
          .catch(() => null);
      }

      await notifyAlftWorkflowParties({
        admin,
        adminDb,
        intakeId,
        memberName,
        mrn: mrn || undefined,
        title: 'ALFT returned for staff edits',
        message: `${memberName} • MRN ${mrn || '—'}\nReturned for admin/staff edits.\nReason: ${reason}`,
        type: 'alft_returned_to_staff',
        stageLabel: 'Returned to staff for revision',
        nextAction: 'Open ISP Tracker, edit the form, save, then continue approve/RN/final steps.',
        triggeredBy: name,
        assignedStaff: {
          uid: clean((intake as any)?.alftStaffUid, 128) || undefined,
          email: clean((intake as any)?.alftStaffEmail, 220).toLowerCase() || undefined,
          name: clean((intake as any)?.alftStaffName, 160) || 'Connections Staff',
        },
        includeAlftReviewers: true,
        sendEmails: false,
        actionUrl: ispWorkflowActionUrl(intakeId),
        createdBy: uid,
        createdByName: name,
      }).catch(() => null);

      return NextResponse.json({ success: true, intakeId, target });
    }

    // target === 'rn' — unlock RN edit/re-sign (clear prior RN signature lock).
    if (requestId) {
      await adminDb
        .collection('alft_signature_requests')
        .doc(requestId)
        .set(
          {
            status: 'awaiting_rn_revision',
            'signers.rn.signedAt': null,
            'signers.rn.signatureStoragePath': null,
            'signers.rn.signedName': null,
            'signers.rn.licenseNumber': null,
            'signers.rn.signedByUid': null,
            returnedForRnRevision: {
              reason,
              returnedByUid: uid,
              returnedByName: name,
              returnedByEmail: email || null,
              returnedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
        .catch(() => null);
    }

    await intakeRef.set(
      {
        status: 'pending',
        needsRnRevision: true,
        needsStaffRevision: false,
        needsSwRevision: false,
        returnedToRnAt: admin.firestore.FieldValue.serverTimestamp(),
        returnedToRnReason: reason,
        returnedToRnByName: name || null,
        returnedToRnByEmail: email || null,
        alftSignature: {
          status: 'awaiting_rn_revision_and_signatures',
          rnSignedAt: null,
          completedAt: null,
          packetPdfStoragePath: null,
          signaturePagePdfStoragePath: null,
        },
        alftManagerReview: {
          status: 'pending',
          required: true,
        },
        workflowStatus: 'returned_to_rn_for_revision',
        workflowStage: 'waiting_rn_revision',
        workflowRouting: {
          nextStepKey: 'rn_revision',
          nextStepLabel: 'RN Edits + Signature',
          nextRecipientName: clean((intake as any)?.alftRnName, 160) || 'RN',
          nextRecipientEmail: clean((intake as any)?.alftRnEmail, 220).toLowerCase() || null,
        },
        workflowUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        ispWorkflowActivityLog: admin.firestore.FieldValue.arrayUnion(activityEntry),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    if (memberId) {
      await adminDb
        .collection('alft_assignments')
        .doc(memberId)
        .set(
          {
            latestIntakeId: intakeId,
            status: 'pending_rn_revision',
            workflowStatus: 'returned_to_rn_for_revision',
            workflowStage: 'waiting_rn_revision',
            needsRnRevision: true,
            needsSwRevision: false,
            ispWorkflowActivityLog: admin.firestore.FieldValue.arrayUnion(activityEntry),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
        .catch(() => null);
    }

    await notifyAlftWorkflowParties({
      admin,
      adminDb,
      intakeId,
      memberName,
      mrn: mrn || undefined,
      title: 'ALFT returned for RN edits',
      message: `${memberName} • MRN ${mrn || '—'}\nReturned for RN edits / re-signature.\nReason: ${reason}`,
      type: 'alft_returned_to_rn',
      stageLabel: 'Returned to RN for revision',
      nextAction: 'Open RN queue, edit if needed, re-sign, then continue to final review.',
      triggeredBy: name,
      assignedStaff: {
        uid: clean((intake as any)?.alftRnUid, 128) || undefined,
        email: clean((intake as any)?.alftRnEmail, 220).toLowerCase() || undefined,
        name: clean((intake as any)?.alftRnName, 160) || 'RN',
      },
      includeAlftReviewers: true,
      sendEmails: false,
      actionUrl: alftRnReviewActionUrl(intakeId),
      createdBy: uid,
      createdByName: name,
    }).catch(() => null);

    return NextResponse.json({ success: true, intakeId, target });
  } catch (e: any) {
    console.error('[alft/workflow/return-for-edits] error', e);
    return NextResponse.json(
      { success: false, error: e?.message || 'Failed to return ALFT for edits' },
      { status: 500 }
    );
  }
}
