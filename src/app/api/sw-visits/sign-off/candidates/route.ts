import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const toDayKey = (value: any): string => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  // Common case: ISO-like string
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  try {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  } catch {
    return '';
  }
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rcfeId = String(searchParams.get('rcfeId') || '').trim();
    const claimDay = String(searchParams.get('claimDay') || '').trim().slice(0, 10);

    if (!rcfeId) {
      return NextResponse.json({ success: false, error: 'rcfeId is required' }, { status: 400 });
    }
    if (!claimDay || !/^\d{4}-\d{2}-\d{2}$/.test(claimDay)) {
      return NextResponse.json({ success: false, error: 'claimDay (YYYY-MM-DD) is required' }, { status: 400 });
    }

    const authHeader = req.headers.get('authorization') || '';
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = tokenMatch?.[1] ? String(tokenMatch[1]).trim() : '';
    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Missing Authorization Bearer token' }, { status: 401 });
    }

    const adminModule = await import('@/firebase-admin');
    const adminAuth = adminModule.adminAuth;
    const adminDb = adminModule.adminDb;

    const decoded = await adminAuth.verifyIdToken(idToken);
    const email = String(decoded?.email || '').trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 });
    }

    // Avoid composite-index requirements: query by email only, filter in memory.
    const snap = await adminDb
      .collection('sw_visit_records')
      .where('socialWorkerEmail', '==', email)
      .limit(2000)
      .get();

    const matches = snap.docs
      .map((d) => (d.data() as any) || {})
      .filter((v: any) => {
        const vRcfeId = String(v?.rcfeId || '').trim();
        if (vRcfeId !== rcfeId) return false;
        if (Boolean(v?.signedOff)) return false;
        const day = toDayKey(v?.claimDay || v?.visitDate || v?.completedAt || v?.submittedAt);
        return day === claimDay;
      })
      .map((v: any) => ({
        visitId: String(v?.visitId || v?.id || '').trim(),
        memberId: String(v?.memberId || '').trim(),
        memberName: String(v?.memberName || '').trim(),
        rcfeId: String(v?.rcfeId || '').trim(),
        rcfeName: String(v?.rcfeName || '').trim(),
        rcfeAddress: String(v?.rcfeAddress || '').trim(),
        flagged: Boolean(v?.flagged),
        status: String(v?.status || '').trim(),
        completedAt: String(v?.completedAt || v?.submittedAt || '').trim(),
      }))
      .filter((v: any) => Boolean(v.visitId));

    const rcfeName = matches[0]?.rcfeName || '';
    const rcfeAddress = matches[0]?.rcfeAddress || '';

    return NextResponse.json({
      success: true,
      rcfeId,
      claimDay,
      rcfeName,
      rcfeAddress,
      visits: matches,
      total: matches.length,
    });
  } catch (error: any) {
    console.error('❌ Error fetching sign-off candidates:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch sign-off candidates' },
      { status: 500 }
    );
  }
}

