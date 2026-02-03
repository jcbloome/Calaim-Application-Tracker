'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useFirestore, useUser } from '@/firebase';
import {
  collection,
  query,
  where,
  onSnapshot,
  limit,
  Timestamp,
  doc,
  updateDoc
} from 'firebase/firestore';
import { useGlobalNotifications } from './NotificationProvider';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  getPriorityRank,
  isPriorityOrUrgent,
  isUrgentPriority,
  normalizePriorityLabel,
  shouldSuppressWebAlerts
} from '@/lib/notification-utils';

interface StaffNotification {
  id: string;
  userId: string;
  noteId: string;
  title: string;
  message: string;
  senderName: string;
  memberName: string;
  type: string;
  priority: 'General' | 'Priority' | 'Urgent' | string;
  timestamp: Timestamp;
  followUpDate?: any;
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
  priority: 'General' | 'Priority' | 'Urgent';
  timestamp: Date;
  followUpDate?: string;
  applicationId?: string;
  actionUrl?: string;
  isGeneral?: boolean;
}

export function RealTimeNotifications() {
  const { user } = useUser();
  const firestore = useFirestore();
  const firestoreRef = useRef(firestore);
  const { showNotification, removeNotification } = useGlobalNotifications();
  const seenNotificationsRef = useRef<Set<string>>(new Set());
  const pendingNotesRef = useRef<Map<string, NotificationData>>(new Map());
  const flushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const summaryNotificationIdRef = useRef<string | null>(null);
  const latestSummaryRef = useRef<{
    type: 'note' | 'urgent';
    title: string;
    message: string;
    author: string;
    pendingLabel: string;
    links: Array<{ label: string; url: string }>;
    soundType: string;
    memberName?: string;
    timestamp?: string;
    tagLabel?: string;
    replyUrl?: string;
    followUpDate?: string;
    followUpNoteId?: string;
  } | null>(null);
  const [desktopState, setDesktopState] = useState<DesktopNotificationState | null>(null);
  const [notificationPrefs, setNotificationPrefs] = useState({
    enabled: true,
    newNotes: true,
    taskAssignments: true,
    urgentPriority: true,
    sound: true,
    soundType: 'mellow-note'
  });
  const [webAppEnabled, setWebAppEnabled] = useState(true);
  const [globalControls, setGlobalControls] = useState({
    masterSwitch: true,
    quietHours: {
      enabled: false,
      startTime: '18:00',
      endTime: '08:00'
    },
    forceSuppressWebWhenDesktopActive: false
  });
  const [globalPolicy, setGlobalPolicy] = useState<{ forceSuppressWebWhenDesktopActive: boolean }>({
    forceSuppressWebWhenDesktopActive: false
  });

  useEffect(() => {
    firestoreRef.current = firestore;
  }, [firestore]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const readPrefs = () => {
      try {
        const raw = localStorage.getItem('notificationSettings');
        if (!raw) return;
        const parsed = JSON.parse(raw) as any;
        const browser = parsed?.browserNotifications;
        const globals = parsed?.globalControls;
        const nextWebEnabled = parsed?.userControls?.webAppNotificationsEnabled;
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
        if (nextWebEnabled !== undefined) {
          setWebAppEnabled(Boolean(nextWebEnabled));
        }
        if (globals) {
          setGlobalControls((prev) => ({
            ...prev,
            masterSwitch: globals.masterSwitch ?? prev.masterSwitch,
            quietHours: {
              ...prev.quietHours,
              ...globals.quietHours
            },
            forceSuppressWebWhenDesktopActive:
              globals.forceSuppressWebWhenDesktopActive ?? prev.forceSuppressWebWhenDesktopActive
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
    const loadGlobalSettings = async () => {
      try {
        const functions = getFunctions();
        const getSettings = httpsCallable(functions, 'getNotificationSettings');
        const result = await getSettings({});
        const data = result.data as any;
        const nextGlobalControls = data?.settings?.globalControls || {};
        const nextPolicy = {
          forceSuppressWebWhenDesktopActive: Boolean(nextGlobalControls.forceSuppressWebWhenDesktopActive)
        };
        setGlobalPolicy(nextPolicy);
        try {
          localStorage.setItem('notificationSettingsGlobal', JSON.stringify({
            globalControls: nextGlobalControls
          }));
        } catch (error) {
          console.warn('Failed to cache global notification settings:', error);
        }
      } catch (error) {
        console.warn('Failed to load global notification settings:', error);
      }
    };
    loadGlobalSettings();
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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.desktopNotifications?.onExpand) return;
    const unsubscribe = window.desktopNotifications.onExpand(() => {
      const summary = latestSummaryRef.current;
      if (!summary) return;
      if (summaryNotificationIdRef.current) {
        removeNotification(summaryNotificationIdRef.current);
        summaryNotificationIdRef.current = null;
      }
      const summaryId = showNotification({
        keyId: 'staff-note-summary-expanded',
        type: summary.type,
        title: summary.title,
        message: summary.message,
        author: summary.author,
        memberName: summary.memberName || '',
        timestamp: summary.timestamp,
        priority: undefined,
        tagLabel: summary.tagLabel,
        startMinimized: false,
        lockToTray: true,
        duration: 45000,
        minimizeAfter: 12000,
        pendingLabel: summary.pendingLabel,
        sound: false,
        soundType: summary.soundType as any,
        animation: 'slide',
        links: summary.links,
        replyUrl: summary.replyUrl,
        followUpDate: summary.followUpDate,
        disableCardClick: true,
        onFollowUpSave: summary.followUpNoteId
          ? (date) => {
              const db = firestoreRef.current;
              if (!db) return;
              updateDoc(doc(db, 'staff_notifications', summary.followUpNoteId), {
                followUpDate: new Date(date),
                followUpRequired: true,
                updatedAt: new Date()
              }).catch((error) => {
                console.warn('Failed to save follow-up date:', error);
              });
            }
          : undefined,
        requiresSecondClick: false,
        onClick: () => {
          if (typeof window === 'undefined') return;
          window.location.href = '/admin/my-notes';
        }
      });
      summaryNotificationIdRef.current = summaryId;

    });
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [removeNotification, showNotification]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem('notificationSettings');
      const parsed = raw ? JSON.parse(raw) as any : {};
      const nextWebEnabled = parsed?.userControls?.webAppNotificationsEnabled;
      const normalizedWebEnabled = nextWebEnabled === undefined ? true : Boolean(nextWebEnabled);
      const desktopPresent = Boolean((window as any).desktopNotifications);
      const nextSuppress = parsed?.userControls?.suppressWebWhenDesktopActive;
      setWebAppEnabled(normalizedWebEnabled);
      localStorage.setItem('notificationSettings', JSON.stringify({
        ...parsed,
        userControls: {
          ...(parsed?.userControls || {}),
          suppressWebWhenDesktopActive: nextSuppress === undefined ? desktopPresent : nextSuppress,
          webAppNotificationsEnabled: normalizedWebEnabled
        }
      }));
    } catch (error) {
      console.warn('Failed to default suppress setting:', error);
    }
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

  const sanitizeFieldLabel = (value?: string) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (raw.includes('[@field:')) return '';
    return raw;
  };

  const sanitizeNoteMessage = (value?: string) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const withoutPrefix = raw.replace(/^See Caspio record for member\.\s*/i, '');
    return withoutPrefix.includes('[@field:') ? '' : withoutPrefix;
  };

  const formatFollowUpDate = (value?: any) => {
    if (!value) return '';
    const date = value?.toDate?.() || new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString();
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
        const pending: NotificationData[] = [];
        let hasNew = false;
        let hasNewPriority = false;
        let hasNewUrgent = false;
        let total = 0;

        snapshot.forEach((docSnap) => {
          total += 1;
          const data = docSnap.data() as StaffNotification;
          if (data.status === 'Closed') return;
          if (data.isRead === true) return;

          const priority = normalizePriorityLabel(data.priority);
          const isUrgent = priority === 'Urgent';
          const isPriority = priority === 'Priority';
          if (!isUrgent && !isPriority) return;

          const notification: NotificationData = {
            id: docSnap.id,
            title: data.title || 'Note',
            message: data.message || (data as any).content || '',
            senderName: data.senderName || (data as any).createdByName || 'Staff',
            memberName: data.memberName || '',
            type: data.type || 'note',
            priority,
            timestamp: data.timestamp?.toDate() || new Date(),
            followUpDate: formatFollowUpDate(data.followUpDate),
            applicationId: data.applicationId,
            actionUrl: resolveActionUrl(data),
            isGeneral: Boolean((data as any).isGeneral)
          };

          const isNew = !seenNotificationsRef.current.has(notification.id);
          if (isNew) {
            seenNotificationsRef.current.add(notification.id);
            hasNew = true;
            if (isPriority) {
              hasNewPriority = true;
            }
            if (isUrgent) {
              hasNewUrgent = true;
            }
          }

          pending.push(notification);
        });

        pendingNotesRef.current = new Map(pending.map((item) => [item.id, item]));
        

        if (flushTimeoutRef.current) {
          clearTimeout(flushTimeoutRef.current);
        }

        flushTimeoutRef.current = setTimeout(() => {
          const sortedPending = Array.from(pendingNotesRef.current.values()).sort((a, b) => {
            const rankDiff = getPriorityRank(b.priority) - getPriorityRank(a.priority);
            if (rankDiff !== 0) return rankDiff;
            return b.timestamp.getTime() - a.timestamp.getTime();
          });

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

          const shouldSuppressWeb = shouldSuppressWebAlerts();
          const shouldShowWebToast = typeof window === 'undefined'
            ? false
            : !shouldSuppressWeb;

          if (!canShowNotifications()) {
            if (summaryNotificationIdRef.current) {
              removeNotification(summaryNotificationIdRef.current);
              summaryNotificationIdRef.current = null;
            }
            return;
          }

          const urgentExists = sortedPending.some((note) => isUrgentPriority(note.priority));
          const priorityExists = sortedPending.some((note) => isPriorityOrUrgent(note.priority) && !isUrgentPriority(note.priority));
          const count = sortedPending.length;
          const uniqueSenders = Array.from(
            new Set(sortedPending.map((note) => note.senderName).filter(Boolean))
          );
          const senderSummary = uniqueSenders.length === 1
            ? uniqueSenders[0]
            : 'Multiple staff';
          const uniqueMembers = Array.from(
            new Set(sortedPending.map((note) => sanitizeFieldLabel(note.memberName)).filter(Boolean))
          );
          const subjectLabel = count === 1
            ? (sortedPending[0]?.memberName || 'Note')
            : (uniqueMembers.length === 1 ? uniqueMembers[0] : 'Multiple notes');
          const highlightNote =
            sortedPending.find((note) => isUrgentPriority(note.priority)) ||
            sortedPending.find((note) => isPriorityOrUrgent(note.priority)) ||
            sortedPending[0];
          const highlightSender = sanitizeFieldLabel(highlightNote?.senderName) || senderSummary;
          const highlightSubject = sanitizeFieldLabel(highlightNote?.memberName) || subjectLabel;
          const highlightTimestamp = highlightNote?.timestamp
            ? highlightNote.timestamp.toLocaleString(undefined, {
                year: 'numeric',
                month: 'numeric',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
              })
            : '';
          const highlightMessage = sanitizeNoteMessage(highlightNote?.message);
          const recentLines = sortedPending.slice(0, 3).map((note) => {
            const label = sanitizeFieldLabel(note.memberName) || 'General Note';
            const timeLabel = note.timestamp
              ? note.timestamp.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
              : '';
            return `• ${label}${timeLabel ? ` (${timeLabel})` : ''}`;
          });
          const summaryTitle = 'Connections Note';
          const summaryMessage = highlightMessage || `Immediate notes: ${count}`;
          const detailMessage = highlightMessage
            || (recentLines.length > 0 ? `Recent notes:\n${recentLines.join('\n')}` : summaryMessage);
          const tagLabel = undefined;
          const priorityTag = urgentExists ? 'Urgent' : priorityExists ? 'Priority' : undefined;
          const links: Array<{ label: string; url: string }> = [
            { label: 'Open My Notifications', url: '/admin/my-notes' }
          ];
          const replyUrl = highlightNote?.id
            ? `/admin/my-notes?replyTo=${encodeURIComponent(highlightNote.id)}`
            : undefined;
          const forceExpanded = hasNewUrgent || hasNewPriority;
          const shouldPopup = shouldShowWebToast && forceExpanded;
          const desktopPresent = typeof window !== 'undefined' && Boolean(window.desktopNotifications);
          latestSummaryRef.current = {
            type: priorityExists ? 'urgent' : 'note',
            title: summaryTitle,
            message: detailMessage,
            author: highlightSender,
            pendingLabel: count === 1 ? `Pending note · ${highlightSender}` : `Notes (${count})`,
            links,
            soundType: notificationPrefs.soundType,
            memberName: highlightSubject || '',
            timestamp: highlightTimestamp || undefined,
            tagLabel: priorityTag,
            replyUrl,
            followUpDate: formatFollowUpDate(highlightNote?.followUpDate),
            followUpNoteId: highlightNote?.id
          };

          if (window.desktopNotifications?.setPillSummary) {
            window.desktopNotifications.setPillSummary({
              count,
              title: summaryTitle,
              message: detailMessage,
              author: highlightSender,
              memberName: highlightSubject,
              timestamp: highlightTimestamp || undefined,
              replyUrl,
              actionUrl: '/admin/my-notes'
            });
          }

          if (shouldShowWebToast) {
            if (!hasNew && summaryNotificationIdRef.current) {
              return;
            }
            if (!hasNew) {
              return;
            }
            const summaryId = showNotification({
              keyId: 'staff-note-summary',
              type: urgentExists ? 'urgent' : 'note',
              title: summaryTitle,
              message: detailMessage,
              author: highlightSender,
              memberName: highlightSubject || '',
              timestamp: highlightTimestamp || undefined,
              priority: undefined,
              tagLabel: priorityTag,
              startMinimized: !shouldPopup && !forceExpanded,
              lockToTray: true,
              duration: 45000,
              minimizeAfter: 12000,
              pendingLabel: count === 1 ? `Pending note · ${highlightSender}` : `Notes (${count})`,
              sound: hasNew && notificationPrefs.enabled ? notificationPrefs.sound : false,
              soundType: notificationPrefs.soundType,
              animation: 'slide',
              links,
              replyUrl,
              followUpDate: formatFollowUpDate(highlightNote?.followUpDate),
              disableCardClick: true,
              onFollowUpSave: highlightNote?.id
                ? (date) => {
                    const db = firestoreRef.current;
                    if (!db) return;
                    updateDoc(doc(db, 'staff_notifications', highlightNote.id), {
                      followUpDate: new Date(date),
                      followUpRequired: true,
                      updatedAt: new Date()
                    }).catch((error) => {
                      console.warn('Failed to save follow-up date:', error);
                    });
                  }
                : undefined,
              requiresSecondClick: false,
              onClick: () => {
                if (typeof window === 'undefined') return;
                window.location.href = '/admin/my-notes';
              }
            });

            summaryNotificationIdRef.current = summaryId;
          } else if (summaryNotificationIdRef.current) {
            removeNotification(summaryNotificationIdRef.current);
            summaryNotificationIdRef.current = null;
          }
          if (hasNew && window.desktopNotifications?.notify) {
            window.desktopNotifications.notify({
              title: summaryTitle,
              body: summaryMessage,
              openOnNotify: hasNew
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
  }, [user, firestore]);

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