import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as any;
    const requestId = String(body?.requestId || '').trim();
    const status = String(body?.status || '').trim().toLowerCase();
    const adminNote = String(body?.adminNote || '').trim();
    const result = body?.result && typeof body.result === 'object' ? body.result : null;

    if (!requestId) return NextResponse.json({ success: false, error: 'requestId is required' }, { status: 400 });
    if (!['pending', 'approved', 'rejected', 'cancelled'].includes(status)) {
      return NextResponse.json({ success: false, error: 'Invalid status' }, { status: 400 });
    }
    if ((status === 'approved' || status === 'rejected') && !adminNote && !result) {
      return NextResponse.json({ success: false, error: 'adminNote is required for approved/rejected decisions' }, { status: 400 });
    }

    const adminCheck = await requireAdminApiAuth(req, { requireTwoFactor: true });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const adminModule = await import('@/firebase-admin');
    const adminDb = adminModule.adminDb;
    const actorUid = adminCheck.uid;
    const actorEmail = adminCheck.email;
    const actorName = adminCheck.name;
    const admin = adminModule.default;

    const ref = adminDb.collection('sw_claim_override_requests').doc(requestId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ success: false, error: 'Request not found' }, { status: 404 });

    const nowIso = new Date().toISOString();
    const actorLabel = String(actorName || actorEmail || 'Admin').trim() || 'Admin';

    await ref.set(
      {
        status,
        adminNote: adminNote || null,
        decidedAtIso: nowIso,
        decidedAt: admin.firestore.FieldValue.serverTimestamp(),
        decidedBy: actorLabel,
        decidedByUid: actorUid,
        decidedByEmail: actorEmail,
        ...(result ? { result } : {}),
        updatedAtIso: nowIso,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ success: true, requestId, status });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Failed to update request' }, { status: 500 });
  }
}

