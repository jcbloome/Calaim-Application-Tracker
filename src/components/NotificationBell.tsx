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

const shouldSuppressBrowserNotifications = () => {
  if (typeof window === 'undefined') return false;
  if (!window.desktopNotifications) return false;
  try {
    const raw = localStorage.getItem('notificationSettings');
    const parsed = raw ? JSON.parse(raw) as any : {};
    const userSuppress = Boolean(parsed?.userControls?.suppressWebWhenDesktopActive);
    let globalForce = false;
    try {
      const rawGlobal = localStorage.getItem('notificationSettingsGlobal');
      if (rawGlobal) {
        const parsedGlobal = JSON.parse(rawGlobal) as any;
        globalForce = Boolean(parsedGlobal?.globalControls?.forceSuppressWebWhenDesktopActive);
      }
    } catch {
      globalForce = false;
    }
    return globalForce || userSuppress;
  } catch {
    return false;
  }
};

// Browser notification function
const showBrowserNotifications = (priorityNotifications: NotificationPreview[]) => {
  if (shouldSuppressBrowserNotifications()) {
    return;
  }
  // Request permission if not already granted
  if (Notification.permission === 'default') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        console.log('🔔 Notification permission granted');
      }
    });
    return; // Don't show notifications on first permission request
  }

  if (Notification.permission !== 'granted') {
    console.log('🔔 Notification permission denied');
    return;
  }

  // Show notifications for each priority alert
  priorityNotifications.forEach(notification => {
    const browserNotification = new Notification(`🚨 Priority Alert: ${notification.memberName}`, {
      body: notification.content,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: notification.id, // Prevent duplicate notifications
      requireInteraction: true, // Keep notification visible until user interacts
      data: {
        url: notification.actionUrl || '/admin/my-notes',
        notificationId: notification.id
      }
    });

    // Handle notification click
    browserNotification.onclick = function(event) {
      event.preventDefault();
      window.focus(); // Focus the browser window
      if (notification.actionUrl) {
        window.location.href = notification.actionUrl;
      }
      browserNotification.close();
    };

    // Auto-close after 10 seconds for non-urgent notifications
    if (notification.priority !== 'Urgent') {
      setTimeout(() => {
        browserNotification.close();
      }, 10000);
    }

    console.log(`🔔 Browser notification shown for: ${notification.memberName}`);
  });
};

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
        
        // Sort by creation date (newest first) and limit to 10
        recentNotifications.sort((a, b) => {
          const aTime = a.createdAt?.toDate?.()?.getTime() || 0;
          const bTime = b.createdAt?.toDate?.()?.getTime() || 0;
          return bTime - aTime;
        });
        
        // Check for new priority notifications for browser alerts
        const newPriorityNotifications = recentNotifications.filter(n => 
          (n.priority === 'High' || n.priority === 'Urgent') &&
          n.requiresStaffAction
        );

        // Show browser notifications for priority alerts
        if (newPriorityNotifications.length > 0) {
          showBrowserNotifications(newPriorityNotifications);
        }
        
        setNotifications(recentNotifications.slice(0, 10));
        
        // Update document title with unread count
        const unreadCount = recentNotifications.length;
        if (unreadCount > 0) {
          document.title = `(${unreadCount}) CalAIM Tracker`;
        } else {
          document.title = 'CalAIM Tracker';
        }
        
        setIsLoading(false);
        console.log(`🔔 Real-time update: ${unreadCount} unread notifications`);
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