'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, MessageSquare, User, Clock, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface NotificationData {
  id: string;
  title: string;
  message: string;
  senderName: string;
  memberName?: string;
  applicationId?: string;
  timestamp: Date;
  type: 'note' | 'task' | 'alert';
  priority: 'low' | 'medium' | 'high';
}

interface CursorStyleNotificationProps {
  notification: NotificationData;
  onClose: () => void;
  onView?: () => void;
  autoClose?: boolean;
  duration?: number;
}

export function CursorStyleNotification({ 
  notification, 
  onClose, 
  onView,
  autoClose = true,
  duration = 8000 
}: CursorStyleNotificationProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    // Animate in
    const timer = setTimeout(() => setIsVisible(true), 100);
    
    // Auto close if enabled
    let autoCloseTimer: NodeJS.Timeout;
    if (autoClose) {
      autoCloseTimer = setTimeout(() => {
        handleClose();
      }, duration);
    }

    return () => {
      clearTimeout(timer);
      if (autoCloseTimer) clearTimeout(autoCloseTimer);
    };
  }, [autoClose, duration]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => {
      onClose();
    }, 300);
  };

  const handleView = () => {
    if (onView) {
      onView();
    }
    handleClose();
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'border-red-200 bg-red-50';
      case 'medium': return 'border-orange-200 bg-orange-50';
      default: return 'border-blue-200 bg-blue-50';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'note': return <MessageSquare className="h-4 w-4" />;
      case 'task': return <Clock className="h-4 w-4" />;
      default: return <MessageSquare className="h-4 w-4" />;
    }
  };

  return (
    <div
      className={cn(
        "fixed top-4 right-4 z-50 w-96 max-w-[calc(100vw-2rem)] transition-all duration-300 ease-out",
        isVisible && !isExiting ? "translate-x-0 opacity-100" : "translate-x-full opacity-0"
      )}
    >
      <Card className={cn(
        "border-2 shadow-lg backdrop-blur-sm",
        getPriorityColor(notification.priority)
      )}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              {getTypeIcon(notification.type)}
              <span className="font-semibold text-sm">New Note</span>
              <Badge variant="outline" className="text-xs">
                {notification.priority}
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              className="h-6 w-6 p-0 hover:bg-white/50"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="h-3 w-3" />
              <span>From: {notification.senderName}</span>
            </div>
            
            {notification.memberName && (
              <div className="text-sm">
                <span className="font-medium">Member:</span> {notification.memberName}
              </div>
            )}

            <div className="text-sm font-medium">
              {notification.title}
            </div>

            <div className="text-sm text-gray-700 line-clamp-2">
              {notification.message}
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>{notification.timestamp.toLocaleTimeString()}</span>
              </div>

              <div className="flex gap-2">
                {notification.applicationId && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleView}
                    className="h-7 text-xs"
                    asChild
                  >
                    <Link href={`/admin/applications/${notification.applicationId}`}>
                      <ExternalLink className="h-3 w-3 mr-1" />
                      View
                    </Link>
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={handleClose}
                  className="h-7 text-xs"
                >
                  Dismiss
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Notification Manager Component
interface NotificationManagerProps {
  children: React.ReactNode;
}

export function NotificationManager({ children }: NotificationManagerProps) {
  const [notifications, setNotifications] = useState<NotificationData[]>([]);

  const addNotification = (notification: Omit<NotificationData, 'id' | 'timestamp'>) => {
    const newNotification: NotificationData = {
      ...notification,
      id: Date.now().toString(),
      timestamp: new Date()
    };
    
    setNotifications(prev => [...prev, newNotification]);
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  // Expose addNotification globally for easy access
  useEffect(() => {
    (window as any).showStaffNotification = addNotification;
    return () => {
      delete (window as any).showStaffNotification;
    };
  }, []);

  return (
    <>
      {children}
      {notifications.map((notification) => (
        <CursorStyleNotification
          key={notification.id}
          notification={notification}
          onClose={() => removeNotification(notification.id)}
        />
      ))}
    </>
  );
}