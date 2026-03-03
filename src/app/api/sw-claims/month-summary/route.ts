import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type MonthSummaryRow = {
  claimId: string;
  claimNumber?: string;
  status: string;
  reviewStatus?: string;
  paymentStatus?: string;
  claimDay?: string;
  claimMonth?: string;
  rcfeName?: string;
  totalAmount?: number;
  submittedAtMs?: number;
};

type MonthSummaryResponse =
  | {
      success: true;
      month: string;
      totals: {
        claimCount: number;
        submittedCount: number;
        paidCount: number;
        totalAmount: number;
        paidAmount: number;
      };
      claims: MonthSummaryRow[];
      scanned: number;
    }
  | { success: false; error: string };

const parseMonth = (value: string) => {
  const m = String(value || '').trim();
  return /^\d{4}-\d{2}$/.test(m) ? m : null;
};

const toMs = (v: any) => {
  try {
    if (!v) return 0;
    if (typeof v?.toDate === 'function') return v.toDate().getTime() || 0;
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d.getTime() : 0;
  } catch {
    return 0;
  }
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const month = parseMonth(String(searchParams.get('month') || ''));
    if (!month) {
      return NextResponse.json<MonthSummaryResponse>(
        { success: false, error: 'month is required (YYYY-MM)' },
        { status: 400 }
      );
    }

    const authHeader = req.headers.get('authorization') || '';
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = tokenMatch?.[1] ? String(tokenMatch[1]).trim() : '';
    if (!idToken) {
      return NextResponse.json<MonthSummaryResponse>(
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
      return NextResponse.json<MonthSummaryResponse>({ success: false, error: 'Invalid token' }, { status: 401 });
    }

    // Avoid composite index requirements: query by owner only, then filter in memory.
    const snap = await adminDb.collection('sw-claims').where('socialWorkerEmail', '==', email).limit(1500).get();
    const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() as any }));

    const claims: MonthSummaryRow[] = [];

    for (const doc of docs) {
      const c = doc.data || {};

      // Ownership safety (legacy docs).
      const ownerEmail = String(c?.socialWorkerEmail || '').trim().toLowerCase();
      const ownerUid = String(c?.socialWorkerUid || '').trim();
      if ((ownerEmail && ownerEmail !== email) || (ownerUid && ownerUid !== uid)) continue;

      const status = String(c?.status || '').trim().toLowerCase();
      if (!status || status === 'draft') continue;

      const claimMonth = String(c?.claimMonth || '').trim();
      const claimDay = String(c?.claimDay || '').trim();
      const dayMonth = claimDay && /^\d{4}-\d{2}-\d{2}$/.test(claimDay) ? claimDay.slice(0, 7) : '';
      const inMonth = claimMonth ? claimMonth === month : dayMonth === month;
      if (!inMonth) continue;

      claims.push({
        claimId: String(doc.id || '').trim(),
        claimNumber: String(c?.claimNumber || '').trim() || undefined,
        status: String(c?.status || '').trim() || 'unknown',
        reviewStatus: String(c?.reviewStatus || '').trim() || undefined,
        paymentStatus: String(c?.paymentStatus || '').trim() || undefined,
        claimDay: claimDay || undefined,
        claimMonth: claimMonth || undefined,
        rcfeName: String(c?.rcfeName || '').trim() || undefined,
        totalAmount: typeof c?.totalAmount === 'number' ? c.totalAmount : Number(c?.totalAmount),
        submittedAtMs: toMs(c?.submittedAt),
      });
    }

    claims.sort((a, b) => (b.submittedAtMs || 0) - (a.submittedAtMs || 0));

    const sum = (arr: MonthSummaryRow[]) =>
      arr.reduce((acc, r) => (Number.isFinite(Number(r.totalAmount)) ? acc + Number(r.totalAmount) : acc), 0);

    const submittedCount = claims.length;
    const paidClaims = claims.filter((c) => {
      const st = String(c.status || '').trim().toLowerCase();
      const pay = String(c.paymentStatus || '').trim().toLowerCase();
      return st === 'paid' || pay === 'paid';
    });

    return NextResponse.json<MonthSummaryResponse>({
      success: true,
      month,
      totals: {
        claimCount: submittedCount,
        submittedCount,
        paidCount: paidClaims.length,
        totalAmount: sum(claims),
        paidAmount: sum(paidClaims),
      },
      claims: claims.slice(0, 500),
      scanned: docs.length,
    });
  } catch (e: any) {
    return NextResponse.json<MonthSummaryResponse>(
      { success: false, error: e?.message || 'Failed to load month summary' },
      { status: 500 }
    );
  }
}

