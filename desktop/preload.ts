import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('desktopNotifications', {
  getState: () => ipcRenderer.invoke('desktop:getState'),
  setPaused: (paused: boolean) => ipcRenderer.invoke('desktop:setPaused', paused),
  notify: (payload: { title: string; body: string; openOnNotify?: boolean; actionUrl?: string }) =>
    ipcRenderer.invoke('desktop:notify', payload),
  setPendingCount: (count: number) => ipcRenderer.send('desktop:setPendingCount', count),
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
