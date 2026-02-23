import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const parseMonth = (value: string) => {
  const m = String(value || '').trim();
  if (!/^\d{4}-\d{2}$/.test(m)) return null;
  const [y, mo] = m.split('-').map((x) => Number(x));
  if (!Number.isFinite(y) || !Number.isFinite(mo) || mo < 1 || mo > 12) return null;
  const start = new Date(Date.UTC(y, mo - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, mo, 1, 0, 0, 0, 0));
  return { month: m, start, end };
};

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = tokenMatch?.[1] ? String(tokenMatch[1]).trim() : '';
    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Missing Authorization Bearer token' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as { month?: string } | null;
    const parsed = parseMonth(String(body?.month || ''));
    if (!parsed) {
      return NextResponse.json({ success: false, error: 'Invalid month (expected YYYY-MM)' }, { status: 400 });
    }

    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;
    const adminAuth = adminModule.adminAuth;
    const adminDb = adminModule.adminDb;

    const decoded = await adminAuth.verifyIdToken(idToken);
    const email = String(decoded?.email || '').trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 });
    }

    const startTs = admin.firestore.Timestamp.fromDate(parsed.start);
    const endTs = admin.firestore.Timestamp.fromDate(parsed.end);

    // Avoid composite index requirements by querying by date range and filtering by email.
    const snap = await adminDb
      .collection('sw_visit_records')
      .where('submittedAtTs', '>=', startTs)
      .where('submittedAtTs', '<', endTs)
      .orderBy('submittedAtTs', 'asc')
      .limit(5000)
      .get();

    const visits = snap.docs
      .map((d) => d.data() as any)
      .filter((v) => String(v?.socialWorkerEmail || '').trim().toLowerCase() === email);

    // Compute per-day totals ($45/visit + $20/day if any visit).
    const byDay = new Map<string, { count: number }>();
    for (const v of visits) {
      const day = String(v?.visitDate || '').slice(0, 10);
      if (!day) continue;
      byDay.set(day, { count: (byDay.get(day)?.count || 0) + 1 });
    }

    const rows = visits.map((v) => {
      const day = String(v?.visitDate || '').slice(0, 10);
      const dailyCount = byDay.get(day)?.count || 0;
      const dailyVisitFees = dailyCount * 45;
      const dailyGas = dailyCount > 0 ? 20 : 0;
      const dailyTotal = dailyVisitFees + dailyGas;
      return {
        date: day,
        memberName: String(v?.memberName || '').trim(),
        rcfeName: String(v?.rcfeName || '').trim(),
        rcfeAddress: String(v?.rcfeAddress || '').trim(),
        visitId: String(v?.visitId || v?.id || '').trim(),
        flagged: Boolean(v?.flagged),
        signedOff: Boolean(v?.signedOff),
        dailyVisitCount: dailyCount,
        dailyVisitFees,
        dailyGas,
        dailyTotal,
      };
    });

    return NextResponse.json({
      success: true,
      month: parsed.month,
      rowCount: rows.length,
      rows,
    });
  } catch (error: any) {
    console.error('❌ Error exporting monthly SW visits:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to export visits' },
      { status: 500 }
    );
  }
}

