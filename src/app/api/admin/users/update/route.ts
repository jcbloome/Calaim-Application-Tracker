import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Mode = 'disable' | 'enable' | 'delete';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as any;
    const targetUid = String(body?.uid || '').trim();
    const mode = String(body?.mode || '').trim() as Mode;
    const reason = String(body?.reason || '').trim();

    if (!targetUid) return NextResponse.json({ success: false, error: 'uid is required' }, { status: 400 });
    if (!mode || !(['disable', 'enable', 'delete'] as Mode[]).includes(mode)) {
      return NextResponse.json({ success: false, error: 'mode must be disable|enable|delete' }, { status: 400 });
    }
    if ((mode === 'disable' || mode === 'delete') && !reason) {
      return NextResponse.json({ success: false, error: 'reason is required' }, { status: 400 });
    }

    const adminCheck = await requireAdminApiAuth(req, { requireSuperAdmin: true, requireTwoFactor: true });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    if (adminCheck.uid && targetUid === adminCheck.uid && mode === 'delete') {
      return NextResponse.json({ success: false, error: 'You cannot delete your own account.' }, { status: 400 });
    }

    const nowIso = new Date().toISOString();
    const actorLabel = String(adminCheck.name || adminCheck.email || 'Super Admin').trim() || 'Super Admin';

    if (mode === 'delete') {
      await adminCheck.adminAuth.deleteUser(targetUid);
    } else {
      await adminCheck.adminAuth.updateUser(targetUid, { disabled: mode === 'disable' });
    }

    // Audit log
    try {
      const eventRef = adminCheck.adminDb.collection('admin_user_events').doc();
      await eventRef.set(
        {
          id: eventRef.id,
          uid: targetUid,
          mode,
          reason: reason || null,
          actorUid: adminCheck.uid,
          actorEmail: adminCheck.email,
          actorName: actorLabel,
          createdAtIso: nowIso,
          createdAt: (await import('@/firebase-admin')).default.firestore.Timestamp.now(),
        },
        { merge: true }
      );
    } catch (e) {
      console.warn('⚠️ Failed writing admin_user_events (best-effort):', e);
    }

    return NextResponse.json({ success: true, uid: targetUid, mode });
  } catch (error: any) {
    console.error('❌ Error updating user:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Failed to update user' }, { status: 500 });
  }
}

