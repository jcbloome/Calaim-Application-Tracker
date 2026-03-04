import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ClaimListRow = {
  claimId: string;
  claimNumber?: string;
  status: string;
  reviewStatus?: string;
  paymentStatus?: string;
  claimDay?: string;
  claimMonth?: string;
  rcfeName?: string;
  rcfeAddress?: string;
  totalAmount?: number;
  visitCount?: number;
  memberName?: string;
  submittedAtMs?: number;
  updatedAtMs?: number;
};

type ListResponse =
  | {
      success: true;
      month: string | null;
      includeDrafts: boolean;
      claims: ClaimListRow[];
      scanned: number;
      returned: number;
    }
  | { success: false; error: string };

const parseMonth = (value: string) => {
  const m = String(value || '').trim();
  if (!m) return null;
  if (m === 'all') return null;
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

const pickMemberName = (claim: any): string | undefined => {
  const direct = String(claim?.memberName || '').trim();
  if (direct) return direct;
  const memberVisits = Array.isArray(claim?.memberVisits) ? claim.memberVisits : [];
  const names = memberVisits
    .map((v: any) => String(v?.memberName || '').trim())
    .filter(Boolean);
  return names[0] || undefined;
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const month = parseMonth(String(searchParams.get('month') || ''));
    const includeDrafts = String(searchParams.get('includeDrafts') || '').trim() === '1';
    const limitRaw = Number(searchParams.get('limit') || 500);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 1000) : 500;

    const authHeader = req.headers.get('authorization') || '';
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = tokenMatch?.[1] ? String(tokenMatch[1]).trim() : '';
    if (!idToken) {
      return NextResponse.json<ListResponse>(
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
      return NextResponse.json<ListResponse>({ success: false, error: 'Invalid token' }, { status: 401 });
    }

    // Avoid composite indexes: query by owner only, filter in memory.
    const snap = await adminDb.collection('sw-claims').where('socialWorkerEmail', '==', email).limit(2500).get();
    const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() as any }));

    const claims: ClaimListRow[] = [];

    for (const doc of docs) {
      const c = doc.data || {};

      // Ownership safety (legacy docs).
      const ownerEmail = String(c?.socialWorkerEmail || '').trim().toLowerCase();
      const ownerUid = String(c?.socialWorkerUid || '').trim();
      if ((ownerEmail && ownerEmail !== email) || (ownerUid && ownerUid !== uid)) continue;

      const statusRaw = String(c?.status || 'draft').trim();
      const statusLower = statusRaw.toLowerCase();
      if (!includeDrafts && statusLower === 'draft') continue;

      const claimMonth = String(c?.claimMonth || '').trim();
      const claimDay = String(c?.claimDay || '').trim();
      const dayMonth = claimDay && /^\d{4}-\d{2}-\d{2}$/.test(claimDay) ? claimDay.slice(0, 7) : '';
      if (month) {
        const inMonth = claimMonth ? claimMonth === month : dayMonth === month;
        if (!inMonth) continue;
      }

      const submittedAtMs = toMs(c?.submittedAt);
      const updatedAtMs = toMs(c?.updatedAt);

      claims.push({
        claimId: String(doc.id || '').trim(),
        claimNumber: String(c?.claimNumber || '').trim() || undefined,
        status: statusRaw || 'unknown',
        reviewStatus: String(c?.reviewStatus || '').trim() || undefined,
        paymentStatus: String(c?.paymentStatus || '').trim() || undefined,
        claimDay: claimDay || undefined,
        claimMonth: claimMonth || undefined,
        rcfeName: String(c?.rcfeName || '').trim() || undefined,
        rcfeAddress: String(c?.rcfeAddress || '').trim() || undefined,
        totalAmount: typeof c?.totalAmount === 'number' ? c.totalAmount : Number(c?.totalAmount),
        visitCount: typeof c?.visitCount === 'number' ? c.visitCount : Number(c?.visitCount),
        memberName: pickMemberName(c),
        submittedAtMs: submittedAtMs || undefined,
        updatedAtMs: updatedAtMs || undefined,
      });
    }

    // Sort: submitted/updated desc, then by claimDay desc.
    claims.sort((a, b) => {
      const aKey = (a.submittedAtMs || 0) || (a.updatedAtMs || 0);
      const bKey = (b.submittedAtMs || 0) || (b.updatedAtMs || 0);
      if (aKey !== bKey) return bKey - aKey;
      const aDay = String(a.claimDay || '');
      const bDay = String(b.claimDay || '');
      return bDay.localeCompare(aDay);
    });

    const sliced = claims.slice(0, limit);

    return NextResponse.json<ListResponse>(
      {
        success: true,
        month,
        includeDrafts,
        claims: sliced,
        scanned: docs.length,
        returned: sliced.length,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (e: any) {
    return NextResponse.json<ListResponse>(
      { success: false, error: e?.message || 'Failed to list claims' },
      { status: 500 }
    );
  }
}

