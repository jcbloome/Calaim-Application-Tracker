'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useGlobalNotifications } from '@/components/NotificationProvider';

type NotifyCardPayload = {
  id?: string;
  type?: 'note' | 'task' | 'urgent' | 'success' | 'warning';
  title: string;
  message: string;
  author?: string;
  recipientName?: string;
  memberName?: string;
  timestamp?: string;
  tagLabel?: string;
  pendingLabel?: string;
  actionUrl?: string;
  notes?: Array<{
    message: string;
    author?: string;
    memberName?: string;
    timestamp?: string;
    replyUrl?: string;
    tagLabel?: string;
  }>;
};

type PillStatePayload = {
  count: number;
  notes?: Array<{
    title: string;
    message: string;
    kind?: 'note' | 'docs' | 'cs';
    author?: string;
    recipientName?: string;
    memberName?: string;
    timestamp?: string;
    noteId?: string;
    senderId?: string;
    replyUrl?: string;
    actionUrl?: string;
  }>;
  title?: string;
  message?: string;
  author?: string;
  recipientName?: string;
  memberName?: string;
  timestamp?: string;
  replyUrl?: string;
  actionUrl?: string;
};

const normalizeType = (value: any): NotifyCardPayload['type'] => {
  const v = String(value || '').toLowerCase().trim();
  if (v === 'urgent') return 'urgent';
  if (v === 'warning') return 'warning';
  if (v === 'success') return 'success';
  if (v === 'task') return 'task';
  return 'note';
};

export default function DesktopNotificationWindowClient() {
  const { showNotification, clearAll } = useGlobalNotifications();
  const unsubRef = useRef<null | (() => void)>(null);
  const unsubSummaryRef = useRef<null | (() => void)>(null);
  const [lastCount, setLastCount] = useState<number>(0);

  const titleLabel = useMemo(() => {
    if (!lastCount) return 'Desktop notifications';
    return lastCount === 1 ? '1 pending item' : `${lastCount} pending items`;
  }, [lastCount]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.title = titleLabel;
    try {
      document.documentElement.style.background = 'transparent';
      document.body.style.background = 'transparent';
    } catch {
      // ignore
    }
  }, [titleLabel]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Clear any stale cards when the window opens.
    clearAll();

    const openExternal = (url?: string) => {
      try {
        if (!url) return;
        window.desktopNotificationPill?.open?.(url);
      } catch {
        // ignore
      }
    };

    const handleNotifyCard = (payload: NotifyCardPayload) => {
      const id = String(payload?.id || `desktop-${Date.now()}-${Math.random().toString(16).slice(2)}`);
      const type = normalizeType(payload?.type);
      const actionUrl = String(payload?.actionUrl || '').trim() || undefined;

      showNotification({
        keyId: `desktop-card:${id}`,
        type,
        title: String(payload?.title || 'Notification'),
        message: String(payload?.message || ''),
        author: payload?.author,
        recipientName: payload?.recipientName,
        memberName: payload?.memberName,
        timestamp: payload?.timestamp,
        tagLabel: payload?.tagLabel,
        pendingLabel: payload?.pendingLabel,
        notes: Array.isArray(payload?.notes) ? payload.notes : undefined,
        duration: 0,
        minimizeAfter: 12000,
        startMinimized: true,
        sound: true,
        animation: 'slide',
        onClick: () => openExternal(actionUrl),
        onClose: () => {
          try {
            window.desktopNotificationPill?.hide?.();
          } catch {
            // ignore
          }
        },
      });
    };

    const handlePillState = (payload: PillStatePayload) => {
      const count = Number(payload?.count || 0);
      setLastCount(count);
      if (!count) return;

      const summaryId = 'desktop-pill-summary';
      const actionUrl = String(payload?.actionUrl || '/admin/my-notes');

      showNotification({
        keyId: summaryId,
        type: 'task',
        title: String(payload?.title || 'Connections notifications'),
        message: String(payload?.message || (count === 1 ? '1 pending item' : `${count} pending items`)),
        author: payload?.author,
        recipientName: payload?.recipientName,
        memberName: payload?.memberName,
        timestamp: payload?.timestamp,
        notes: Array.isArray(payload?.notes)
          ? payload.notes.slice(0, 6).map((n) => ({
              message: `${n.title}${n.message ? ` — ${n.message}` : ''}`,
              author: n.author,
              memberName: n.memberName,
              timestamp: n.timestamp,
              replyUrl: n.replyUrl,
            }))
          : undefined,
        duration: 0,
        minimizeAfter: 14000,
        startMinimized: true,
        sound: false,
        animation: 'slide',
        onClick: () => openExternal(actionUrl),
      });
    };

    unsubRef.current = window.desktopNotificationPill?.onNotifyCard?.(handleNotifyCard) || null;
    unsubSummaryRef.current = window.desktopNotificationPill?.onPillState?.(handlePillState) || null;

    return () => {
      try {
        unsubRef.current?.();
      } catch {
        // ignore
      }
      try {
        unsubSummaryRef.current?.();
      } catch {
        // ignore
      }
      unsubRef.current = null;
      unsubSummaryRef.current = null;
    };
  }, [showNotification, clearAll]);

  return (
    <div className="min-h-screen w-full bg-transparent">
      {/* Notifications are rendered by NotificationProvider */}
    </div>
  );
}

