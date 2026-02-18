import { app, BrowserWindow, Tray, Menu, Notification, ipcMain, dialog, screen, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import { autoUpdater } from 'electron-updater';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let notificationWindow: BrowserWindow | null = null;
let notificationTimer: NodeJS.Timeout | null = null;
let isQuitting = false;
let notificationWindowLoaded = false;
let updateReadyToInstall = false;
let updateReadyVersion: string | null = null;
let updaterConfigured = false;

let pillSummary = {
  count: 0,
  title: 'Connections Note',
  message: '',
  author: '',
  recipientName: '',
  memberName: '',
  timestamp: '',
  noteId: undefined as string | undefined,
  senderId: undefined as string | undefined,
  replyUrl: undefined as string | undefined,
  actionUrl: '/admin/my-notes'
};
type PillItem = {
  title: string;
  message: string;
  kind?: 'note' | 'docs' | 'cs';
  author?: string;
  recipientName?: string;
  memberName?: string;
  timestamp?: string;
  noteId?: string;
  senderId?: string;
  replyUrl?: string;
  actionUrl?: string;
};

let pillNotes: PillItem[] = [];
let staffPillNotes: PillItem[] = [];
let reviewPillNotes: PillItem[] = [];
let staffPillCount = 0;
let reviewPillCount = 0;
let pillIndex = 0;
let pillPosition: { x: number; y: number } | null = null;
let pillMode: 'compact' | 'panel' = 'compact';

const PILL_WINDOW_SIZES = {
  compact: { width: 420, height: 110 },
  panel: { width: 460, height: 340 }
} as const;

const applyPillWindowSize = () => {
  if (!notificationWindow) return;
  const target = pillMode === 'panel' ? PILL_WINDOW_SIZES.panel : PILL_WINDOW_SIZES.compact;
  try {
    notificationWindow.setResizable(false);
    notificationWindow.setMinimumSize(target.width, target.height);
    notificationWindow.setMaximumSize(target.width, target.height);
    notificationWindow.setSize(target.width, target.height, false);
  } catch {
    // ignore
  }
};

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
}

const isDev = !app.isPackaged;
let appUrl = process.env.DESKTOP_APP_URL
  || (isDev ? 'http://localhost:3000/admin/my-notes' : 'https://connectcalaim.com/admin/my-notes');
let appOrigin = (() => {
  try {
    return new URL(appUrl).origin;
  } catch {
    return 'https://connectcalaim.com';
  }
})();
const setAppUrl = (nextUrl: string) => {
  appUrl = nextUrl;
  try {
    appOrigin = new URL(nextUrl).origin;
  } catch {
    // ignore
  }
};
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

const openInMainWindow = (route?: string) => {
  const target = getExternalUrl(route || '/admin/my-notes');
  try {
    if (!mainWindow) {
      createWindow();
    }
    if (!mainWindow) {
      shell.openExternal(target).catch(() => undefined);
      return;
    }
    mainWindow.show();
    mainWindow.focus();
    mainWindow.loadURL(target).catch(() => {
      if (!isDev) return;
      try {
        const fallbackOrigin = appOrigin.includes('localhost:3000')
          ? appOrigin.replace('localhost:3000', 'localhost:3001')
          : appOrigin.includes('localhost:3001')
            ? appOrigin.replace('localhost:3001', 'localhost:3000')
            : '';
        if (!fallbackOrigin) return;
        const url = String(target).replace(appOrigin, fallbackOrigin);
        setAppUrl(url);
        mainWindow?.loadURL(url).catch(() => undefined);
      } catch {
        // ignore
      }
    });
  } catch {
    shell.openExternal(target).catch(() => undefined);
  }
};

const buildTrayMenu = () => {
  const statusLabel = notificationState.effectivePaused ? 'Silent' : 'Active';
  const template: Array<Electron.MenuItemConstructorOptions> = [
    {
      label: 'Open Notifications',
      click: () => {
        openInMainWindow('/admin/my-notes');
        try {
          mainWindow?.webContents.send('desktop:expand');
        } catch {
          // ignore
        }
      }
    },
    {
      label: 'Open Staff Chat',
      click: () => openInMainWindow('/admin/chat')
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
    ...(updateReadyToInstall
      ? ([
          {
            label: updateReadyVersion ? `Restart to Update (v${updateReadyVersion})` : 'Restart to Update',
            click: () => {
              try {
                isQuitting = true;
                autoUpdater.quitAndInstall();
              } catch {
                // ignore
              }
            }
          },
          { type: 'separator' as const },
        ] as const)
      : []),
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ];
  return Menu.buildFromTemplate(template);
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

  mainWindow.loadURL(appUrl).catch(() => {
    if (!isDev) return;
    // Dev fallback when the Next dev server starts on 3001.
    try {
      const fallback = appUrl.includes('localhost:3000')
        ? appUrl.replace('localhost:3000', 'localhost:3001')
        : appUrl.includes('localhost:3001')
          ? appUrl.replace('localhost:3001', 'localhost:3000')
          : '';
      if (!fallback) return;
      setAppUrl(fallback);
      mainWindow?.loadURL(fallback).catch(() => undefined);
    } catch {
      // ignore
    }
  });

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
    notificationWindowLoaded = false;
  }
};

const getExternalUrl = (url?: string) => {
  const raw = String(url || '').trim();
  if (!raw) return appOrigin;
  if (raw.startsWith('http')) return raw;
  if (raw.startsWith('/')) return `${appOrigin}${raw}`;
  return `${appOrigin}/${raw}`;
};

const ensureNotificationWindow = () => {
  if (!notificationWindow) {
    notificationWindow = new BrowserWindow({
      width: PILL_WINDOW_SIZES.compact.width,
      height: PILL_WINDOW_SIZES.compact.height,
      frame: false,
      transparent: true,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: true,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: path.join(__dirname, 'notification-preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    notificationWindow.setAlwaysOnTop(true, 'screen-saver');
    notificationWindow.setVisibleOnAllWorkspaces(true);
    applyPillWindowSize();
    notificationWindow.on('closed', () => {
      notificationWindow = null;
      notificationWindowLoaded = false;
    });
    notificationWindow.on('show', () => positionNotificationWindow());
    notificationWindow.webContents.once('did-finish-load', () => {
      notificationWindowLoaded = true;
      positionNotificationWindow();
    });
  }

  if (!notificationWindowLoaded) {
    const url = `${appOrigin}/admin/desktop-notification-window`;
    notificationWindow.loadURL(url).catch(() => {
      if (!isDev) return;
      try {
        const fallbackOrigin = appOrigin.includes('localhost:3000')
          ? appOrigin.replace('localhost:3000', 'localhost:3001')
          : appOrigin.includes('localhost:3001')
            ? appOrigin.replace('localhost:3001', 'localhost:3000')
            : '';
        if (!fallbackOrigin) return;
        notificationWindow?.loadURL(`${fallbackOrigin}/admin/desktop-notification-window`).catch(() => undefined);
      } catch {
        // ignore
      }
    });
  }

  return notificationWindow;
};

const positionNotificationWindow = () => {
  if (!notificationWindow) return;
  const windowBounds = notificationWindow.getBounds();
  const display = screen.getPrimaryDisplay();
  const workArea = display.workArea;
  if (pillPosition) {
    const clampedX = Math.min(
      Math.max(pillPosition.x, workArea.x + 8),
      workArea.x + workArea.width - windowBounds.width - 8
    );
    const clampedY = Math.min(
      Math.max(pillPosition.y, workArea.y + 8),
      workArea.y + workArea.height - windowBounds.height - 8
    );
    pillPosition = { x: clampedX, y: clampedY };
    notificationWindow.setPosition(Math.round(clampedX), Math.round(clampedY), false);
    return;
  }
  const margin = 16;
  const x = workArea.x + workArea.width - windowBounds.width - margin;
  const y = workArea.y + workArea.height - windowBounds.height - margin;
  notificationWindow.setPosition(Math.round(x), Math.round(y), false);
};

const renderNotificationPill = () => {
  // New system: render web-style notification cards in a dedicated window.
  // Keep the old HTML pill implementation below as a fallback (unreachable).
  if (pillSummary.count <= 0) {
    closeNotificationWindow();
    return;
  }
  try {
    const win = ensureNotificationWindow();
    applyPillWindowSize();
    positionNotificationWindow();
    win.showInactive();
    win.webContents.send('desktop:pillState', {
      count: pillSummary.count,
      title: pillSummary.title,
      message: pillSummary.message,
      author: pillSummary.author,
      recipientName: pillSummary.recipientName,
      memberName: pillSummary.memberName,
      timestamp: pillSummary.timestamp,
      replyUrl: pillSummary.replyUrl,
      actionUrl: pillSummary.actionUrl,
      notes: pillNotes
    });
  } catch {
    // ignore
  }
  return;

  const activeNote = pillNotes.length > 0 ? pillNotes[pillIndex] : pillSummary;
  const safeTitle = escapeHtml(activeNote.title || pillSummary.title || 'Connections Note');
  const safeBody = escapeHtml(activeNote.message || pillSummary.message || '');
  const safeReply = activeNote.replyUrl ? escapeHtml(activeNote.replyUrl || '') : '';
  const safeAction = escapeHtml(activeNote.actionUrl || pillSummary.actionUrl || '/admin/my-notes');
  const countLabel = pillSummary.count === 1
    ? '1 pending item'
    : `${pillSummary.count} pending items`;
  const metaLabels = 'From: To: About: Sent:';
  const fromValue = escapeHtml(activeNote.author || pillSummary.author || '-');
  const toValue = escapeHtml(activeNote.recipientName || pillSummary.recipientName || '-');
  const aboutValue = escapeHtml(activeNote.memberName || pillSummary.memberName || '-');
  const sentValue = escapeHtml(activeNote.timestamp || pillSummary.timestamp || '-');
  const metaValues = `${fromValue} · ${toValue} · ${aboutValue} · ${sentValue}`;
  // Fixed-size pill: no expanded carousel UI.
  const kind = String((activeNote as any)?.kind || 'note');
  const accentColor =
    kind === 'docs'
      ? '#16a34a'
      : kind === 'cs'
        ? '#f97316'
        : '#7c3aed';
  const openLabel =
    kind === 'docs' || kind === 'cs'
      ? 'Go to Applications'
      : 'Go to Notes';
  const typeLabel =
    kind === 'docs'
      ? 'Documents'
      : kind === 'cs'
        ? 'CS Summary'
        : 'Interoffice note';

  if (!notificationWindow) {
    notificationWindow = new BrowserWindow({
      width: 360,
      height: pillMode === 'panel' ? 220 : 84,
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

    notificationWindow!.setAlwaysOnTop(true, 'screen-saver');
    notificationWindow!.setVisibleOnAllWorkspaces(true);
    notificationWindow!.on('closed', () => {
      notificationWindow = null;
    });
    notificationWindow!.on('show', () => positionNotificationWindow());
    notificationWindow!.webContents.once('did-finish-load', () => positionNotificationWindow());
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
            overflow: hidden;
            user-select: none;
          }
          .pill {
            margin: 4px;
            padding: 6px 8px;
            border-radius: 10px;
            background: #ffffff;
            border: 1px solid #e5e7eb;
            box-shadow: 0 10px 22px rgba(0, 0, 0, 0.16);
            border-left: 6px solid ${accentColor};
          }
          .minimized {
            display: flex;
            align-items: center;
            justify-content: space-between;
            cursor: pointer;
          }
          .minimized .label {
            font-size: 9px;
            color: #1f2937;
            font-weight: 600;
          }
          .minimized .count {
            font-size: 9px;
            color: #2563eb;
            font-weight: 600;
          }
          .minimized .snippet {
            font-size: 9px;
            color: #334155;
            margin-top: 2px;
            max-width: 230px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
          }
          .rightCol {
            display: flex;
            align-items: center;
            gap: 6px;
          }
          .metaLine {
            margin-top: 4px;
            font-size: 8px;
            color: #64748b;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 320px;
          }
          .tag {
            display: inline-block;
            font-size: 8px;
            padding: 1px 6px;
            border-radius: 999px;
            background: #f1f5f9;
            border: 1px solid #e2e8f0;
            color: #0f172a;
            margin-left: 6px;
          }
          .tag.note { border-color: #ddd6fe; background: #f5f3ff; color: #5b21b6; }
          .tag.docs { border-color: #bbf7d0; background: #f0fdf4; color: #166534; }
          .tag.cs { border-color: #fed7aa; background: #fff7ed; color: #9a3412; }
          .panelHeader {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
          }
          .panelMetaGrid {
            margin-top: 8px;
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 8px;
          }
          .title {
            font-weight: 700;
            font-size: 11px;
            color: #0f172a;
            margin-bottom: 4px;
          }
          .body {
            font-size: 9px;
            color: #334155;
            line-height: 1.35;
          }
          .meta {
            margin-top: 4px;
            font-size: 8px;
            color: #64748b;
          }
          .meta.meta-labels {
            color: #9ca3af;
            font-size: 8px;
            text-transform: uppercase;
            letter-spacing: 0.04em;
          }
          .meta-grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 8px;
          }
          .actions {
            display: flex;
            gap: 4px;
            margin-top: 6px;
          }
          .btn {
            font-size: 8px;
            padding: 3px 6px;
            border-radius: 8px;
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
            right: 14px;
            top: 10px;
            font-size: 12px;
            color: #6b7280;
            cursor: pointer;
          }
        </style>
      </head>
      <body>
        <div class="pill minimized" id="pill" data-mode="${pillMode}" data-note-id="${escapeHtml(activeNote.noteId || '')}" data-sender-id="${escapeHtml(activeNote.senderId || '')}">
          ${
            pillMode === 'panel'
              ? `<div class="panelHeader">
                   <div class="title">Connections Note<span class="tag ${kind}">${typeLabel}</span></div>
                   <div style="display:flex;gap:6px;align-items:center;">
                     ${pillNotes.length > 1 ? `<button class="btn" id="prev">Prev</button><button class="btn" id="next">Next</button>` : ''}
                     <button class="btn" id="minimize">Minimize</button>
                     <button class="btn" id="hide">Hide</button>
                   </div>
                 </div>
                 <div class="meta meta-labels panelMetaGrid">
                   <span>From:</span>
                   <span>To:</span>
                   <span>About:</span>
                   <span>Sent:</span>
                 </div>
                 <div class="meta meta-values panelMetaGrid">
                   <span>${fromValue}</span>
                   <span>${toValue}</span>
                   <span>${aboutValue}</span>
                   <span>${sentValue}</span>
                 </div>
                 <div class="body" style="margin-top:8px;max-height:92px;overflow:auto;">${safeBody.replace(/\\n/g, '<br />')}</div>
                 <div class="actions">
                   <button class="btn primary" id="open">${openLabel}</button>
                 </div>`
              : `<div class="row">
                   <div>
                     <div class="label">Notes & documents<span class="tag ${kind}">${typeLabel}</span></div>
                     <div class="snippet">${safeTitle} — ${safeBody}</div>
                   </div>
                   <div class="rightCol">
                     <div class="count">${countLabel}</div>
                   </div>
                 </div>
                 <div class="metaLine">${metaLabels} ${metaValues}</div>`
          }
        </div>
        <script>
          const pill = document.getElementById('pill');
          const mode = pill?.dataset?.mode || 'compact';
          const noteId = pill?.dataset?.noteId || '';
          const senderId = pill?.dataset?.senderId || '';
          let dragging = false;
          let dragged = false;
          let startX = 0;
          let startY = 0;
          let originX = 0;
          let originY = 0;

          const refreshOrigin = async () => {
            const pos = await window.desktopNotificationPill?.getPosition?.();
            if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
              originX = pos.x;
              originY = pos.y;
            }
          };

          document.addEventListener('mousedown', (event) => {
            if (event.target.closest('button')) return;
            dragging = true;
            dragged = false;
            startX = event.screenX;
            startY = event.screenY;
            refreshOrigin();
          });
          document.addEventListener('mousemove', (event) => {
            if (!dragging) return;
            const dx = event.screenX - startX;
            const dy = event.screenY - startY;
            if (Math.abs(dx) + Math.abs(dy) < 4) return;
            dragged = true;
            const nextX = originX + dx;
            const nextY = originY + dy;
            window.desktopNotificationPill?.move?.(nextX, nextY);
          });
          document.addEventListener('mouseup', (event) => {
            if (!dragging) return;
            dragging = false;
            if (!dragged) return;
            const dx = event.screenX - startX;
            const dy = event.screenY - startY;
            originX = originX + dx;
            originY = originY + dy;
            window.desktopNotificationPill?.move?.(originX, originY);
          });
          pill.addEventListener('click', () => {
            if (dragged) return;
            if (mode === 'compact') {
              window.desktopNotificationPill?.expand?.();
            }
          });
          const open = document.getElementById('open');
          if (open) {
            open.addEventListener('click', (event) => {
              event.stopPropagation();
              window.desktopNotificationPill?.open?.("${safeAction}");
            });
          }
          const minimize = document.getElementById('minimize');
          if (minimize) {
            minimize.addEventListener('click', (event) => {
              event.stopPropagation();
              window.desktopNotificationPill?.dismiss?.();
            });
          }
          const hide = document.getElementById('hide');
          if (hide) {
            hide.addEventListener('click', (event) => {
              event.stopPropagation();
              window.desktopNotificationPill?.hide?.();
            });
          }
          const prev = document.getElementById('prev');
          if (prev) {
            prev.addEventListener('click', (event) => {
              event.stopPropagation();
              window.desktopNotificationPill?.navigate?.(-1);
            });
          }
          const next = document.getElementById('next');
          if (next) {
            next.addEventListener('click', (event) => {
              event.stopPropagation();
              window.desktopNotificationPill?.navigate?.(1);
            });
          }
        </script>
      </body>
    </html>
  `;

  notificationWindow!.setSize(360, pillMode === 'panel' ? 220 : 84, false);
  positionNotificationWindow();
  notificationWindow!.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch(() => undefined);
  notificationWindow!.showInactive();
};

const showPanel = () => {
  if (pillSummary.count <= 0) {
    closeNotificationWindow();
    return;
  }
  pillMode = 'panel';
  renderNotificationPill();
};

const recomputeCombinedPill = () => {
  const combined: PillItem[] = [];
  combined.push(...staffPillNotes);
  combined.push(...reviewPillNotes);

  // Best-effort newest-first sort using Date.parse on timestamp labels.
  combined.sort((a, b) => {
    const at = Date.parse(String(a.timestamp || '')) || 0;
    const bt = Date.parse(String(b.timestamp || '')) || 0;
    return bt - at;
  });

  pillNotes = combined;
  pillIndex = 0;
  pillSummary.count = staffPillCount + reviewPillCount;
};

const showMinimizedPill = () => {
  if (pillSummary.count <= 0) {
    closeNotificationWindow();
    return;
  }
  pillMode = 'compact';
  renderNotificationPill();
};

const createTray = () => {
  const packagedIcon = path.join(app.getAppPath(), 'assets', 'tray.ico');
  const resourcesIcon = path.join(process.resourcesPath, 'assets', 'tray.ico');
  const distIcon = path.join(__dirname, 'assets', 'tray.ico');
  const sourceIcon = path.join(__dirname, '..', 'assets', 'tray.ico');
  const iconPath = fs.existsSync(packagedIcon)
    ? packagedIcon
    : fs.existsSync(resourcesIcon)
      ? resourcesIcon
      : fs.existsSync(distIcon)
        ? distIcon
        : sourceIcon;
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
        {
          label: updateReadyVersion ? `Restart to Update (v${updateReadyVersion})` : 'Restart to Update',
          enabled: updateReadyToInstall,
          click: () => {
            try {
              isQuitting = true;
              autoUpdater.quitAndInstall();
            } catch {
              // ignore
            }
          }
        },
        { type: 'separator' as const },
        { label: 'Quit', click: () => { isQuitting = true; app.quit(); } }
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
};

const configureAutoUpdater = () => {
  if (updaterConfigured) return;
  updaterConfigured = true;
  // Auto-update is only intended for packaged builds.
  if (isDev) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-downloaded', async (info: any) => {
    updateReadyToInstall = true;
    updateReadyVersion = typeof info?.version === 'string' ? info.version : null;
    try {
      updateTrayMenu();
      createAppMenu();
    } catch {
      // ignore
    }

    try {
      const result = await dialog.showMessageBox({
        type: 'info',
        title: 'Update downloaded',
        message: 'Update downloaded — restart now?',
        detail: updateReadyVersion
          ? `Version ${updateReadyVersion} is ready to install.`
          : 'A new version is ready to install.',
        buttons: ['Restart now', 'Later'],
        defaultId: 0,
        cancelId: 1,
      });

      if (result.response === 0) {
        isQuitting = true;
        autoUpdater.quitAndInstall();
      }
    } catch {
      // ignore
    }
  });

  autoUpdater.on('error', (error: any) => {
    // Keep this quiet unless debugging; updater failures are common on locked-down machines.
    try {
      console.warn('Auto-updater error:', error instanceof Error ? error.message : String(error));
    } catch {
      // ignore
    }
  });

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
    count: Math.max(1, Number(pillSummary.count || 0)),
    title: payload.title,
    message: payload.body
  };
  showMinimizedPill();

  try {
    const win = ensureNotificationWindow();
    win.showInactive();
    win.webContents.send('desktop:notifyCard', {
      id: `desktop-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type: 'task',
      title: payload.title,
      message: payload.body,
      author: 'System',
      recipientName: 'System',
      actionUrl: pillSummary.actionUrl || '/admin/my-notes',
      timestamp: new Date().toISOString(),
    });
  } catch {
    // ignore
  }

  if (payload.openOnNotify) {
    openInMainWindow('/admin');
  }
  return true;
});

ipcMain.on('desktop:openNotifications', (_event, payload?: { url?: string }) => {
  openInMainWindow(payload?.url || '/admin/my-notes');
  closeNotificationWindow();
});

ipcMain.on('desktop:dismissPill', () => {
  // Return to compact pill (panel -> compact).
  showMinimizedPill();
});

ipcMain.on('desktop:hidePill', () => {
  closeNotificationWindow();
});

ipcMain.on('desktop:expandPill', () => {
  // First click behavior: open the note panel (fixed-size).
  showPanel();
});

ipcMain.on('desktop:setPillMode', (_event, payload?: { mode?: 'compact' | 'panel' }) => {
  const mode = payload?.mode === 'panel' ? 'panel' : 'compact';
  pillMode = mode;
  applyPillWindowSize();
  positionNotificationWindow();
});

ipcMain.on('desktop:navigatePill', (_event, payload: { delta: number }) => {
  if (pillNotes.length === 0) return;
  const nextIndex = pillIndex + payload.delta;
  if (nextIndex < 0 || nextIndex >= pillNotes.length) return;
  pillIndex = nextIndex;
  renderNotificationPill();
});

ipcMain.on('desktop:quickReply', (_event, payload: { noteId?: string; senderId?: string; message: string }) => {
  if (!mainWindow) return;
  mainWindow.webContents.send('desktop:quickReply', payload);
});

ipcMain.on('desktop:movePill', (_event, payload: { x: number; y: number }) => {
  pillPosition = { x: payload.x, y: payload.y };
  if (notificationWindow) {
    notificationWindow.setPosition(Math.round(payload.x), Math.round(payload.y), false);
  }
});

ipcMain.handle('desktop:getPillPosition', () => {
  return pillPosition;
});

ipcMain.on('desktop:setPillSummary', (_event, payload: {
  count: number;
  notes?: PillItem[];
  title?: string;
  message?: string;
  author?: string;
  recipientName?: string;
  memberName?: string;
  timestamp?: string;
  replyUrl?: string;
  actionUrl?: string;
}) => {
  staffPillNotes = (payload.notes || []).map((note) => ({
    ...note,
    kind: note.kind || 'note'
  }));
  staffPillCount = payload.count || 0;
  recomputeCombinedPill();
  pillSummary = {
    count: pillSummary.count,
    title: payload.title || pillSummary.title,
    message: payload.message || pillSummary.message,
    author: payload.author || pillSummary.author || '',
    recipientName: payload.recipientName || pillSummary.recipientName || '',
    memberName: payload.memberName || pillSummary.memberName || '',
    timestamp: payload.timestamp || pillSummary.timestamp || '',
    noteId: pillSummary.noteId,
    senderId: pillSummary.senderId,
    replyUrl: payload.replyUrl,
    actionUrl: payload.actionUrl || '/admin/my-notes'
  };
  if (pillSummary.count > 0) {
    showMinimizedPill();
  } else {
    closeNotificationWindow();
  }
});

ipcMain.on('desktop:setReviewPillSummary', (_event, payload: {
  count: number;
  notes?: PillItem[];
}) => {
  reviewPillNotes = (payload.notes || []).map((note) => ({
    ...note,
    kind: note.kind || 'docs'
  }));
  reviewPillCount = payload.count || 0;
  recomputeCombinedPill();
  if (pillSummary.count > 0) {
    showMinimizedPill();
  } else {
    closeNotificationWindow();
  }
});

ipcMain.on('desktop:setPendingCount', (_event, count: number) => {
  staffPillCount = Number(count || 0);
  recomputeCombinedPill();
  if (tray) {
    tray.setToolTip(`Connect CalAIM Desktop (${pillSummary.count} pending)`);
  }
  // Don't auto-open the pill UI based on count alone.
  // We only show the UI when we have actual note/review payload (setPillSummary / setReviewPillSummary),
  // otherwise the panel can render empty fields ("-") if the user clicks too quickly.
  if (pillSummary.count <= 0) {
    closeNotificationWindow();
    return;
  }
  if (notificationWindow) {
    renderNotificationPill();
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
