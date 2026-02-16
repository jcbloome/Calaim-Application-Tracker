import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('desktopNotificationPill', {
  open: (url?: string) => ipcRenderer.send('desktop:openNotifications', { url }),
  dismiss: () => ipcRenderer.send('desktop:dismissPill'),
  hide: () => ipcRenderer.send('desktop:hidePill'),
  expand: () => ipcRenderer.send('desktop:expandPill'),
  navigate: (delta: number) => ipcRenderer.send('desktop:navigatePill', { delta }),
  sendReply: (payload: { noteId?: string; senderId?: string; message: string }) =>
    ipcRenderer.send('desktop:quickReply', payload),
  move: (x: number, y: number) => ipcRenderer.send('desktop:movePill', { x, y }),
  getPosition: () => ipcRenderer.invoke('desktop:getPillPosition'),

  onNotifyCard: (callback: (payload: any) => void) => {
    const handler = (_event: any, payload: any) => callback(payload);
    ipcRenderer.on('desktop:notifyCard', handler);
    return () => ipcRenderer.removeListener('desktop:notifyCard', handler);
  },
  onPillState: (callback: (payload: any) => void) => {
    const handler = (_event: any, payload: any) => callback(payload);
    ipcRenderer.on('desktop:pillState', handler);
    return () => ipcRenderer.removeListener('desktop:pillState', handler);
  }
});
