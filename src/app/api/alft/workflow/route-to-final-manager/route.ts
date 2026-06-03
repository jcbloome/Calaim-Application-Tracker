import { NextRequest, NextResponse } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';
import { sendAlftManagerWorkflowStageEmail } from '@/app/actions/send-email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  idToken?: string;
  intakeId?: string;
  overrideRecipientEmail?: string;
};

const clean = (v: unknown, max = 400) => String(v ?? '').trim().slice(0, max);
const JOHN_FINAL_REVIEW_EMAIL = 'john@carehomefinders.com';
const JOHN_FINAL_REVIEW_NAME = 'John';

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
          nextStepKey: 'john_final_review',
          nextStepLabel: 'John final review',
          nextRecipientName: JOHN_FINAL_REVIEW_NAME,
          nextRecipientEmail: JOHN_FINAL_REVIEW_EMAIL,
          finalReviewOwnerName: JOHN_FINAL_REVIEW_NAME,
          finalReviewOwnerEmail: JOHN_FINAL_REVIEW_EMAIL,
        },
        assignedManager: {
          uid: null,
          name: JOHN_FINAL_REVIEW_NAME,
          email: JOHN_FINAL_REVIEW_EMAIL,
        },
        workflowUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    try {
      const johnUserSnap = await adminDb
        .collection('users')
        .where('email', '==', JOHN_FINAL_REVIEW_EMAIL)
        .limit(1)
        .get()
        .catch(() => null);
      const memberName = clean((intake as any)?.memberName, 160) || 'Member';
      const mrn = clean((intake as any)?.medicalRecordNumber || (intake as any)?.kaiserMrn, 80);
      const managerRecipients = overrideRecipientEmail
        ? [
            {
              uid: '',
              email: overrideRecipientEmail,
              name: 'Dummy Recipient',
            },
          ]
        : [
        ...(johnUserSnap?.docs || []).map((d: any) => ({
          uid: clean(d.id, 128),
          email: clean((d.data() as any)?.email, 220).toLowerCase(),
          name: clean((d.data() as any)?.displayName, 160) || JOHN_FINAL_REVIEW_NAME,
        })),
        {
          uid: '',
          email: JOHN_FINAL_REVIEW_EMAIL,
          name: JOHN_FINAL_REVIEW_NAME,
        },
      ].filter((r: any, idx: number, arr: any[]) => arr.findIndex((x: any) => x.email === r.email) === idx);
      await Promise.all(
        managerRecipients
          .filter((r: any) => Boolean(r.uid))
          .map((r: any) =>
          adminDb.collection('staff_notifications').add({
            userId: r.uid,
            recipientName: r.name || 'Kaiser Manager',
            title: 'ALFT ready for John final review',
            message: `${memberName} • MRN ${mrn || '—'}\nRN marked this ALFT ready for John's final review.`,
            memberName,
            type: 'alft_ready_for_john_final_review',
            priority: 'Priority',
            status: 'Open',
            isRead: false,
            source: 'system',
            createdBy: uid,
            createdByName: name,
            senderName: name,
            senderId: uid,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            actionUrl: `/admin/alft-tracker?focus=${encodeURIComponent(intakeId)}`,
            standaloneUploadId: intakeId,
          })
        )
      );
      await Promise.all(
        managerRecipients
          .filter((r: any) => Boolean(r.email))
          .map((r: any) =>
            sendAlftManagerWorkflowStageEmail({
              to: r.email,
              managerName: r.name,
              memberName,
              mrn: mrn || undefined,
              stageLabel: 'RN review complete — John final review required',
              nextAction: 'John reviews first, then routes to Deydry for final send/print to Jocelyn.',
              actionUrl: `/admin/alft-tracker?edit=${encodeURIComponent(intakeId)}`,
              triggeredBy: name,
            }).catch(() => null)
          )
      );
    } catch {
      // best-effort only
    }

    return NextResponse.json({ success: true, intakeId });
  } catch (e: any) {
    console.error('[alft/workflow/route-to-final-manager] error', e);
    return NextResponse.json({ success: false, error: e?.message || 'Failed to route ALFT to final manager review' }, { status: 500 });
  }
}

