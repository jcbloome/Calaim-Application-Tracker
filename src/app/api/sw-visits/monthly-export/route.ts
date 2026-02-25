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

const firstOfNextMonth = (month: string) => {
  const [y, mo] = month.split('-').map((x) => Number(x));
  const start = new Date(Date.UTC(y, mo - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, mo, 1, 0, 0, 0, 0));
  const endMonth = `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, '0')}`;
  return { start, end, endMonth };
};

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = tokenMatch?.[1] ? String(tokenMatch[1]).trim() : '';
    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Missing Authorization Bearer token' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as
      | { month?: string; raw?: boolean; dedupeByMemberMonth?: boolean }
      | null;
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

    const rawMode = Boolean(body?.raw);
    const dedupeByMemberMonth = body?.dedupeByMemberMonth === undefined ? true : Boolean(body?.dedupeByMemberMonth);

    const range = firstOfNextMonth(parsed.month);
    const startStr = `${parsed.month}-01`;
    const endStr = `${range.endMonth}-01`;

    // Query by visitDate so "month" reflects the actual visit month.
    // This avoids missing late submissions that belong to the prior month.
    const snap = await adminDb
      .collection('sw_visit_records')
      .where('visitDate', '>=', startStr)
      .where('visitDate', '<', endStr)
      .orderBy('visitDate', 'asc')
      .limit(5000)
      .get();

    const visits = snap.docs
      .map((d) => d.data() as any)
      .filter((v) => String(v?.socialWorkerEmail || '').trim().toLowerCase() === email);

    const normalizeKey = (v: any) =>
      String(v ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');

    // Dedupe by member-month (business rule: only one per member per month).
    const dedupedVisits = (() => {
      if (!dedupeByMemberMonth || rawMode) return visits;
      const byMember = new Map<string, any>();
      for (const v of visits) {
        const memberId = normalizeKey(v?.memberId || '');
        const memberName = normalizeKey(v?.memberName || '');
        const key = memberId || (memberName ? `name:${memberName}` : '');
        if (!key) continue;
        if (!byMember.has(key)) byMember.set(key, v);
      }
      return Array.from(byMember.values());
    })();

    const duplicates = (() => {
      const counts = new Map<string, { count: number; visitIds: string[]; memberName: string }>();
      for (const v of visits) {
        const memberId = normalizeKey(v?.memberId || '');
        const memberName = String(v?.memberName || '').trim();
        const key = memberId || `name:${normalizeKey(memberName)}`;
        if (!key) continue;
        const cur = counts.get(key) || { count: 0, visitIds: [], memberName };
        cur.count += 1;
        const vid = String(v?.visitId || v?.id || '').trim();
        if (vid) cur.visitIds.push(vid);
        if (!cur.memberName && memberName) cur.memberName = memberName;
        counts.set(key, cur);
      }
      return Array.from(counts.entries())
        .map(([key, v]) => ({ key, ...v }))
        .filter((x) => x.count > 1)
        .sort((a, b) => b.count - a.count);
    })();

    // Compute per-day totals ($45/visit + $20/day if any visit).
    const byDay = new Map<string, { count: number }>();
    for (const v of dedupedVisits) {
      const day = String(v?.visitDate || '').slice(0, 10);
      if (!day) continue;
      byDay.set(day, { count: (byDay.get(day)?.count || 0) + 1 });
    }

    const rows = dedupedVisits.map((v) => {
      const day = String(v?.visitDate || '').slice(0, 10);
      const dailyCount = byDay.get(day)?.count || 0;
      const dailyVisitFees = dailyCount * 45;
      const dailyGas = dailyCount > 0 ? 20 : 0;
      const dailyTotal = dailyVisitFees + dailyGas;
      return {
        date: day,
        memberId: String(v?.memberId || '').trim(),
        visitMonth: String(v?.visitMonth || '').trim() || parsed.month,
        memberName: String(v?.memberName || '').trim(),
        rcfeName: String(v?.rcfeName || '').trim(),
        rcfeAddress: String(v?.rcfeAddress || '').trim(),
        visitId: String(v?.visitId || v?.id || '').trim(),
        flagged: Boolean(v?.flagged),
        signedOff: Boolean(v?.signedOff),
        claimId: String(v?.claimId || '').trim(),
        claimStatus: String(v?.claimStatus || '').trim() || 'draft',
        claimSubmitted: Boolean(v?.claimSubmitted),
        claimPaid: Boolean(v?.claimPaid),
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
      duplicates,
      dedupedByMemberMonth: dedupeByMemberMonth && !rawMode,
    });
  } catch (error: any) {
    console.error('❌ Error exporting monthly SW visits:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to export visits' },
      { status: 500 }
    );
  }
}

