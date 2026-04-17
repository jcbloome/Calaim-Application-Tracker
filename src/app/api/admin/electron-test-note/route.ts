import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuthFromIdToken } from '@/lib/admin-api-auth';

type Body = {
  idToken?: string;
  targetUids?: string[];
  message?: string;
  priority?: 'General' | 'Priority' | 'Urgent' | string;
};

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
    const authz = await requireAdminApiAuthFromIdToken(idToken, { requireSuperAdmin: true, requireTwoFactor: true });
    if (!authz.ok) {
      return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
    }
    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;
    const adminDb = adminModule.adminDb;
    const uid = authz.uid;
    const senderName = String(authz.name || authz.email || 'Super Admin').trim() || 'Super Admin';
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

