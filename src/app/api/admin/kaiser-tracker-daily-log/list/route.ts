import { NextRequest, NextResponse } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LOG_COLLECTION = 'kaiser_tracker_daily_logs';

const normalizeText = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const ET_DATE_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const todayEt = () => ET_DATE_FMT.format(new Date());

async function requireLogReader(idToken: string) {
  const adminModule = await import('@/firebase-admin');
  const adminAuth = adminModule.adminAuth;
  const adminDb = adminModule.adminDb;
  const decoded = await adminAuth.verifyIdToken(idToken);

  const uid = String(decoded?.uid || '').trim();
  const email = String((decoded as any)?.email || '').trim().toLowerCase();
  if (!uid) return { ok: false as const, status: 401, error: 'Invalid token' };

  const claimSuperAdmin = Boolean((decoded as any)?.superAdmin);
  const claimAdmin = Boolean((decoded as any)?.admin);
  const claimKaiserManager = Boolean((decoded as any)?.kaiserManager);
  let isSuperAdmin = claimSuperAdmin || isHardcodedAdminEmail(email);
  let isAdmin = claimAdmin || isSuperAdmin;
  let isKaiserManager = claimKaiserManager;

  const [adminRole, superAdminRole, userDoc] = await Promise.all([
    adminDb.collection('roles_admin').doc(uid).get(),
    adminDb.collection('roles_super_admin').doc(uid).get(),
    adminDb.collection('users').doc(uid).get().catch(() => null as any),
  ]);
  if (!isAdmin && adminRole.exists) isAdmin = true;
  if (!isSuperAdmin && superAdminRole.exists) isSuperAdmin = true;
  if (isSuperAdmin) isAdmin = true;

  const userData = userDoc && userDoc.exists ? (userDoc.data() as any) : {};
  const roleLabel = normalizeText(userData?.role || '');
  if (!isKaiserManager) {
    isKaiserManager = Boolean(userData?.isKaiserManager || roleLabel.includes('kaiser manager'));
  }

  if (!isSuperAdmin && !isKaiserManager && !isAdmin) {
    return { ok: false as const, status: 403, error: 'Admin privileges required' };
  }

  return { ok: true as const, adminDb, uid, email, isAdmin, isSuperAdmin, isKaiserManager };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as any;
    const idToken = String(body?.idToken || '').trim();
    const dateKey = String(body?.dateKey || '').trim() || todayEt();
    const staffName = String(body?.staffName || '').trim();
    const limitRaw = Number(body?.limit);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 200;

    if (!idToken) return NextResponse.json({ success: false, error: 'Missing idToken' }, { status: 400 });
    const authz = await requireLogReader(idToken);
    if (!authz.ok) return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });

    let query: any = authz.adminDb.collection(LOG_COLLECTION).where('dateKey', '==', dateKey).limit(limit);
    const snap = await query.get();
    let rows = snap.docs.map((docSnap: any) => ({ id: docSnap.id, ...(docSnap.data() as any) }));

    if (staffName) {
      const target = normalizeText(staffName);
      rows = rows.filter((row: any) => normalizeText(row?.staffName || '') === target);
    }

    rows.sort((a: any, b: any) => String(b?.submittedAt || '').localeCompare(String(a?.submittedAt || '')));

    return NextResponse.json({
      success: true,
      dateKey,
      count: rows.length,
      rows,
    });
  } catch (error: any) {
    console.error('❌ [KAISER-DAILY-LOG-LIST] failed:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to list daily logs' },
      { status: 500 }
    );
  }
}

