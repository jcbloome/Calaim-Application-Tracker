import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = tokenMatch?.[1] ? String(tokenMatch[1]).trim() : '';
    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Missing Authorization Bearer token' }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as any;
    const visitId = String(body?.visitId || '').trim();
    if (!visitId) {
      return NextResponse.json({ success: false, error: 'visitId is required' }, { status: 400 });
    }

    const adminModule = await import('@/firebase-admin');
    const adminAuth = adminModule.adminAuth;
    const adminDb = adminModule.adminDb;

    const decoded = await adminAuth.verifyIdToken(idToken);
    const email = String(decoded?.email || '').trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 });
    }

    const ref = adminDb.collection('sw_visit_records').doc(visitId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ success: false, error: 'Visit not found' }, { status: 404 });
    }

    const visit = snap.data() as any;
    const owner = String(visit?.socialWorkerEmail || '').trim().toLowerCase();
    if (owner && owner !== email) {
      return NextResponse.json({ success: false, error: 'Visit does not belong to this social worker' }, { status: 403 });
    }

    const status = String(visit?.status || '').trim().toLowerCase();
    if (status !== 'draft') {
      return NextResponse.json({ success: false, error: `Only draft visits can be deleted (status=${status || 'unknown'})` }, { status: 409 });
    }
    if (Boolean(visit?.signedOff)) {
      return NextResponse.json({ success: false, error: 'Cannot delete: visit is already signed off.' }, { status: 409 });
    }
    const claimId = String(visit?.claimId || '').trim();
    if (claimId) {
      return NextResponse.json({ success: false, error: 'Cannot delete: visit is already linked to a claim.' }, { status: 409 });
    }
    const claimStatus = String(visit?.claimStatus || '').trim().toLowerCase();
    if (Boolean(visit?.claimSubmitted) || Boolean(visit?.claimPaid) || (claimStatus && claimStatus !== 'draft')) {
      return NextResponse.json({ success: false, error: 'Cannot delete: visit is already submitted/paid.' }, { status: 409 });
    }

    await ref.delete();
    return NextResponse.json({ success: true, visitId });
  } catch (error: any) {
    console.error('❌ Error deleting SW draft visit:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to delete draft visit' },
      { status: 500 }
    );
  }
}

