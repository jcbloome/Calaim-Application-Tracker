import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  idToken?: string;
  intakeId?: string;
};

const clean = (v: unknown, max = 500) => String(v ?? '').trim().slice(0, max);

const base64UrlToken = (bytes = 32) =>
  crypto
    .randomBytes(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

/**
 * Issue a fresh RN signature link for the assigned RN (used from ALFT RN review tracker).
 * Does not email — opens `/admin/alft-sign/{token}` so RN can submit with suggested tier.
 */
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
    if (!uid) return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 });

    const [meSnap, intakeSnap] = await Promise.all([
      adminDb.collection('users').doc(uid).get().catch(() => null),
      adminDb.collection('standalone_upload_submissions').doc(intakeId).get(),
    ]);
    if (!intakeSnap.exists) {
      return NextResponse.json({ success: false, error: 'ALFT intake not found' }, { status: 404 });
    }

    const intake = intakeSnap.data() || {};
    const me = meSnap?.exists ? (meSnap.data() as any) : null;
    const isRnStaff = Boolean(me?.isRnStaff);

    const rnUid = clean((intake as any)?.alftRnUid, 128);
    const rnEmail = clean((intake as any)?.alftRnEmail || (intake as any)?.alftSignature?.rnEmail, 220).toLowerCase();
    const isAssignedRn = (uid && uid === rnUid) || (email && rnEmail && email === rnEmail);

    let isAdmin = Boolean((decoded as any)?.admin) || Boolean((decoded as any)?.superAdmin);
    if (!isAdmin && isHardcodedAdminEmail(email)) isAdmin = true;
    if (!isAdmin) {
      const [adminRole, superAdminRole] = await Promise.all([
        adminDb.collection('roles_admin').doc(uid).get(),
        adminDb.collection('roles_super_admin').doc(uid).get(),
      ]);
      isAdmin = adminRole.exists || superAdminRole.exists;
    }

    if (!isAssignedRn && !(isRnStaff && rnEmail && email === rnEmail) && !isAdmin) {
      return NextResponse.json(
        { success: false, error: 'Only the assigned RN can open the signature submit link.' },
        { status: 403 }
      );
    }

    if ((intake as any)?.alftSignature?.rnSignedAt) {
      return NextResponse.json(
        { success: false, error: 'RN already signed this packet. It was returned to admin.' },
        { status: 409 }
      );
    }

    const requestId = clean((intake as any)?.alftSignature?.requestId, 220);
    if (!requestId) {
      return NextResponse.json(
        {
          success: false,
          error: 'No RN signature request is open yet. Ask admin to Approve → Send to RN first.',
        },
        { status: 409 }
      );
    }

    const requestRef = adminDb.collection('alft_signature_requests').doc(requestId);
    const requestSnap = await requestRef.get();
    if (!requestSnap.exists) {
      return NextResponse.json({ success: false, error: 'Signature request not found.' }, { status: 404 });
    }

    const rnToken = base64UrlToken(32);
    const rnTokenHash = sha256(rnToken);
    const existingRn = ((requestSnap.data() as any)?.signers?.rn || {}) as Record<string, unknown>;
    await requestRef.set(
      {
        signers: {
          rn: {
            ...existingRn,
            tokenHash: rnTokenHash,
            requestedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const signUrl = `/admin/alft-sign/${encodeURIComponent(rnToken)}`;
    return NextResponse.json({
      success: true,
      intakeId,
      requestId,
      token: rnToken,
      signUrl,
    });
  } catch (error: any) {
    console.error('[alft/signatures/rn-open-link]', error);
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to open RN signature link') },
      { status: 500 }
    );
  }
}
