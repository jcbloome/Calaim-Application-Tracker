import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type LookupResponse =
  | { success: true; claim: any }
  | { success: false; error: string };

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const claimId = String(searchParams.get('claimId') || '').trim();
    if (!claimId) {
      return NextResponse.json<LookupResponse>({ success: false, error: 'claimId is required' }, { status: 400 });
    }

    const authHeader = req.headers.get('authorization') || '';
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = tokenMatch?.[1] ? String(tokenMatch[1]).trim() : '';
    if (!idToken) {
      return NextResponse.json<LookupResponse>(
        { success: false, error: 'Missing Authorization Bearer token' },
        { status: 401 }
      );
    }

    const adminModule = await import('@/firebase-admin');
    const adminAuth = adminModule.adminAuth;
    const adminDb = adminModule.adminDb;

    const decoded = await adminAuth.verifyIdToken(idToken);
    const email = String(decoded?.email || '').trim().toLowerCase();
    const uid = String(decoded?.uid || '').trim();
    if (!email || !uid) {
      return NextResponse.json<LookupResponse>({ success: false, error: 'Invalid token' }, { status: 401 });
    }

    const claimRef = adminDb.collection('sw-claims').doc(claimId);
    const snap = await claimRef.get();
    if (!snap.exists) {
      return NextResponse.json<LookupResponse>({ success: false, error: 'Claim not found' }, { status: 404 });
    }

    const claim = (snap.data() as any) || {};
    const ownerEmail = String(claim?.socialWorkerEmail || '').trim().toLowerCase();
    const ownerUid = String(claim?.socialWorkerUid || '').trim();

    if ((ownerEmail && ownerEmail !== email) || (ownerUid && ownerUid !== uid)) {
      return NextResponse.json<LookupResponse>({ success: false, error: 'Claim does not belong to this social worker' }, { status: 403 });
    }

    // Return a safe subset for display in the SW roster UI.
    return NextResponse.json<LookupResponse>({
      success: true,
      claim: {
        claimId: String(snap.id || claimId).trim(),
        status: String(claim?.status || '').trim() || 'unknown',
        reviewStatus: String(claim?.reviewStatus || '').trim() || undefined,
        paymentStatus: String(claim?.paymentStatus || '').trim() || undefined,
        claimDay: String(claim?.claimDay || '').trim() || undefined,
        claimMonth: String(claim?.claimMonth || '').trim() || undefined,
        rcfeId: String(claim?.rcfeId || '').trim() || undefined,
        rcfeName: String(claim?.rcfeName || '').trim() || undefined,
        rcfeAddress: String(claim?.rcfeAddress || '').trim() || undefined,
        totalAmount: typeof claim?.totalAmount === 'number' ? claim.totalAmount : Number(claim?.totalAmount),
        visitCount: typeof claim?.visitCount === 'number' ? claim.visitCount : Number(claim?.visitCount),
      },
    });
  } catch (e: any) {
    return NextResponse.json<LookupResponse>(
      { success: false, error: e?.message || 'Claim lookup failed' },
      { status: 500 }
    );
  }
}

