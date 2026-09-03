import { NextRequest, NextResponse } from 'next/server';
import {
  DEFAULT_SW_ISP_TOOLS,
  SW_ISP_TOOLS_SETTINGS_DOC,
  normalizeSwIspToolsList,
} from '@/lib/sw-isp-tools';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const extractBearer = (req: NextRequest) => {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ? String(match[1]).trim() : '';
};

async function verifyIspToolsAccess(idToken: string) {
  const adminModule = await import('@/firebase-admin');
  const adminAuth = adminModule.adminAuth;
  const adminDb = adminModule.adminDb;

  const decoded = await adminAuth.verifyIdToken(idToken);
  const uid = String(decoded?.uid || '').trim();
  const email = String(decoded?.email || '').trim().toLowerCase();
  if (!uid || !email) {
    return { ok: false as const, status: 401, error: 'Invalid token payload' };
  }

  if (
    Boolean((decoded as { socialWorker?: boolean }).socialWorker) ||
    Boolean((decoded as { admin?: boolean }).admin) ||
    Boolean((decoded as { superAdmin?: boolean }).superAdmin)
  ) {
    return { ok: true as const, uid, email };
  }

  const [uidDoc, adminRole, superRole, userSnap] = await Promise.all([
    adminDb.collection('socialWorkers').doc(uid).get(),
    adminDb.collection('roles_admin').doc(uid).get(),
    adminDb.collection('roles_super_admin').doc(uid).get(),
    adminDb.collection('users').doc(uid).get(),
  ]);
  if (uidDoc.exists && uidDoc.data()?.isActive) {
    return { ok: true as const, uid, email };
  }
  if (adminRole.exists || superRole.exists) {
    return { ok: true as const, uid, email };
  }
  const userData = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : {};
  if (Boolean(userData?.isRnStaff) || Boolean(userData?.isStaff)) {
    return { ok: true as const, uid, email };
  }

  const emailQuery = await adminDb.collection('socialWorkers').where('email', '==', email).limit(1).get();
  if (!emailQuery.empty && emailQuery.docs[0].data()?.isActive) {
    return { ok: true as const, uid, email };
  }

  return { ok: false as const, status: 403, error: 'Staff, RN, or social worker access required' };
}

export async function GET(req: NextRequest) {
  try {
    const idToken = extractBearer(req);
    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Missing Authorization Bearer token' }, { status: 401 });
    }

    const access = await verifyIspToolsAccess(idToken);
    if (!access.ok) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    const adminModule = await import('@/firebase-admin');
    const snap = await adminModule.adminDb.collection('admin-settings').doc(SW_ISP_TOOLS_SETTINGS_DOC).get();
    const items = snap.exists
      ? normalizeSwIspToolsList((snap.data() as { items?: unknown })?.items)
      : [...DEFAULT_SW_ISP_TOOLS];

    return NextResponse.json({
      success: true,
      items,
      updatedAt: snap.exists ? (snap.data() as any)?.updatedAt ?? null : null,
    });
  } catch (e: any) {
    console.error('[api/sw/isp-tools] error', e);
    return NextResponse.json(
      { success: false, error: e?.message || 'Failed to load ISP tools' },
      { status: 500 }
    );
  }
}
