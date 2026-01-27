'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useUser } from '@/firebase';
import {
  collection,
  query,
  where,
  onSnapshot,
  limit,
  Timestamp
} from 'firebase/firestore';
import { db } from '@/firebase';
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
}

export function RealTimeNotifications() {
  const { user } = useUser();
  const { showNotification } = useGlobalNotifications();
  const seenNotificationsRef = useRef<Set<string>>(new Set());

  const resolveActionUrl = (data: StaffNotification) => {
    const baseUrl = data.isGeneral ? '/admin/my-notes' : data.actionUrl;
    const memberUrl = data.applicationId
      ? `/admin/applications/${data.applicationId}`
      : data.clientId2
        ? `/admin/applications/${data.clientId2}`
        : null;
    const isDashboard =
      baseUrl === '/admin' ||
      baseUrl === '/admin/activity' ||
      baseUrl === '/admin/activity-dashboard' ||
      baseUrl === '/admin/dashboard';

    if (memberUrl && (!baseUrl || isDashboard)) {
      return memberUrl;
    }

    return baseUrl || memberUrl || '/admin/my-notes';
  };

  useEffect(() => {
    if (!user) return;

    console.log('🔔 Setting up real-time notifications for user:', user.uid);

    const identifiers = Array.from(
      new Set([user.uid, user.email].filter(Boolean))
    ) as string[];

    const unsubscribeHandlers = identifiers.map((identifier) => {
      const notificationsQuery = query(
        collection(db, 'staff_notifications'),
        where('userId', '==', identifier),
        limit(50)
      );

      return onSnapshot(
        notificationsQuery,
        (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            if (change.type !== 'added') return;
            if (seenNotificationsRef.current.has(change.doc.id)) return;
            const data = change.doc.data() as StaffNotification;
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

            const notification: NotificationData = {
              id: change.doc.id,
              title: data.title || 'Note',
              message: data.message || (data as any).content || '',
              senderName: data.senderName || (data as any).createdByName || 'Staff',
              memberName: data.memberName || '',
              type: data.type || 'note',
              priority,
              timestamp: data.timestamp?.toDate() || new Date(),
              applicationId: data.applicationId,
              actionUrl: resolveActionUrl(data)
            };

            seenNotificationsRef.current.add(notification.id);

            const isUrgent = notification.priority === 'urgent';
            showNotification({
              type: isUrgent ? 'urgent' : notification.type === 'assignment' ? 'task' : 'note',
              title: notification.title,
              message: notification.message,
              author: notification.senderName,
              memberName: notification.memberName,
              priority: isUrgent
                ? 'Urgent'
                : notification.priority === 'high'
                  ? 'High'
                  : notification.priority === 'medium'
                    ? 'Medium'
                    : 'Low',
              duration: 0,
              minimizeAfter: 30000,
              pendingLabel: 'Pending note',
              sound: true,
              soundType: 'mellow-note',
              animation: 'slide',
              onClick: () => {
                if (notification.actionUrl) {
                  window.location.href = notification.actionUrl;
                }
              }
            });
          });
        },
        (error) => {
          console.error('❌ Error listening to notifications:', error);
        }
      );
    });

    return () => {
      unsubscribeHandlers.forEach((unsubscribe) => unsubscribe());
    };
  }, [user]);

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