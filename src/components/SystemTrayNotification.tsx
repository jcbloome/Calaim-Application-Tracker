'use client';

import React, { useState, useEffect } from 'react';
import { X, Bell, CheckCircle, AlertTriangle, Info, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SystemTrayNotificationProps {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  duration?: number; // in milliseconds, 0 for persistent
  onClose?: (id: string) => void;
  onClick?: (id: string) => void;
  showBellIcon?: boolean;
  actionButton?: {
    label: string;
    onClick: () => void;
  };
}

export const SystemTrayNotification: React.FC<SystemTrayNotificationProps> = ({
  id,
  type,
  title,
  message,
  duration = 5000,
  onClose,
  onClick,
  showBellIcon = true,
  actionButton,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    // Animate in
    const showTimer = setTimeout(() => setIsVisible(true), 100);

    // Auto-hide after duration
    let hideTimer: NodeJS.Timeout;
    if (duration > 0) {
      hideTimer = setTimeout(() => {
        handleClose();
      }, duration);
    }

    return () => {
      clearTimeout(showTimer);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, [duration]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => {
      onClose?.(id);
    }, 300); // Match exit animation duration
  };

  const handleClick = () => {
    onClick?.(id);
  };

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
      case 'info':
      default:
        return <Info className="h-5 w-5 text-blue-600" />;
    }
  };

  const getBackgroundColor = () => {
    switch (type) {
      case 'success':
        return 'bg-green-50 border-green-200';
      case 'error':
        return 'bg-red-50 border-red-200';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200';
      case 'info':
      default:
        return 'bg-blue-50 border-blue-200';
    }
  };

  return (
    <div
      className={cn(
        'fixed top-4 right-4 z-50 w-96 max-w-sm',
        'transform transition-all duration-300 ease-out',
        isVisible && !isExiting
          ? 'translate-x-0 opacity-100 scale-100'
          : 'translate-x-full opacity-0 scale-95',
        isExiting && 'translate-x-full opacity-0 scale-95'
      )}
    >
      <div
        className={cn(
          'rounded-lg border-2 shadow-lg backdrop-blur-sm',
          'p-4 cursor-pointer hover:shadow-xl transition-shadow duration-200',
          getBackgroundColor()
        )}
        onClick={handleClick}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            {showBellIcon && <Bell className="h-4 w-4 text-gray-500" />}
            {getIcon()}
            <h4 className="font-semibold text-gray-900 text-sm">{title}</h4>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleClose();
            }}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-white/50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Message */}
        <p className="text-sm text-gray-700 mb-3 leading-relaxed">{message}</p>

        {/* Action Button */}
        {actionButton && (
          <div className="flex justify-end">
            <button
              onClick={(e) => {
                e.stopPropagation();
                actionButton.onClick();
              }}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                type === 'success' && 'bg-green-600 hover:bg-green-700 text-white',
                type === 'error' && 'bg-red-600 hover:bg-red-700 text-white',
                type === 'warning' && 'bg-yellow-600 hover:bg-yellow-700 text-white',
                type === 'info' && 'bg-blue-600 hover:bg-blue-700 text-white'
              )}
            >
              {actionButton.label}
            </button>
          </div>
        )}

        {/* Progress bar for timed notifications */}
        {duration > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-200 rounded-b-lg overflow-hidden">
            <div
              className={cn(
                'h-full transition-all ease-linear',
                type === 'success' && 'bg-green-500',
                type === 'error' && 'bg-red-500',
                type === 'warning' && 'bg-yellow-500',
                type === 'info' && 'bg-blue-500'
              )}
              style={{
                animation: `shrink ${duration}ms linear`,
              }}
            />
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes shrink {
          from {
            width: 100%;
          }
          to {
            width: 0%;
          }
        }
      `}</style>
    </div>
  );
};

// Notification Manager Component
interface NotificationManagerProps {
  notifications: SystemTrayNotificationProps[];
  onRemove: (id: string) => void;
}

export const NotificationManager: React.FC<NotificationManagerProps> = ({
  notifications,
  onRemove,
}) => {
  return (
    <div className="fixed top-0 right-0 z-50 pointer-events-none">
      <div className="flex flex-col gap-2 p-4 pointer-events-auto">
        {notifications.map((notification, index) => (
          <div
            key={notification.id}
            style={{
              transform: `translateY(${index * 8}px)`,
              zIndex: 50 - index,
            }}
          >
            <SystemTrayNotification
              {...notification}
              onClose={onRemove}
            />
          </div>
        ))}
      </div>
    </div>
  );
};