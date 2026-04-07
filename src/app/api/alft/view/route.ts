import { NextRequest, NextResponse } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (v: unknown, max = 500) => String(v ?? '').trim().slice(0, max);

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { idToken?: string; intakeId?: string };
    const idToken = clean(body?.idToken, 12000);
    const intakeId = clean(body?.intakeId, 240);
    if (!idToken) return NextResponse.json({ success: false, error: 'Missing idToken' }, { status: 400 });
    if (!intakeId) return NextResponse.json({ success: false, error: 'Missing intakeId' }, { status: 400 });

    const adminModule = await import('@/firebase-admin');
    const adminDb = adminModule.adminDb;
    const adminAuth = adminModule.adminAuth;

    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = clean(decoded?.uid, 128);
    const email = clean((decoded as any)?.email, 240).toLowerCase();
    if (!uid) return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 });

    // Fetch the intake document first to check per-record authorization.
    const snap = await adminDb.collection('standalone_upload_submissions').doc(intakeId).get();
    if (!snap.exists) return NextResponse.json({ success: false, error: 'ALFT form not found' }, { status: 404 });
    const intake = (snap.data() || {}) as any;

    // Build authorization: admins, Kaiser managers, assigned RN, and the SW uploader can all view.
    let canView = Boolean((decoded as any)?.admin) || Boolean((decoded as any)?.superAdmin);
    if (!canView && isHardcodedAdminEmail(email)) canView = true;

    if (!canView) {
      const [adminRole, superAdminRole, userDoc] = await Promise.all([
        adminDb.collection('roles_admin').doc(uid).get(),
        adminDb.collection('roles_super_admin').doc(uid).get(),
        adminDb.collection('users').doc(uid).get().catch(() => null),
      ]);
      if (adminRole.exists || superAdminRole.exists) canView = true;

      if (!canView) {
        const userData = userDoc?.exists ? (userDoc.data() as any) : null;
        if (Boolean(userData?.isKaiserAssignmentManager)) canView = true;
      }
    }

    // Assigned RN and the original SW uploader also get view access.
    if (!canView) {
      const uploaderUid = clean(intake?.uploaderUid, 128);
      const uploaderEmail = clean(intake?.uploaderEmail, 240).toLowerCase();
      const rnUid = clean(intake?.alftRnUid, 128);
      const rnEmail = clean(intake?.alftRnEmail, 240).toLowerCase();
      canView =
        uid === uploaderUid ||
        uid === rnUid ||
        (email && [uploaderEmail, rnEmail].includes(email));
    }

    if (!canView) {
      return NextResponse.json({ success: false, error: 'You do not have permission to view this ALFT form.' }, { status: 403 });
    }

    // Return the full intake data needed for the viewer.
    return NextResponse.json({
      success: true,
      intake: {
        id: snap.id,
        memberName: intake.memberName ?? null,
        medicalRecordNumber: intake.medicalRecordNumber ?? intake.kaiserMrn ?? null,
        uploaderName: intake.uploaderName ?? null,
        uploaderEmail: intake.uploaderEmail ?? null,
        alftRnName: intake.alftRnName ?? null,
        alftForm: intake.alftForm ?? null,
        workflowStatus: intake.workflowStatus ?? null,
        alftManagerReview: intake.alftManagerReview ?? null,
        alftSignature: intake.alftSignature ?? null,
        createdAt: intake.createdAt?.toMillis?.() ?? null,
        updatedAt: intake.updatedAt?.toMillis?.() ?? null,
        files: Array.isArray(intake.files) ? intake.files : [],
        alftRevisions: Array.isArray(intake.alftRevisions) ? intake.alftRevisions : [],
      },
    });
  } catch (e: any) {
    console.error('[api/alft/view] error', e);
    return NextResponse.json({ success: false, error: e?.message || 'Failed to load ALFT form' }, { status: 500 });
  }
}
