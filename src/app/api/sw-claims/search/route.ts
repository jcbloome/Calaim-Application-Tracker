import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SearchResult = {
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
  memberNames: string[];
  matchedMemberNames: string[];
  submittedAtMs: number;
};

type SearchResponse =
  | { success: true; results: SearchResult[]; scanned: number; returned: number }
  | { success: false; error: string };

const norm = (v: unknown) =>
  String(v ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const qRaw = String(searchParams.get('q') || '').trim();
    const q = norm(qRaw);
    if (!q) {
      return NextResponse.json<SearchResponse>({ success: false, error: 'q is required' }, { status: 400 });
    }

    const authHeader = req.headers.get('authorization') || '';
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = tokenMatch?.[1] ? String(tokenMatch[1]).trim() : '';
    if (!idToken) {
      return NextResponse.json<SearchResponse>(
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
      return NextResponse.json<SearchResponse>({ success: false, error: 'Invalid token' }, { status: 401 });
    }

    // Avoid composite index requirements: query by owner only, then filter/sort in memory.
    const claimsCol = adminDb.collection('sw-claims');
    const snap = await claimsCol.where('socialWorkerEmail', '==', email).limit(500).get();
    const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() as any }));

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

    const matches: SearchResult[] = [];

    for (const doc of docs) {
      const claim = doc.data || {};

      // Ownership safety (in case of legacy docs).
      const ownerEmail = String(claim?.socialWorkerEmail || '').trim().toLowerCase();
      const ownerUid = String(claim?.socialWorkerUid || '').trim();
      if ((ownerEmail && ownerEmail !== email) || (ownerUid && ownerUid !== uid)) continue;

      const status = String(claim?.status || '').trim().toLowerCase();
      if (status === 'draft') continue;

      const memberVisits = Array.isArray(claim?.memberVisits) ? claim.memberVisits : [];
      const memberNames = Array.from(
        new Set(
          memberVisits
            .map((v: any) => String(v?.memberName || '').trim())
            .filter(Boolean)
        )
      );

      // Fallback: sometimes member names might be stored elsewhere; keep it simple for now.
      if (memberNames.length === 0) continue;

      const matched = memberNames.filter((name) => norm(name).includes(q));
      if (matched.length === 0) continue;

      matches.push({
        claimId: String(doc.id || '').trim(),
        claimNumber: String(claim?.claimNumber || '').trim() || undefined,
        status: String(claim?.status || '').trim() || 'unknown',
        reviewStatus: String(claim?.reviewStatus || '').trim() || undefined,
        paymentStatus: String(claim?.paymentStatus || '').trim() || undefined,
        claimDay: String(claim?.claimDay || '').trim() || undefined,
        claimMonth: String(claim?.claimMonth || '').trim() || undefined,
        rcfeName: String(claim?.rcfeName || '').trim() || undefined,
        rcfeAddress: String(claim?.rcfeAddress || '').trim() || undefined,
        totalAmount: typeof claim?.totalAmount === 'number' ? claim.totalAmount : Number(claim?.totalAmount),
        visitCount: typeof claim?.visitCount === 'number' ? claim.visitCount : Number(claim?.visitCount),
        memberNames,
        matchedMemberNames: matched,
        submittedAtMs: toMs(claim?.submittedAt),
      });
    }

    matches.sort((a, b) => (b.submittedAtMs || 0) - (a.submittedAtMs || 0));

    const results = matches.slice(0, 25);

    return NextResponse.json<SearchResponse>({
      success: true,
      results,
      scanned: docs.length,
      returned: results.length,
    });
  } catch (e: any) {
    return NextResponse.json<SearchResponse>(
      { success: false, error: e?.message || 'Search failed' },
      { status: 500 }
    );
  }
}

