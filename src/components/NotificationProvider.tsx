'use client';

import React, { createContext, useContext, useState } from 'react';
import WindowsNotification, { useWindowsNotifications } from '@/components/WindowsNotification';

interface WindowsNotificationProps {
  keyId?: string;
  id: string;
  type: 'note' | 'task' | 'urgent' | 'success' | 'warning';
  title: string;
  message: string;
  author?: string;
  notes?: Array<{
    message: string;
    author?: string;
    memberName?: string;
    timestamp?: string;
    replyUrl?: string;
    tagLabel?: string;
  }>;
  recipientName?: string;
  memberName?: string;
  timestamp?: string;
  priority?: 'Low' | 'Medium' | 'High' | 'Urgent';
  duration?: number;
  minimizeAfter?: number;
  pendingLabel?: string;
  sound?: boolean;
  soundType?: 'mellow-note' | 'arrow-target' | 'bell' | 'chime' | 'pop' | 'windows-default' | 'success-ding' | 'message-swoosh' | 'alert-beep' | 'coin-drop' | 'bubble-pop' | 'typewriter-ding' | 'glass-ping' | 'wooden-knock' | 'digital-blip' | 'water-drop' | 'silent';
  animation?: 'bounce' | 'slide' | 'fade' | 'pulse';
  followUpDate?: string;
  replyUrl?: string;
  requiresSecondClick?: boolean;
  disableCardClick?: boolean;
  startMinimized?: boolean;
  lockToTray?: boolean;
  tagLabel?: string;
  links?: Array<{ label: string; url: string }>;
  onFollowUpSave?: (date: string) => void;
  onClose?: () => void;
  onClick?: () => void;
}

interface NotificationContextType {
  showNotification: (notification: Omit<WindowsNotificationProps, 'id' | 'onClose'>) => string;
  removeNotification: (id: string) => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const notificationManager = useWindowsNotifications();

  return (
    <NotificationContext.Provider value={notificationManager}>
      {children}
      {/* Render notifications */}
      <div className="fixed bottom-0 right-0 z-50 pointer-events-none">
        <div className="space-y-2 p-4">
          {notificationManager.notifications.map((notification) => (
            <div key={notification.id} className="pointer-events-auto">
              <WindowsNotification {...notification} />
            </div>
          ))}
        </div>
      </div>
    </NotificationContext.Provider>
  );
}

export function useGlobalNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useGlobalNotifications must be used within a NotificationProvider');
  }
  return context;
}