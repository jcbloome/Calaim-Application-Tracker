import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = tokenMatch?.[1] ? String(tokenMatch[1]).trim() : '';
    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Missing Authorization Bearer token' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const visitId = String(searchParams.get('visitId') || '').trim();
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

    const snap = await adminDb.collection('sw_visit_records').doc(visitId).get();
    if (!snap.exists) {
      return NextResponse.json({ success: false, error: 'Visit not found' }, { status: 404 });
    }
    const visit = snap.data() as any;

    const owner = String(visit?.socialWorkerEmail || '').trim().toLowerCase();
    if (owner && owner !== email) {
      return NextResponse.json({ success: false, error: 'Visit does not belong to this social worker' }, { status: 403 });
    }

    return NextResponse.json({ success: true, visitId, visit });
  } catch (error: any) {
    console.error('❌ Error loading SW visit:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to load visit' },
      { status: 500 }
    );
  }
}

