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

  return { ok: true as const, adminDb };
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
    const visitIdsRaw = Array.isArray(body?.visitIds) ? body.visitIds : [];
    const visitIds = Array.from(
      new Set(visitIdsRaw.map((v: any) => String(v || '').trim()).filter(Boolean))
    ).slice(0, 500);
    if (visitIds.length === 0) {
      return NextResponse.json({ success: false, error: 'visitIds[] is required' }, { status: 400 });
    }

    const adminCheck = await requireAdmin({ idToken });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const adminModule = await import('@/firebase-admin');
    const adminDb = adminModule.adminDb;

    const refs = visitIds.map((id) => adminDb.collection('sw_visit_records').doc(id));
    const snaps = await adminDb.getAll(...refs);

    const visits = snaps
      .filter((s: any) => s?.exists)
      .map((s: any) => {
        const v = s.data() as any;
        return {
          id: s.id,
          visitId: String(v?.visitId || s.id || '').trim(),
          memberId: String(v?.memberId || '').trim(),
          memberName: String(v?.memberName || '').trim(),
          memberRoomNumber: String(v?.memberRoomNumber || v?.raw?.memberRoomNumber || '').trim() || null,
          rcfeId: String(v?.rcfeId || '').trim(),
          rcfeName: String(v?.rcfeName || '').trim(),
          rcfeAddress: String(v?.rcfeAddress || '').trim(),
          visitDate: String(v?.visitDate || '').trim(),
          visitMonth: String(v?.visitMonth || '').trim(),
          totalScore: Number(v?.totalScore || v?.raw?.visitSummary?.totalScore || 0) || 0,
          flagged: Boolean(v?.flagged || v?.raw?.visitSummary?.flagged),
          flagReasons: Array.isArray(v?.flagReasons) ? v.flagReasons : [],
          signedOff: Boolean(v?.signedOff),
          claimId: String(v?.claimId || '').trim() || null,
          claimStatus: String(v?.claimStatus || '').trim() || null,
          raw: v?.raw || null,
        };
      });

    return NextResponse.json({ success: true, visits });
  } catch (error: any) {
    console.error('❌ Error fetching SW visits by IDs:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch visits' },
      { status: 500 }
    );
  }
}

