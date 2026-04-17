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

function pickMemberName(m: any): string {
  const fromCache = String(m?.memberName || '').trim();
  if (fromCache) return fromCache;
  const first = String(m?.Senior_First || m?.memberFirstName || '').trim();
  const last = String(m?.Senior_Last || m?.memberLastName || '').trim();
  const combined = `${first} ${last}`.trim();
  return combined || String(m?.Senior_Last_First_ID || '').trim() || 'Unknown member';
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const month = String(searchParams.get('month') || '').trim();
    const swKey = normalizeName(searchParams.get('swKey') || '');
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ success: false, error: 'month must be YYYY-MM' }, { status: 400 });
    }
    if (!swKey) {
      return NextResponse.json({ success: false, error: 'swKey is required' }, { status: 400 });
    }

    const adminCheck = await requireAdminApiAuth(req, { requireTwoFactor: true });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;
    const adminDb = adminModule.adminDb;

    const pageSize = 5000;
    const maxPages = 20;

    // Assigned members (from cache)
    const assignedTotal: Array<{ memberId: string; memberName: string; rcfeName: string; rcfeAddress: string; hold: boolean }> = [];
    const assignedActive: Array<{ memberId: string; memberName: string; rcfeName: string; rcfeAddress: string }> = [];
    const onHold: Array<{ memberId: string; memberName: string; rcfeName: string; rcfeAddress: string }> = [];

    let lastDoc: any = null;
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
        const raw = String(m?.Social_Worker_Assigned || '').trim();
        if (normalizeName(raw) !== swKey) continue;
        const memberId = String(m?.Client_ID2 || doc.id || '').trim();
        if (!memberId) continue;
        const memberName = pickMemberName(m);
        const rcfeName = String(m?.RCFE_Name || '').trim() || 'Unknown RCFE';
        const rcfeAddress = String(m?.RCFE_Address || '').trim() || '';
        const hold =
          toBoolLike(m?.Hold_For_Social_Worker) ||
          toBoolLike(m?.Hold_For_Social_Worker_Visit) ||
          toBoolLike(m?.Hold_for_Social_Worker);
        assignedTotal.push({ memberId, memberName, rcfeName, rcfeAddress, hold });
        if (hold) onHold.push({ memberId, memberName, rcfeName, rcfeAddress });
        else assignedActive.push({ memberId, memberName, rcfeName, rcfeAddress });
      }
      lastDoc = snap.docs[snap.docs.length - 1];
      if (snap.size < pageSize) break;
    }

    // Completed (signed-off) members this month
    const completedById = new Map<string, { memberId: string; memberName: string; rcfeName: string; visitId: string }>();
    let lastVisitDoc: any = null;
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
        if (!Boolean(v?.signedOff)) continue;
        const swRaw = String(v?.socialWorkerName || v?.socialWorkerEmail || v?.socialWorkerId || '').trim();
        if (normalizeName(swRaw) !== swKey) continue;
        const memberId = String(v?.memberId || '').trim();
        if (!memberId) continue;
        if (completedById.has(memberId)) continue;
        completedById.set(memberId, {
          memberId,
          memberName: String(v?.memberName || '').trim() || memberId,
          rcfeName: String(v?.rcfeName || '').trim() || 'Unknown RCFE',
          visitId: String(v?.visitId || doc.id || '').trim(),
        });
      }
      lastVisitDoc = snap.docs[snap.docs.length - 1];
      if (snap.size < pageSize) break;
    }
    const completed = Array.from(completedById.values());

    const completedSet = new Set(completed.map((m) => m.memberId));
    const outstanding = assignedActive.filter((m) => !completedSet.has(m.memberId));

    // Claims totals for this month
    let claimsTotalAmount = 0;
    let claimsCount = 0;
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
        if (normalizeName(swRaw) !== swKey) continue;
        claimsCount += 1;
        claimsTotalAmount += Number(c?.totalAmount || 0) || 0;
      }
      lastClaimDoc = snap.docs[snap.docs.length - 1];
      if (snap.size < pageSize) break;
    }

    return NextResponse.json({
      success: true,
      month,
      swKey,
      assignedTotal,
      assignedActive,
      onHold,
      completed,
      outstanding,
      claimsCount,
      claimsTotalAmount,
    });
  } catch (error: any) {
    console.error('❌ Error building SW monthly detail:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to build detail' },
      { status: 500 }
    );
  }
}

