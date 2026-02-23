'use client';

import { useState, useCallback } from 'react';
import { SystemTrayNotificationProps } from '@/components/SystemTrayNotification';
import { WEB_NOTIFICATIONS_MOTHBALLED } from '@/lib/notification-utils';
import { isRealDesktop } from '@/lib/is-real-desktop';

export interface NotificationOptions {
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  duration?: number;
  onClick?: (id: string) => void;
  actionButton?: {
    label: string;
    onClick: () => void;
  };
  playSound?: boolean;
}

export const useSystemNotifications = () => {
  const [notifications, setNotifications] = useState<SystemTrayNotificationProps[]>([]);

  const addNotification = useCallback((options: NotificationOptions) => {
    if (WEB_NOTIFICATIONS_MOTHBALLED || isRealDesktop()) {
      return '';
    }
    const id = `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const notification: SystemTrayNotificationProps = {
      id,
      type: options.type,
      title: options.title,
      message: options.message,
      duration: options.duration ?? 5000,
      onClick: options.onClick,
      actionButton: options.actionButton,
      showBellIcon: true,
    };

    setNotifications(prev => [...prev, notification]);

    // Play notification sound if requested and supported
    if (options.playSound && 'Audio' in window) {
      try {
        // Create a subtle notification sound
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // Configure sound based on notification type
        switch (options.type) {
          case 'success':
            oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
            oscillator.frequency.setValueAtTime(1000, audioContext.currentTime + 0.1);
            break;
          case 'error':
            oscillator.frequency.setValueAtTime(400, audioContext.currentTime);
            oscillator.frequency.setValueAtTime(300, audioContext.currentTime + 0.1);
            break;
          case 'warning':
            oscillator.frequency.setValueAtTime(600, audioContext.currentTime);
            break;
          case 'info':
          default:
            oscillator.frequency.setValueAtTime(500, audioContext.currentTime);
            break;
        }
        
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.2);
      } catch (error) {
        console.warn('Could not play notification sound:', error);
      }
    }

    // Request browser notification permission and show if available
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const browserNotification = new Notification(options.title, {
          body: options.message,
          icon: '/calaimlogopdf.png',
          tag: id,
          requireInteraction: options.type === 'error' || options.duration === 0,
        });

        browserNotification.onclick = () => {
          window.focus();
          options.onClick?.(id);
          browserNotification.close();
        };

        // Auto-close browser notification after duration
        if (options.duration && options.duration > 0) {
          setTimeout(() => {
            browserNotification.close();
          }, options.duration);
        }
      } catch (error) {
        console.warn('Could not show browser notification:', error);
      }
    }

    return id;
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const clearAllNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  // Convenience methods
  const showSuccess = useCallback((title: string, message: string, options?: Partial<NotificationOptions>) => {
    return addNotification({
      type: 'success',
      title,
      message,
      playSound: true,
      ...options,
    });
  }, [addNotification]);

  const showError = useCallback((title: string, message: string, options?: Partial<NotificationOptions>) => {
    return addNotification({
      type: 'error',
      title,
      message,
      duration: 0, // Persistent for errors
      playSound: true,
      ...options,
    });
  }, [addNotification]);

  const showWarning = useCallback((title: string, message: string, options?: Partial<NotificationOptions>) => {
    return addNotification({
      type: 'warning',
      title,
      message,
      duration: 7000, // Longer for warnings
      playSound: true,
      ...options,
    });
  }, [addNotification]);

  const showInfo = useCallback((title: string, message: string, options?: Partial<NotificationOptions>) => {
    return addNotification({
      type: 'info',
      title,
      message,
      ...options,
    });
  }, [addNotification]);

  // Request notification permission
  const requestPermission = useCallback(async () => {
    if (WEB_NOTIFICATIONS_MOTHBALLED || isRealDesktop()) return false;
    if ('Notification' in window && Notification.permission === 'default') {
      try {
        const permission = await Notification.requestPermission();
        return permission === 'granted';
      } catch (error) {
        console.warn('Could not request notification permission:', error);
        return false;
      }
    }
    return Notification.permission === 'granted';
  }, []);

  return {
    notifications,
    addNotification,
    removeNotification,
    clearAllNotifications,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    requestPermission,
  };
};