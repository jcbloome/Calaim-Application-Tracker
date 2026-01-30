import { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, Notification, screen } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import path from 'path';
import Store from 'electron-store';

type DesktopNotificationState = {
  pausedByUser: boolean;
  isWithinBusinessHours: boolean;
  allowAfterHours: boolean;
  effectivePaused: boolean;
};

type DesktopStore = {
  pausedByUser: boolean;
  allowAfterHours: boolean;
  overlayPosition?: { x: number; y: number };
};

const ADMIN_SETTINGS_URL = process.env.CALAIM_DESKTOP_URL || 'https://connectcalaim.com/admin/notification-settings';
const NOTIFICATION_URL = process.env.CALAIM_TRAY_NOTIFICATION_URL || 'https://connectcalaim.com/admin/login?redirect=/admin/my-notes';
const SHOW_ADMIN_LINK = process.env.CALAIM_TRAY_ADMIN_LINK === 'true';
const BUSINESS_START_MINUTES = 12 * 60; // 12:00 ET
const BUSINESS_END_MINUTES = 20 * 60; // 20:00 ET

const store = new Store<DesktopStore>();

let mainWindow: BrowserWindow | null = null;
let notificationWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let pendingCount = 0;
let pausedByUser = store.get('pausedByUser', false);
let allowAfterHours = store.get('allowAfterHours', false);
let isWithinBusinessHours = true;
let scheduleTimeout: NodeJS.Timeout | null = null;
let isQuitting = false;
let overlayMoveTimeout: NodeJS.Timeout | null = null;
let overlayDragOffset: { x: number; y: number } | null = null;

const resolveTrayIconPath = () => {
  const candidatePaths = [
    process.env.CALAIM_TRAY_ICON,
    path.join(__dirname, 'assets', 'tray.ico'),
    path.join(__dirname, '..', 'assets', 'tray.ico'),
    path.join(__dirname, '..', '..', 'public', 'calaimlogopdf.png'),
    path.join(__dirname, '..', '..', 'public', 'icon.svg')
  ].filter(Boolean) as string[];

  for (const iconPath of candidatePaths) {
    const image = nativeImage.createFromPath(iconPath);
    if (!image.isEmpty()) {
      return iconPath;
    }
  }

  return null;
};

const resolveTrayIcon = () => {
  const iconPath = resolveTrayIconPath();
  if (iconPath) {
    return nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  }

  return nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/wwAAgMBAp5L5gAAAABJRU5ErkJggg=='
  );
};

const getDefaultOverlayPosition = (width: number, height: number) => {
  const { workArea } = screen.getPrimaryDisplay();
  return {
    x: Math.max(workArea.x, workArea.x + workArea.width - width - 16),
    y: Math.max(workArea.y, workArea.y + workArea.height - height - 16)
  };
};

const resolveOverlayPosition = (width: number, height: number) => {
  const { workArea } = screen.getPrimaryDisplay();
  const saved = store.get('overlayPosition');
  if (!saved || !Number.isFinite(saved.x) || !Number.isFinite(saved.y)) {
    return getDefaultOverlayPosition(width, height);
  }
  const maxX = workArea.x + workArea.width - width;
  const maxY = workArea.y + workArea.height - height;
  return {
    x: Math.min(Math.max(saved.x, workArea.x), maxX),
    y: Math.min(Math.max(saved.y, workArea.y), maxY)
  };
};

const getEtNow = () => {
  return new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })
  );
};

const computeBusinessWindow = () => {
  const nowEt = getEtNow();
  const minutesNow = nowEt.getHours() * 60 + nowEt.getMinutes();
  const within = minutesNow >= BUSINESS_START_MINUTES && minutesNow < BUSINESS_END_MINUTES;

  const nextChange = new Date(nowEt);
  if (within) {
    nextChange.setHours(Math.floor(BUSINESS_END_MINUTES / 60), BUSINESS_END_MINUTES % 60, 0, 0);
  } else if (minutesNow < BUSINESS_START_MINUTES) {
    nextChange.setHours(Math.floor(BUSINESS_START_MINUTES / 60), BUSINESS_START_MINUTES % 60, 0, 0);
  } else {
    nextChange.setDate(nextChange.getDate() + 1);
    nextChange.setHours(Math.floor(BUSINESS_START_MINUTES / 60), BUSINESS_START_MINUTES % 60, 0, 0);
  }

  const msUntilChange = Math.max(nextChange.getTime() - nowEt.getTime(), 60 * 1000);
  return { within, msUntilChange };
};

const getState = (): DesktopNotificationState => ({
  pausedByUser,
  isWithinBusinessHours,
  allowAfterHours,
  effectivePaused: pausedByUser || (!isWithinBusinessHours && !allowAfterHours)
});

const broadcastState = () => {
  if (mainWindow) {
    mainWindow.webContents.send('desktop-notifications:update', getState());
  }
  if (notificationWindow) {
    notificationWindow.webContents.send('desktop-notifications:update', getState());
  }
  updateOverlay();
};

const setPausedByUser = (nextPaused: boolean) => {
  pausedByUser = nextPaused;
  store.set('pausedByUser', pausedByUser);
  updateTrayMenu();
  broadcastState();
};

const setAllowAfterHours = (nextAllow: boolean) => {
  allowAfterHours = nextAllow;
  store.set('allowAfterHours', allowAfterHours);
  updateTrayMenu();
  broadcastState();
};

const updateBusinessHours = () => {
  const { within, msUntilChange } = computeBusinessWindow();
  isWithinBusinessHours = within;

  updateTrayMenu();
  broadcastState();

  if (scheduleTimeout) {
    clearTimeout(scheduleTimeout);
  }
  scheduleTimeout = setTimeout(updateBusinessHours, msUntilChange);
};

const createTrayIcon = () => {
  if (tray) return;
  const trayImage = resolveTrayIcon();
  tray = new Tray(trayImage);
  tray.setToolTip('Connect CalAIM Desktop');
  tray.on('click', () => {
    if (!tray) return;
    tray.popUpContextMenu();
  });
  tray.on('right-click', () => {
    if (!tray) return;
    tray.popUpContextMenu();
  });
  updateTrayMenu();
};

const resetOverlayPosition = () => {
  store.delete('overlayPosition');
  if (!overlayWindow) return;
  const width = overlayWindow.getBounds().width;
  const height = overlayWindow.getBounds().height;
  const { x, y } = getDefaultOverlayPosition(width, height);
  overlayWindow.setPosition(x, y);
};

const persistOverlayPosition = () => {
  if (!overlayWindow) return;
  const [nextX, nextY] = overlayWindow.getPosition();
  store.set('overlayPosition', { x: nextX, y: nextY });
};

const updateTrayMenu = () => {
  if (!tray) return;
  const state = getState();
  const baseMenu: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Open Notifications',
      click: () => {
        if (!notificationWindow) {
          createNotificationWindow();
        }
        notificationWindow?.show();
        notificationWindow?.focus();
      }
    },
    {
      label: 'Reset Notification Pill Position',
      click: () => resetOverlayPosition()
    },
    { type: 'separator' },
    {
      label: state.isWithinBusinessHours ? 'Business hours: Active' : 'Business hours: Silent',
      enabled: false
    },
    { type: 'separator' },
    {
      label: allowAfterHours ? 'Disable After-Hours Alerts' : 'Enable After-Hours Alerts',
      click: () => setAllowAfterHours(!allowAfterHours)
    },
    {
      label: pausedByUser ? 'Resume Notifications' : 'Pause Notifications',
      click: () => setPausedByUser(!pausedByUser)
    },
    {
      label: state.effectivePaused ? 'Status: Silent' : 'Status: Active',
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ];

  if (SHOW_ADMIN_LINK) {
    baseMenu.unshift({
      label: 'Open Admin Notification Settings',
      click: () => {
        if (!mainWindow) {
          createMainWindow();
          return;
        }
        mainWindow.show();
        mainWindow.focus();
      }
    });
    baseMenu.splice(1, 0, { type: 'separator' });
  }

  const menu = Menu.buildFromTemplate(baseMenu);
  tray.setContextMenu(menu);
};

const createMainWindow = () => {
  if (mainWindow) return;
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    show: true,
    icon: resolveTrayIconPath() ?? undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadURL(ADMIN_SETTINGS_URL);

  mainWindow.on('close', (event: Electron.Event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow?.hide();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

const createNotificationWindow = () => {
  if (notificationWindow) return;
  notificationWindow = new BrowserWindow({
    width: 900,
    height: 700,
    show: true,
    skipTaskbar: false,
    icon: resolveTrayIconPath() ?? undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  notificationWindow.loadURL(NOTIFICATION_URL);

  notificationWindow.on('close', (event: Electron.Event) => {
    if (isQuitting) return;
    event.preventDefault();
    notificationWindow?.hide();
  });

  notificationWindow.on('closed', () => {
    notificationWindow = null;
  });
};

const createOverlayWindow = () => {
  if (overlayWindow) return;
  const width = 190;
  const height = 52;
  const { x, y } = resolveOverlayPosition(width, height);

  overlayWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    frame: false,
    resizable: false,
    movable: true,
    focusable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  overlayWindow.setAlwaysOnTop(true, 'pop-up-menu');
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.setMovable(true);
  overlayWindow.on('closed', () => {
    if (overlayMoveTimeout) {
      clearTimeout(overlayMoveTimeout);
      overlayMoveTimeout = null;
    }
    overlayDragOffset = null;
    overlayWindow = null;
  });
  overlayWindow.on('move', () => {
    if (!overlayWindow) return;
    if (overlayMoveTimeout) {
      clearTimeout(overlayMoveTimeout);
    }
    overlayMoveTimeout = setTimeout(() => {
      persistOverlayPosition();
    }, 300);
  });

  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: transparent; }
          #pill {
            font-family: "Segoe UI", Arial, sans-serif;
            font-size: 12px;
            color: #0f172a;
            background: #ffffff;
            border: 1px solid #bfdbfe;
            border-radius: 999px;
            padding: 8px 12px;
            display: inline-flex;
            align-items: center;
            gap: 10px;
            box-shadow: 0 10px 24px rgba(15, 23, 42, 0.18);
            cursor: grab;
            user-select: none;
            -webkit-app-region: no-drag;
          }
          #drag {
            width: 16px;
            height: 16px;
            border-radius: 999px;
            background: #e2e8f0;
            border: 1px solid #cbd5e1;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            color: #64748b;
            cursor: move;
            -webkit-app-region: no-drag;
          }
          #dot {
            width: 10px;
            height: 10px;
            border-radius: 999px;
            background: #f97316;
            box-shadow: 0 0 10px rgba(249, 115, 22, 0.6);
          }
          #label {
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: #2563eb;
          }
          #text {
            color: #334155;
          }
          #muted {
            color: #94a3b8;
          }
        </style>
      </head>
      <body>
        <div id="pill">
          <div id="dot"></div>
          <div>
            <div id="label">Connections Note</div>
            <div id="text">Notes: 0</div>
          </div>
          <div id="drag" title="Drag to move">⋮⋮</div>
        </div>
        <script>
          const { ipcRenderer } = require('electron');
          const pill = document.getElementById('pill');
          const dragHandle = document.getElementById('drag');
          const text = document.getElementById('text');
          const dot = document.getElementById('dot');

          const setVisible = (visible) => {
            pill.style.display = visible ? 'inline-flex' : 'none';
          };

          let expandedOnce = false;
          let lastCount = 0;

          ipcRenderer.on('desktop-notifications:overlay', (_event, payload) => {
            const count = Number(payload?.count || 0);
            const paused = Boolean(payload?.paused);
            if (count !== lastCount) {
              expandedOnce = false;
              lastCount = count;
            }
            setVisible(count > 0);
            text.textContent = paused
              ? \`Notes: \${count} (paused)\`
              : \`Notes: \${count}\`;
            dot.style.opacity = paused ? '0.4' : '1';
          });

          let dragging = false;
          let dragMoved = false;
          let lastDragEnd = 0;

          const startDrag = (event) => {
            if (!event || event.button !== 0) return;
            dragging = true;
            dragMoved = false;
            ipcRenderer.send('desktop-notifications:drag-start', {
              offsetX: event.offsetX,
              offsetY: event.offsetY
            });
            event.preventDefault();
          };

          const moveDrag = (event) => {
            if (!dragging) return;
            dragMoved = true;
            ipcRenderer.send('desktop-notifications:drag-move', {
              x: event.screenX,
              y: event.screenY
            });
            event.preventDefault();
          };

          const endDrag = () => {
            if (!dragging) return;
            dragging = false;
            if (dragMoved) {
              lastDragEnd = Date.now();
            }
            ipcRenderer.send('desktop-notifications:drag-end');
          };

          pill.addEventListener('click', () => {
            if (Date.now() - lastDragEnd < 300) return;
            if (!expandedOnce) {
              expandedOnce = true;
              ipcRenderer.send('desktop-notifications:expand');
              return;
            }
            ipcRenderer.send('desktop-notifications:open-notifications');
          });

          pill.addEventListener('mousedown', startDrag);
          window.addEventListener('mousemove', moveDrag);
          window.addEventListener('mouseup', endDrag);
        </script>
      </body>
    </html>
  `;

  overlayWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
};

const updateOverlay = () => {
  if (!overlayWindow) return;
  const state = getState();
  if (pendingCount > 0) {
    if (!overlayWindow.isVisible()) {
      overlayWindow.showInactive();
    }
  } else if (overlayWindow.isVisible()) {
    overlayWindow.hide();
  }
  overlayWindow.webContents.send('desktop-notifications:overlay', {
    count: pendingCount,
    paused: state.effectivePaused
  });
};

app.setAppUserModelId('ConnectCalAIM');
const userDataPath = path.join(app.getPath('temp'), 'ConnectCalAIM-user');
const cachePath = path.join(app.getPath('temp'), 'ConnectCalAIM-cache');
app.setPath('userData', userDataPath);
app.setPath('cache', cachePath);
app.commandLine.appendSwitch('user-data-dir', userDataPath);
app.commandLine.appendSwitch('disk-cache-dir', cachePath);
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-gpu-cache');
app.commandLine.appendSwitch('disable-features', 'GpuProcessDiskCache');
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('disk-cache-size', '1');
app.commandLine.appendSwitch('disable-gpu');

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.on('ready', () => {
  createTrayIcon();
  createNotificationWindow();
  createOverlayWindow();
  if (SHOW_ADMIN_LINK) {
    createMainWindow();
  }
  updateBusinessHours();
});

app.on('before-quit', () => {
  isQuitting = true;
});

ipcMain.handle('desktop-notifications:getState', () => getState());
ipcMain.handle('desktop-notifications:setPaused', (_event: IpcMainInvokeEvent, nextPaused: boolean) => {
  setPausedByUser(Boolean(nextPaused));
  return getState();
});
ipcMain.handle('desktop-notifications:notify', (_event: IpcMainInvokeEvent, payload: { title: string; body: string; openOnNotify?: boolean }) => {
  const state = getState();
  if (state.effectivePaused) return false;
  if (!payload?.title || !payload?.body) return false;
  const notification = new Notification({
    title: payload.title,
    body: payload.body
  });
  notification.on('click', () => {
    if (!notificationWindow) {
      createNotificationWindow();
    }
    notificationWindow?.show();
    notificationWindow?.focus();
  });
  notification.show();
  if (payload.openOnNotify) {
    if (!notificationWindow) {
      createNotificationWindow();
    }
    notificationWindow?.show();
    notificationWindow?.focus();
  }
  return true;
});
ipcMain.on('desktop-notifications:pending-count', (_event, count: number) => {
  pendingCount = Math.max(0, Number(count) || 0);
  updateOverlay();
});
ipcMain.on('desktop-notifications:open-notifications', () => {
  if (!notificationWindow) {
    createNotificationWindow();
  }
  notificationWindow?.show();
  notificationWindow?.focus();
});
ipcMain.on('desktop-notifications:expand', () => {
  if (!notificationWindow) {
    createNotificationWindow();
  }
  if (!notificationWindow) return;
  notificationWindow.show();
  notificationWindow.focus();
  if (notificationWindow.webContents.isLoading()) {
    notificationWindow.webContents.once('did-finish-load', () => {
      notificationWindow?.webContents.send('desktop-notifications:expand');
    });
  } else {
    notificationWindow.webContents.send('desktop-notifications:expand');
  }
});

ipcMain.on('desktop-notifications:drag-start', (_event, payload: { offsetX?: number; offsetY?: number }) => {
  const offsetX = Number(payload?.offsetX ?? 0);
  const offsetY = Number(payload?.offsetY ?? 0);
  if (!Number.isFinite(offsetX) || !Number.isFinite(offsetY)) return;
  overlayDragOffset = { x: offsetX, y: offsetY };
});

ipcMain.on('desktop-notifications:drag-move', (_event, payload: { x?: number; y?: number }) => {
  if (!overlayWindow || !overlayDragOffset) return;
  const nextX = Number(payload?.x ?? 0) - overlayDragOffset.x;
  const nextY = Number(payload?.y ?? 0) - overlayDragOffset.y;
  if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) return;
  overlayWindow.setPosition(nextX, nextY);
});

ipcMain.on('desktop-notifications:drag-end', () => {
  overlayDragOffset = null;
  persistOverlayPosition();
});
