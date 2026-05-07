import { NextRequest, NextResponse } from 'next/server';
import { fetchCaspioSocialWorkers, getCaspioCredentialsFromEnv } from '@/lib/caspio-api-utils';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CACHE_COLLECTION = 'syncedSocialWorkers';
const BATCH_LIMIT = 200;

async function requireAdmin(idToken: string) {
  const adminModule = await import('@/firebase-admin');
  const adminAuth = adminModule.adminAuth;
  const adminDb = adminModule.adminDb;

  const decoded = await adminAuth.verifyIdToken(idToken);
  const uid = String(decoded?.uid || '').trim();
  const email = String((decoded as any)?.email || '').trim().toLowerCase();

  if (!uid) return { ok: false as const, status: 401, error: 'Invalid token' };
  if (Boolean((decoded as any)?.admin) || Boolean((decoded as any)?.superAdmin) || isHardcodedAdminEmail(email)) {
    return { ok: true as const, adminDb };
  }

  const [adminRole, superAdminRole] = await Promise.all([
    adminDb.collection('roles_admin').doc(uid).get(),
    adminDb.collection('roles_super_admin').doc(uid).get(),
  ]);
  if (!adminRole.exists && !superAdminRole.exists) {
    return { ok: false as const, status: 403, error: 'Admin privileges required' };
  }
  return { ok: true as const, adminDb };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { idToken?: string };
    const authHeader = req.headers.get('authorization');
    const cronAuthorized = Boolean(process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`);

    let adminDb: any;
    if (cronAuthorized) {
      const adminModule = await import('@/firebase-admin');
      adminDb = adminModule.adminDb;
    } else {
      const idToken = String(body?.idToken || '').trim();
      if (!idToken) return NextResponse.json({ success: false, error: 'Missing idToken' }, { status: 400 });
      const adminCheck = await requireAdmin(idToken);
      if (!adminCheck.ok) return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
      adminDb = adminCheck.adminDb;
    }

    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;
    const nowIso = new Date().toISOString();
    const credentials = getCaspioCredentialsFromEnv();
    const staff = await fetchCaspioSocialWorkers(credentials, { includeAssignmentCounts: false });

    const normalized = (staff || []).map((row: any) => ({
      sw_id: String(row?.sw_id || '').trim(),
      email: String(row?.email || '').trim().toLowerCase(),
      name: String(row?.name || '').trim(),
      role: String(row?.role || '').trim() || 'MSW',
      isActive: true,
      assignedMemberCount: Number(row?.assignedMemberCount || 0),
      source: 'caspio',
      syncedAt: nowIso,
    }));

    let upserted = 0;
    for (let i = 0; i < normalized.length; i += BATCH_LIMIT) {
      const chunk = normalized.slice(i, i + BATCH_LIMIT);
      const batch = adminDb.batch();
      chunk.forEach((row: any) => {
        const docId = String(row.sw_id || row.email || '').trim();
        if (!docId) return;
        upserted += 1;
        batch.set(
          adminDb.collection(CACHE_COLLECTION).doc(docId),
          {
            ...row,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      });
      await batch.commit();
    }

    return NextResponse.json({
      success: true,
      fetched: normalized.length,
      upserted,
      collection: CACHE_COLLECTION,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to sync social workers cache' },
      { status: 500 }
    );
  }
}

