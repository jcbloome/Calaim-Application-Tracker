import { NextRequest, NextResponse } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';

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

  if (!uid) {
    return { ok: false as const, status: 401, error: 'Invalid token' };
  }

  const hasAdminClaim = Boolean((decoded as any)?.admin);
  const hasSuperAdminClaim = Boolean((decoded as any)?.superAdmin);
  let isAdmin = hasAdminClaim || hasSuperAdminClaim;
  let isSuperAdmin = hasSuperAdminClaim;

  // Email allow-list always wins.
  if (isHardcodedAdminEmail(email)) {
    isAdmin = true;
    isSuperAdmin = true;
  }

  // Even if the token only has `admin` (not `superAdmin`), upgrade to superadmin
  // when the Firestore role indicates it. This avoids false 403s for true superadmins.
  if (!isAdmin || !isSuperAdmin) {
    const [adminRole, superAdminRole] = await Promise.all([
      adminDb.collection('roles_admin').doc(uid).get(),
      adminDb.collection('roles_super_admin').doc(uid).get(),
    ]);

    isAdmin = isAdmin || adminRole.exists || superAdminRole.exists;
    isSuperAdmin = isSuperAdmin || superAdminRole.exists;

    // Backward-compat: some roles were stored by email instead of UID.
    if (email && (!isAdmin || !isSuperAdmin)) {
      const [emailAdminRole, emailSuperAdminRole] = await Promise.all([
        adminDb.collection('roles_admin').doc(email).get(),
        adminDb.collection('roles_super_admin').doc(email).get(),
      ]);
      isAdmin = isAdmin || emailAdminRole.exists || emailSuperAdminRole.exists;
      isSuperAdmin = isSuperAdmin || emailSuperAdminRole.exists;
    }
  }

  if (!isAdmin) {
    return { ok: false as const, status: 403, error: 'Admin privileges required' };
  }

  return { ok: true as const, uid, email, name, adminDb, isSuperAdmin };
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = tokenMatch?.[1] ? String(tokenMatch[1]).trim() : '';
    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Missing Authorization Bearer token' }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as any;
    const visitIds: string[] = Array.isArray(body?.visitIds)
      ? body.visitIds.map((v: any) => String(v || '').trim()).filter(Boolean)
      : [];
    const rcfeStaffName = String(body?.rcfeStaffName || '').trim();
    const rcfeStaffTitle = String(body?.rcfeStaffTitle || '').trim();
    const reason = String(body?.reason || '').trim();

    if (visitIds.length === 0) {
      return NextResponse.json({ success: false, error: 'No visitIds provided' }, { status: 400 });
    }

    const adminCheck = await requireAdmin({ idToken });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const { adminDb, uid: actorUid, email: actorEmail, name: actorName } = adminCheck;
    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;

    const nowIso = new Date().toISOString();

    // Load visits (best-effort; skip missing docs).
    const snaps = await Promise.all(visitIds.slice(0, 500).map((id) => adminDb.collection('sw_visit_records').doc(id).get()));
    const visits = snaps
      .filter((s) => s.exists)
      .map((s) => ({ id: s.id, ...(s.data() as any) }))
      .filter(Boolean);

    if (visits.length === 0) {
      return NextResponse.json({ success: false, error: 'No matching visits found' }, { status: 404 });
    }

    // Group by RCFE so an override creates one sign-off record per RCFE.
    const byRcfe = new Map<string, any[]>();
    for (const v of visits) {
      const rcfeId = String(v?.rcfeId || '').trim() || 'unknown-rcfe';
      const arr = byRcfe.get(rcfeId) || [];
      arr.push(v);
      byRcfe.set(rcfeId, arr);
    }

    const results: Array<{ rcfeId: string; signOffId: string; visitCount: number }> = [];

    for (const [rcfeId, rcfeVisits] of byRcfe.entries()) {
      const recordRef = adminDb.collection('sw_signoff_records').doc();
      const claimDay = String(rcfeVisits?.[0]?.claimDay || rcfeVisits?.[0]?.visitDate || '').slice(0, 10) || nowIso.slice(0, 10);

      const completedVisits = rcfeVisits.map((v) => ({
        visitId: String(v?.visitId || v?.id || ''),
        memberId: String(v?.memberId || ''),
        memberName: String(v?.memberName || ''),
        rcfeId: String(v?.rcfeId || rcfeId),
        rcfeName: String(v?.rcfeName || ''),
        claimDay,
        completedAt: String(v?.completedAt || v?.submittedAt || nowIso),
        flagged: Boolean(v?.flagged),
      }));

      const record = {
        id: recordRef.id,
        rcfeId,
        rcfeName: String(rcfeVisits?.[0]?.rcfeName || ''),
        socialWorkerId: 'admin_override',
        socialWorkerUid: null,
        socialWorkerEmail: null,
        socialWorkerName: 'Admin override',
        claimDay,
        visitIds: rcfeVisits.map((v) => String(v?.visitId || v?.id || '')).filter(Boolean),
        completedVisits,
        invoice: null,
        rcfeStaff: {
          name: rcfeStaffName || String(actorName || actorEmail || 'Admin'),
          title: rcfeStaffTitle || 'Admin',
          signature: 'ADMIN_OVERRIDE',
          signedAt: nowIso,
          geolocation: null,
          locationVerified: false,
        },
        submittedAt: nowIso,
        source: 'admin_override',
        overrideReason: reason || null,
        actorUid,
        actorEmail,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      await recordRef.set(record, { merge: true });

      const batch = adminDb.batch();
      for (const v of rcfeVisits.slice(0, 500)) {
        const visitRef = adminDb.collection('sw_visit_records').doc(String(v?.visitId || v?.id || '').trim());
        batch.set(
          visitRef,
          {
            signedOff: true,
            status: 'signed_off',
            signedOffAt: nowIso,
            signOffId: recordRef.id,
            rcfeStaffName: record.rcfeStaff.name,
            rcfeStaffTitle: record.rcfeStaff.title,
            claimDay,
            signedOffByAdminUid: actorUid,
            signedOffByAdminEmail: actorEmail,
            signedOffOverrideReason: reason || null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
      await batch.commit();

      results.push({ rcfeId, signOffId: recordRef.id, visitCount: rcfeVisits.length });
    }

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    console.error('❌ Error overriding sign-off:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to override sign-off' },
      { status: 500 }
    );
  }
}

