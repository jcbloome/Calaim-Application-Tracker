'use client';

import React, { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAdmin } from '@/hooks/use-admin';
import { useFirestore } from '@/firebase';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { useRouter } from 'next/navigation';

interface StaffNotification {
  id: string;
  type: 'note_assignment' | 'note_mention' | 'member_update' | 'task_assignment' | 'interoffice_note' | 'interoffice_followup' | 'authorization_expiry' | 'interoffice_reply';
  title: string;
  message: string;
  noteId?: string;
  clientId2?: string;
  memberName?: string;
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  createdAt: string;
  isRead: boolean;
  createdBy: string;
  createdByName: string;
  status?: 'Open' | 'Closed';
  actionUrl?: string;
  applicationId?: string;
  isGeneral?: boolean;
}

interface StaffNotificationBellProps {
  userId?: string;
  className?: string;
}

export function StaffNotificationBell({ userId, className = '' }: StaffNotificationBellProps) {
  const { user } = useAdmin();
  const firestore = useFirestore();
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);

  const effectiveUserId = userId || user?.uid;

  useEffect(() => {
    if (!effectiveUserId || !firestore) return;

    const notificationsQuery = query(
      collection(firestore, 'staff_notifications'),
      where('userId', '==', effectiveUserId),
      limit(200)
    );

    const unsubscribe = onSnapshot(
      notificationsQuery,
      (snapshot) => {
        const isInterofficeNotification = (data: any) => {
          const originType = String(data?.type || '').toLowerCase();
          return Boolean(data?.isGeneral) || originType.includes('interoffice');
        };

        const isImmediateNote = (data: any) => {
          const normalized = String(data?.priority || '').toLowerCase();
          return normalized.includes('urgent') || normalized.includes('high');
        };

        const nextNotifications: StaffNotification[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as any;
          const timestamp = data?.timestamp?.toDate?.() || data?.createdAt || new Date();
          const isGeneral = Boolean(data.isGeneral);
          return {
            id: docSnap.id,
            type: data.type || 'note_assignment',
            title: data.title || 'New Note',
            message: data.message || 'A note requires your attention.',
            noteId: data.noteId,
            clientId2: data.clientId2,
            memberName: data.memberName,
            priority: normalizePriority(data.priority),
            createdAt: new Date(timestamp).toISOString(),
            isRead: Boolean(data.isRead),
            createdBy: data.createdBy || 'system',
            createdByName: data.senderName || data.createdByName || 'System',
            status: data.status === 'Closed' ? 'Closed' : 'Open',
            actionUrl: data.actionUrl || (isGeneral ? '/admin/my-notes' : undefined),
            applicationId: data.applicationId,
            isGeneral
          };
        })
          .filter((notification) => isInterofficeNotification(notification) && isImmediateNote(notification))
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        setUnreadCount(nextNotifications.filter(n => !n.isRead && n.status !== 'Closed').length);
      },
      (error) => {
        console.error('Error fetching notifications:', error);
      }
    );

    return () => unsubscribe();
  }, [effectiveUserId, firestore]);

  const normalizePriority = (priority: string | undefined): StaffNotification['priority'] => {
    const normalized = String(priority || '').toLowerCase();
    if (normalized.includes('urgent') || normalized.includes('🔴')) return 'Urgent';
    if (normalized.includes('high')) return 'High';
    if (normalized.includes('low')) return 'Low';
    return 'Medium';
  };


  

  if (!effectiveUserId) {
    return null;
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className={`relative ${className}`}
      onClick={() => router.push('/admin/my-notes')}
      title="My Notifications"
    >
      <Bell className="h-5 w-5" />
      {unreadCount > 0 && (
        <Badge 
          variant="destructive" 
          className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-xs"
          title={`${unreadCount} immediate note${unreadCount === 1 ? '' : 's'}`}
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </Badge>
      )}
    </Button>
  );
}