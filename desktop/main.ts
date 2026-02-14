import { app, BrowserWindow, Tray, Menu, Notification, ipcMain, dialog, screen } from 'electron';
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
let pillMode: 'minimized' | 'expanded' = 'minimized';
let pillPosition: { x: number; y: number } | null = null;

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
}

const isDev = !app.isPackaged;
const appUrl = process.env.DESKTOP_APP_URL
  || (isDev ? 'http://localhost:3000/admin/my-notes' : 'https://connectcalaim.com/admin/my-notes');
const appOrigin = (() => {
  try {
    return new URL(appUrl).origin;
  } catch {
    return 'https://connectcalaim.com';
  }
})();
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
  const activeNote = pillNotes.length > 0 ? pillNotes[pillIndex] : pillSummary;
  const safeTitle = escapeHtml(activeNote.title || pillSummary.title || 'Connections Note');
  const safeBody = escapeHtml(activeNote.message || pillSummary.message || '');
  const safeReply = activeNote.replyUrl ? escapeHtml(activeNote.replyUrl) : '';
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
  const indexLabel = pillNotes.length > 1
    ? `Note ${pillIndex + 1} of ${pillNotes.length}`
    : '';
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

  if (!notificationWindow) {
    notificationWindow = new BrowserWindow({
      width: pillMode === 'expanded' ? 320 : 320,
      height: pillMode === 'expanded' ? 180 : 64,
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
    notificationWindow.on('show', () => positionNotificationWindow());
    notificationWindow.webContents.once('did-finish-load', () => positionNotificationWindow());
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
        <div class="pill ${pillMode === 'expanded' ? '' : 'minimized'}" id="pill" data-mode="${pillMode}" data-note-id="${escapeHtml(activeNote.noteId || '')}" data-sender-id="${escapeHtml(activeNote.senderId || '')}">
          ${
            pillMode === 'expanded'
              ? `<div class="title">${safeTitle}</div>
                 <div class="meta meta-labels meta-grid">
                   <span>From:</span>
                   <span>To:</span>
                   <span>About:</span>
                   <span>Sent:</span>
                 </div>
                 <div class="meta meta-values meta-grid">
                   <span>${fromValue}</span>
                   <span>${toValue}</span>
                   <span>${aboutValue}</span>
                   <span>${sentValue}</span>
                 </div>
                 <div class="body">${safeBody.replace(/\\n/g, '<br />')}</div>
                 ${indexLabel ? `<div class="meta">${indexLabel}</div>` : ''}
                 <div class="meta">${countLabel}</div>
                 <div class="actions">
                   ${safeReply ? `<button class="btn" id="reply">Quick Reply</button>` : ''}
                   ${pillNotes.length > 1 ? `<button class="btn" id="prev">Prev</button>` : ''}
                   ${pillNotes.length > 1 ? `<button class="btn" id="next">Next</button>` : ''}
                   <button class="btn primary" id="open">${openLabel}</button>
                   <button class="btn" id="closeBtn">Minimize</button>
                 </div>
                 ${safeReply ? `<div class="actions" style="margin-top:6px;">
                    <input id="replyInput" placeholder="Quick reply..." style="flex:1;font-size:9px;padding:3px 6px;border-radius:8px;border:1px solid #e2e8f0;" />
                    <button class="btn primary" id="sendReply">Send</button>
                  </div>` : ''}`
              : `<div>
                   <div class="label">Notes & documents</div>
                   <div class="snippet">${safeTitle} — ${safeBody}</div>
                 </div>
                 <div class="count">${countLabel}</div>`
          }
        </div>
        ${pillMode === 'expanded' ? `<div class="close" id="close">✕</div>` : ''}
        <script>
          const pill = document.getElementById('pill');
          const mode = pill?.dataset?.mode;
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
            if (mode === 'expanded') {
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
              const input = document.getElementById('replyInput');
              if (input) {
                input.focus();
                input.select?.();
              }
            });
          }
          const replyInput = document.getElementById('replyInput');
          const sendReply = document.getElementById('sendReply');
          if (sendReply && replyInput) {
            replyInput.addEventListener('click', (event) => {
              event.stopPropagation();
            });
            replyInput.addEventListener('keydown', (event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                sendReply.click();
              } else {
                event.stopPropagation();
              }
            });
            sendReply.addEventListener('click', (event) => {
              event.stopPropagation();
              const message = replyInput.value.trim();
              if (!message) return;
              window.desktopNotificationPill?.sendReply?.({ noteId, senderId, message });
              replyInput.value = '';
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

  notificationWindow.setSize(pillMode === 'expanded' ? 320 : 320, pillMode === 'expanded' ? 180 : 64, false);
  positionNotificationWindow();
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
  }, pillMode === 'expanded' ? 8000 : 12000);
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
    count: Math.max(1, Number(pillSummary.count || 0)),
    title: payload.title,
    message: payload.body
  };
  if (payload.openOnNotify) {
    showExpandedPill();
  } else {
    showMinimizedPill();
  }

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
    const nextUrl = payload.url.startsWith('http')
      ? payload.url
      : payload.url.startsWith('/')
        ? `${appOrigin}${payload.url}`
        : `${appOrigin}/${payload.url}`;
    mainWindow.loadURL(nextUrl).catch(() => undefined);
  }
  closeNotificationWindow();
});

ipcMain.on('desktop:dismissPill', () => {
  showMinimizedPill();
});

ipcMain.on('desktop:expandPill', () => {
  showExpandedPill();
});

ipcMain.on('desktop:navigatePill', (_event, payload: { delta: number }) => {
  if (pillNotes.length === 0) return;
  const nextIndex = pillIndex + payload.delta;
  if (nextIndex < 0 || nextIndex >= pillNotes.length) return;
  pillIndex = nextIndex;
  showExpandedPill();
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
    author: payload.author || '',
    recipientName: payload.recipientName || '',
    memberName: payload.memberName || '',
    timestamp: payload.timestamp || '',
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
  if (pillSummary.count > 0) {
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
