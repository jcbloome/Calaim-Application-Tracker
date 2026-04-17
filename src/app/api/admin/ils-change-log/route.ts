import { NextRequest, NextResponse } from 'next/server';
import { adminDb, default as admin } from '@/firebase-admin';
import { requireAdminApiAuthFromIdToken } from '@/lib/admin-api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const idToken = String(body?.idToken || '').trim();
    const action = String(body?.action || '').trim().toLowerCase();
    if (!idToken) return NextResponse.json({ success: false, error: 'Missing idToken' }, { status: 400 });

    const authz = await requireAdminApiAuthFromIdToken(idToken, { requireTwoFactor: true });
    if (!authz.ok) return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });

    if (action === 'create') {
      const memberId = String(body?.memberId || '').trim();
      const clientId2 = String(body?.clientId2 || '').trim();
      const memberName = String(body?.memberName || '').trim() || 'Member';
      const queue = String(body?.queue || '').trim() || 'unknown';
      const changes = body?.changes && typeof body.changes === 'object' ? body.changes : {};
      const eventType = String(body?.eventType || 'queue_change').trim() || 'queue_change';
      const queueChangeFlag = Boolean(body?.queueChangeFlag ?? true);
      const now = new Date();
      const dateKey = now.toISOString().slice(0, 10);

      const ref = adminDb.collection('ils_change_log').doc();
      await ref.set({
        memberId,
        clientId2,
        memberName,
        queue,
        eventType,
        queueChangeFlag,
        changes,
        changedByUid: authz.uid,
        changedByEmail: authz.email,
        dateKey,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAtIso: now.toISOString(),
      });
      return NextResponse.json({ success: true, id: ref.id });
    }

    // default list
    const dateKey = String(body?.dateKey || '').trim(); // optional yyyy-mm-dd
    const limit = Math.min(500, Math.max(1, Number(body?.limit || 200)));
    let q: FirebaseFirestore.Query = adminDb.collection('ils_change_log').limit(limit);
    if (dateKey) q = adminDb.collection('ils_change_log').where('dateKey', '==', dateKey).limit(limit);
    const snap = await q.get();
    const rows = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }))
      .sort((a: any, b: any) => String(b?.createdAtIso || '').localeCompare(String(a?.createdAtIso || '')));
    return NextResponse.json({ success: true, rows });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to process ILS change log' }, { status: 500 });
  }
}
