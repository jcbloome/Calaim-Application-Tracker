import { NextRequest, NextResponse } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';

type SendChatBody = {
  message: string;
  participantUids: string[];
  threadId?: string;
  simulateIncoming?: boolean;
};

const uniq = (values: string[]) => Array.from(new Set(values));
const TEST_BOT_UID = 'system-test';
const TEST_BOT_NAME = 'Test Bot';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = tokenMatch?.[1] ? String(tokenMatch[1]).trim() : '';
    if (!idToken) {
      return NextResponse.json({ error: 'Missing Authorization Bearer token' }, { status: 401 });
    }

    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;
    const adminDb = adminModule.adminDb;

    const decoded = await admin.auth().verifyIdToken(idToken);
    const uid = String(decoded?.uid || '').trim();
    const email = String(decoded?.email || '').trim().toLowerCase();
    if (!uid || !email) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const isEmailAdmin = isHardcodedAdminEmail(email);
    let isAdmin = isEmailAdmin;
    // For our internal allow-list, treat as superadmin (matches app behavior and enables tray testing).
    let isSuperAdmin = isEmailAdmin;
    if (!isAdmin) {
      const [adminDoc, superAdminDoc] = await Promise.all([
        adminDb.collection('roles_admin').doc(uid).get(),
        adminDb.collection('roles_super_admin').doc(uid).get(),
      ]);
      isSuperAdmin = superAdminDoc.exists;
      isAdmin = adminDoc.exists || isSuperAdmin;
    }
    if (!isAdmin && email) {
      const [emailAdminDoc, emailSuperAdminDoc] = await Promise.all([
        adminDb.collection('roles_admin').doc(email).get(),
        adminDb.collection('roles_super_admin').doc(email).get(),
      ]);
      isSuperAdmin = emailSuperAdminDoc.exists;
      isAdmin = emailAdminDoc.exists || isSuperAdmin;
    }
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as SendChatBody | null;
    const message = String(body?.message || '').trim();
    const simulateIncoming = Boolean(body?.simulateIncoming);
    const rawParticipants = Array.isArray(body?.participantUids) ? body!.participantUids : [];
    const participantUids = uniq(rawParticipants.map((x) => String(x || '').trim()).filter(Boolean));
    const threadId = String(body?.threadId || '').trim();

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    if (!simulateIncoming) {
      if (participantUids.length < 2 || !participantUids.includes(uid)) {
        return NextResponse.json({ error: 'participantUids must include sender and at least 1 recipient' }, { status: 400 });
      }
    } else {
      if (!isSuperAdmin) {
        return NextResponse.json({ error: 'Super admin access required' }, { status: 403 });
      }
      if (participantUids.length !== 1 || participantUids[0] !== uid) {
        return NextResponse.json({ error: 'simulateIncoming expects participantUids = [currentUserUid]' }, { status: 400 });
      }
    }

    const storedParticipants = simulateIncoming ? uniq([uid, TEST_BOT_UID]) : participantUids;

    const resolvedThreadId =
      threadId ||
      (simulateIncoming
        ? `chat:test-incoming:${uid}`
        : `chat:${participantUids.slice().sort().join(':')}`);

    const senderUid = simulateIncoming ? 'system-test' : uid;
    const senderName = simulateIncoming ? 'Test Bot' : (String(decoded?.name || decoded?.email || 'Staff').trim() || 'Staff');

    // Resolve participant names from users collection (best effort).
    const participantNames: string[] = [];
    try {
      const docs = await Promise.all(
        storedParticipants
          .filter((puid) => puid !== TEST_BOT_UID)
          .map((puid) => adminDb.collection('users').doc(puid).get().catch(() => null))
      );
      const nameByUid = new Map<string, string>();
      let docIdx = 0;
      for (const puid of storedParticipants) {
        if (puid === TEST_BOT_UID) {
          nameByUid.set(TEST_BOT_UID, TEST_BOT_NAME);
          continue;
        }
        const snap = docs[docIdx++];
        const fallback = puid === uid ? (String(decoded?.name || decoded?.email || 'Staff').trim() || 'Staff') : 'Staff';
        const data = snap && snap.exists ? (snap.data() as any) : null;
        const name =
          data?.firstName && data?.lastName
            ? `${data.firstName} ${data.lastName}`.trim()
            : String(data?.displayName || data?.email || '').trim();
        nameByUid.set(puid, name || fallback);
      }
      storedParticipants.forEach((puid) => {
        const n = String(nameByUid.get(puid) || '').trim();
        if (n) participantNames.push(n);
      });
    } catch {
      // ignore
    }

    const nowTs = admin.firestore.FieldValue.serverTimestamp();
    const basePayload: Record<string, any> = {
      title: 'Chat',
      message,
      type: 'interoffice_chat',
      priority: 'General',
      status: 'Open',
      isRead: false,
      isChatOnly: true,
      hiddenFromInbox: true,
      createdBy: senderUid,
      createdByName: senderName,
      senderName,
      senderId: senderUid,
      timestamp: nowTs,
      threadId: resolvedThreadId,
      actionUrl: '/admin/desktop-chat-window',
      source: 'electron',
      participants: storedParticipants,
      participantNames: participantNames.length ? participantNames : undefined,
    };

    const recipients = simulateIncoming ? [uid] : participantUids;
    const writes = recipients.map((recipientUid) => {
      const isSenderCopy = recipientUid === uid && !simulateIncoming;
      return adminDb.collection('staff_notifications').add({
        ...basePayload,
        userId: recipientUid,
        recipientName: recipientUid === uid ? (String(decoded?.name || decoded?.email || 'Staff').trim() || 'Staff') : 'Staff',
        isRead: simulateIncoming ? false : isSenderCopy ? true : false,
      });
    });

    await Promise.all(writes);

    return NextResponse.json({ success: true, threadId: resolvedThreadId });
  } catch (error: any) {
    console.error('[api/chat/send] Error:', error);
    return NextResponse.json({ error: 'Failed to send chat', details: error?.message || String(error) }, { status: 500 });
  }
}

