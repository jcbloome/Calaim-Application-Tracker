'use client';

import { useEffect } from 'react';
import { useGlobalNotifications } from '@/components/NotificationProvider';

declare global {
  interface Window {
    __devWebNotifyDocs?: () => void;
    __devWebNotifyCs?: () => void;
    __devWebNotifyBoth?: () => void;
  }
}

function isLocalhostHost() {
  if (typeof window === 'undefined') return false;
  const hostname = window.location.hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

export function WebNotificationsDevTester() {
  const { showNotification } = useGlobalNotifications();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (process.env.NODE_ENV === 'production' && !isLocalhostHost()) return;

    const showDocs = () => {
      showNotification({
        keyId: 'dev-docs-received',
        type: 'success',
        title: 'Documents received',
        message: '2 uploads to acknowledge',
        author: 'System',
        recipientName: 'Staff',
        duration: 0,
        minimizeAfter: 12000,
        startMinimized: true,
        pendingLabel: 'Documents received · 2 uploads',
        disableCardClick: true,
        notes: [
          {
            message: 'Documents received — John Doe (2)',
            author: 'System',
            memberName: 'John Doe',
            timestamp: new Date().toLocaleString(),
          },
          {
            message: 'Documents received — Jane Smith (1)',
            author: 'System',
            memberName: 'Jane Smith',
            timestamp: new Date(Date.now() - 60_000).toLocaleString(),
          },
        ],
        onClick: () => {
          if (typeof window === 'undefined') return;
          window.location.href = '/admin/applications?review=docs';
        },
      });
    };

    const showCs = () => {
      showNotification({
        keyId: 'dev-cs-received',
        type: 'task',
        title: 'CS Summary received',
        message: '1 CS Summary to review',
        author: 'System',
        recipientName: 'Staff',
        duration: 0,
        minimizeAfter: 12000,
        startMinimized: true,
        pendingLabel: 'CS Summary received · 1 to review',
        disableCardClick: true,
        notes: [
          {
            message: 'CS Summary received — John Doe',
            author: 'System',
            memberName: 'John Doe',
            timestamp: new Date().toLocaleString(),
          },
        ],
        onClick: () => {
          if (typeof window === 'undefined') return;
          window.location.href = '/admin/applications?review=cs';
        },
      });
    };

    const showBoth = () => {
      showNotification({
        keyId: 'dev-review-both',
        type: 'warning',
        title: 'Review items received',
        message: '1 CS Summary to review • 2 uploads to acknowledge',
        author: 'System',
        recipientName: 'Staff',
        duration: 0,
        minimizeAfter: 12000,
        startMinimized: true,
        pendingLabel: 'Review items received · multiple',
        disableCardClick: true,
        notes: [
          {
            message: 'CS Summary received — John Doe',
            author: 'System',
            memberName: 'John Doe',
            timestamp: new Date().toLocaleString(),
          },
          {
            message: 'Documents received — Jane Smith (2)',
            author: 'System',
            memberName: 'Jane Smith',
            timestamp: new Date(Date.now() - 60_000).toLocaleString(),
          },
        ],
        onClick: () => {
          if (typeof window === 'undefined') return;
          window.location.href = '/admin/applications?review=docs';
        },
      });
    };

    // Expose helpers for quick manual testing in devtools.
    window.__devWebNotifyDocs = showDocs;
    window.__devWebNotifyCs = showCs;
    window.__devWebNotifyBoth = showBoth;

    // Keyboard shortcuts:
    // Ctrl+Alt+D -> docs, Ctrl+Alt+C -> cs, Ctrl+Alt+B -> both
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || !event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'd') {
        event.preventDefault();
        showDocs();
      } else if (key === 'c') {
        event.preventDefault();
        showCs();
      } else if (key === 'b') {
        event.preventDefault();
        showBoth();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [showNotification]);

  return null;
}

