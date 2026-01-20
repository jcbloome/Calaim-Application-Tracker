'use client';

import React, { useState, useEffect } from 'react';
import { Bell, BellRing } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useFirestore, useUser } from '@/firebase';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import Link from 'next/link';

interface NotificationPreview {
  id: string;
  title: string;
  content: string;
  memberName?: string;
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  isRead: boolean;
  createdAt: Timestamp;
  requiresStaffAction: boolean;
}

interface NotificationBellProps {
  className?: string;
}

export default function NotificationBell({ className = '' }: NotificationBellProps) {
  const [notifications, setNotifications] = useState<NotificationPreview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useUser();
  const firestore = useFirestore();

  useEffect(() => {
    if (!firestore || !user?.uid) {
      setIsLoading(false);
      return;
    }

    try {
      // Query recent unread notifications for the current user
      const notificationsQuery = query(
        collection(firestore, 'staff-notifications'),
        where('recipientId', '==', user.uid),
        where('isRead', '==', false)
      );

      const unsubscribe = onSnapshot(notificationsQuery, (snapshot) => {
        const recentNotifications: NotificationPreview[] = [];
        
        snapshot.forEach((doc) => {
          const data = doc.data();
          recentNotifications.push({
            id: doc.id,
            title: data.title || 'Notification',
            content: data.content || '',
            memberName: data.memberName,
            priority: data.priority || 'Medium',
            isRead: data.isRead || false,
            createdAt: data.createdAt,
            requiresStaffAction: data.requiresStaffAction || false
          });
        });
        
        // Sort by creation date (newest first) and limit to 5
        recentNotifications.sort((a, b) => {
          const aTime = a.createdAt?.toDate?.()?.getTime() || 0;
          const bTime = b.createdAt?.toDate?.()?.getTime() || 0;
          return bTime - aTime;
        });
        
        setNotifications(recentNotifications.slice(0, 5));
        setIsLoading(false);
      }, (error) => {
        console.error('Error loading notification preview:', error);
        setIsLoading(false);
      });

      return () => unsubscribe();
    } catch (error) {
      console.error('Error setting up notification listener:', error);
      setIsLoading(false);
    }
  }, [firestore, user?.uid]);

  const unreadCount = notifications.length;

  const truncateText = (text: string, maxLength: number = 50) => {
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'High':
      case 'Urgent':
        return 'text-red-600';
      case 'Medium':
        return 'text-orange-600';
      default:
        return 'text-blue-600';
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className={`relative ${className}`}>
          {unreadCount > 0 ? (
            <BellRing className="h-5 w-5" />
          ) : (
            <Bell className="h-5 w-5" />
          )}
          {unreadCount > 0 && (
            <Badge 
              className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 text-xs bg-red-500 text-white border-white"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          {unreadCount > 0 && (
            <Badge variant="secondary">{unreadCount} unread</Badge>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {isLoading ? (
          <DropdownMenuItem disabled>
            <span className="text-muted-foreground">Loading...</span>
          </DropdownMenuItem>
        ) : notifications.length === 0 ? (
          <DropdownMenuItem disabled>
            <span className="text-muted-foreground">No new notifications</span>
          </DropdownMenuItem>
        ) : (
          <>
            {notifications.map((notification) => (
              <DropdownMenuItem key={notification.id} className="flex-col items-start p-3 cursor-pointer">
                <div className="w-full">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`font-medium text-sm ${getPriorityColor(notification.priority)}`}>
                      {notification.title}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {notification.createdAt?.toDate?.()?.toLocaleDateString()}
                    </span>
                  </div>
                  {notification.memberName && (
                    <div className="text-xs text-muted-foreground mb-1">
                      Member: {notification.memberName}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {truncateText(notification.content)}
                  </div>
                  {notification.requiresStaffAction && (
                    <Badge className="mt-1 text-xs bg-orange-100 text-orange-800 border-orange-200">
                      Action Required
                    </Badge>
                  )}
                </div>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/admin/my-notes" className="w-full text-center">
                <span className="text-blue-600 font-medium">View All Notifications</span>
              </Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}