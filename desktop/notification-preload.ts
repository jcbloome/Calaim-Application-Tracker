import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('desktopNotificationPill', {
  open: () => ipcRenderer.send('desktop:openNotifications'),
  dismiss: () => ipcRenderer.send('desktop:dismissPill')
});
