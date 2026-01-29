import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

interface StaffNotificationDoc {
  title?: string;
  message?: string;
  timestamp?: admin.firestore.Timestamp;
  isRead?: boolean;
  status?: 'Open' | 'Closed';
}

export const sendMorningNoteDigest = onSchedule(
  {
    schedule: '0 12 * * *',
    timeZone: 'America/New_York',
  },
  async () => {
    const firestore = admin.firestore();

    const tokensSnap = await firestore.collection('user-fcm-tokens').get();
    const userIds = tokensSnap.docs.map((doc) => doc.id);

    for (const userId of userIds) {
      const tokens = tokensSnap.docs.find((doc) => doc.id === userId)?.data()?.tokens || [];
      if (!Array.isArray(tokens) || tokens.length === 0) continue;

      const notesSnap = await firestore
        .collection('staff_notifications')
        .where('userId', '==', userId)
        .where('isRead', '==', false)
        .get();

      const notes = notesSnap.docs.map((doc) => doc.data() as StaffNotificationDoc)
        .filter((note) => note.status !== 'Closed');

      if (notes.length === 0) continue;

      const sorted = notes.sort((a, b) => {
        const aTime = a.timestamp?.toDate?.()?.getTime() || 0;
        const bTime = b.timestamp?.toDate?.()?.getTime() || 0;
        return bTime - aTime;
      });

      const topNotes = sorted.slice(0, 3).map((note) => note.message || note.title || '').filter(Boolean);
      const digestBody = topNotes.length > 0
        ? `You have ${notes.length} unread notes. Top: ${topNotes.join(' | ')}`
        : `You have ${notes.length} unread notes.`;

      await admin.messaging().sendEachForMulticast({
        notification: {
          title: 'Morning Notes Summary',
          body: digestBody,
        },
        data: {
          actionUrl: '/admin/my-notes',
          message: digestBody,
          type: 'morning_digest',
        },
        webpush: {
          notification: {
            title: 'Morning Notes Summary',
            body: digestBody,
            icon: '/calaimlogopdf.png',
            badge: '/calaimlogopdf.png',
          },
          fcmOptions: {
            link: '/admin/my-notes',
          },
        },
        tokens,
      });
    }
  }
);
