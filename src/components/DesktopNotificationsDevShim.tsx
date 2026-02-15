/* eslint-disable no-console */
'use client';

import { useEffect } from 'react';

type PillNote = {
  title: string;
  message: string;
  kind?: 'note' | 'docs' | 'cs';
  author?: string;
  recipientName?: string;
  memberName?: string;
  timestamp?: string;
  noteId?: string;
  senderId?: string;
  replyUrl?: string;
  actionUrl?: string;
};

type PillSummaryPayload = {
  count: number;
  notes?: PillNote[];
  title?: string;
  message?: string;
  author?: string;
  recipientName?: string;
  memberName?: string;
  timestamp?: string;
  replyUrl?: string;
  actionUrl?: string;
};

type ReviewSummaryPayload = {
  count: number;
  notes?: Array<{
    title: string;
    message: string;
    kind?: 'note' | 'docs' | 'cs';
    memberName?: string;
    timestamp?: string;
    actionUrl?: string;
  }>;
};

type NotifyPayload = { title: string; body: string; openOnNotify?: boolean };

export function DesktopNotificationsDevShim() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const hostname = window.location.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

    // Only install shim in local dev (or localhost), and only when Electron preload isn't present.
    if (process.env.NODE_ENV === 'production' && !isLocalhost) return;
    if ((window as any).desktopNotifications) return;

    const emit = (name: string, detail: any) => {
      try {
        window.dispatchEvent(new CustomEvent(name, { detail }));
      } catch {
        // ignore
      }
    };

    (window as any).desktopNotifications = {
      __shim: true,
      getState: async () => ({ pausedByUser: false, isWithinBusinessHours: true, allowAfterHours: true, effectivePaused: false }),
      setPaused: async (_paused: boolean) => ({ pausedByUser: false, isWithinBusinessHours: true, allowAfterHours: true, effectivePaused: false }),
      notify: async (payload: NotifyPayload) => {
        emit('devDesktop:notify', payload);
        return true;
      },
      setPendingCount: (count: number) => emit('devDesktop:pendingCount', { count }),
      setPillSummary: (payload: PillSummaryPayload) => emit('devDesktop:pillSummary', payload),
      setReviewPillSummary: (payload: ReviewSummaryPayload) => emit('devDesktop:reviewSummary', payload),
      onChange: (callback: (state: any) => void) => {
        const handler = (event: any) => callback(event?.detail);
        window.addEventListener('devDesktop:state', handler);
        return () => window.removeEventListener('devDesktop:state', handler);
      },
      onExpand: (callback: () => void) => {
        const handler = () => callback();
        window.addEventListener('devDesktop:expand', handler);
        return () => window.removeEventListener('devDesktop:expand', handler);
      },
      onQuickReply: (callback: (payload: { noteId?: string; senderId?: string; message: string }) => void) => {
        const handler = (event: any) => callback(event?.detail);
        window.addEventListener('devDesktop:quickReply', handler);
        return () => window.removeEventListener('devDesktop:quickReply', handler);
      },
    };

    console.log('[devDesktop] Installed desktopNotifications shim');
    return () => {
      // Keep shim installed for the session; do not delete to avoid churn.
    };
  }, []);

  return null;
}

