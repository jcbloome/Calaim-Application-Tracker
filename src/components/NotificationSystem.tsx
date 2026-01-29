'use client';

import { useState, useEffect, useRef } from 'react';
import { Bell, X, MessageSquare, Calendar, User, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

// Types
interface Notification {
  id: string;
  type: 'client_note' | 'system' | 'reminder';
  subType?: string;
  title: string;
  message: string;
  data?: any;
  recipientUserId: string;
  recipientUserName: string;
  createdAt: string;
  read: boolean;
  dismissed: boolean;
  priority: 'normal' | 'high' | 'urgent';
  expiresAt?: string;
}

interface NotificationSystemProps {
  userId: string;
  className?: string;
}

const shouldSuppressBrowserNotifications = () => {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem('notificationSettings');
    const parsed = raw ? JSON.parse(raw) as any : {};
    const userSuppress = parsed?.userControls?.suppressWebWhenDesktopActive;
    const webAppEnabled = parsed?.userControls?.webAppNotificationsEnabled;
    const webAppEnabled = parsed?.userControls?.webAppNotificationsEnabled;
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
    if (webAppEnabled === true) return globalForce;
    if (webAppEnabled === false) return true;
    const defaultSuppress = userSuppress === undefined;
    return globalForce || userSuppress === true || defaultSuppress;
  } catch {
    return false;
  }
};

export default function NotificationSystem({ userId, className = '' }: NotificationSystemProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Don't render if no userId provided
  if (!userId) {
    return null;
  }

  // Fetch notifications
  const fetchNotifications = async (includeRead = false) => {
    try {
      setLoading(true);
      
      // This would call your Firebase function
      const response = await fetch('/api/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          limit: 50,
          includeRead
        }),
      });

      if (!response.ok) throw new Error('Failed to fetch notifications');

      const data = await response.json();
      if (data.success) {
        setNotifications(data.notifications || []);
        setUnreadCount(data.notifications?.filter((n: Notification) => !n.read).length || 0);
      }
    } catch (error: any) {
      console.error('Error fetching notifications:', error);
      // Don't show toast for background fetches
    } finally {
      setLoading(false);
    }
  };

  // Mark notification as read
  const markAsRead = async (notificationId: string) => {
    try {
      const response = await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notificationId,
          userId
        }),
      });

      if (!response.ok) throw new Error('Failed to mark notification as read');

      // Update local state
      setNotifications(prev => 
        prev.map(n => 
          n.id === notificationId ? { ...n, read: true } : n
        )
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error: any) {
      console.error('Error marking notification as read:', error);
      toast({
        title: "Error",
        description: "Failed to mark notification as read",
        variant: "destructive",
      });
    }
  };

  // Handle notification click
  const handleNotificationClick = async (notification: Notification) => {
    // Mark as read if not already
    if (!notification.read) {
      await markAsRead(notification.id);
    }

    // Handle different notification types
    switch (notification.type) {
      case 'client_note':
        // Navigate to client notes page or specific note
        if (notification.data?.clientId2) {
          window.location.href = `/admin/client-notes?client=${notification.data.clientId2}`;
        } else {
          window.location.href = '/admin/client-notes';
        }
        break;
      case 'reminder':
        // Handle reminder notifications
        if (notification.data?.followUpDate) {
          window.location.href = `/admin/client-notes?followup=${notification.data.followUpDate}`;
        }
        break;
      default:
        // Default action
        break;
    }
    
    setIsOpen(false);
  };

  // Show system tray notification (browser notification)
  const showSystemTrayNotification = (notification: Notification) => {
    if (shouldSuppressBrowserNotifications()) {
      return;
    }
    if ('Notification' in window && Notification.permission === 'granted') {
      const systemNotification = new Notification(notification.title, {
        body: notification.message,
        icon: '/calaimlogopdf.png',
        badge: '/calaimlogopdf.png',
        tag: notification.id,
        requireInteraction: notification.priority === 'urgent',
        silent: notification.priority === 'normal'
      });

      systemNotification.onclick = () => {
        window.focus();
        handleNotificationClick(notification);
        systemNotification.close();
      };

      // Auto-close after 5 seconds for normal priority
      if (notification.priority === 'normal') {
        setTimeout(() => systemNotification.close(), 5000);
      }
    }
  };

  // Request notification permission
  const requestNotificationPermission = async () => {
    if (shouldSuppressBrowserNotifications()) {
      return;
    }
    if ('Notification' in window && Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        toast({
          title: "Notifications Enabled",
          description: "You'll now receive system tray notifications for new notes",
        });
      }
    }
  };

  // Poll for new notifications
  useEffect(() => {
    fetchNotifications();

    // Set up polling every 30 seconds
    intervalRef.current = setInterval(() => {
      fetchNotifications();
    }, 30000);

    // Request notification permission on first load
    requestNotificationPermission();

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [userId]);

  // Check for new notifications and show system tray alerts
  useEffect(() => {
    const newNotifications = notifications.filter(n => !n.read && n.createdAt);
    
    // Show system tray notifications for new unread notifications
    newNotifications.forEach(notification => {
      const createdAt = new Date(notification.createdAt);
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      
      // Only show system tray notification if it's very recent (within 5 minutes)
      if (createdAt > fiveMinutesAgo) {
        showSystemTrayNotification(notification);
      }
    });
  }, [notifications]);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'client_note':
        return <MessageSquare className="w-4 h-4" />;
      case 'reminder':
        return <Calendar className="w-4 h-4" />;
      default:
        return <Bell className="w-4 h-4" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'high':
        return 'text-orange-600 bg-orange-50 border-orange-200';
      default:
        return 'text-blue-600 bg-blue-50 border-blue-200';
    }
  };

  return (
    <div className={`relative ${className}`}>
      {/* Notification Bell Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <Badge 
            className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs bg-red-600"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </Badge>
        )}
      </Button>

      {/* Notification Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Notifications</h3>
              <div className="flex items-center space-x-2">
                {unreadCount > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {unreadCount} new
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsOpen(false)}
                  className="p-1"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          <ScrollArea className="max-h-96">
            {loading ? (
              <div className="p-4 text-center text-muted-foreground">
                Loading notifications...
              </div>
            ) : notifications.length === 0 ? null : (
              <div className="p-2">
                {notifications.map((notification) => (
                  <Card
                    key={notification.id}
                    className={`mb-2 cursor-pointer transition-all hover:shadow-md ${
                      !notification.read ? 'border-l-4 border-l-blue-500 bg-blue-50' : ''
                    } ${getPriorityColor(notification.priority)}`}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0 mt-1">
                          {getNotificationIcon(notification.type)}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <h4 className="text-sm font-medium truncate">
                              {notification.title}
                            </h4>
                            {!notification.read && (
                              <div className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0 ml-2" />
                            )}
                          </div>
                          
                          <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                            {notification.message}
                          </p>
                          
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>
                              {format(new Date(notification.createdAt), 'MMM dd, HH:mm')}
                            </span>
                            
                            {notification.priority !== 'normal' && (
                              <Badge 
                                variant="outline" 
                                className={`text-xs ${
                                  notification.priority === 'urgent' ? 'border-red-300 text-red-600' :
                                  notification.priority === 'high' ? 'border-orange-300 text-orange-600' :
                                  'border-blue-300 text-blue-600'
                                }`}
                              >
                                {notification.priority}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>

          {notifications.length > 0 && (
            <div className="p-3 border-t border-gray-200">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  window.location.href = '/admin/client-notes';
                  setIsOpen(false);
                }}
                className="w-full text-sm"
              >
                View All Notes
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Backdrop to close dropdown */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}