import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizeName(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toBoolLike(value: unknown): boolean {
  const v = String(value ?? '').trim().toLowerCase();
  if (!v) return false;
  return v === 'true' || v === '1' || v === 'yes' || v === 'y' || v === 'on';
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const month = String(searchParams.get('month') || '').trim();
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ success: false, error: 'month must be YYYY-MM' }, { status: 400 });
    }

    const adminCheck = await requireAdminApiAuth(req, { requireTwoFactor: true });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;
    const adminDb = adminModule.adminDb;

    // 1) Assigned members per SW (from Caspio members cache)
    const assignedTotalByKey = new Map<string, Set<string>>();
    const assignedActiveByKey = new Map<string, Set<string>>();
    const displayNameByKey = new Map<string, string>();
    const onHoldCountByKey = new Map<string, number>();

    const pageSize = 5000;
    const maxPages = 20; // hard safety cap
    let lastDoc: any = null;
    let scannedMembers = 0;

    for (let page = 0; page < maxPages; page += 1) {
      let q = adminDb
        .collection('caspio_members_cache')
        .where('Social_Worker_Assigned', '>', '')
        .orderBy('Social_Worker_Assigned')
        .limit(pageSize);
      if (lastDoc) q = q.startAfter(lastDoc);

      const snap = await q.get();
      if (snap.empty) break;

      for (const doc of snap.docs) {
        const m = doc.data() as any;
        const memberId = String(m?.Client_ID2 || doc.id || '').trim();
        const swNameRaw = String(m?.Social_Worker_Assigned || '').trim();
        const swKey = normalizeName(swNameRaw);
        if (!memberId || !swKey) continue;

        displayNameByKey.set(swKey, swNameRaw);

        const hold =
          toBoolLike(m?.Hold_For_Social_Worker) ||
          toBoolLike(m?.Hold_For_Social_Worker_Visit) ||
          toBoolLike(m?.Hold_for_Social_Worker);

        if (!assignedTotalByKey.has(swKey)) assignedTotalByKey.set(swKey, new Set());
        assignedTotalByKey.get(swKey)!.add(memberId);

        if (hold) {
          onHoldCountByKey.set(swKey, (onHoldCountByKey.get(swKey) || 0) + 1);
        } else {
          if (!assignedActiveByKey.has(swKey)) assignedActiveByKey.set(swKey, new Set());
          assignedActiveByKey.get(swKey)!.add(memberId);
        }
      }

      scannedMembers += snap.size;
      lastDoc = snap.docs[snap.docs.length - 1];
      if (snap.size < pageSize) break;
    }

    // 2) Completed (signed-off) visits per SW for month (from sw_visit_records)
    const completedByKey = new Map<string, Set<string>>();
    const swNameFromVisitsByKey = new Map<string, string>();

    let lastVisitDoc: any = null;
    let scannedVisits = 0;

    for (let page = 0; page < maxPages; page += 1) {
      let q = adminDb
        .collection('sw_visit_records')
        .where('visitMonth', '==', month)
        .orderBy(admin.firestore.FieldPath.documentId())
        .limit(pageSize);
      if (lastVisitDoc) q = q.startAfter(lastVisitDoc);

      const snap = await q.get();
      if (snap.empty) break;

      for (const doc of snap.docs) {
        const v = doc.data() as any;
        if (!Boolean(v?.signedOff)) continue; // only count completed visits that were signed off
        const memberId = String(v?.memberId || '').trim();
        if (!memberId) continue;
        const swNameRaw = String(v?.socialWorkerName || v?.socialWorkerEmail || v?.socialWorkerId || '').trim();
        const swKey = normalizeName(swNameRaw);
        if (!swKey) continue;

        swNameFromVisitsByKey.set(swKey, swNameRaw);
        if (!completedByKey.has(swKey)) completedByKey.set(swKey, new Set());
        completedByKey.get(swKey)!.add(memberId);
      }

      scannedVisits += snap.size;
      lastVisitDoc = snap.docs[snap.docs.length - 1];
      if (snap.size < pageSize) break;
    }

    // 2b) Claims total per SW for month (from sw-claims)
    const claimTotalByKey = new Map<string, number>();
    const claimCountByKey = new Map<string, number>();
    let scannedClaims = 0;
    let lastClaimDoc: any = null;
    for (let page = 0; page < maxPages; page += 1) {
      let q = adminDb
        .collection('sw-claims')
        .where('claimMonth', '==', month)
        .orderBy(admin.firestore.FieldPath.documentId())
        .limit(pageSize);
      if (lastClaimDoc) q = q.startAfter(lastClaimDoc);

      const snap = await q.get();
      if (snap.empty) break;

      for (const doc of snap.docs) {
        const c = doc.data() as any;
        const swRaw = String(c?.socialWorkerEmail || c?.socialWorkerName || c?.socialWorkerId || '').trim();
        const swKey = normalizeName(swRaw);
        if (!swKey) continue;
        const totalAmount = Number(c?.totalAmount || 0) || 0;
        claimTotalByKey.set(swKey, (claimTotalByKey.get(swKey) || 0) + totalAmount);
        claimCountByKey.set(swKey, (claimCountByKey.get(swKey) || 0) + 1);
      }

      scannedClaims += snap.size;
      lastClaimDoc = snap.docs[snap.docs.length - 1];
      if (snap.size < pageSize) break;
    }

    // 3) Join (best-effort by normalized name)
    const allKeys = new Set<string>([
      ...Array.from(assignedTotalByKey.keys()),
      ...Array.from(completedByKey.keys()),
      ...Array.from(claimTotalByKey.keys()),
    ]);

    const rows = Array.from(allKeys).map((key) => {
      const assignedTotal = assignedTotalByKey.get(key)?.size || 0;
      const assignedActive = assignedActiveByKey.get(key)?.size || 0;
      const completed = completedByKey.get(key)?.size || 0;
      const outstanding = Math.max(0, assignedActive - completed);
      const onHold = onHoldCountByKey.get(key) || 0;
      const name = displayNameByKey.get(key) || swNameFromVisitsByKey.get(key) || key;
      const claimsTotalAmount = claimTotalByKey.get(key) || 0;
      const claimsCount = claimCountByKey.get(key) || 0;
      return {
        key,
        socialWorkerName: name,
        assignedTotal,
        assignedActive,
        onHold,
        completed,
        outstanding,
        claimsCount,
        claimsTotalAmount,
      };
    });

    rows.sort(
      (a, b) =>
        (b.outstanding - a.outstanding) ||
        (b.assignedActive - a.assignedActive) ||
        (b.claimsTotalAmount - a.claimsTotalAmount) ||
        a.socialWorkerName.localeCompare(b.socialWorkerName)
    );

    return NextResponse.json({
      success: true,
      month,
      totals: {
        socialWorkers: rows.length,
        scannedMembers,
        scannedVisits,
        scannedClaims,
      },
      rows,
    });
  } catch (error: any) {
    console.error('❌ Error building SW monthly summary:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to build summary' },
      { status: 500 }
    );
  }
}

