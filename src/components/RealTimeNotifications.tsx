'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFirestore, useUser } from '@/firebase';
import {
  addDoc,
  collection,
  query,
  where,
  onSnapshot,
  Timestamp,
  doc,
  updateDoc,
  serverTimestamp,
  getDoc,
} from 'firebase/firestore';
import { useGlobalNotifications } from './NotificationProvider';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  INTEROFFICE_NOTES_MOTHBALLED,
  getPriorityRank,
  isNotificationClosedLike,
  isNotificationSoftDeleted,
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
  senderId?: string;
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
  senderId?: string;
  memberName: string;
  clientId2?: string;
  source?: string;
  type: string;
  priority: 'General' | 'Priority' | 'Urgent';
  timestamp: Date;
  followUpDate?: string;
  applicationId?: string;
  actionUrl?: string;
  isGeneral?: boolean;
  suppressWebToast?: boolean;
}

const toMs = (value: any): number => {
  if (!value) return 0;
  try {
    if (typeof value?.toMillis === 'function') return value.toMillis();
    if (typeof value?.toDate === 'function') return value.toDate().getTime();
    if (typeof value === 'number') return value;
    const d = new Date(value);
    const ms = d.getTime();
    return Number.isNaN(ms) ? 0 : ms;
  } catch {
    return 0;
  }
};

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
    recipientName?: string;
    notes?: Array<{
      message: string;
      author?: string;
      memberName?: string;
      timestamp?: string;
      replyUrl?: string;
    }>;
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
  const [notificationPrefs, setNotificationPrefs] = useState({
    enabled: true,
    newNotes: true,
    taskAssignments: true,
    urgentPriority: true,
    sound: true,
    soundType: 'mellow-note'
  });
  const [, setWebAppEnabled] = useState(true);
  const [globalControls, setGlobalControls] = useState({
    masterSwitch: true,
    quietHours: {
      enabled: false,
      startTime: '18:00',
      endTime: '08:00'
    },
    forceSuppressWebWhenDesktopActive: false
  });
  const [, setGlobalPolicy] = useState<{ forceSuppressWebWhenDesktopActive: boolean }>({
    forceSuppressWebWhenDesktopActive: false
  });
  const [webToastPolicy, setWebToastPolicy] = useState<{
    webAppNotificationsEnabled: boolean;
    suppressWebWhenDesktopActive: boolean;
    interofficeNotificationsEnabled: boolean;
    caspioAnnouncementsInElectronEnabled: boolean;
  }>({
    webAppNotificationsEnabled: true,
    suppressWebWhenDesktopActive: true,
    interofficeNotificationsEnabled: true,
    caspioAnnouncementsInElectronEnabled: false
  });

  useEffect(() => {
    firestoreRef.current = firestore;
  }, [firestore]);


  // Super Admin global toggles for web in-app notifications (stored in system_settings/notifications).
  useEffect(() => {
    if (!firestore || typeof window === 'undefined') return;
    const load = async () => {
      try {
        const snap = await getDoc(doc(firestore, 'system_settings', 'notifications'));
        if (!snap.exists()) return;
        const data = snap.data() as any;
        setWebToastPolicy({
          webAppNotificationsEnabled: Boolean(data?.webAppNotificationsEnabled ?? true),
          suppressWebWhenDesktopActive: Boolean(data?.suppressWebWhenDesktopActive ?? true),
          interofficeNotificationsEnabled: Boolean(data?.interofficeNotificationsEnabled ?? true),
          caspioAnnouncementsInElectronEnabled: Boolean(data?.caspioAnnouncementsInElectronEnabled ?? false)
        });
      } catch (error) {
        console.warn('Failed to load web toast policy:', error);
      }
    };
    load();
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
        const nextCaspioDesktopEnabled = parsed?.userControls?.caspioAnnouncementsInElectronEnabled;
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
        if (nextCaspioDesktopEnabled !== undefined) {
          setWebToastPolicy((prev) => ({
            ...prev,
            caspioAnnouncementsInElectronEnabled: Boolean(nextCaspioDesktopEnabled)
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
        const globalCaspioElectronEnabled = Boolean(nextGlobalControls.caspioAnnouncementsInElectronEnabled);
        setWebToastPolicy((prev) => {
          let userOverride: boolean | undefined;
          try {
            const raw = localStorage.getItem('notificationSettings');
            if (raw) {
              const parsed = JSON.parse(raw) as any;
              if (parsed?.userControls?.caspioAnnouncementsInElectronEnabled !== undefined) {
                userOverride = Boolean(parsed.userControls.caspioAnnouncementsInElectronEnabled);
              }
            }
          } catch {
            // ignore parse errors and fall back to global default
          }
          return {
            ...prev,
            caspioAnnouncementsInElectronEnabled:
              userOverride === undefined ? globalCaspioElectronEnabled : userOverride
          };
        });
        try {
          localStorage.setItem('notificationSettingsGlobal', JSON.stringify({
            globalControls: nextGlobalControls
          }));
        } catch (error) {
          console.warn('Failed to cache global notification settings:', error);
        }
      } catch (error: any) {
        console.warn(
          'Failed to load global notification settings:',
          String(error?.code || ''),
          String(error?.message || error || 'unknown')
        );
      }
    };
    loadGlobalSettings();
  }, []);


  // Desktop notification expand handler removed (Electron deprecated)

  // Desktop quick reply removed (Electron deprecated)

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem('notificationSettings');
      const parsed = raw ? JSON.parse(raw) as any : {};
      const nextWebEnabled = parsed?.userControls?.webAppNotificationsEnabled;
      const normalizedWebEnabled = nextWebEnabled === undefined ? true : Boolean(nextWebEnabled);
      const nextSuppress = parsed?.userControls?.suppressWebWhenDesktopActive;
      const nextCaspioDesktopEnabled = parsed?.userControls?.caspioAnnouncementsInElectronEnabled;
      setWebAppEnabled(normalizedWebEnabled);
      setWebToastPolicy((prev) => ({
        ...prev,
        caspioAnnouncementsInElectronEnabled: nextCaspioDesktopEnabled === undefined
          ? prev.caspioAnnouncementsInElectronEnabled
          : Boolean(nextCaspioDesktopEnabled)
      }));
      localStorage.setItem('notificationSettings', JSON.stringify({
        ...parsed,
        userControls: {
          ...(parsed?.userControls || {}),
          suppressWebWhenDesktopActive: nextSuppress === undefined ? false : nextSuppress,
          webAppNotificationsEnabled: normalizedWebEnabled,
          caspioAnnouncementsInElectronEnabled:
            nextCaspioDesktopEnabled === undefined ? false : Boolean(nextCaspioDesktopEnabled)
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

        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as StaffNotification;
          const noteType = String((data as any)?.type || '').toLowerCase();
          const isInterofficeType = noteType.includes('interoffice');
          const isChatOnly = Boolean((data as any)?.isChatOnly) || noteType.includes('chat');
          const hiddenFromInbox = Boolean((data as any)?.hiddenFromInbox);
          if (isChatOnly || hiddenFromInbox) return;

          const isSoftDeleted = isNotificationSoftDeleted(data as any);
          const isClosedLike = isNotificationClosedLike(data as any);
          if (isClosedLike || isSoftDeleted) return;
          if (data.isRead === true) return;

          const priority = normalizePriorityLabel(data.priority);
          const isUrgent = priority === 'Urgent';
          const isPriority = priority === 'Priority';

          const notification: NotificationData = {
            id: docSnap.id,
            title: data.title || 'Note',
            // Some sources (ex: Caspio webhook) store the real note text in `noteContent`.
            message: (data as any).noteContent || data.message || (data as any).content || '',
            senderName:
              data.senderName ||
              (data as any).authorName ||
              (data as any).createdByName ||
              (data as any).createdBy ||
              'Staff',
            senderId: (data as any).senderId || (data as any).createdBy,
            memberName: data.memberName || '',
            clientId2: (data as any).clientId2 || (data as any).client_ID2 || undefined,
            source: (data as any).source || undefined,
            type: data.type || 'note',
            priority,
            timestamp:
              data.timestamp?.toDate?.() ||
              (data as any).createdAt?.toDate?.() ||
              ((data as any).createdAt ? new Date((data as any).createdAt) : null) ||
              new Date(),
            followUpDate: formatFollowUpDate(data.followUpDate),
            applicationId: data.applicationId,
            actionUrl: resolveActionUrl(data),
            isGeneral: Boolean((data as any).isGeneral),
            suppressWebToast: isInterofficeType && !webToastPolicy.interofficeNotificationsEnabled
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
          if (INTEROFFICE_NOTES_MOTHBALLED) {
            if (summaryNotificationIdRef.current) {
              removeNotification(summaryNotificationIdRef.current);
              summaryNotificationIdRef.current = null;
            }
            pendingNotesRef.current = new Map();
            return;
          }

          const sortedPending = Array.from(pendingNotesRef.current.values()).sort((a, b) => {
            const rankDiff = getPriorityRank(b.priority) - getPriorityRank(a.priority);
            if (rankDiff !== 0) return rankDiff;
            return b.timestamp.getTime() - a.timestamp.getTime();
          });

          if (sortedPending.length === 0) {
            if (summaryNotificationIdRef.current) {
              removeNotification(summaryNotificationIdRef.current);
              summaryNotificationIdRef.current = null;
            }
            return;
          }

          const shouldSuppressWeb = shouldSuppressWebAlerts();
          const shouldShowWebToastBase = typeof window === 'undefined'
            ? false
            : !shouldSuppressWeb;

          const urgentExists = sortedPending.some((note) => isUrgentPriority(note.priority));
          const priorityExists = sortedPending.some((note) => isPriorityOrUrgent(note.priority) && !isUrgentPriority(note.priority));
          const count = sortedPending.length;
          const uniqueSenders = Array.from(
            new Set(sortedPending.map((note) => note.senderName).filter(Boolean))
          );
          const senderSummary = uniqueSenders.length === 1
            ? uniqueSenders[0]
            : 'Multiple staff';
          const recipientLabel = user?.displayName || user?.email || 'Assigned staff';
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
          const highlightMessage =
            sanitizeNoteMessage(highlightNote?.message) ||
            sanitizeFieldLabel(highlightNote?.title) ||
            '';
          const recentLines = sortedPending.slice(0, 3).map((note) => {
            const label = sanitizeFieldLabel(note.memberName) || 'General Note';
            const timeLabel = note.timestamp
              ? note.timestamp.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
              : '';
            return `• ${label}${timeLabel ? ` (${timeLabel})` : ''}`;
          });
          const summaryTitle = count === 1 ? 'Interoffice note' : 'Interoffice notes';
          const summaryMessage = highlightMessage || `Immediate notes: ${count}`;
          const detailMessage = highlightMessage
            || (recentLines.length > 0 ? `Recent notes:\n${recentLines.join('\n')}` : summaryMessage);
          const tagLabel = undefined;
          const links: Array<{ label: string; url: string }> = [
            { label: 'Open My Notifications', url: '/admin/my-notes' }
          ];
          const replyUrl = highlightNote?.id
            ? `/admin/my-notes?replyTo=${encodeURIComponent(highlightNote.id)}`
            : undefined;
          const latestPending = sortedPending[0];
          const recentThresholdMs = 2 * 60 * 1000;
          const isRecent =
            Boolean(latestPending?.timestamp) &&
            Date.now() - latestPending.timestamp.getTime() <= recentThresholdMs;
          const forceExpanded = hasNewUrgent || hasNewPriority || isRecent;
          const hasActiveDesktopChannel = false;
          const shouldShowWebToast = (() => {
            if (!webToastPolicy.webAppNotificationsEnabled) return false;
            if (hasActiveDesktopChannel && webToastPolicy.suppressWebWhenDesktopActive) return false;
            if (Boolean((highlightNote as any)?.suppressWebToast)) return false;
            return shouldShowWebToastBase;
          })();

          if (!canShowNotifications() && !forceExpanded) {
            if (summaryNotificationIdRef.current) {
              removeNotification(summaryNotificationIdRef.current);
              summaryNotificationIdRef.current = null;
            }
            return;
          }
          latestSummaryRef.current = {
            type: priorityExists ? 'urgent' : 'note',
            title: summaryTitle,
            message: detailMessage,
            author: highlightSender,
            recipientName: recipientLabel,
            notes: sortedPending.map((note) => ({
              message: sanitizeNoteMessage(note.message),
              author: sanitizeFieldLabel(note.senderName) || undefined,
              memberName: sanitizeFieldLabel(note.memberName) || undefined,
              timestamp: note.timestamp?.toLocaleString?.() || undefined,
              tagLabel: isUrgentPriority(note.priority)
                ? 'Urgent'
                : isPriorityOrUrgent(note.priority)
                  ? 'Priority'
                  : undefined,
              noteId: note.id,
              senderId: note.senderId,
              replyUrl: note.id
                ? `/admin/my-notes?replyTo=${encodeURIComponent(note.id)}`
                : undefined
            })),
            pendingLabel: count === 1 ? `Pending note · ${highlightSender}` : `Notes (${count})`,
            links,
            soundType: notificationPrefs.soundType,
            memberName: highlightSubject || '',
            timestamp: highlightTimestamp || undefined,
            tagLabel,
            replyUrl,
            followUpDate: formatFollowUpDate(highlightNote?.followUpDate),
            followUpNoteId: highlightNote?.id
          };


          if (shouldShowWebToast) {
            if (!hasNew && !isRecent && summaryNotificationIdRef.current) {
              return;
            }
            if (!hasNew && !isRecent) {
              return;
            }
            const summaryId = showNotification({
              keyId: 'staff-note-summary',
              type: urgentExists ? 'urgent' : 'note',
              title: summaryTitle,
              message: detailMessage,
              author: highlightSender,
              recipientName: recipientLabel,
              memberName: highlightSubject || '',
              timestamp: highlightTimestamp || undefined,
              notes: sortedPending.map((note) => ({
                message: sanitizeNoteMessage(note.message),
                author: sanitizeFieldLabel(note.senderName) || undefined,
                memberName: sanitizeFieldLabel(note.memberName) || undefined,
                timestamp: note.timestamp?.toLocaleString?.() || undefined,
                tagLabel: isUrgentPriority(note.priority)
                  ? 'Urgent'
                  : isPriorityOrUrgent(note.priority)
                    ? 'Priority'
                    : undefined,
                replyUrl: note.id
                  ? `/admin/my-notes?replyTo=${encodeURIComponent(note.id)}`
                  : undefined
              })),
              priority: undefined,
              tagLabel,
              // Always start compact; user clicks to expand.
              startMinimized: true,
              lockToTray: true,
              duration: 0,
              minimizeAfter: 12000,
              pendingLabel: count === 1 ? `Interoffice note · ${highlightSender}` : `Interoffice notes (${count})`,
              sound: hasNew && notificationPrefs.enabled ? notificationPrefs.sound : false,
              soundType: notificationPrefs.soundType as Parameters<typeof showNotification>[0]['soundType'],
              animation: 'slide',
              links,
              replyUrl,
              followUpDate: formatFollowUpDate(highlightNote?.followUpDate),
              // Keep full-card click disabled, but allow clicking the message itself to open.
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
                const url = highlightNote?.id
                  ? `/admin/my-notes?noteId=${encodeURIComponent(highlightNote.id)}`
                  : '/admin/my-notes';
                window.location.href = url;
              }
            });

            summaryNotificationIdRef.current = summaryId;
          } else if (summaryNotificationIdRef.current) {
            removeNotification(summaryNotificationIdRef.current);
            summaryNotificationIdRef.current = null;
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
  }, [user, firestore, webToastPolicy.interofficeNotificationsEnabled, webToastPolicy.webAppNotificationsEnabled, webToastPolicy.suppressWebWhenDesktopActive]);

  return null;
}

// Badge component to show unread count
export function NotificationBadge() {
  const { user } = useUser();
  const firestore = useFirestore();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user || !firestore) return;

    const notificationsQuery = query(
      collection(firestore, 'staff_notifications'),
      where('userId', '==', user.uid),
      where('isRead', '==', false)
    );

    const unsubscribe = onSnapshot(notificationsQuery, (snapshot) => {
      setUnreadCount(snapshot.size);
    });

    return () => unsubscribe();
  }, [user, firestore]);

  if (unreadCount === 0) return null;

  return (
    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
      {unreadCount > 9 ? '9+' : unreadCount}
    </span>
  );
}