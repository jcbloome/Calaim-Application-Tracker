import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  idToken?: string;
  token?: string;
};

const clean = (v: unknown, max = 8000) => String(v ?? '').trim().slice(0, max);
const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const idToken = clean(body?.idToken, 8000);
    const token = clean(body?.token, 4000);
    if (!idToken) return NextResponse.json({ success: false, error: 'Missing idToken' }, { status: 400 });
    if (!token) return NextResponse.json({ success: false, error: 'Missing token' }, { status: 400 });

    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;
    const adminDb = adminModule.adminDb;

    const decoded = await admin.auth().verifyIdToken(idToken);
    const email = clean(decoded?.email, 220).toLowerCase();
    const uid = clean(decoded?.uid, 128);
    if (!uid) return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 });

    const tokenHash = sha256(token);

    const snap = await adminDb
      .collection('alft_signature_requests')
      .where('signers.rn.tokenHash', '==', tokenHash)
      .limit(1)
      .get()
      .catch(() => null);

    const snap2 =
      snap && !snap.empty
        ? snap
        : await adminDb.collection('alft_signature_requests').where('signers.msw.tokenHash', '==', tokenHash).limit(1).get();

    const doc = snap2?.docs?.[0];
    if (!doc) return NextResponse.json({ success: false, error: 'Signature request not found' }, { status: 404 });

    const data = doc.data() || {};
    const rnEmail = clean(data?.signers?.rn?.email, 220).toLowerCase();
    const mswEmail = clean(data?.signers?.msw?.email, 220).toLowerCase();
    const signerRole = email && email === rnEmail ? 'rn' : email && email === mswEmail ? 'msw' : '';
    if (!signerRole) {
      return NextResponse.json(
        { success: false, error: 'This link is for a different signer. Please sign in with the correct email.' },
        { status: 403 }
      );
    }

    const reviewedAtMs =
      typeof data?.reviewedAt?.toMillis === 'function' ? data.reviewedAt.toMillis() : data?.reviewedAt ? new Date(data.reviewedAt).getTime() : 0;

    const rnSignedAtMs =
      typeof data?.signers?.rn?.signedAt?.toMillis === 'function' ? data.signers.rn.signedAt.toMillis() : 0;
    const mswSignedAtMs =
      typeof data?.signers?.msw?.signedAt?.toMillis === 'function' ? data.signers.msw.signedAt.toMillis() : 0;

    return NextResponse.json({
      success: true,
      requestId: doc.id,
      intakeId: clean(data?.intakeId, 200),
      memberName: clean(data?.memberName, 180) || 'Member',
      mrn: clean(data?.mrn, 80) || null,
      reviewedAtMs: reviewedAtMs || null,
      status: clean(data?.status, 40) || 'requested',
      signerRole,
      rn: {
        name: clean(data?.signers?.rn?.name, 180) || 'RN',
        email: rnEmail || null,
        signedAtMs: rnSignedAtMs || null,
      },
      msw: {
        name: clean(data?.signers?.msw?.name, 180) || 'MSW',
        email: mswEmail || null,
        signedAtMs: mswSignedAtMs || null,
      },
      outputs: {
        signaturePageReady: Boolean(clean(data?.outputs?.signaturePagePdfStoragePath, 800)),
        packetReady: Boolean(clean(data?.outputs?.packetPdfStoragePath, 800)),
      },
    });
  } catch (e: any) {
    console.error('[alft/signatures/lookup] error', e);
    return NextResponse.json({ success: false, error: e?.message || 'Lookup failed' }, { status: 500 });
  }
}

