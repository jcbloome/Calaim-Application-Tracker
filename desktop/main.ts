import { app, BrowserWindow, Tray, Menu, Notification, ipcMain } from 'electron';
import path from 'path';
import { autoUpdater } from 'electron-updater';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

const isDev = !app.isPackaged;
const appUrl = process.env.DESKTOP_APP_URL
  || (isDev ? 'http://localhost:3000/admin/my-notes' : 'https://connectcalaim.com/admin/my-notes');
const updateUrl = process.env.DESKTOP_UPDATE_URL || 'https://connectcalaim.com/desktop/updates';

const notificationState = {
  pausedByUser: false,
  isWithinBusinessHours: true,
  allowAfterHours: true,
  effectivePaused: false
};

const broadcastState = () => {
  if (!mainWindow) return;
  mainWindow.webContents.send('desktop:state', { ...notificationState });
};

const computeEffectivePaused = () => {
  notificationState.effectivePaused = notificationState.pausedByUser;
};

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadURL(appUrl).catch(() => undefined);

  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow?.hide();
  });
};

const createTray = () => {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'assets', 'tray.ico')
    : path.join(__dirname, 'assets', 'tray.ico');
  tray = new Tray(iconPath);
  tray.setToolTip('Connect CalAIM Desktop');

  const menu = Menu.buildFromTemplate([
    {
      label: 'Open',
      click: () => {
        if (!mainWindow) return;
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send('desktop:expand');
      }
    },
    {
      label: 'Check for Updates',
      click: () => {
        autoUpdater.checkForUpdatesAndNotify().catch(() => undefined);
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(menu);
  tray.on('click', () => {
    if (!mainWindow) return;
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('desktop:expand');
  });
};

const configureAutoUpdater = () => {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.setFeedURL({ provider: 'generic', url: updateUrl });
  autoUpdater.checkForUpdatesAndNotify().catch(() => undefined);
};

ipcMain.handle('desktop:getState', () => {
  computeEffectivePaused();
  return { ...notificationState };
});

ipcMain.handle('desktop:setPaused', (_event, paused: boolean) => {
  notificationState.pausedByUser = Boolean(paused);
  computeEffectivePaused();
  broadcastState();
  return { ...notificationState };
});

ipcMain.handle('desktop:notify', (_event, payload: { title: string; body: string; openOnNotify?: boolean }) => {
  computeEffectivePaused();
  if (notificationState.effectivePaused) return false;

  const notice = new Notification({
    title: payload.title,
    body: payload.body
  });
  notice.show();

  if (payload.openOnNotify && mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('desktop:expand');
  }
  return true;
});

ipcMain.on('desktop:setPendingCount', (_event, count: number) => {
  if (tray) {
    tray.setToolTip(`Connect CalAIM Desktop (${count} pending)`);
  }
});

ipcMain.handle('desktop:checkForUpdates', async () => {
  await autoUpdater.checkForUpdatesAndNotify();
});

app.whenReady().then(() => {
  computeEffectivePaused();
  createWindow();
  createTray();
  configureAutoUpdater();
  broadcastState();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (!mainWindow) {
    createWindow();
  } else {
    mainWindow.show();
  }
});
