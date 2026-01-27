'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Bell, MessageSquare, Clock, User, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { useAdmin } from '@/hooks/use-admin';
import { useFirestore } from '@/firebase';
import { collection, doc, limit, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
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
  const [notifications, setNotifications] = useState<StaffNotification[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const seenNotificationsRef = useRef<Set<string>>(new Set());

  const effectiveUserId = userId || user?.uid;

  useEffect(() => {
    if (!effectiveUserId || !firestore) return;

    setIsLoading(true);
    const notificationsQuery = query(
      collection(firestore, 'staff_notifications'),
      where('userId', '==', effectiveUserId),
      limit(200)
    );

    const unsubscribe = onSnapshot(
      notificationsQuery,
      (snapshot) => {
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
        }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        setNotifications(nextNotifications);
        setUnreadCount(nextNotifications.filter(n => !n.isRead && n.status !== 'Closed').length);
        setIsLoading(false);
      },
      (error) => {
        console.error('Error fetching notifications:', error);
        setIsLoading(false);
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


  const markAsRead = async (notificationId: string) => {
    try {
      if (!firestore) return;
      await updateDoc(doc(firestore, 'staff_notifications', notificationId), {
        isRead: true,
        readAt: new Date().toISOString()
      });

      setNotifications(prev => 
        prev.map(notification => 
          notification.id === notificationId 
            ? { ...notification, isRead: true }
            : notification
        )
      );
      
      setUnreadCount(prev => Math.max(0, prev - 1));
      
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAsResolved = async (notificationId: string) => {
    try {
      if (!firestore) return;
      await updateDoc(doc(firestore, 'staff_notifications', notificationId), {
        status: 'Closed',
        resolvedAt: new Date().toISOString(),
        isRead: true
      });
      if (typeof window !== 'undefined' && (window as any).dismissStaffNotification) {
        (window as any).dismissStaffNotification(notificationId);
      }
    } catch (error) {
      console.error('Error resolving notification:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      if (!firestore) return;
      const unread = notifications.filter(n => !n.isRead && n.status !== 'Closed');
      await Promise.all(
        unread.map((notification) =>
          updateDoc(doc(firestore, 'staff_notifications', notification.id), {
            isRead: true,
            readAt: new Date().toISOString()
          })
        )
      );

      setNotifications(prev => 
        prev.map(notification => ({ ...notification, isRead: true }))
      );
      
      setUnreadCount(0);
      
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'Urgent': return 'text-red-600 bg-red-50 border-red-200';
      case 'High': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'Medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'Low': return 'text-green-600 bg-green-50 border-green-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'note_assignment': return <MessageSquare className="h-4 w-4" />;
      case 'note_mention': return <MessageSquare className="h-4 w-4" />;
      case 'interoffice_note': return <MessageSquare className="h-4 w-4" />;
      case 'interoffice_followup': return <Clock className="h-4 w-4" />;
      case 'authorization_expiry': return <AlertCircle className="h-4 w-4" />;
      case 'member_update': return <User className="h-4 w-4" />;
      case 'task_assignment': return <Clock className="h-4 w-4" />;
      default: return <Bell className="h-4 w-4" />;
    }
  };

  const getNotificationLink = (notification: StaffNotification) => {
    const baseUrl = notification.isGeneral ? '/admin/my-notes' : notification.actionUrl;
    const memberUrl = notification.applicationId
      ? `/admin/applications/${notification.applicationId}`
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
    if (!effectiveUserId) return;
    const openNotifications = notifications.filter((notification) => {
      if (notification.status === 'Closed' || notification.isRead) return false;
      return true;
    });

    openNotifications.forEach((notification) => {
      if (seenNotificationsRef.current.has(notification.id)) return;
      seenNotificationsRef.current.add(notification.id);
    });
  }, [notifications]);

  if (!effectiveUserId) {
    return null;
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`relative ${className}`}
          onClick={() => setIsOpen(!isOpen)}
          title="Staff notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-xs"
              title={`${unreadCount} unread staff notification${unreadCount === 1 ? '' : 's'}`}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0 z-50" align="end">
        <Card className="border-0 shadow-lg">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Notifications</CardTitle>
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={markAllAsRead}
                  className="text-xs"
                >
                  Mark all read
                </Button>
              )}
            </div>
            <CardDescription>
              {unreadCount > 0 ? `${unreadCount} unread notifications` : 'All caught up!'}
            </CardDescription>
          </CardHeader>
          <Separator />
          <CardContent className="p-0">
            <ScrollArea className="h-96">
              {notifications.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground">
                  <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No notifications yet</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`p-4 hover:bg-gray-50 cursor-pointer border-l-4 ${
                        !notification.isRead 
                          ? 'bg-blue-50 border-l-blue-500' 
                          : 'border-l-transparent'
                      }`}
                      onClick={() => {
                        if (!notification.isRead) {
                          markAsRead(notification.id);
                        }
                        router.push(getNotificationLink(notification));
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`p-1 rounded-full ${getPriorityColor(notification.priority)}`}>
                          {getNotificationIcon(notification.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <p className={`text-sm font-medium ${!notification.isRead ? 'text-gray-900' : 'text-gray-600'}`}>
                              {notification.title}
                            </p>
                          <Badge variant="outline" className={`text-xs ${getPriorityColor(notification.priority)}`}>
                              {notification.priority}
                            </Badge>
                          </div>
                        {notification.status && (
                          <p className="text-xs text-gray-500 mb-1">
                            Status: {notification.status}
                          </p>
                        )}
                          <p className="text-sm text-gray-600 mb-2">
                            {notification.message}
                          </p>
                          {notification.memberName && (
                            <p className="text-xs text-gray-500 mb-1">
                              Member: {notification.memberName} ({notification.clientId2})
                            </p>
                          )}
                          <div className="flex items-center justify-between text-xs text-gray-500">
                            <span>From: {notification.createdByName}</span>
                            <span>{format(new Date(notification.createdAt), 'MMM d, h:mm a')}</span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            className="text-xs"
                            onClick={(event) => {
                              event.stopPropagation();
                              router.push(getNotificationLink(notification));
                            }}
                          >
                            View
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            onClick={(event) => {
                              event.stopPropagation();
                              router.push(`/admin/my-notes?replyTo=${notification.id}`);
                            }}
                          >
                            Reply
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            onClick={(event) => {
                              event.stopPropagation();
                              router.push('/admin/my-notes?compose=1#compose-note');
                            }}
                          >
                            New Note
                          </Button>
                          {notification.status !== 'Closed' && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs"
                              onClick={(event) => {
                                event.stopPropagation();
                                markAsResolved(notification.id);
                              }}
                            >
                              Mark Resolved
                            </Button>
                          )}
                        </div>
                        {!notification.isRead && (
                          <div className="w-2 h-2 bg-blue-600 rounded-full mt-2"></div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </PopoverContent>
    </Popover>
  );
}