'use client';

import React, { useState, useEffect } from 'react';
import { Bell, MessageSquare, Clock, User, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { useAdmin } from '@/hooks/use-admin';

interface StaffNotification {
  id: string;
  type: 'note_assignment' | 'note_mention' | 'member_update' | 'task_assignment';
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
}

interface StaffNotificationBellProps {
  userId?: string;
  className?: string;
}

export function StaffNotificationBell({ userId, className = '' }: StaffNotificationBellProps) {
  const { user } = useAdmin();
  const [notifications, setNotifications] = useState<StaffNotification[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  const effectiveUserId = userId || user?.uid;

  useEffect(() => {
    if (!effectiveUserId) return;

    fetchNotifications();
    
    // Set up polling for new notifications every 30 seconds
    const interval = setInterval(fetchNotifications, 30000);
    
    return () => clearInterval(interval);
  }, [effectiveUserId]);

  const fetchNotifications = async () => {
    if (!effectiveUserId) return;

    try {
      setIsLoading(true);
      
      // Sample notifications - in production this would come from API
      const sampleNotifications: StaffNotification[] = [
        {
          id: '1',
          type: 'note_assignment',
          title: 'New Note Assigned',
          message: 'You have been assigned a high priority note for John Doe',
        noteId: 'note_123',
        clientId2: 'KAI-12345',
        memberName: 'Sample Member A',
        priority: 'High',
        createdAt: '2026-01-17T14:30:00Z',
          isRead: false,
          createdBy: 'sarah_johnson',
          createdByName: 'Sarah Johnson, MSW'
        },
        {
          id: '2',
          type: 'member_update',
          title: 'Member Status Update',
        message: 'Sample Member B has been moved to Authorized status',
        clientId2: 'HN-67890',
        memberName: 'Sample Member B',
        priority: 'Medium',
        createdAt: '2026-01-17T12:15:00Z',
          isRead: false,
          createdBy: 'admin',
          createdByName: 'System Administrator'
        },
        {
          id: '3',
          type: 'note_mention',
          title: 'Mentioned in Note',
          message: 'You were mentioned in a note for Robert Johnson',
        noteId: 'note_456',
        clientId2: 'KAI-11111',
        memberName: 'Sample Member C',
        priority: 'Low',
        createdAt: '2026-01-17T10:00:00Z',
          isRead: true,
          createdBy: 'mike_wilson',
          createdByName: 'Dr. Mike Wilson, RN'
        }
      ];

      setNotifications(sampleNotifications);
      setUnreadCount(sampleNotifications.filter(n => !n.isRead).length);
      
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const markAsRead = async (notificationId: string) => {
    try {
      // In production, this would call the API to mark as read
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

  const markAllAsRead = async () => {
    try {
      // In production, this would call the API to mark all as read
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
      case 'member_update': return <User className="h-4 w-4" />;
      case 'task_assignment': return <Clock className="h-4 w-4" />;
      default: return <Bell className="h-4 w-4" />;
    }
  };

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
                        // In production, this could navigate to the relevant page
                        if (notification.noteId) {
                          console.log(`Navigate to note: ${notification.noteId}`);
                        }
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