import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('desktopNotifications', {
  getState: () => ipcRenderer.invoke('desktop:getState'),
  setPaused: (paused: boolean) => ipcRenderer.invoke('desktop:setPaused', paused),
  notify: (payload: { title: string; body: string; openOnNotify?: boolean }) =>
    ipcRenderer.invoke('desktop:notify', payload),
  setPendingCount: (count: number) => ipcRenderer.send('desktop:setPendingCount', count),
  setPillSummary: (payload: { count: number; title: string; message: string; author?: string; memberName?: string; timestamp?: string; replyUrl?: string; actionUrl?: string }) =>
    ipcRenderer.send('desktop:setPillSummary', payload),
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
  }
});
