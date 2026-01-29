import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';

type DesktopNotificationState = {
  pausedByUser: boolean;
  isWithinBusinessHours: boolean;
  effectivePaused: boolean;
};

contextBridge.exposeInMainWorld('desktopNotifications', {
  getState: (): Promise<DesktopNotificationState> =>
    ipcRenderer.invoke('desktop-notifications:getState'),
  setPaused: (paused: boolean): Promise<DesktopNotificationState> =>
    ipcRenderer.invoke('desktop-notifications:setPaused', paused),
  notify: (payload: { title: string; body: string; openOnNotify?: boolean }): Promise<boolean> =>
    ipcRenderer.invoke('desktop-notifications:notify', payload),
  setPendingCount: (count: number) => {
    ipcRenderer.send('desktop-notifications:pending-count', count);
  },
  onChange: (callback: (state: DesktopNotificationState) => void) => {
    const handler = (_event: IpcRendererEvent, state: DesktopNotificationState) => {
      callback(state);
    };
    ipcRenderer.on('desktop-notifications:update', handler);
    return () => ipcRenderer.removeListener('desktop-notifications:update', handler);
  },
  onExpand: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('desktop-notifications:expand', handler);
    return () => ipcRenderer.removeListener('desktop-notifications:expand', handler);
  }
});
