import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (v: unknown, max = 500) => String(v ?? '').trim().slice(0, max);

async function isAdminUser(adminDb: any, uid: string): Promise<boolean> {
  const id = String(uid || '').trim();
  if (!id) return false;
  try {
    const [a, s] = await Promise.all([
      adminDb.collection('roles_admin').doc(id).get().catch(() => null),
      adminDb.collection('roles_super_admin').doc(id).get().catch(() => null),
    ]);
    return Boolean((a as any)?.exists || (s as any)?.exists);
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  try {
    const requestId = clean(req.nextUrl.searchParams.get('requestId'), 200);
    const kind = clean(req.nextUrl.searchParams.get('kind'), 30) || 'packet';
    if (!requestId) return NextResponse.json({ success: false, error: 'Missing requestId' }, { status: 400 });

    const authz = clean(req.headers.get('authorization'), 9000);
    const idToken = authz.toLowerCase().startsWith('bearer ') ? authz.slice(7).trim() : '';
    if (!idToken) return NextResponse.json({ success: false, error: 'Missing Authorization bearer token' }, { status: 401 });

    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;
    const adminDb = adminModule.adminDb;
    const adminStorage = adminModule.adminStorage;

    const decoded = await admin.auth().verifyIdToken(idToken);
    const uid = clean(decoded?.uid, 128);
    const email = clean(decoded?.email, 220).toLowerCase();
    if (!uid) return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 });

    const docSnap = await adminDb.collection('alft_signature_requests').doc(requestId).get();
    if (!docSnap.exists) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    const data = docSnap.data() || {};

    const rnEmail = clean(data?.signers?.rn?.email, 220).toLowerCase();
    const mswEmail = clean(data?.signers?.msw?.email, 220).toLowerCase();
    const allowedByEmail = Boolean(email && (email === rnEmail || email === mswEmail));
    const allowedByAdmin = await isAdminUser(adminDb, uid);
    if (!allowedByEmail && !allowedByAdmin) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const path =
      kind === 'signature'
        ? clean(data?.outputs?.signaturePagePdfStoragePath, 900)
        : clean(data?.outputs?.packetPdfStoragePath, 900) || clean(data?.outputs?.signaturePagePdfStoragePath, 900);
    if (!path) return NextResponse.json({ success: false, error: 'File not ready yet' }, { status: 409 });

    const bucket = adminStorage.bucket();
    const file = bucket.file(path);
    const [buf] = await file.download();
    const bytes = Buffer.from(buf);
    const fileNameSafe = `ALFT_${clean(data?.memberName, 80).replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, '_') || 'Member'}_${
      kind === 'signature' ? 'signature_page' : 'packet'
    }.pdf`;

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileNameSafe}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e: any) {
    console.error('[alft/signatures/download] error', e);
    return NextResponse.json({ success: false, error: e?.message || 'Download failed' }, { status: 500 });
  }
}

