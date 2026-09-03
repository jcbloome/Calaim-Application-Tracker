import { NextRequest, NextResponse } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';
import { sendAlftManagerWorkflowStageEmail } from '@/app/actions/send-email';
import { ispWorkflowActionUrl, notifyAlftWorkflowParties } from '@/lib/alft-workflow-notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  idToken?: string;
  intakeId?: string;
};

const clean = (v: unknown, max = 400) => String(v ?? '').trim().slice(0, max);
const DEYDRY_SEND_EMAIL = 'deydry@carehomefinders.com';
const DEYDRY_SEND_NAME = 'Deydry';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const idToken = clean(body?.idToken, 12000);
    const intakeId = clean(body?.intakeId, 220);
    if (!idToken) return NextResponse.json({ success: false, error: 'Missing idToken' }, { status: 400 });
    if (!intakeId) return NextResponse.json({ success: false, error: 'Missing intakeId' }, { status: 400 });

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

    const [meSnap, intakeSnapEarly] = await Promise.all([
      adminDb.collection('users').doc(uid).get().catch(() => null),
      adminDb.collection('standalone_upload_submissions').doc(intakeId).get(),
    ]);
    if (!intakeSnapEarly.exists) return NextResponse.json({ success: false, error: 'ALFT intake not found' }, { status: 404 });
    const intakeEarly = intakeSnapEarly.data() || {};
    const finalOwnerEmail = clean(
      (intakeEarly as any)?.alftStaffEmail ||
        (intakeEarly as any)?.workflowRouting?.finalReviewOwnerEmail ||
        (intakeEarly as any)?.assignedManager?.email,
      220
    ).toLowerCase();
    const isAssignedFinalOwner = Boolean(finalOwnerEmail && email === finalOwnerEmail);
    const me = meSnap?.exists ? (meSnap.data() as any) : null;
    const isKaiserStaff = Boolean(me?.isKaiserStaff || me?.isKaiserAssignmentManager);
    const canReview = isAdmin || isAssignedFinalOwner || isKaiserStaff;
    if (!canReview) {
      return NextResponse.json(
        { success: false, error: 'Assigned Connections staff (or admin) is required for this final ALFT review step.' },
        { status: 403 }
      );
    }

    const intakeRef = adminDb.collection('standalone_upload_submissions').doc(intakeId);
    const intakeSnap = intakeSnapEarly;
    const intake = intakeEarly;
    const toolCode = clean((intake as any)?.toolCode, 50).toUpperCase();
    const docType = clean((intake as any)?.documentType, 120).toLowerCase();
    const isAlft = toolCode === 'ALFT' || docType.includes('alft');
    if (!isAlft) return NextResponse.json({ success: false, error: 'This intake is not an ALFT upload' }, { status: 400 });

    const hasSignedPacket = Boolean(
      clean((intake as any)?.alftSignature?.packetPdfStoragePath, 1000) ||
        clean((intake as any)?.alftSignature?.signaturePagePdfStoragePath, 1000)
    );
    if (!hasSignedPacket) {
      return NextResponse.json(
        { success: false, error: 'Complete SW + RN signatures before final manager review.' },
        { status: 409 }
      );
    }

    await intakeRef.set(
      {
        alftManagerReview: {
          status: 'approved',
          reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
          reviewedByUid: uid,
          reviewedByEmail: email || null,
          reviewedByName: name || null,
        },
        workflowStatus: 'manager_review_complete_ready_to_send',
        workflowStage: 'manager_final_review_complete',
        workflowRouting: {
          nextStepKey: 'deydry_send_to_jocelyn',
          nextStepLabel: 'Deydry send/print to Jocelyn',
          nextRecipientName: DEYDRY_SEND_NAME,
          nextRecipientEmail: DEYDRY_SEND_EMAIL,
          finalReviewOwnerName: name || null,
          finalReviewOwnerEmail: email || finalOwnerEmail || null,
        },
        workflowUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    try {
      const deydryUserSnap = await adminDb
        .collection('users')
        .where('email', '==', DEYDRY_SEND_EMAIL)
        .limit(1)
        .get()
        .catch(() => null);

      const memberName = clean((intake as any)?.memberName, 160) || 'Member';
      const mrn = clean((intake as any)?.medicalRecordNumber || (intake as any)?.kaiserMrn, 80);
      const memberIdForPurpose = clean(
        (intake as any)?.memberClientId || (intake as any)?.clientId2 || (intake as any)?.Client_ID2,
        120
      );
      let assessmentPurpose = clean((intake as any)?.prefillPurpose, 60);
      if (!assessmentPurpose && memberIdForPurpose) {
        const assignmentSnap = await adminDb
          .collection('alft_assignments')
          .doc(memberIdForPurpose)
          .get()
          .catch(() => null);
        assessmentPurpose = clean((assignmentSnap?.data() as any)?.prefillPurpose, 60);
      }
      const deydryUid = clean(deydryUserSnap?.docs?.[0]?.id, 128);
      if (deydryUid) {
        await Promise.all(
          [deydryUid].map((recipientUid) =>
            adminDb.collection('staff_notifications').add({
              userId: recipientUid,
              recipientName: DEYDRY_SEND_NAME,
              title: 'ALFT ready for Deydry send step',
              message: `${memberName} • MRN ${mrn || '—'}\n${name} completed final review. Send/print packet to Jocelyn.`,
              memberName,
              type: 'alft_ready_for_deydry_send',
              priority: 'Priority',
              status: 'Open',
              isRead: false,
              source: 'system',
              createdBy: uid,
              createdByName: name,
              senderName: name,
              senderId: uid,
              timestamp: admin.firestore.FieldValue.serverTimestamp(),
              actionUrl: ispWorkflowActionUrl(intakeId),
              standaloneUploadId: intakeId,
            })
          )
        );
      }
      await sendAlftManagerWorkflowStageEmail({
        to: DEYDRY_SEND_EMAIL,
        managerName: DEYDRY_SEND_NAME,
        memberName,
        mrn: mrn || undefined,
        stageLabel: 'Staff final review complete',
        nextAction: 'Send or print the completed ALFT packet to Jocelyn at ILS.',
        actionUrl: ispWorkflowActionUrl(intakeId),
        triggeredBy: name,
        assessmentPurpose: assessmentPurpose || undefined,
      }).catch(() => null);

      await notifyAlftWorkflowParties({
        admin,
        adminDb,
        intakeId,
        memberName,
        mrn: mrn || undefined,
        title: 'ALFT final review complete',
        message: `${memberName} • MRN ${mrn || '—'}\nFinal review completed by ${name}. Ready for send/print step.`,
        type: 'alft_final_review_complete',
        stageLabel: 'Staff final review complete',
        nextAction: 'Packet is ready for Deydry send/print to Jocelyn.',
        triggeredBy: name,
        assignedStaff: {
          uid: clean((intake as any)?.alftStaffUid, 128) || undefined,
          email: clean((intake as any)?.alftStaffEmail, 220).toLowerCase() || undefined,
          name: clean((intake as any)?.alftStaffName, 160) || 'ALFT Reviewer',
        },
        includeAlftReviewers: true,
        sendEmails: true,
        actionUrl: ispWorkflowActionUrl(intakeId),
        createdBy: uid,
        createdByName: name,
      });
    } catch {
      // best-effort only
    }

    // Caspio client note: staff final review complete.
    try {
      const memberId = clean(
        (intake as any)?.memberClientId || (intake as any)?.clientId2 || (intake as any)?.Client_ID2 || (intake as any)?.memberId,
        120
      );
      if (memberId) {
        const { appendCaspioClientNote } = await import('@/lib/caspio-client-notes');
        const memberName = clean((intake as any)?.memberName, 160) || 'Member';
        const mrn = clean((intake as any)?.medicalRecordNumber || (intake as any)?.kaiserMrn, 80);
        await appendCaspioClientNote({
          clientId2: memberId,
          comments: [
            'ISP/ALFT staff final review complete. Ready for send/print.',
            `Member: ${memberName || memberId}.`,
            mrn ? `MRN: ${mrn}.` : '',
            `Reviewed by: ${name || email || '—'}.`,
          ]
            .filter(Boolean)
            .join(' '),
          assignedStaffName: name || undefined,
          sourceTag: 'alft-final-review-complete',
        });
      }
    } catch (noteErr) {
      console.warn('[alft/workflow/final-review] Caspio note failed:', noteErr);
    }

    return NextResponse.json({ success: true, intakeId });
  } catch (e: any) {
    console.error('[alft/workflow/final-review] error', e);
    return NextResponse.json({ success: false, error: e?.message || 'Failed to complete final review' }, { status: 500 });
  }
}

