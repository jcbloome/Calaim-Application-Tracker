'use client';

import React, { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { useAdmin } from '@/hooks/use-admin';
import { useFirestore } from '@/firebase';
import { collection, doc, limit, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { getPriorityRank, isPriorityOrUrgent, normalizePriorityLabel } from '@/lib/notification-utils';

interface StaffNotification {
  id: string;
  type: 'note_assignment' | 'note_mention' | 'member_update' | 'task_assignment' | 'interoffice_note' | 'interoffice_followup' | 'authorization_expiry' | 'interoffice_reply';
  title: string;
  message: string;
  noteId?: string;
  clientId2?: string;
  memberName?: string;
  priority: 'General' | 'Priority' | 'Urgent' | string;
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
  const { toast } = useToast();
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<StaffNotification[]>([]);

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
        const isImmediateNote = (data: any) => {
          return isPriorityOrUrgent(data?.priority);
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
            priority: normalizePriorityLabel(data.priority),
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
          .filter((notification) => isImmediateNote(notification))
          .sort((a, b) => {
            const rankDiff = getPriorityRank(b.priority) - getPriorityRank(a.priority);
            if (rankDiff !== 0) return rankDiff;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          });

        setNotifications(nextNotifications);
        setUnreadCount(nextNotifications.filter(n => !n.isRead && n.status !== 'Closed').length);
      },
      (error) => {
        console.error('Error fetching notifications:', error);
      }
    );

    return () => unsubscribe();
  }, [effectiveUserId, firestore]);

  const markViewed = async (notificationId: string) => {
    if (!firestore) return;
    try {
      await updateDoc(doc(firestore, 'staff_notifications', notificationId), { isRead: true });
    } catch (error) {
      console.error('Failed to mark viewed:', error);
      toast({
        title: 'Error',
        description: 'Failed to mark viewed.',
        variant: 'destructive'
      });
    }
  };

  const toggleStatus = async (notification: StaffNotification) => {
    if (!firestore) return;
    const nextStatus = notification.status === 'Closed' ? 'Open' : 'Closed';
    try {
      await updateDoc(doc(firestore, 'staff_notifications', notification.id), {
        status: nextStatus
      });
    } catch (error) {
      console.error('Failed to update status:', error);
      toast({
        title: 'Error',
        description: 'Failed to update status.',
        variant: 'destructive'
      });
    }
  };


  

  if (!effectiveUserId) {
    return null;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`relative ${className}`}
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
      </PopoverTrigger>
      <PopoverContent className="w-96 p-2" align="end">
        <div className="flex items-center justify-between px-2 py-1">
          <div className="text-sm font-semibold">Priority Notes</div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => router.push('/admin/my-notes')}
          >
            Open List
          </Button>
        </div>
        {notifications.length === 0 ? (
          <div className="px-2 py-3 text-sm text-muted-foreground">
            No priority notes right now.
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto space-y-2 p-2">
            {notifications.slice(0, 6).map((notification) => (
              <div
                key={notification.id}
                className="rounded-md border border-border bg-background p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold">
                      {notification.title}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      From {notification.createdByName}
                      {notification.memberName ? ` · ${notification.memberName}` : ''}
                    </div>
                    <div className="text-sm text-slate-700 line-clamp-2">
                      {notification.message}
                    </div>
                  </div>
                  {!notification.isRead && (
                    <Badge variant="secondary">New</Badge>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => router.push('/admin/my-notes')}
                  >
                    Open
                  </Button>
                  {!notification.isRead && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => markViewed(notification.id)}
                    >
                      Mark Viewed
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => toggleStatus(notification)}
                  >
                    {notification.status === 'Closed' ? 'Reopen' : 'Close'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}