import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AccountKind = 'staff' | 'social_worker' | 'user' | 'unknown';

export async function GET(req: NextRequest) {
  try {
    const adminCheck = await requireAdminApiAuth(req, { requireSuperAdmin: true, requireTwoFactor: true });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const { searchParams } = new URL(req.url);
    const pageToken = String(searchParams.get('pageToken') || '').trim() || undefined;
    const pageSizeRaw = Number(searchParams.get('pageSize') || 50);
    const pageSize = Number.isFinite(pageSizeRaw) ? Math.min(Math.max(Math.floor(pageSizeRaw), 5), 250) : 50;

    const list = await adminCheck.adminAuth.listUsers(pageSize, pageToken);
    const rawUsers = Array.isArray(list.users) ? list.users : [];

    // Best-effort: categorize user type for UI filters/badges.
    // We prefer token claims when present, but also look at Firestore role docs and socialWorkers docs.
    const refs: any[] = [];
    const normEmailByUid = new Map<string, string>();
    rawUsers.forEach((u) => {
      const uid = String(u?.uid || '').trim();
      const email = String(u?.email || '').trim().toLowerCase();
      if (!uid) return;
      normEmailByUid.set(uid, email);
      refs.push(adminCheck.adminDb.collection('roles_admin').doc(uid));
      refs.push(adminCheck.adminDb.collection('roles_super_admin').doc(uid));
      refs.push(adminCheck.adminDb.collection('socialWorkers').doc(uid));
      if (email) {
        // Backward-compat: some roles/SW docs used email as the doc id.
        refs.push(adminCheck.adminDb.collection('roles_admin').doc(email));
        refs.push(adminCheck.adminDb.collection('roles_super_admin').doc(email));
        refs.push(adminCheck.adminDb.collection('socialWorkers').doc(email));
      }
    });

    const existsByPath = new Map<string, boolean>();
    if (refs.length > 0) {
      const snaps = await adminCheck.adminDb.getAll(...refs);
      snaps.forEach((s: any) => {
        const path = String(s?.ref?.path || '').trim();
        if (!path) return;
        existsByPath.set(path, Boolean(s?.exists));
      });
    }

    const hasDoc = (collectionId: string, docId: string) => {
      const id = String(docId || '').trim();
      if (!id) return false;
      return Boolean(existsByPath.get(`${collectionId}/${id}`));
    };

    const users = rawUsers.map((u) => {
      const uid = String(u.uid || '').trim();
      const email = String(u.email || '').trim().toLowerCase();
      const claims = ((u as any)?.customClaims || {}) as Record<string, any>;

      const isStaff =
        (email ? isHardcodedAdminEmail(email) : false) ||
        Boolean(claims.admin) ||
        Boolean(claims.superAdmin) ||
        hasDoc('roles_admin', uid) ||
        hasDoc('roles_super_admin', uid) ||
        (email ? hasDoc('roles_admin', email) || hasDoc('roles_super_admin', email) : false);

      const isSocialWorker =
        Boolean(claims.socialWorker) ||
        hasDoc('socialWorkers', uid) ||
        (email ? hasDoc('socialWorkers', email) : false);

      const kind: AccountKind = isStaff ? 'staff' : isSocialWorker ? 'social_worker' : uid ? 'user' : 'unknown';

      return {
        uid,
        email: u.email || '',
        displayName: u.displayName || '',
        disabled: Boolean(u.disabled),
        createdAt: u.metadata?.creationTime || null,
        lastSignInAt: u.metadata?.lastSignInTime || null,
        providerIds: Array.isArray(u.providerData) ? u.providerData.map((p) => p?.providerId).filter(Boolean) : [],
        kind,
      };
    });

    return NextResponse.json({ success: true, users, nextPageToken: list.pageToken || null });
  } catch (error: any) {
    console.error('❌ Error listing users:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Failed to list users' }, { status: 500 });
  }
}

