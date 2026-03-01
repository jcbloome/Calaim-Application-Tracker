import { NextRequest, NextResponse } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';
import { sendSwClaimReminderEmail } from '@/app/actions/send-email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireAdmin(params: { idToken: string }) {
  const adminModule = await import('@/firebase-admin');
  const adminAuth = adminModule.adminAuth;
  const adminDb = adminModule.adminDb;

  const decoded = await adminAuth.verifyIdToken(params.idToken);
  const uid = String(decoded?.uid || '').trim();
  const email = String((decoded as any)?.email || '').trim().toLowerCase();
  const name = String((decoded as any)?.name || '').trim();

  if (!uid) return { ok: false as const, status: 401, error: 'Invalid token' };

  let isAdmin = Boolean((decoded as any)?.admin) || Boolean((decoded as any)?.superAdmin);
  if (isHardcodedAdminEmail(email)) isAdmin = true;

  if (!isAdmin) {
    const [adminRole, superAdminRole] = await Promise.all([
      adminDb.collection('roles_admin').doc(uid).get(),
      adminDb.collection('roles_super_admin').doc(uid).get(),
    ]);
    isAdmin = adminRole.exists || superAdminRole.exists;
    if (!isAdmin && email) {
      const [adminRoleByEmail, superAdminRoleByEmail] = await Promise.all([
        adminDb.collection('roles_admin').doc(email).get(),
        adminDb.collection('roles_super_admin').doc(email).get(),
      ]);
      isAdmin = adminRoleByEmail.exists || superAdminRoleByEmail.exists;
    }
  }

  if (!isAdmin) return { ok: false as const, status: 403, error: 'Admin privileges required' };

  return { ok: true as const, adminDb, uid, email, name };
}

const normStatus = (v: unknown) => String(v ?? 'draft').trim().toLowerCase();

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = tokenMatch?.[1] ? String(tokenMatch[1]).trim() : '';
    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Missing Authorization Bearer token' }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as any;
    const claimIds: string[] = Array.isArray(body?.claimIds)
      ? body.claimIds.map((c: any) => String(c || '').trim()).filter(Boolean)
      : [];
    const onlyDraft = body?.onlyDraft === undefined ? true : Boolean(body?.onlyDraft);
    const portalUrl = String(body?.portalUrl || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || '').trim();

    if (claimIds.length === 0) {
      return NextResponse.json({ success: false, error: 'claimIds[] is required' }, { status: 400 });
    }

    const adminCheck = await requireAdmin({ idToken });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const { adminDb, uid: actorUid, email: actorEmail, name: actorName } = adminCheck;
    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;

    const refs = claimIds.slice(0, 500).map((id) => adminDb.collection('sw-claims').doc(id));
    const snaps = await adminDb.getAll(...refs);
    const claims = snaps.filter((s) => s.exists).map((s) => ({ id: s.id, ...(s.data() as any) }));

    const eligible = claims.filter((c: any) => {
      if (!onlyDraft) return true;
      return normStatus(c?.status) === 'draft';
    });

    const bySw = new Map<string, { name: string; items: any[] }>();
    for (const c of eligible) {
      const swEmail = String(c?.socialWorkerEmail || '').trim().toLowerCase();
      if (!swEmail) continue;
      const swName = String(c?.socialWorkerName || '').trim() || 'Social Worker';
      const entry = bySw.get(swEmail) || { name: swName, items: [] };
      entry.items.push({
        claimId: String(c?.id || '').trim() || String(c?.claimId || '').trim(),
        claimMonth: String(c?.claimMonth || '').trim() || undefined,
        claimDay: String(c?.claimDay || '').trim() || undefined,
        rcfeName: String(c?.rcfeName || '').trim() || undefined,
        totalAmount: typeof c?.totalAmount === 'number' ? c.totalAmount : Number(c?.totalAmount),
      });
      bySw.set(swEmail, entry);
    }

    const sent: Array<{ to: string; itemCount: number }> = [];
    const errors: Array<{ to: string; error: string }> = [];

    const nowIso = new Date().toISOString();
    const nowTs = admin.firestore.Timestamp.now();

    for (const [to, payload] of bySw.entries()) {
      try {
        await sendSwClaimReminderEmail({
          to,
          socialWorkerName: payload.name,
          items: payload.items,
          portalUrl: portalUrl || undefined,
        });

        // Record an audit event per reminder batch.
        const eventRef = adminDb.collection('sw_claim_events').doc();
        await eventRef.set(
          {
            id: eventRef.id,
            eventType: 'reminder_sent',
            actorUid,
            actorEmail,
            actorName: String(actorName || actorEmail || 'Admin').trim(),
            socialWorkerEmail: to,
            itemCount: payload.items.length,
            claimIds: payload.items.map((x: any) => String(x?.claimId || '').trim()).filter(Boolean).slice(0, 200),
            createdAtIso: nowIso,
            createdAt: nowTs,
          },
          { merge: true }
        );

        sent.push({ to, itemCount: payload.items.length });
      } catch (e: any) {
        errors.push({ to, error: e?.message || 'Send failed' });
      }
    }

    return NextResponse.json({
      success: true,
      requested: claimIds.length,
      eligible: eligible.length,
      socialWorkersNotified: sent.length,
      sent,
      errors,
    });
  } catch (error: any) {
    console.error('❌ Error sending SW claim reminders:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to send reminders' },
      { status: 500 }
    );
  }
}

