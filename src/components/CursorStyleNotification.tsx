'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  X, 
  CheckCircle2, 
  AlertTriangle, 
  Info, 
  MessageSquare,
  Clock,
  User,
  Target,
  Zap,
  Bell
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface CursorStyleNotificationProps {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning' | 'message' | 'task';
  title: string;
  message: string;
  author?: string;
  memberName?: string;
  priority?: 'Low' | 'Medium' | 'High' | 'Urgent';
  duration?: number;
  position?: 'top-right' | 'top-center' | 'bottom-right' | 'bottom-center';
  showProgress?: boolean;
  onClose?: () => void;
  onClick?: () => void;
}

const TYPE_CONFIGS = {
  success: {
    icon: CheckCircle2,
    color: 'text-green-600',
    bgColor: 'bg-green-50 border-green-200',
    accentColor: 'bg-green-500'
  },
  error: {
    icon: AlertTriangle,
    color: 'text-red-600',
    bgColor: 'bg-red-50 border-red-200',
    accentColor: 'bg-red-500'
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50 border-yellow-200',
    accentColor: 'bg-yellow-500'
  },
  info: {
    icon: Info,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 border-blue-200',
    accentColor: 'bg-blue-500'
  },
  message: {
    icon: MessageSquare,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50 border-purple-200',
    accentColor: 'bg-purple-500'
  },
  task: {
    icon: Clock,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50 border-orange-200',
    accentColor: 'bg-orange-500'
  }
};

const PRIORITY_COLORS = {
  'Low': 'bg-gray-100 text-gray-700',
  'Medium': 'bg-blue-100 text-blue-700',
  'High': 'bg-orange-100 text-orange-700',
  'Urgent': 'bg-red-100 text-red-700'
};

const POSITION_CLASSES = {
  'top-right': 'top-4 right-4',
  'top-center': 'top-4 left-1/2 transform -translate-x-1/2',
  'bottom-right': 'bottom-4 right-4',
  'bottom-center': 'bottom-4 left-1/2 transform -translate-x-1/2'
};

export default function CursorStyleNotification({
  id,
  type,
  title,
  message,
  author,
  memberName,
  priority,
  duration = 5000,
  position = 'top-right',
  showProgress = true,
  onClose,
  onClick
}: CursorStyleNotificationProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [progress, setProgress] = useState(100);

  const config = TYPE_CONFIGS[type];
  const IconComponent = config.icon;

  // Handle close
  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsVisible(false);
      onClose?.();
    }, 200);
  };

  // Handle click
  const handleClick = () => {
    onClick?.();
    handleClose();
  };

  // Animation classes
  const getAnimationClasses = () => {
    const base = 'transition-all duration-200 ease-out';
    
    if (isClosing) {
      return `${base} transform scale-95 opacity-0`;
    }

    if (!isVisible) {
      return `${base} transform scale-95 opacity-0`;
    }

    return `${base} transform scale-100 opacity-100`;
  };

  useEffect(() => {
    // Show notification
    setTimeout(() => setIsVisible(true), 50);

    // Progress bar animation
    if (showProgress && duration > 0) {
      const interval = setInterval(() => {
        setProgress(prev => {
          const newProgress = prev - (100 / (duration / 100));
          return Math.max(0, newProgress);
        });
      }, 100);

      // Auto close
      const timer = setTimeout(() => {
        handleClose();
      }, duration);

      return () => {
        clearInterval(interval);
        clearTimeout(timer);
      };
    }
  }, [duration, showProgress]);

  return (
    <div className={cn('fixed z-50 pointer-events-auto', POSITION_CLASSES[position])}>
      <Card 
        className={cn(
          'w-80 cursor-pointer shadow-lg border-l-4 overflow-hidden',
          config.bgColor,
          getAnimationClasses()
        )}
        onClick={handleClick}
      >
        {/* Progress bar */}
        {showProgress && duration > 0 && (
          <div className="h-1 bg-gray-200">
            <div 
              className={cn('h-full transition-all duration-100 ease-linear', config.accentColor)}
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        <div className="p-4">
          {/* Header */}
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2 flex-1">
              <IconComponent className={cn('h-5 w-5 flex-shrink-0', config.color)} />
              <div className="flex items-center gap-2 flex-1">
                <span className={cn('font-semibold text-sm', config.color)}>
                  {title}
                </span>
                {priority && (
                  <Badge className={cn('text-xs px-1.5 py-0.5', PRIORITY_COLORS[priority])}>
                    {priority}
                  </Badge>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 hover:bg-gray-200 flex-shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                handleClose();
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>

          {/* Content */}
          <div className="space-y-2">
            <p className="text-sm text-gray-700 leading-relaxed">{message}</p>
            
            {/* Author and Member info */}
            {(author || memberName) && (
              <div className="flex items-center gap-3 text-xs text-gray-500">
                {author && (
                  <div className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    <span>{author}</span>
                  </div>
                )}
                {memberName && (
                  <div className="flex items-center gap-1">
                    <Target className="h-3 w-3" />
                    <span>{memberName}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Accent border */}
        <div className={cn('absolute left-0 top-0 bottom-0 w-1', config.accentColor)} />
      </Card>
    </div>
  );
}

// Cursor-style Notification Manager Hook
export function useCursorNotifications() {
  const [notifications, setNotifications] = useState<CursorStyleNotificationProps[]>([]);

  const showNotification = (notification: Omit<CursorStyleNotificationProps, 'id' | 'onClose'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newNotification: CursorStyleNotificationProps = {
      ...notification,
      id,
      onClose: () => removeNotification(id)
    };

    setNotifications(prev => [...prev, newNotification]);

    // Auto-remove after duration
    if (notification.duration && notification.duration > 0) {
      setTimeout(() => {
        removeNotification(id);
      }, notification.duration + 300); // Add buffer for animation
    }

    return id;
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const clearAll = () => {
    setNotifications([]);
  };

  return {
    notifications,
    showNotification,
    removeNotification,
    clearAll
  };
}

// Cursor-style Notification Container Component
export function CursorNotificationContainer() {
  const { notifications } = useCursorNotifications();

  return (
    <>
      {notifications.map((notification) => (
        <CursorStyleNotification key={notification.id} {...notification} />
      ))}
    </>
  );
}

// Tab Notification System (like Cursor's tab indicator)
export function useTabNotifications() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [isBlinking, setIsBlinking] = useState(false);

  const addNotification = (priority: 'normal' | 'urgent' = 'normal') => {
    setUnreadCount(prev => prev + 1);
    
    // Update document title with notification count
    const originalTitle = document.title.replace(/ \(\d+\)$/, '');
    document.title = `${originalTitle} (${unreadCount + 1})`;
    
    // Blink favicon for urgent notifications
    if (priority === 'urgent') {
      setIsBlinking(true);
      blinkFavicon();
    }
  };

  const clearNotifications = () => {
    setUnreadCount(0);
    setIsBlinking(false);
    
    // Reset document title
    document.title = document.title.replace(/ \(\d+\)$/, '');
    
    // Reset favicon
    resetFavicon();
  };

  const blinkFavicon = () => {
    const favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
    if (!favicon) return;

    const originalHref = favicon.href;
    let isRed = false;
    
    const blinkInterval = setInterval(() => {
      if (!isBlinking) {
        clearInterval(blinkInterval);
        favicon.href = originalHref;
        return;
      }
      
      // Toggle between original and red dot
      if (isRed) {
        favicon.href = originalHref;
      } else {
        // Create red dot favicon
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');
        
        if (ctx) {
          // Draw red circle
          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.arc(16, 16, 14, 0, 2 * Math.PI);
          ctx.fill();
          
          // Draw white exclamation mark
          ctx.fillStyle = 'white';
          ctx.font = 'bold 20px Arial';
          ctx.textAlign = 'center';
          ctx.fillText('!', 16, 22);
          
          favicon.href = canvas.toDataURL();
        }
      }
      
      isRed = !isRed;
    }, 500);
  };

  const resetFavicon = () => {
    const favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
    if (favicon) {
      favicon.href = '/favicon.ico';
    }
  };

  // Listen for page visibility changes to clear notifications when user returns
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && unreadCount > 0) {
        // User returned to tab, clear notifications after a short delay
        setTimeout(() => {
          clearNotifications();
        }, 2000);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [unreadCount]);

  return {
    unreadCount,
    isBlinking,
    addNotification,
    clearNotifications
  };
}