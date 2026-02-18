'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useAdmin } from '@/hooks/use-admin';
import { useFirestore } from '@/firebase';
import { getOtherParticipantUid } from '@/lib/chat-utils';

type ConversationDoc = {
  id: string;
  participants: string[];
  participantInfo?: Record<string, { name?: string; email?: string }>;
  lastMessageText?: string;
  lastMessageAt?: any;
  lastMessageSenderUid?: string;
  lastMessageId?: string;
  readAtByUid?: Record<string, any>;
  unreadCountByUid?: Record<string, number>;
  updatedAt?: any;
};

function isElectronRuntime() {
  try {
    return typeof window !== 'undefined' && Boolean((window as any).desktopNotifications);
  } catch {
    return false;
  }
}

function toMs(value: any) {
  try {
    if (!value) return 0;
    if (typeof value?.toMillis === 'function') return value.toMillis();
    if (typeof value?.toDate === 'function') return value.toDate().getTime();
    const d = new Date(value);
    const ms = d.getTime();
    return Number.isNaN(ms) ? 0 : ms;
  } catch {
    return 0;
  }
}

export function ChatDesktopNotifier() {
  const { isAdmin, isLoading, user } = useAdmin();
  const firestore = useFirestore();

  const myUid = String(user?.uid || '').trim();
  const [convs, setConvs] = useState<ConversationDoc[]>([]);

  const lastNotifiedByConvRef = useRef<Record<string, string>>({});
  const lastNotifiedAtByConvRef = useRef<Record<string, number>>({});
  const lastGlobalNotifyAtRef = useRef<number>(0);

  useEffect(() => {
    if (!firestore || !isAdmin || !myUid) return;
    const qConvs = query(collection(firestore, 'chat_conversations'), where('participants', 'array-contains', myUid));
    const unsub = onSnapshot(
      qConvs,
      (snap) => {
        const list: ConversationDoc[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        setConvs(list);
      },
      () => setConvs([])
    );
    return () => unsub();
  }, [firestore, isAdmin, myUid]);

  const unread = useMemo(() => {
    if (!myUid) return [];
    return convs.filter((c) => {
      const lastAt = toMs(c.lastMessageAt);
      if (!lastAt) return false;
      const readAt = toMs(c.readAtByUid?.[myUid]);
      return lastAt > readAt;
    });
  }, [convs, myUid]);

  const unreadTotalCount = useMemo(() => {
    if (!myUid) return 0;
    let total = 0;
    unread.forEach((c) => {
      const n = Number(c.unreadCountByUid?.[myUid] ?? 0);
      total += Number.isFinite(n) ? Math.max(0, n) : 0;
    });
    // Fallback: if we have unread conversations but no counts, treat as 1 each.
    if (total === 0 && unread.length > 0) return unread.length;
    return total;
  }, [myUid, unread]);

  useEffect(() => {
    if (isLoading) return;
    if (!isAdmin || !myUid) return;
    if (!isElectronRuntime()) return;
    if (!window.desktopNotifications) return;

    // Update the pill summary for chat unread conversations.
    try {
      window.desktopNotifications.setChatPillSummary?.({
        count: unreadTotalCount,
        notes: unread.slice(0, 6).map((c) => {
          const otherUid = getOtherParticipantUid(c.participants || [], myUid);
          const otherInfo = otherUid ? c.participantInfo?.[otherUid] : null;
          const title = otherInfo?.name || otherInfo?.email || otherUid || 'Chat';
          const perConv = Number(c.unreadCountByUid?.[myUid] ?? 0);
          return {
            title: perConv > 1 ? `${title} (${perConv})` : title,
            message: String(c.lastMessageText || 'New message'),
            timestamp: c.lastMessageAt && typeof c.lastMessageAt?.toDate === 'function'
              ? c.lastMessageAt.toDate().toISOString()
              : undefined,
            actionUrl: `/admin/chat?cid=${encodeURIComponent(c.id)}`,
          };
        }),
      });
    } catch {
      // ignore
    }
  }, [isAdmin, isLoading, myUid, unread, unreadTotalCount]);

  useEffect(() => {
    if (isLoading) return;
    if (!isAdmin || !myUid) return;
    if (!isElectronRuntime()) return;
    if (!window.desktopNotifications) return;

    // Fire one desktop card notification per new incoming lastMessageId.
    convs.forEach((c) => {
      const lastId = String(c.lastMessageId || '').trim();
      if (!lastId) return;
      const sender = String(c.lastMessageSenderUid || '').trim();
      if (!sender || sender === myUid) return;

      const lastAt = toMs(c.lastMessageAt);
      const readAt = toMs(c.readAtByUid?.[myUid]);
      const isUnread = lastAt > readAt;
      if (!isUnread) return;

      const prev = lastNotifiedByConvRef.current[c.id];
      if (prev === lastId) return;

      // Throttle: avoid spamming when multiple messages arrive quickly.
      const now = Date.now();
      const lastConvNotifyAt = Number(lastNotifiedAtByConvRef.current[c.id] || 0);
      const lastGlobal = Number(lastGlobalNotifyAtRef.current || 0);
      const withinConvCooldown = now - lastConvNotifyAt < 15_000;
      const withinGlobalCooldown = now - lastGlobal < 8_000;
      if (withinConvCooldown || withinGlobalCooldown) {
        lastNotifiedByConvRef.current[c.id] = lastId;
        return;
      }

      lastNotifiedByConvRef.current[c.id] = lastId;
      lastNotifiedAtByConvRef.current[c.id] = now;
      lastGlobalNotifyAtRef.current = now;

      const otherUid = getOtherParticipantUid(c.participants || [], myUid);
      const otherInfo = otherUid ? c.participantInfo?.[otherUid] : null;
      const title = otherInfo?.name || otherInfo?.email || otherUid || 'New chat message';
      const body = String(c.lastMessageText || 'New message');

      try {
        void window.desktopNotifications.notify({
          title: `Chat: ${title}`,
          body,
          actionUrl: `/admin/chat?cid=${encodeURIComponent(c.id)}`,
        });
      } catch {
        // ignore
      }
    });
  }, [convs, isAdmin, isLoading, myUid]);

  return null;
}

