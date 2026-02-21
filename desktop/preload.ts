import { contextBridge, ipcRenderer } from 'electron';

const sendRendererError = (payload: any) => {
  try {
    ipcRenderer.send('desktop:rendererError', payload);
  } catch {
    // ignore
  }
};

contextBridge.exposeInMainWorld('desktopNotifications', {
  getState: () => ipcRenderer.invoke('desktop:getState'),
  setPaused: (paused: boolean) => ipcRenderer.invoke('desktop:setPaused', paused),
  setSnooze: (untilMs: number) => ipcRenderer.invoke('desktop:setSnooze', { untilMs }),
  clearSnooze: () => ipcRenderer.invoke('desktop:clearSnooze'),
  snoozeNote: (noteId: string, untilMs: number) => ipcRenderer.invoke('desktop:snoozeNote', { noteId, untilMs }),
  clearSnoozeNote: (noteId: string) => ipcRenderer.invoke('desktop:clearSnoozeNote', { noteId }),
  muteSender: (senderId: string, untilMs: number) => ipcRenderer.invoke('desktop:muteSender', { senderId, untilMs }),
  clearMuteSender: (senderId: string) => ipcRenderer.invoke('desktop:clearMuteSender', { senderId }),
  openStaffStatus: () => ipcRenderer.invoke('desktop:openStaffStatus'),
  refreshApp: () => ipcRenderer.invoke('desktop:refreshApp'),
  notify: (payload: { title: string; body: string; openOnNotify?: boolean; actionUrl?: string }) =>
    ipcRenderer.invoke('desktop:notify', payload),
  setPendingCount: (count: number) => ipcRenderer.send('desktop:setPendingCount', count),
  setChatPendingCount: (count: number) => ipcRenderer.send('desktop:setChatPendingCount', count),
  setPillSummary: (payload: {
    count: number;
    openPanel?: boolean;
    notes?: Array<{
      title: string;
      message: string;
      kind?: 'note' | 'docs' | 'cs';
      source?: string;
      clientId2?: string;
      author?: string;
      recipientName?: string;
      memberName?: string;
      timestamp?: string;
      noteId?: string;
      senderId?: string;
      replyUrl?: string;
      actionUrl?: string;
    }>;
    title?: string;
    message?: string;
    author?: string;
    recipientName?: string;
    memberName?: string;
    timestamp?: string;
    replyUrl?: string;
    actionUrl?: string;
  }) =>
    ipcRenderer.send('desktop:setPillSummary', payload),
  setReviewPillSummary: (payload: {
    count: number;
    openPanel?: boolean;
    notes?: Array<{
      title: string;
      message: string;
      kind?: 'note' | 'docs' | 'cs';
      memberName?: string;
      timestamp?: string;
      actionUrl?: string;
    }>;
  }) => ipcRenderer.send('desktop:setReviewPillSummary', payload),
  checkForUpdates: () => ipcRenderer.invoke('desktop:checkForUpdates'),
  onChange: (callback: (state: any) => void) => {
    const handler = (_event: any, state: any) => callback(state);
    ipcRenderer.on('desktop:state', handler);
    return () => ipcRenderer.removeListener('desktop:state', handler);
  },
  onExpand: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('desktop:expand', handler);
    return () => ipcRenderer.removeListener('desktop:expand', handler);
  },
  onQuickReply: (callback: (payload: { noteId?: string; senderId?: string; message: string }) => void) => {
    const handler = (_event: any, payload: { noteId?: string; senderId?: string; message: string }) => callback(payload);
    ipcRenderer.on('desktop:quickReply', handler);
    return () => ipcRenderer.removeListener('desktop:quickReply', handler);
  }
});

// Capture client-side exceptions that show the "Application error" screen.
try {
  window.addEventListener('error', (event: any) => {
    sendRendererError({
      type: 'error',
      message: String(event?.message || 'Unhandled error'),
      filename: event?.filename,
      lineno: event?.lineno,
      colno: event?.colno,
      stack: event?.error?.stack,
      href: typeof location !== 'undefined' ? String(location.href) : undefined,
      ts: Date.now(),
    });
  });
  window.addEventListener('unhandledrejection', (event: any) => {
    const reason = event?.reason;
    sendRendererError({
      type: 'unhandledrejection',
      message: reason instanceof Error ? reason.message : String(reason || 'Unhandled rejection'),
      stack: reason instanceof Error ? reason.stack : undefined,
      href: typeof location !== 'undefined' ? String(location.href) : undefined,
      ts: Date.now(),
    });
  });
} catch {
  // ignore
}
