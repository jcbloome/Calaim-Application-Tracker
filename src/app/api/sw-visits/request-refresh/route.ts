import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const uniq = (arr: string[]) => Array.from(new Set(arr.map((s) => String(s || '').trim()).filter(Boolean)));
const chunk = <T,>(arr: T[], size: number) => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = tokenMatch?.[1] ? String(tokenMatch[1]).trim() : '';
    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Missing Authorization Bearer token' }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as any;
    const message = String(body?.message || '').trim();

    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;
    const adminAuth = adminModule.adminAuth;
    const adminDb = adminModule.adminDb;

    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = String(decoded?.uid || '').trim();
    const email = String((decoded as any)?.email || '').trim().toLowerCase();
    const name = String((decoded as any)?.name || '').trim();
    const hasSwClaim = Boolean((decoded as any)?.socialWorker);

    if (!uid || !email) {
      return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 });
    }
    if (!hasSwClaim) {
      return NextResponse.json({ success: false, error: 'Social worker access required' }, { status: 403 });
    }

    // Resolve recipients: all admins + super admins.
    const [adminsSnap, superSnap] = await Promise.all([
      adminDb.collection('roles_admin').limit(500).get(),
      adminDb.collection('roles_super_admin').limit(200).get(),
    ]);
    const roleIds = uniq([...adminsSnap.docs.map((d) => d.id), ...superSnap.docs.map((d) => d.id)]);

    // Backward-compat: some roles were stored by email instead of UID.
    const directUids = roleIds.filter((id) => !id.includes('@'));
    const emailIds = roleIds.filter((id) => id.includes('@'));

    const resolvedUids: string[] = [];
    for (const emails of chunk(emailIds, 10)) {
      try {
        const snap = await adminDb.collection('users').where('email', 'in', emails).limit(20).get();
        for (const doc of snap.docs) resolvedUids.push(doc.id);
      } catch {
        // ignore
      }
    }

    const recipients = uniq([...directUids, ...resolvedUids]).slice(0, 600);

    if (recipients.length === 0) {
      return NextResponse.json({ success: false, error: 'No admin recipients found' }, { status: 409 });
    }

    const title = 'SW requested assignment refresh';
    const bodyText =
      message ||
      `Social Worker ${name || email} is requesting a refresh of Caspio member assignments cache. Please run “Caspio Members Cache Sync”.`;

    const batchSize = 400;
    for (let i = 0; i < recipients.length; i += batchSize) {
      const slice = recipients.slice(i, i + batchSize);
      const batch = adminDb.batch();
      for (const recipientUid of slice) {
        const ref = adminDb.collection('staff_notifications').doc();
        batch.set(ref, {
          userId: recipientUid,
          title,
          message: bodyText,
          type: 'sw_assignments_refresh_request',
          senderName: name || email,
          senderEmail: email,
          source: 'sw_portal',
          isRead: false,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
    }

    // Lightweight log record for auditing.
    try {
      await adminDb.collection('sw_sync_requests').add({
        uid,
        email,
        name: name || null,
        message: message || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch {
      // ignore
    }

    return NextResponse.json({ success: true, notified: recipients.length });
  } catch (error: any) {
    console.error('❌ Error requesting assignment refresh:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to request refresh' },
      { status: 500 }
    );
  }
}

