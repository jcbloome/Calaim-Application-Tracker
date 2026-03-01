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
    const rcfeId = String(searchParams.get('rcfeId') || '').trim();
    const rcfeNameQ = String(searchParams.get('rcfeName') || '').trim();
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

    const toMs = (value: any): number => {
      if (!value) return 0;
      if (typeof value?.toMillis === 'function') return Number(value.toMillis()) || 0;
      const seconds = typeof value?.seconds === 'number' ? value.seconds : undefined;
      if (typeof seconds === 'number' && Number.isFinite(seconds)) return Math.floor(seconds * 1000);
      const asDate = new Date(String(value));
      const ms = asDate.getTime();
      return Number.isFinite(ms) ? ms : 0;
    };

    const norm = (value: unknown) =>
      String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');

    const matches = snap.docs
      .map((d) => (d.data() as any) || {})
      .filter((v: any) => {
        const vRcfeId = String(v?.rcfeId || '').trim();
        if (vRcfeId !== rcfeId) {
          // Backward-compat: older drafts used a slug rcfeId. Allow matching by rcfeName only for legacy ids.
          const legacy = vRcfeId.startsWith('rcfe-');
          const nameMatch = rcfeNameQ && norm(v?.rcfeName) === norm(rcfeNameQ);
          if (!(legacy && nameMatch)) return false;
        }
        const status = String(v?.status || '').trim().toLowerCase();
        if (status !== 'draft') return false;
        const day = toDayKey(v?.claimDay || v?.visitDate || v?.completedAt || v?.submittedAt);
        return day === claimDay;
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

    // De-dupe: one candidate per member (keep most recently updated).
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
    const deduped = Array.from(dedupedMap.values())
      .sort((a, b) => Number(b?._updatedAtMs || 0) - Number(a?._updatedAtMs || 0))
      .map(({ _updatedAtMs, ...rest }) => rest);

    const rcfeName = deduped[0]?.rcfeName || '';
    const rcfeAddress = deduped[0]?.rcfeAddress || '';

    return NextResponse.json({
      success: true,
      rcfeId,
      claimDay,
      rcfeName,
      rcfeAddress,
      visits: deduped,
      total: deduped.length,
    });
  } catch (error: any) {
    console.error('❌ Error fetching draft candidates:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch draft candidates' },
      { status: 500 }
    );
  }
}

