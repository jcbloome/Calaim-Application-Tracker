import { app, BrowserWindow, Tray, Menu, Notification, ipcMain, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import { autoUpdater } from 'electron-updater';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let notificationWindow: BrowserWindow | null = null;
let notificationTimer: NodeJS.Timeout | null = null;
let isQuitting = false;

let pillSummary = {
  count: 0,
  title: 'Connections Note',
  message: '',
  author: '',
  memberName: '',
  timestamp: '',
  replyUrl: undefined as string | undefined,
  actionUrl: '/admin/my-notes'
};
let pillMode: 'minimized' | 'expanded' = 'minimized';

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

const renderNotificationPill = () => {
  const safeTitle = escapeHtml(pillSummary.title || 'Connections Note');
  const safeBody = escapeHtml(pillSummary.message || '');
  const safeReply = pillSummary.replyUrl ? escapeHtml(pillSummary.replyUrl) : '';
  const safeAction = escapeHtml(pillSummary.actionUrl || '/admin/my-notes');
  const countLabel = pillSummary.count === 1
    ? '1 priority note'
    : `${pillSummary.count} priority notes`;
  const metaParts = [pillSummary.author, pillSummary.memberName, pillSummary.timestamp]
    .map((part) => escapeHtml(part || ''))
    .filter(Boolean);
  const metaLabel = metaParts.join(' · ');

  if (!notificationWindow) {
    notificationWindow = new BrowserWindow({
      width: 380,
      height: pillMode === 'expanded' ? 210 : 72,
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
            margin: 10px;
            padding: 12px 14px;
            border-radius: 16px;
            background: #ffffff;
            border: 1px solid #e5e7eb;
            box-shadow: 0 16px 30px rgba(0, 0, 0, 0.18);
          }
          .minimized {
            display: flex;
            align-items: center;
            justify-content: space-between;
            cursor: pointer;
          }
          .minimized .label {
            font-size: 12px;
            color: #1f2937;
            font-weight: 600;
          }
          .minimized .count {
            font-size: 12px;
            color: #2563eb;
            font-weight: 600;
          }
          .title {
            font-weight: 700;
            font-size: 14px;
            color: #0f172a;
            margin-bottom: 6px;
          }
          .body {
            font-size: 12px;
            color: #334155;
            line-height: 1.4;
          }
          .meta {
            margin-top: 6px;
            font-size: 11px;
            color: #64748b;
          }
          .actions {
            display: flex;
            gap: 8px;
            margin-top: 10px;
          }
          .btn {
            font-size: 11px;
            padding: 6px 10px;
            border-radius: 10px;
            border: 1px solid #e2e8f0;
            background: #f8fafc;
            cursor: pointer;
          }
          .btn.primary {
            background: #2563eb;
            color: #ffffff;
            border-color: #2563eb;
          }
          .close {
            position: absolute;
            right: 16px;
            top: 12px;
            font-size: 12px;
            color: #6b7280;
            cursor: pointer;
          }
        </style>
      </head>
      <body>
        <div class="pill ${pillMode === 'expanded' ? '' : 'minimized'}" id="pill" data-mode="${pillMode}">
          ${
            pillMode === 'expanded'
              ? `<div class="title">${safeTitle}</div>
                 <div class="body">${safeBody}</div>
                 ${metaLabel ? `<div class="meta">${metaLabel}</div>` : ''}
                 <div class="meta">${countLabel}</div>
                 <div class="actions">
                   ${safeReply ? `<button class="btn" id="reply">Reply</button>` : ''}
                   <button class="btn primary" id="open">Go to Notes</button>
                   <button class="btn" id="closeBtn">Close</button>
                 </div>`
              : `<div class="label">Priority notes pending</div>
                 <div class="count">${countLabel}</div>`
          }
        </div>
        ${pillMode === 'expanded' ? `<div class="close" id="close">✕</div>` : ''}
        <script>
          const pill = document.getElementById('pill');
          const mode = pill?.dataset?.mode;
          pill.addEventListener('click', () => {
            if (mode === 'expanded') {
              window.desktopNotificationPill?.open?.("${safeAction}");
              return;
            }
            window.desktopNotificationPill?.expand?.();
          });
          const closeBtn = document.getElementById('close');
          if (closeBtn) {
            closeBtn.addEventListener('click', (event) => {
              event.stopPropagation();
              window.desktopNotificationPill?.dismiss?.();
            });
          }
          const closeAction = document.getElementById('closeBtn');
          if (closeAction) {
            closeAction.addEventListener('click', (event) => {
              event.stopPropagation();
              window.desktopNotificationPill?.dismiss?.();
            });
          }
          const open = document.getElementById('open');
          if (open) {
            open.addEventListener('click', (event) => {
              event.stopPropagation();
              window.desktopNotificationPill?.open?.("${safeAction}");
            });
          }
          const reply = document.getElementById('reply');
          if (reply) {
            reply.addEventListener('click', (event) => {
              event.stopPropagation();
              window.desktopNotificationPill?.open?.("${safeReply}");
            });
          }
        </script>
      </body>
    </html>
  `;

  notificationWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch(() => undefined);
  notificationWindow.showInactive();

  if (notificationTimer) clearTimeout(notificationTimer);
  notificationTimer = setTimeout(() => {
    if (pillSummary.count > 0) {
      pillMode = 'minimized';
      renderNotificationPill();
    } else {
      closeNotificationWindow();
    }
  }, 12000);
};

const showExpandedPill = () => {
  pillMode = 'expanded';
  renderNotificationPill();
};

const showMinimizedPill = () => {
  if (pillSummary.count <= 0) {
    closeNotificationWindow();
    return;
  }
  pillMode = 'minimized';
  renderNotificationPill();
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

  pillSummary = {
    ...pillSummary,
    title: payload.title,
    message: payload.body
  };
  showExpandedPill();

  if (payload.openOnNotify && mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('desktop:expand');
  }
  return true;
});

ipcMain.on('desktop:openNotifications', (_event, payload?: { url?: string }) => {
  if (!mainWindow) return;
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send('desktop:expand');
  if (payload?.url) {
    mainWindow.loadURL(payload.url.startsWith('http') ? payload.url : `${appUrl}${payload.url}`).catch(() => undefined);
  }
  closeNotificationWindow();
});

ipcMain.on('desktop:dismissPill', () => {
  showMinimizedPill();
});

ipcMain.on('desktop:expandPill', () => {
  showExpandedPill();
});

ipcMain.on('desktop:setPillSummary', (_event, payload: { count: number; title: string; message: string; author?: string; memberName?: string; timestamp?: string; replyUrl?: string; actionUrl?: string }) => {
  pillSummary = {
    count: payload.count,
    title: payload.title || pillSummary.title,
    message: payload.message || pillSummary.message,
    author: payload.author || '',
    memberName: payload.memberName || '',
    timestamp: payload.timestamp || '',
    replyUrl: payload.replyUrl,
    actionUrl: payload.actionUrl || '/admin/my-notes'
  };
  if (pillSummary.count > 0) {
    showMinimizedPill();
  } else {
    closeNotificationWindow();
  }
});

ipcMain.on('desktop:setPendingCount', (_event, count: number) => {
  if (tray) {
    tray.setToolTip(`Connect CalAIM Desktop (${count} pending)`);
  }
  pillSummary.count = count;
  if (count > 0) {
    showMinimizedPill();
  } else {
    closeNotificationWindow();
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
