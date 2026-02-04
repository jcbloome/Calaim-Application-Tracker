import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('desktopNotificationPill', {
  open: (url?: string) => ipcRenderer.send('desktop:openNotifications', { url }),
  dismiss: () => ipcRenderer.send('desktop:dismissPill'),
  expand: () => ipcRenderer.send('desktop:expandPill'),
  navigate: (delta: number) => ipcRenderer.send('desktop:navigatePill', { delta }),
  move: (x: number, y: number) => ipcRenderer.send('desktop:movePill', { x, y }),
  getPosition: () => ipcRenderer.invoke('desktop:getPillPosition')
});
