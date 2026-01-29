'use client';

import React, { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useFirestore, useUser } from '@/firebase';
import {
  collection,
  query,
  where,
  onSnapshot,
  limit,
  Timestamp
} from 'firebase/firestore';
import { useGlobalNotifications } from './NotificationProvider';

interface StaffNotification {
  id: string;
  userId: string;
  noteId: string;
  title: string;
  message: string;
  senderName: string;
  memberName: string;
  type: string;
  priority: 'low' | 'medium' | 'high';
  timestamp: Timestamp;
  isRead: boolean;
  applicationId?: string;
  actionUrl?: string;
  clientId2?: string;
  isGeneral?: boolean;
}

interface NotificationData {
  id: string;
  title: string;
  message: string;
  senderName: string;
  memberName: string;
  type: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  timestamp: Date;
  applicationId?: string;
  actionUrl?: string;
  isGeneral?: boolean;
}

export function RealTimeNotifications() {
  const { user } = useUser();
  const firestore = useFirestore();
  const pathname = usePathname();
  const { showNotification, removeNotification } = useGlobalNotifications();
  const seenNotificationsRef = useRef<Set<string>>(new Set());
  const pendingNotesRef = useRef<Map<string, NotificationData>>(new Map());
  const flushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const summaryNotificationIdRef = useRef<string | null>(null);
  const [desktopState, setDesktopState] = useState<DesktopNotificationState | null>(null);
  const [notificationPrefs, setNotificationPrefs] = useState({
    enabled: true,
    newNotes: true,
    taskAssignments: true,
    urgentPriority: true,
    sound: true,
    soundType: 'mellow-note'
  });
  const [globalControls, setGlobalControls] = useState({
    masterSwitch: true,
    quietHours: {
      enabled: false,
      startTime: '18:00',
      endTime: '08:00'
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const readPrefs = () => {
      try {
        const raw = localStorage.getItem('notificationSettings');
        if (!raw) return;
        const parsed = JSON.parse(raw) as any;
        const browser = parsed?.browserNotifications;
        const globals = parsed?.globalControls;
        if (!browser) return;
        setNotificationPrefs((prev) => ({
          ...prev,
          enabled: browser.enabled ?? prev.enabled,
          newNotes: browser.newNotes ?? prev.newNotes,
          taskAssignments: browser.taskAssignments ?? prev.taskAssignments,
          urgentPriority: browser.urgentPriority ?? prev.urgentPriority,
          sound: browser.sound ?? prev.sound,
          soundType: browser.soundType || prev.soundType
        }));
        if (globals) {
          setGlobalControls((prev) => ({
            ...prev,
            masterSwitch: globals.masterSwitch ?? prev.masterSwitch,
            quietHours: {
              ...prev.quietHours,
              ...globals.quietHours
            }
          }));
        }
      } catch (error) {
        console.warn('Failed to read notification prefs:', error);
      }
    };

    readPrefs();
    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'notificationSettings') {
        readPrefs();
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.desktopNotifications) return;
    let unsubscribe: (() => void) | undefined;
    window.desktopNotifications.getState()
      .then((state) => setDesktopState(state))
      .catch((error) => console.warn('Failed to read desktop notification state:', error));
    unsubscribe = window.desktopNotifications.onChange((state) => {
      setDesktopState(state);
    });
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const isWithinQuietHours = () => {
    if (!globalControls.quietHours.enabled) return false;
    const now = new Date();
    const [startH, startM] = globalControls.quietHours.startTime.split(':').map(Number);
    const [endH, endM] = globalControls.quietHours.endTime.split(':').map(Number);
    if (Number.isNaN(startH) || Number.isNaN(startM) || Number.isNaN(endH) || Number.isNaN(endM)) {
      return false;
    }
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    if (startMinutes === endMinutes) return false;
    if (startMinutes < endMinutes) {
      return nowMinutes >= startMinutes && nowMinutes < endMinutes;
    }
    return nowMinutes >= startMinutes || nowMinutes < endMinutes;
  };

  const canShowNotifications = () => {
    if (!notificationPrefs.enabled) return false;
    if (!globalControls.masterSwitch) return false;
    if (isWithinQuietHours()) return false;
    if (desktopState?.effectivePaused) return false;
    return true;
  };

  const resolveActionUrl = (data: StaffNotification) => {
    const originType = String(data.type || '').toLowerCase();
    const hasClientId = Boolean(data.clientId2);
    const memberNotesUrl = hasClientId
      ? `/admin/member-notes?clientId2=${encodeURIComponent(data.clientId2 || '')}`
      : null;

    if (memberNotesUrl) {
      return memberNotesUrl;
    }

    if (data.isGeneral || originType.includes('interoffice')) {
      return '/admin/my-notes';
    }

    if (data.actionUrl) {
      return data.actionUrl;
    }

    if (data.applicationId) {
      return `/admin/applications/${data.applicationId}`;
    }

    return '/admin/my-notes';
  };

  useEffect(() => {
    if (!user || !user.uid) return;
    if (!firestore) return;

    console.log('🔔 Setting up real-time notifications for user:', user.uid);

    const notificationsQuery = query(
      collection(firestore, 'staff_notifications'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(
      notificationsQuery,
      (snapshot) => {
        const isInterofficeNotification = (data: StaffNotification) => {
          const originType = String(data.type || '').toLowerCase();
          return originType.includes('interoffice') && !(data as any).isGeneral;
        };

        const pending: NotificationData[] = [];
        let hasNew = false;
        let total = 0;

        snapshot.forEach((docSnap) => {
          total += 1;
          const data = docSnap.data() as StaffNotification;
          if (!isInterofficeNotification(data)) return;
          if (data.status === 'Closed') return;
          if (data.isRead === true) return;

          const normalizedPriority = String(data.priority || '').toLowerCase();
          const priority: NotificationData['priority'] =
            normalizedPriority.includes('urgent')
              ? 'urgent'
              : normalizedPriority.includes('high')
                ? 'high'
                : normalizedPriority.includes('medium')
                  ? 'medium'
                  : 'low';

          const isImportant = priority === 'urgent' || priority === 'high';
          if (!isImportant) return;

          const notification: NotificationData = {
            id: docSnap.id,
            title: data.title || 'Note',
            message: data.message || (data as any).content || '',
            senderName: data.senderName || (data as any).createdByName || 'Staff',
            memberName: data.memberName || '',
            type: data.type || 'note',
            priority,
            timestamp: data.timestamp?.toDate() || new Date(),
            applicationId: data.applicationId,
            actionUrl: resolveActionUrl(data),
            isGeneral: Boolean((data as any).isGeneral)
          };

          if (!seenNotificationsRef.current.has(notification.id)) {
            seenNotificationsRef.current.add(notification.id);
            hasNew = true;
          }

          pending.push(notification);
        });

        pendingNotesRef.current = new Map(pending.map((item) => [item.id, item]));
        

        if (flushTimeoutRef.current) {
          clearTimeout(flushTimeoutRef.current);
        }

        flushTimeoutRef.current = setTimeout(() => {
          const sortedPending = Array.from(pendingNotesRef.current.values()).sort(
            (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
          );

          if (window.desktopNotifications?.setPendingCount) {
            window.desktopNotifications.setPendingCount(sortedPending.length);
          }

          if (sortedPending.length === 0) {
            if (summaryNotificationIdRef.current) {
              removeNotification(summaryNotificationIdRef.current);
              summaryNotificationIdRef.current = null;
            }
            return;
          }

          if (!canShowNotifications()) {
            if (summaryNotificationIdRef.current) {
              removeNotification(summaryNotificationIdRef.current);
              summaryNotificationIdRef.current = null;
            }
            return;
          }

          const urgentExists = sortedPending.some((note) => note.priority === 'urgent');
          const count = sortedPending.length;
          const uniqueSenders = Array.from(
            new Set(sortedPending.map((note) => note.senderName).filter(Boolean))
          );
          const senderSummary = uniqueSenders.length === 1
            ? uniqueSenders[0]
            : 'Multiple staff';
          const uniqueMembers = Array.from(
            new Set(sortedPending.map((note) => note.memberName).filter(Boolean))
          );
          const subjectLabel = count === 1
            ? (sortedPending[0]?.memberName || 'Priority Note')
            : (uniqueMembers.length === 1 ? uniqueMembers[0] : 'Multiple notes');
          const summaryTitle = count === 1
            ? `From ${senderSummary} · Re: ${subjectLabel}`
            : `Re: ${subjectLabel}`;
          const senderLabel = count === 1 ? `From: ${senderSummary}` : 'From: Multiple staff';
          const tagLabel = 'Priority';
          const links: Array<{ label: string; url: string }> = [
            { label: 'Open My Notifications', url: '/admin/my-notes' }
          ];
          const shouldPopup = hasNew;

          const summaryId = showNotification({
            keyId: 'staff-note-summary',
            type: urgentExists ? 'urgent' : 'note',
            title: summaryTitle,
            message: `${senderLabel} · Immediate notes: ${count}`,
            author: senderSummary,
            memberName: '',
            priority: urgentExists ? 'High' : 'Low',
            tagLabel,
            startMinimized: !shouldPopup,
            lockToTray: true,
            duration: 0,
            minimizeAfter: shouldPopup ? 12000 : 0,
            pendingLabel: count === 1 ? `Pending priority · ${senderSummary}` : `Priority notes (${count})`,
            sound: hasNew && notificationPrefs.enabled ? notificationPrefs.sound : false,
            soundType: notificationPrefs.soundType,
            animation: 'slide',
            links,
            onClick: undefined
          });

          summaryNotificationIdRef.current = summaryId;
          if (hasNew && window.desktopNotifications?.notify) {
            window.desktopNotifications.notify({
              title: summaryTitle,
              body: `${senderLabel} · Immediate notes: ${count}`
            }).catch(() => undefined);
          }
        }, 400);
      },
      (error) => {
        console.warn('⚠️ Error listening to notifications:', error instanceof Error ? error.message : String(error));
      }
    );

    return () => {
      unsubscribe();
    };
  }, [user, pathname, firestore]);

  return null;
}

// Badge component to show unread count
export function NotificationBadge() {
  const { user } = useUser();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    const notificationsQuery = query(
      collection(db, 'staff_notifications'),
      where('userId', '==', user.uid),
      where('isRead', '==', false)
    );

    const unsubscribe = onSnapshot(notificationsQuery, (snapshot) => {
      setUnreadCount(snapshot.size);
    });

    return () => unsubscribe();
  }, [user]);

  if (unreadCount === 0) return null;

  return (
    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
      {unreadCount > 9 ? '9+' : unreadCount}
    </span>
  );
}