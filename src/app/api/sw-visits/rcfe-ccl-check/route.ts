import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (v: unknown, max = 300) => String(v ?? '').trim().slice(0, max);

const safeDocId = (value: string) =>
  clean(value, 240)
    .replace(/[^\w.\-]+/g, '_')
    .slice(0, 240);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rcfeId = clean(searchParams.get('rcfeId'), 120);
    const month = clean(searchParams.get('month'), 10);
    if (!rcfeId) return NextResponse.json({ success: false, error: 'rcfeId is required' }, { status: 400 });
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ success: false, error: 'month (YYYY-MM) is required' }, { status: 400 });
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
    const email = clean(decoded?.email, 200).toLowerCase();
    if (!email) return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 });

    const docId = safeDocId(`${rcfeId}_${month}`);
    const snap = await adminDb.collection('rcfe_monthly_ccl_checks').doc(docId).get();
    if (!snap.exists) {
      return NextResponse.json({ success: true, rcfeId, month, check: null });
    }
    const data = snap.data() as any;
    return NextResponse.json({
      success: true,
      rcfeId,
      month,
      check: {
        id: snap.id,
        rcfeId: clean(data?.rcfeId, 140) || rcfeId,
        rcfeName: clean(data?.rcfeName, 200),
        month: clean(data?.month, 10) || month,
        latestReportDate: clean(data?.latestReportDate, 10),
        typeAViolations: Number(data?.typeAViolations ?? 0) || 0,
        typeBViolations: Number(data?.typeBViolations ?? 0) || 0,
        seriousViolationComments: clean(data?.seriousViolationComments, 4000),
        checkedAt: data?.checkedAt?.toDate?.()?.toISOString?.() || clean(data?.checkedAt, 50) || '',
        checkedByName: clean(data?.checkedByName, 140),
        checkedByEmail: clean(data?.checkedByEmail, 200),
        updatedAt: data?.updatedAt?.toDate?.()?.toISOString?.() || clean(data?.updatedAt, 50) || '',
      },
    });
  } catch (error: any) {
    console.error('❌ Error reading RCFE CCL check:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Failed to fetch check' }, { status: 500 });
  }
}

