import { app, BrowserWindow, Tray, Menu, Notification, ipcMain, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import { autoUpdater } from 'electron-updater';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let notificationWindow: BrowserWindow | null = null;
let notificationTimer: NodeJS.Timeout | null = null;
let isQuitting = false;

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
}

const isDev = !app.isPackaged;
const appUrl = process.env.DESKTOP_APP_URL
  || (isDev ? 'http://localhost:3000/admin/my-notes' : 'https://connectcalaim.com/admin/my-notes');
const updateUrl = process.env.DESKTOP_UPDATE_URL
  || 'https://github.com/jcbloome/Calaim-Application-Tracker/releases';

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
  const pausedForHours = !notificationState.allowAfterHours && !notificationState.isWithinBusinessHours;
  notificationState.effectivePaused = notificationState.pausedByUser || pausedForHours;
};

const buildTrayMenu = () => {
  const statusLabel = notificationState.effectivePaused ? 'Silent' : 'Active';
  return Menu.buildFromTemplate([
    {
      label: 'Open Notifications',
      click: () => {
        if (!mainWindow) return;
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send('desktop:expand');
      }
    },
    { type: 'separator' },
    {
      label: `Business hours: ${notificationState.isWithinBusinessHours ? 'Active' : 'Silent'}`,
      enabled: false
    },
    {
      label: notificationState.allowAfterHours ? 'Disable After-Hours Alerts' : 'Enable After-Hours Alerts',
      click: () => {
        notificationState.allowAfterHours = !notificationState.allowAfterHours;
        computeEffectivePaused();
        broadcastState();
        updateTrayMenu();
      }
    },
    {
      label: notificationState.pausedByUser ? 'Resume Notifications' : 'Pause Notifications',
      click: () => {
        notificationState.pausedByUser = !notificationState.pausedByUser;
        computeEffectivePaused();
        broadcastState();
        updateTrayMenu();
      }
    },
    {
      label: `Status: ${statusLabel}`,
      enabled: false
    },
    { type: 'separator' },
    {
      label: `About Connect CalAIM (v${app.getVersion()})`,
      click: async () => {
        const result = await dialog.showMessageBox({
          type: 'info',
          title: 'About Connect CalAIM',
          message: 'Connect CalAIM Desktop',
          detail: `Version: ${app.getVersion()}\nUpdate feed: ${updateUrl}`,
          buttons: ['Check for Updates', 'Close'],
          defaultId: 0,
          cancelId: 1
        });
        if (result.response === 0) {
          autoUpdater.checkForUpdatesAndNotify().catch(() => undefined);
        }
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
};

const updateTrayMenu = () => {
  if (!tray) return;
  tray.setContextMenu(buildTrayMenu());
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

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const closeNotificationWindow = () => {
  if (notificationTimer) {
    clearTimeout(notificationTimer);
    notificationTimer = null;
  }
  if (notificationWindow) {
    notificationWindow.close();
    notificationWindow = null;
  }
};

const showNotificationPill = (payload: { title: string; body: string }) => {
  const safeTitle = escapeHtml(payload.title || 'Notification');
  const safeBody = escapeHtml(payload.body || '');

  if (!notificationWindow) {
    notificationWindow = new BrowserWindow({
      width: 360,
      height: 120,
      frame: false,
      transparent: true,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: true,
      webPreferences: {
        preload: path.join(__dirname, 'notification-preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    notificationWindow.setAlwaysOnTop(true, 'screen-saver');
    notificationWindow.setVisibleOnAllWorkspaces(true);
    notificationWindow.on('closed', () => {
      notificationWindow = null;
    });
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body {
            margin: 0;
            font-family: "Segoe UI", Tahoma, sans-serif;
            background: transparent;
          }
          .pill {
            margin: 12px;
            padding: 12px 14px;
            border-radius: 14px;
            background: rgba(255, 255, 255, 0.98);
            border: 1px solid rgba(209, 213, 219, 0.9);
            box-shadow: 0 12px 24px rgba(0, 0, 0, 0.18);
            cursor: pointer;
          }
          .title {
            font-weight: 600;
            font-size: 13px;
            color: #111827;
            margin-bottom: 4px;
          }
          .body {
            font-size: 12px;
            color: #374151;
            line-height: 1.3;
          }
          .actions {
            margin-top: 6px;
            font-size: 11px;
            color: #2563eb;
          }
          .close {
            position: absolute;
            right: 18px;
            top: 14px;
            font-size: 12px;
            color: #6b7280;
            cursor: pointer;
          }
        </style>
      </head>
      <body>
        <div class="pill" id="pill">
          <div class="title">${safeTitle}</div>
          <div class="body">${safeBody}</div>
          <div class="actions">Open My Notifications</div>
        </div>
        <div class="close" id="close">✕</div>
        <script>
          const pill = document.getElementById('pill');
          const closeBtn = document.getElementById('close');
          pill.addEventListener('click', () => {
            window.desktopNotificationPill?.open?.();
          });
          closeBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            window.desktopNotificationPill?.dismiss?.();
          });
        </script>
      </body>
    </html>
  `;

  notificationWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch(() => undefined);
  notificationWindow.showInactive();

  if (notificationTimer) clearTimeout(notificationTimer);
  notificationTimer = setTimeout(() => {
    closeNotificationWindow();
  }, 12000);
};

const createTray = () => {
  const packagedIcon = path.join(app.getAppPath(), 'assets', 'tray.ico');
  const resourcesIcon = path.join(process.resourcesPath, 'assets', 'tray.ico');
  const devIcon = path.join(__dirname, 'assets', 'tray.ico');
  const iconPath = fs.existsSync(packagedIcon)
    ? packagedIcon
    : fs.existsSync(resourcesIcon)
      ? resourcesIcon
      : devIcon;
  tray = new Tray(iconPath);
  tray.setToolTip('Connect CalAIM Desktop');

  updateTrayMenu();
  tray.on('click', () => {
    if (!mainWindow) return;
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('desktop:expand');
  });
};

const showAboutDialog = async () => {
  await dialog.showMessageBox({
    type: 'info',
    title: 'About Connect CalAIM',
    message: 'Connect CalAIM Desktop',
    detail: `Version: ${app.getVersion()}\nUpdate feed: ${updateUrl}`,
    buttons: ['Check for Updates', 'Close'],
    defaultId: 0,
    cancelId: 1
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.checkForUpdatesAndNotify().catch(() => undefined);
    }
  });
};

const createAppMenu = () => {
  const template = [
    {
      label: 'Connect CalAIM',
      submenu: [
        { label: 'About Connect CalAIM', click: showAboutDialog },
        { label: 'Check for Updates', click: () => autoUpdater.checkForUpdatesAndNotify().catch(() => undefined) },
        { type: 'separator' as const },
        { label: 'Quit', click: () => { isQuitting = true; app.quit(); } }
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
};

const configureAutoUpdater = () => {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
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
  updateTrayMenu();
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

  showNotificationPill({ title: payload.title, body: payload.body });

  if (payload.openOnNotify && mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('desktop:expand');
  }
  return true;
});

ipcMain.on('desktop:openNotifications', () => {
  if (!mainWindow) return;
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send('desktop:expand');
  closeNotificationWindow();
});

ipcMain.on('desktop:dismissPill', () => {
  closeNotificationWindow();
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
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('desktop:expand');
  });

  computeEffectivePaused();
  createAppMenu();
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
