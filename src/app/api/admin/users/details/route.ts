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

const toIso = (value: any): string | null => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (typeof value === 'number') return new Date(value).toISOString();
  return null;
};

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
    const targetUid = String(searchParams.get('uid') || '').trim();
    if (!targetUid) {
      return NextResponse.json({ success: false, error: 'uid is required' }, { status: 400 });
    }

    const user = await adminCheck.adminAuth.getUser(targetUid);

    const loginLogsSnap = await adminCheck.adminDb
      .collection('loginLogs')
      .where('userId', '==', targetUid)
      .orderBy('timestamp', 'desc')
      .limit(20)
      .get();

    const loginLogs = loginLogsSnap.docs.map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        email: String(data?.email || ''),
        role: String(data?.role || ''),
        displayName: String(data?.displayName || ''),
        timestamp: toIso(data?.timestamp) || null,
      };
    });

    const uploadsSnap = await adminCheck.adminDb
      .collection('standalone_upload_submissions')
      .where('userId', '==', targetUid)
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();

    const uploads = uploadsSnap.docs.map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        status: String(data?.status || ''),
        docType: String(data?.docType || ''),
        fileName: String(data?.fileName || ''),
        storagePath: String(data?.storagePath || ''),
        createdAt: toIso(data?.createdAt) || null,
      };
    });

    return NextResponse.json({
      success: true,
      user: {
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || '',
        disabled: Boolean(user.disabled),
        createdAt: user.metadata?.creationTime || null,
        lastSignInAt: user.metadata?.lastSignInTime || null,
        providerIds: Array.isArray(user.providerData) ? user.providerData.map((p) => p?.providerId).filter(Boolean) : [],
      },
      loginLogs,
      uploads,
    });
  } catch (error: any) {
    console.error('❌ Error fetching user details:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Failed to fetch user details' }, { status: 500 });
  }
}

