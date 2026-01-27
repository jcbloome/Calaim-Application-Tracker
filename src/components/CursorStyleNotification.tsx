'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, MessageSquare, User, Clock, ExternalLink, MessageSquareText } from 'lucide-react';
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
  priority: 'low' | 'medium' | 'high' | 'urgent';
  autoClose?: boolean;
  duration?: number;
  requiresResolve?: boolean;
  resolveLabel?: string;
  onResolve?: () => void;
  compact?: boolean;
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
    const shouldAutoClose = notification.autoClose ?? autoClose;
    const closeAfter = notification.duration ?? duration;
    if (shouldAutoClose) {
      autoCloseTimer = setTimeout(() => {
        handleClose();
      }, closeAfter);
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
      case 'urgent': return 'border-red-300 bg-red-50';
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

  const isCompact = Boolean(notification.compact);

  return (
    <div
      className={cn(
        "fixed top-4 right-4 z-50 max-w-[calc(100vw-2rem)] transition-all duration-300 ease-out",
        isCompact ? "w-80" : "w-96",
        isVisible && !isExiting ? "translate-x-0 opacity-100" : "translate-x-full opacity-0"
      )}
    >
      <Card className={cn(
        "border-2 shadow-lg backdrop-blur-sm",
        getPriorityColor(notification.priority)
      )}>
        <CardContent className={cn(isCompact ? "p-3" : "p-4")}>
          <div className={cn("flex items-start justify-between", isCompact ? "mb-2" : "mb-3")}>
            <div className="flex items-center gap-2">
              {getTypeIcon(notification.type)}
              <span className={cn("font-semibold", isCompact ? "text-xs" : "text-sm")}>New Note</span>
              <Badge variant="outline" className={cn(isCompact ? "text-[10px]" : "text-xs")}>
                {notification.priority}
              </Badge>
            </div>
            {!notification.requiresResolve && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClose}
                className="h-6 w-6 p-0 hover:bg-white/50"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>

          <div className={cn(isCompact ? "space-y-1.5" : "space-y-2")}>
            <div className={cn("flex items-center gap-2 text-muted-foreground", isCompact ? "text-[11px]" : "text-sm")}>
              <User className="h-3 w-3" />
              <span>From: {notification.senderName}</span>
            </div>
            
            {notification.memberName && (
              <div className={cn(isCompact ? "text-xs" : "text-sm")}>
                <span className="font-medium">Member:</span> {notification.memberName}
              </div>
            )}

            <div className={cn("font-medium", isCompact ? "text-xs" : "text-sm")}>
              {notification.title}
            </div>

            <div className={cn("text-gray-700 line-clamp-2", isCompact ? "text-xs" : "text-sm")}>
              {notification.message}
            </div>

            <div className={cn("flex items-center justify-between", isCompact ? "pt-1" : "pt-2")}>
              <div className={cn("flex items-center gap-1 text-muted-foreground", isCompact ? "text-[10px]" : "text-xs")}>
                <Clock className="h-3 w-3" />
                <span>{notification.timestamp.toLocaleTimeString()}</span>
              </div>

              <div className={cn("flex gap-2", isCompact && "gap-1")}>
                {notification.memberName && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleClose}
                    className={cn(isCompact ? "h-6 text-[10px] px-2" : "h-7 text-xs")}
                    asChild
                  >
                    <Link href={`/admin/my-notes?member=${encodeURIComponent(notification.memberName)}`}>
                      <MessageSquareText className={cn(isCompact ? "h-2.5 w-2.5 mr-1" : "h-3 w-3 mr-1")} />
                      {isCompact ? "Open" : "Notes"}
                    </Link>
                  </Button>
                )}
                {notification.applicationId && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleView}
                    className={cn(isCompact ? "h-6 text-[10px] px-2" : "h-7 text-xs")}
                    asChild
                  >
                    <Link href={`/admin/applications/${notification.applicationId}`}>
                      <ExternalLink className={cn(isCompact ? "h-2.5 w-2.5 mr-1" : "h-3 w-3 mr-1")} />
                      {isCompact ? "Go" : "View"}
                    </Link>
                  </Button>
                )}
                {notification.requiresResolve ? (
                  <Button
                    size="sm"
                    onClick={() => {
                      notification.onResolve?.();
                      handleClose();
                    }}
                    className={cn(isCompact ? "h-6 text-[10px] px-2" : "h-7 text-xs")}
                  >
                    {notification.resolveLabel || 'Mark Resolved'}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={handleClose}
                    className={cn(isCompact ? "h-6 text-[10px] px-2" : "h-7 text-xs")}
                  >
                    Dismiss
                  </Button>
                )}
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

  const addNotification = (notification: Omit<NotificationData, 'id' | 'timestamp'> & { id?: string }) => {
    const newNotification: NotificationData = {
      ...notification,
      id: notification.id || Date.now().toString(),
      timestamp: new Date()
    };
    
    setNotifications(prev => {
      if (prev.some(existing => existing.id === newNotification.id)) {
        return prev;
      }
      return [...prev, newNotification];
    });
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  // Expose addNotification globally for easy access
  useEffect(() => {
    (window as any).showStaffNotification = addNotification;
    (window as any).dismissStaffNotification = removeNotification;
    return () => {
      delete (window as any).showStaffNotification;
      delete (window as any).dismissStaffNotification;
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

// Hook for cursor-style notifications (for demo page compatibility)
export function useCursorNotifications() {
  const showNotification = (notification: Omit<NotificationData, 'id' | 'timestamp'>) => {
    if ((window as any).showStaffNotification) {
      (window as any).showStaffNotification(notification);
    }
  };

  return { showNotification };
}

// Hook for tab notifications (for demo page compatibility)
export function useTabNotifications() {
  const addNotification = (notification: Omit<NotificationData, 'id' | 'timestamp'>) => {
    if ((window as any).showStaffNotification) {
      (window as any).showStaffNotification(notification);
    }
  };

  return { addNotification };
}

// Container component alias (for layout compatibility)
export const CursorNotificationContainer = NotificationManager;