import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const toDayKey = (value: any): string => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
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
    const claimDay = String(searchParams.get('claimDay') || '').trim().slice(0, 10);
    const month = String(searchParams.get('month') || '').trim();

    if (claimDay && !/^\d{4}-\d{2}-\d{2}$/.test(claimDay)) {
      return NextResponse.json({ success: false, error: 'claimDay must be YYYY-MM-DD when provided' }, { status: 400 });
    }
    if (month && !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ success: false, error: 'month must be YYYY-MM when provided' }, { status: 400 });
    }
    if (!claimDay && !month) {
      return NextResponse.json({ success: false, error: 'Provide claimDay or month' }, { status: 400 });
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

    // Avoid composite indexes: query by owner only; filter in memory.
    const snap = await adminDb.collection('sw_visit_records').where('socialWorkerEmail', '==', email).limit(2000).get();

    const toMs = (value: any): number => {
      if (!value) return 0;
      if (typeof value?.toMillis === 'function') return Number(value.toMillis()) || 0;
      const seconds = typeof value?.seconds === 'number' ? value.seconds : undefined;
      if (typeof seconds === 'number' && Number.isFinite(seconds)) return Math.floor(seconds * 1000);
      const asDate = new Date(String(value));
      const ms = asDate.getTime();
      return Number.isFinite(ms) ? ms : 0;
    };

    const matches = snap.docs
      .map((d) => (d.data() as any) || {})
      .filter((v: any) => {
        const status = String(v?.status || '').trim().toLowerCase();
        if (status !== 'draft') return false;
        const day = toDayKey(v?.claimDay || v?.visitDate || v?.completedAt || v?.submittedAt);
        if (!day) return false;
        if (claimDay) return day === claimDay;
        if (month) return day.slice(0, 7) === month;
        return false;
      })
      .map((v: any) => ({
        visitId: String(v?.visitId || v?.id || '').trim(),
        memberId: String(v?.memberId || '').trim(),
        memberName: String(v?.memberName || '').trim(),
        memberRoomNumber: String(v?.memberRoomNumber || '').trim(),
        rcfeId: String(v?.rcfeId || '').trim(),
        rcfeName: String(v?.rcfeName || '').trim(),
        rcfeAddress: String(v?.rcfeAddress || '').trim(),
        flagged: Boolean(v?.flagged),
        status: String(v?.status || '').trim(),
        updatedAt: String(v?.updatedAt || '').trim(),
        _updatedAtMs: Math.max(toMs(v?.updatedAt), toMs(v?.createdAt)),
      }))
      .filter((v: any) => Boolean(v.visitId));

    // De-dupe: one draft per member (keep most recently updated).
    const dedupedMap = new Map<string, any>();
    for (const v of matches) {
      const memberKey =
        String(v?.memberId || '').trim() ||
        `${String(v?.memberName || '').trim().toLowerCase()}|${String(v?.memberRoomNumber || '').trim().toLowerCase()}`;
      if (!memberKey) continue;
      const prev = dedupedMap.get(memberKey);
      if (!prev || Number(v?._updatedAtMs || 0) >= Number(prev?._updatedAtMs || 0)) {
        dedupedMap.set(memberKey, v);
      }
    }

    const visits = Array.from(dedupedMap.values())
      .sort((a, b) => Number(b?._updatedAtMs || 0) - Number(a?._updatedAtMs || 0))
      .map(({ _updatedAtMs, ...rest }) => rest);

    return NextResponse.json(
      {
        success: true,
        claimDay,
        month: month || null,
        visits,
        total: visits.length,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error: any) {
    console.error('❌ Error fetching SW drafts:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Failed to fetch drafts' }, { status: 500 });
  }
}

