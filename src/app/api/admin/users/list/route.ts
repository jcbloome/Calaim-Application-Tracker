import { NextRequest, NextResponse } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireSuperAdmin(params: { idToken: string }) {
  const adminModule = await import('@/firebase-admin');
  const adminAuth = adminModule.adminAuth;
  const adminDb = adminModule.adminDb;

  const decoded = await adminAuth.verifyIdToken(params.idToken);
  const uid = String(decoded?.uid || '').trim();
  const email = String((decoded as any)?.email || '').trim().toLowerCase();

  if (!uid) return { ok: false as const, status: 401, error: 'Invalid token' };

  let isSuperAdmin = Boolean((decoded as any)?.superAdmin);
  if (isHardcodedAdminEmail(email)) isSuperAdmin = true;

  if (!isSuperAdmin) {
    const superAdminDoc = await adminDb.collection('roles_super_admin').doc(uid).get();
    isSuperAdmin = superAdminDoc.exists;
    if (!isSuperAdmin && email) {
      const superAdminByEmailDoc = await adminDb.collection('roles_super_admin').doc(email).get();
      isSuperAdmin = superAdminByEmailDoc.exists;
    }
  }

  if (!isSuperAdmin) return { ok: false as const, status: 403, error: 'Super Admin privileges required' };

  return { ok: true as const, adminAuth, adminDb };
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = tokenMatch?.[1] ? String(tokenMatch[1]).trim() : '';
    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Missing Authorization Bearer token' }, { status: 401 });
    }

    const adminCheck = await requireSuperAdmin({ idToken });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const { searchParams } = new URL(req.url);
    const pageToken = String(searchParams.get('pageToken') || '').trim() || undefined;
    const pageSizeRaw = Number(searchParams.get('pageSize') || 50);
    const pageSize = Number.isFinite(pageSizeRaw) ? Math.min(Math.max(Math.floor(pageSizeRaw), 5), 250) : 50;

    const list = await adminCheck.adminAuth.listUsers(pageSize, pageToken);
    const users = list.users.map((u) => ({
      uid: u.uid,
      email: u.email || '',
      displayName: u.displayName || '',
      disabled: Boolean(u.disabled),
      createdAt: u.metadata?.creationTime || null,
      lastSignInAt: u.metadata?.lastSignInTime || null,
      providerIds: Array.isArray(u.providerData) ? u.providerData.map((p) => p?.providerId).filter(Boolean) : [],
    }));

    return NextResponse.json({ success: true, users, nextPageToken: list.pageToken || null });
  } catch (error: any) {
    console.error('❌ Error listing users:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Failed to list users' }, { status: 500 });
  }
}

