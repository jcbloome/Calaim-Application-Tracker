import { NextRequest, NextResponse } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';

type Body = {
  idToken?: string;
  targetUids?: string[];
  message?: string;
  priority?: 'General' | 'Priority' | 'Urgent' | string;
};

async function requireSuperAdmin(idToken: string) {
  const adminModule = await import('@/firebase-admin');
  const admin = adminModule.default;
  const adminAuth = adminModule.adminAuth;
  const adminDb = adminModule.adminDb;
  const decoded = await adminAuth.verifyIdToken(idToken);
  const uid = String(decoded?.uid || '').trim();
  const email = String(decoded?.email || '').trim().toLowerCase();
  if (!uid || !email) throw new Error('Invalid token');

  let isSuperAdmin = Boolean((decoded as any)?.superAdmin) || isHardcodedAdminEmail(email);
  if (!isSuperAdmin) {
    const [uidDoc, emailDoc] = await Promise.all([
      adminDb.collection('roles_super_admin').doc(uid).get(),
      adminDb.collection('roles_super_admin').doc(email).get(),
    ]);
    isSuperAdmin = uidDoc.exists || emailDoc.exists;
  }
  if (!isSuperAdmin) throw new Error('Super admin access required');
  return {
    admin,
    adminDb,
    uid,
    email,
    senderName: String(decoded?.name || decoded?.email || 'Super Admin').trim() || 'Super Admin'
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Body;
    const idToken = String(body?.idToken || '').trim();
    if (!idToken) return NextResponse.json({ success: false, error: 'Missing idToken' }, { status: 400 });
    const targetUids = Array.isArray(body?.targetUids)
      ? Array.from(new Set(body.targetUids.map((x) => String(x || '').trim()).filter(Boolean)))
      : [];
    if (targetUids.length === 0) {
      return NextResponse.json({ success: false, error: 'No target staff selected' }, { status: 400 });
    }

    const message = String(body?.message || 'Test Electron popup from Super Admin').trim();
    const priority = String(body?.priority || 'Priority').trim() || 'Priority';
    const { admin, adminDb, uid, senderName } = await requireSuperAdmin(idToken);
    const nowTs = admin.firestore.FieldValue.serverTimestamp();

    await Promise.all(
      targetUids.map((targetUid) =>
        adminDb.collection('staff_notifications').add({
          userId: targetUid,
          title: 'Electron test popup',
          message,
          type: 'interoffice_test',
          priority,
          status: 'Open',
          isRead: false,
          isGeneral: true,
          source: 'electron',
          actionUrl: '/admin/my-notes',
          createdBy: uid,
          createdByName: senderName,
          senderId: uid,
          senderName,
          timestamp: nowTs,
          createdAt: nowTs,
        })
      )
    );

    return NextResponse.json({ success: true, targets: targetUids.length });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to send test popup' },
      { status: 500 }
    );
  }
}

