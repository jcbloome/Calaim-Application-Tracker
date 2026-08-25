import { NextRequest, NextResponse } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';
import { ispWorkflowActionUrl, notifyAlftWorkflowParties } from '@/lib/alft-workflow-notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  idToken?: string;
  intakeId?: string;
  overrideRecipientEmail?: string;
};

const clean = (v: unknown, max = 400) => String(v ?? '').trim().slice(0, max);

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const idToken = clean(body?.idToken, 12000);
    const intakeId = clean(body?.intakeId, 220);
    const overrideRecipientEmail = clean(body?.overrideRecipientEmail, 220).toLowerCase();
    if (!idToken) return NextResponse.json({ success: false, error: 'Missing idToken' }, { status: 400 });
    if (!intakeId) return NextResponse.json({ success: false, error: 'Missing intakeId' }, { status: 400 });

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

    const meSnap = await adminDb.collection('users').doc(uid).get().catch(() => null);
    const me = meSnap?.exists ? (meSnap.data() as any) : null;
    const isKaiserAssignmentManager = Boolean(me?.isKaiserAssignmentManager);
    const isKaiserStaff = Boolean(me?.isKaiserStaff);
    const isRnStaff = Boolean(me?.isRnStaff);
    const canRoute = isAdmin || isKaiserAssignmentManager || isKaiserStaff || isRnStaff;
    if (!canRoute) {
      return NextResponse.json(
        { success: false, error: 'RN/Kaiser staff or admin access is required to route ALFT back to final manager review.' },
        { status: 403 }
      );
    }

    const intakeRef = adminDb.collection('standalone_upload_submissions').doc(intakeId);
    const intakeSnap = await intakeRef.get();
    if (!intakeSnap.exists) return NextResponse.json({ success: false, error: 'ALFT intake not found' }, { status: 404 });
    const intake = intakeSnap.data() || {};
    const toolCode = clean((intake as any)?.toolCode, 50).toUpperCase();
    const docType = clean((intake as any)?.documentType, 120).toLowerCase();
    const isAlft = toolCode === 'ALFT' || docType.includes('alft');
    if (!isAlft) return NextResponse.json({ success: false, error: 'This intake is not an ALFT upload' }, { status: 400 });

    const staffUid = clean((intake as any)?.alftStaffUid || (intake as any)?.assignedManager?.uid, 128);
    const staffName =
      clean((intake as any)?.alftStaffName || (intake as any)?.assignedManager?.name, 160) || 'ALFT Reviewer';
    const staffEmail = clean(
      (intake as any)?.alftStaffEmail ||
        (intake as any)?.workflowRouting?.finalReviewOwnerEmail ||
        (intake as any)?.assignedManager?.email,
      220
    ).toLowerCase();
    const recipientEmail = overrideRecipientEmail || staffEmail;
    const recipientName = overrideRecipientEmail ? 'Override Recipient' : staffName;
    if (!recipientEmail) {
      return NextResponse.json(
        { success: false, error: 'No assigned ALFT reviewer on this intake. Select first-review staff in ISP Workflow.' },
        { status: 409 }
      );
    }

    await intakeRef.set(
      {
        alftManagerReview: {
          status: 'pending',
          required: true,
          routedAt: admin.firestore.FieldValue.serverTimestamp(),
          routedByUid: uid,
          routedByEmail: email || null,
          routedByName: name || null,
        },
        workflowStatus: 'awaiting_kaiser_manager_final_review',
        workflowStage: 'awaiting_manager_final_review',
        workflowRouting: {
          nextStepKey: 'staff_final_review',
          nextStepLabel: 'Connections Staff Final Review',
          nextRecipientName: recipientName,
          nextRecipientEmail: recipientEmail,
          finalReviewOwnerName: staffName,
          finalReviewOwnerEmail: staffEmail || recipientEmail,
        },
        assignedManager: {
          uid: staffUid || null,
          name: staffName,
          email: staffEmail || recipientEmail,
        },
        workflowUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    try {
      const memberName = clean((intake as any)?.memberName, 160) || 'Member';
      const mrn = clean((intake as any)?.medicalRecordNumber || (intake as any)?.kaiserMrn, 80);
      await notifyAlftWorkflowParties({
        admin,
        adminDb,
        intakeId,
        memberName,
        mrn: mrn || undefined,
        title: 'ALFT ready for final review',
        message: `${memberName} • MRN ${mrn || '—'}\nRouted for final staff review.`,
        type: 'alft_ready_for_staff_final_review',
        stageLabel: 'Ready for Connections staff final review',
        nextAction: 'Open ISP Workflow, complete final review, then download/archive.',
        triggeredBy: name,
        assignedStaff: {
          uid: staffUid || undefined,
          email: recipientEmail,
          name: recipientName,
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

    return NextResponse.json({ success: true, intakeId });
  } catch (e: any) {
    console.error('[alft/workflow/route-to-final-manager] error', e);
    return NextResponse.json({ success: false, error: e?.message || 'Failed to route ALFT to final manager review' }, { status: 500 });
  }
}

