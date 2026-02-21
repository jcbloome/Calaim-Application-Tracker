import { app, BrowserWindow, Tray, Menu, Notification, ipcMain, dialog, screen, shell, clipboard } from 'electron';
import fs from 'fs';
import path from 'path';
import { autoUpdater } from 'electron-updater';
import Store from 'electron-store';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let notificationWindow: BrowserWindow | null = null;
let statusWindow: BrowserWindow | null = null;
let chatWindow: BrowserWindow | null = null;
let notificationTimer: NodeJS.Timeout | null = null;
let isQuitting = false;
let notificationWindowLoaded = false;
let isPositioningPillWindow = false;
let updateReadyToInstall = false;
let updateReadyVersion: string | null = null;
let updaterConfigured = false;
let updateCheckInProgress = false;
let updateUiState: 'idle' | 'checking' | 'upToDate' | 'downloading' | 'downloaded' | 'error' = 'idle';
let updateUiVersion: string | null = null;
let updateUiLastCheckedAt: number | null = null;

let recentRendererErrors: Array<{
  type: string;
  message: string;
  stack?: string;
  href?: string;
  ts: number;
}> = [];
let rendererErrorDialogShownAt: number = 0;

type DesktopPreferences = {
  pausedByUser: boolean;
  allowAfterHours: boolean;
  snoozedUntilMs: number;
  showNotes: boolean;
  showReview: boolean;
  pillPosition: { x: number; y: number } | null;
  snoozedNoteUntilById: Record<string, number>;
  mutedSenderUntilById: Record<string, number>;
};

const prefsStore = new Store<DesktopPreferences>({
  name: 'desktop-preferences',
  defaults: {
    pausedByUser: false,
    allowAfterHours: true,
    snoozedUntilMs: 0,
    showNotes: true,
    showReview: true,
    pillPosition: null,
    snoozedNoteUntilById: {},
    mutedSenderUntilById: {},
  },
});

const normalizeUntilMap = (raw: any): Record<string, number> => {
  const now = Date.now();
  const next: Record<string, number> = {};
  try {
    if (!raw || typeof raw !== 'object') return {};
    for (const [key, value] of Object.entries(raw)) {
      const id = String(key || '').trim();
      const untilMs = Number(value || 0);
      if (!id) continue;
      if (!untilMs || Number.isNaN(untilMs)) continue;
      if (untilMs <= now) continue;
      next[id] = untilMs;
    }
  } catch {
    return {};
  }
  return next;
};

let snoozedNoteUntilById = normalizeUntilMap(prefsStore.get('snoozedNoteUntilById'));
let mutedSenderUntilById = normalizeUntilMap(prefsStore.get('mutedSenderUntilById'));
let pillLastUpdatedAtMs: number = Date.now();

const saveSuppressionMaps = () => {
  try {
    prefsStore.set('snoozedNoteUntilById', snoozedNoteUntilById);
  } catch {
    // ignore
  }
  try {
    prefsStore.set('mutedSenderUntilById', mutedSenderUntilById);
  } catch {
    // ignore
  }
};

const countActiveSuppressions = () => {
  const now = Date.now();
  const snoozed = Object.values(snoozedNoteUntilById).filter((v) => Number(v) > now).length;
  const muted = Object.values(mutedSenderUntilById).filter((v) => Number(v) > now).length;
  return { snoozed, muted };
};

const applySuppressionFilters = (notes: PillItem[]) => {
  const now = Date.now();
  // Prune expired entries opportunistically.
  const nextSnoozes = normalizeUntilMap(snoozedNoteUntilById);
  const nextMutes = normalizeUntilMap(mutedSenderUntilById);
  const pruned = (Object.keys(nextSnoozes).length !== Object.keys(snoozedNoteUntilById).length)
    || (Object.keys(nextMutes).length !== Object.keys(mutedSenderUntilById).length);
  snoozedNoteUntilById = nextSnoozes;
  mutedSenderUntilById = nextMutes;
  if (pruned) {
    saveSuppressionMaps();
  }

  return (notes || []).filter((note) => {
    const rawType = String((note as any)?.type || '').toLowerCase();
    const isChat = Boolean((note as any)?.isChatOnly) || rawType.includes('chat');
    if (isChat) return false;
    const noteId = String(note.noteId || '').trim();
    if (noteId) {
      const until = Number(snoozedNoteUntilById[noteId] || 0);
      if (until > now) return false;
    }
    const senderId = String(note.senderId || '').trim();
    if (senderId) {
      const until = Number(mutedSenderUntilById[senderId] || 0);
      if (until > now) return false;
    }
    return true;
  });
};

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
  type?: string;
  isChatOnly?: boolean;
  source?: string;
  clientId2?: string;
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
let pillHiddenByUser = false;

const PILL_WINDOW_SIZES = {
  compact: { width: 320, height: 74 },
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

const setUpdateUi = (next: Partial<{
  state: typeof updateUiState;
  version: string | null;
  lastCheckedAt: number | null;
  readyToInstall: boolean;
  readyVersion: string | null;
}>) => {
  if (next.state) updateUiState = next.state;
  if (next.version !== undefined) updateUiVersion = next.version;
  if (next.lastCheckedAt !== undefined) updateUiLastCheckedAt = next.lastCheckedAt;
  if (next.readyToInstall !== undefined) updateReadyToInstall = next.readyToInstall;
  if (next.readyVersion !== undefined) updateReadyVersion = next.readyVersion;
  try {
    updateTrayMenu();
  } catch {
    // ignore
  }
  try {
    createAppMenu();
  } catch {
    // ignore
  }
};

const showUpdaterDialog = async (payload: {
  title: string;
  message: string;
  detail?: string;
}) => {
  try {
    await dialog.showMessageBox({
      type: 'info',
      title: payload.title,
      message: payload.message,
      detail: payload.detail,
      buttons: ['OK'],
      defaultId: 0,
    });
  } catch {
    // ignore
  }
};

const runManualUpdateCheck = async (source: 'tray' | 'menu' | 'about' = 'tray') => {
  if (isDev) {
    await showUpdaterDialog({
      title: 'Updates',
      message: 'Auto-update is disabled in dev mode.',
      detail: `Current version: ${app.getVersion()}`,
    });
    return;
  }
  if (updateCheckInProgress) return;
  updateCheckInProgress = true;
  setUpdateUi({ state: 'checking', lastCheckedAt: Date.now() });
  try {
    const result: any = await autoUpdater.checkForUpdates();
    const nextVersion = typeof result?.updateInfo?.version === 'string' ? result.updateInfo.version : null;
    const hasUpdate = Boolean(result?.downloadPromise);

    if (!hasUpdate) {
      setUpdateUi({ state: 'upToDate', version: null, lastCheckedAt: Date.now() });
      await showUpdaterDialog({
        title: 'Updates',
        message: 'No new updates found.',
        detail: `You are on the latest version (v${app.getVersion()}).`,
      });
      return;
    }

    setUpdateUi({ state: 'downloading', version: nextVersion, lastCheckedAt: Date.now() });
    await showUpdaterDialog({
      title: 'Updates',
      message: nextVersion ? `Update available: v${nextVersion}` : 'Update available.',
      detail: 'The update will download in the background. You will be prompted to restart when it is ready.',
    });
  } catch (error: any) {
    setUpdateUi({ state: 'error', lastCheckedAt: Date.now() });
    await showUpdaterDialog({
      title: 'Updates',
      message: 'Update check failed.',
      detail: error instanceof Error ? error.message : String(error),
    });
  } finally {
    updateCheckInProgress = false;
    // If the check completed but we didn't transition to a known state, keep it idle.
    if (updateUiState === 'checking') {
      setUpdateUi({ state: 'idle' });
    }
  }
};

const formatRendererErrors = () => {
  const lines: string[] = [];
  const items = recentRendererErrors.slice(-8).reverse();
  if (items.length === 0) {
    lines.push('(no captured renderer errors yet)');
  } else {
    items.forEach((e, idx) => {
      const when = new Date(e.ts).toLocaleString();
      lines.push(`(${idx + 1}) [${when}] ${e.type}: ${e.message}`);
      if (e.href) lines.push(`    URL: ${e.href}`);
      if (e.stack) {
        const stack = String(e.stack).split('\n').slice(0, 12).join('\n');
        lines.push(`    Stack:\n${stack}`);
      }
      lines.push('');
    });
  }
  return lines.join('\n');
};

const showDiagnosticsDialog = async () => {
  const mainUrl = (() => {
    try { return mainWindow?.webContents.getURL() || '(none)'; } catch { return '(unavailable)'; }
  })();
  const pillUrl = (() => {
    try { return notificationWindow?.webContents.getURL() || '(none)'; } catch { return '(unavailable)'; }
  })();
  const detail = [
    `App version: ${app.getVersion()}`,
    `Main URL: ${mainUrl}`,
    `Pill URL: ${pillUrl}`,
    `Origin: ${appOrigin}`,
    '',
    'Recent renderer errors:',
    formatRendererErrors(),
  ].join('\n');

  try {
    const result = await dialog.showMessageBox({
      type: 'info',
      title: 'Desktop diagnostics',
      message: 'Diagnostics (copy/paste to support)',
      detail,
      buttons: ['Copy to clipboard', 'OK'],
      defaultId: 1,
      cancelId: 1,
    });
    if (result.response === 0) {
      try {
        clipboard.writeText(detail);
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
};

const notificationState = {
  pausedByUser: Boolean(prefsStore.get('pausedByUser')),
  isWithinBusinessHours: true,
  allowAfterHours: Boolean(prefsStore.get('allowAfterHours')),
  effectivePaused: false,
  snoozedUntilMs: Number(prefsStore.get('snoozedUntilMs') || 0),
  showNotes: Boolean(prefsStore.get('showNotes')),
  showReview: Boolean(prefsStore.get('showReview')),
};

const getUpdateSuffix = () => {
  if (updateReadyToInstall) {
    return updateReadyVersion ? ` (Ready v${updateReadyVersion})` : ' (Ready)';
  }
  if (updateUiState === 'checking') return ' (Checking…)';
  if (updateUiState === 'upToDate') return ' (Up to date)';
  if (updateUiState === 'downloading') return updateUiVersion ? ` (Downloading v${updateUiVersion}…)` : ' (Downloading…)';
  if (updateUiState === 'downloaded') return updateUiVersion ? ` (Downloaded v${updateUiVersion})` : ' (Downloaded)';
  if (updateUiState === 'error') return ' (Check failed)';
  return '';
};

const broadcastState = () => {
  if (!mainWindow) return;
  mainWindow.webContents.send('desktop:state', { ...notificationState });
};

const safeToggleDevTools = (win: BrowserWindow | null) => {
  try {
    if (!win) return;
    if (win.webContents.isDevToolsOpened()) {
      win.webContents.closeDevTools();
    } else {
      win.webContents.openDevTools({ mode: 'detach' });
    }
  } catch {
    // ignore
  }
};

const readBridgeState = async () => {
  if (!mainWindow) return { bridgePresent: false, shim: null as null | boolean, error: 'Main window not created' };
  try {
    const res = await mainWindow.webContents.executeJavaScript(
      `(() => {
        const dn = (window && window.desktopNotifications) ? window.desktopNotifications : null;
        return {
          hasDesktopNotifications: Boolean(dn),
          shim: dn ? Boolean(dn.__shim) : null,
          keys: dn ? Object.keys(dn) : [],
        };
      })()`,
      true
    );
    const hasDesktopNotifications = Boolean(res?.hasDesktopNotifications);
    const shim = res?.shim === null ? null : Boolean(res?.shim);
    return { bridgePresent: hasDesktopNotifications, shim, error: null as string | null, keys: res?.keys || [] };
  } catch (error: any) {
    return {
      bridgePresent: false,
      shim: null,
      error: error instanceof Error ? error.message : String(error),
      keys: [],
    };
  }
};

const showDebugDialog = async () => {
  const mainUrl = (() => {
    try {
      return mainWindow?.webContents.getURL() || '(none)';
    } catch {
      return '(unavailable)';
    }
  })();
  const pillUrl = (() => {
    try {
      return notificationWindow?.webContents.getURL() || '(none)';
    } catch {
      return '(unavailable)';
    }
  })();
  const bridge = await readBridgeState();

  const lines = [
    `App version: ${app.getVersion()}`,
    `isDev: ${String(isDev)}`,
    '',
    `Main window URL: ${mainUrl}`,
    `Desktop bridge present: ${String(bridge.bridgePresent)}`,
    `Desktop bridge shim: ${bridge.shim === null ? '(unknown)' : String(bridge.shim)}`,
    bridge.keys?.length ? `Desktop bridge keys: ${bridge.keys.join(', ')}` : 'Desktop bridge keys: (none)',
    bridge.error ? `Bridge check error: ${bridge.error}` : '',
    '',
    `Pill window exists: ${String(Boolean(notificationWindow))}`,
    `Pill window loaded: ${String(notificationWindowLoaded)}`,
    `Pill window URL: ${pillUrl}`,
    '',
    `Pending count (pillSummary.count): ${String(pillSummary.count)}`,
    `Paused: ${String(notificationState.effectivePaused)}`,
  ].filter((l) => l !== '');

  try {
    await dialog.showMessageBox({
      type: 'info',
      title: 'Desktop Debug Info',
      message: 'Connect CalAIM Desktop Debug',
      detail: lines.join('\n'),
      buttons: ['OK'],
    });
  } catch {
    // ignore
  }
};

const computeEffectivePaused = () => {
  const pausedForHours = !notificationState.allowAfterHours && !notificationState.isWithinBusinessHours;
  const snoozedNow = Number(notificationState.snoozedUntilMs || 0) > Date.now();
  notificationState.effectivePaused = notificationState.pausedByUser || pausedForHours || snoozedNow;
};

const formatSnoozeLabel = (untilMs: number) => {
  if (!untilMs || untilMs <= Date.now()) return '';
  try {
    return new Date(untilMs).toLocaleString();
  } catch {
    return '';
  }
};

const setSnoozeUntil = (untilMs: number) => {
  notificationState.snoozedUntilMs = Math.max(0, Number(untilMs || 0));
  try {
    prefsStore.set('snoozedUntilMs', notificationState.snoozedUntilMs);
  } catch {
    // ignore
  }
  computeEffectivePaused();
  broadcastState();
  updateTrayMenu();
};

const clearSnooze = () => {
  setSnoozeUntil(0);
};

const setFilters = (next: Partial<{ showNotes: boolean; showReview: boolean }>) => {
  if (next.showNotes !== undefined) {
    notificationState.showNotes = Boolean(next.showNotes);
    try { prefsStore.set('showNotes', notificationState.showNotes); } catch { /* ignore */ }
  }
  if (next.showReview !== undefined) {
    notificationState.showReview = Boolean(next.showReview);
    try { prefsStore.set('showReview', notificationState.showReview); } catch { /* ignore */ }
  }
  recomputeCombinedPill();
  renderNotificationPill();
  updateTrayMenu();
  broadcastState();
};

const openStaffStatusWindow = () => {
  try {
    if (statusWindow && !statusWindow.isDestroyed()) {
      statusWindow.show();
      statusWindow.focus();
      return;
    }

    statusWindow = new BrowserWindow({
      width: 760,
      height: 560,
      show: false,
      title: 'Staff Status Indicators',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    const url = getExternalUrl('/admin/desktop-status');
    statusWindow.loadURL(url).catch(() => undefined);
    statusWindow.once('ready-to-show', () => {
      try {
        statusWindow?.show();
      } catch {
        // ignore
      }
    });
    statusWindow.on('closed', () => {
      statusWindow = null;
    });
  } catch {
    // ignore
  }
};

const openChatWindow = () => {
  try {
    if (chatWindow && !chatWindow.isDestroyed()) {
      chatWindow.show();
      chatWindow.focus();
      return;
    }

    chatWindow = new BrowserWindow({
      width: 980,
      height: 720,
      show: false,
      title: 'Staff Chat',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    const url = getExternalUrl('/admin/desktop-chat-window');
    chatWindow.loadURL(url).catch(() => undefined);
    chatWindow.once('ready-to-show', () => {
      try {
        chatWindow?.show();
      } catch {
        // ignore
      }
    });
    chatWindow.on('closed', () => {
      chatWindow = null;
    });
  } catch {
    // ignore
  }
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
    // Avoid reloading the same URL repeatedly (can create a reload loop if the renderer
    // re-triggers open requests during startup).
    try {
      const current = mainWindow.webContents.getURL();
      if (current && current === target) {
        mainWindow.show();
        mainWindow.focus();
        return;
      }
    } catch {
      // ignore
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
  const updateSuffix = getUpdateSuffix();
  const showDebugItems =
    isDev || String(process.env.DESKTOP_SHOW_DEBUG || '').trim() === '1';
  const snoozeUntil = Number(notificationState.snoozedUntilMs || 0);
  const snoozeActive = snoozeUntil > Date.now();
  const snoozeLabel = snoozeActive ? `Snoozed until: ${formatSnoozeLabel(snoozeUntil)}` : 'Not snoozed';
  const suppressionCounts = countActiveSuppressions();
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
      label: 'Open Chat',
      click: () => openChatWindow(),
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
        try {
          prefsStore.set('allowAfterHours', notificationState.allowAfterHours);
        } catch {
          // ignore
        }
        computeEffectivePaused();
        broadcastState();
        updateTrayMenu();
      }
    },
    {
      label: notificationState.pausedByUser ? 'Resume Notifications' : 'Pause Notifications',
      click: () => {
        notificationState.pausedByUser = !notificationState.pausedByUser;
        try {
          prefsStore.set('pausedByUser', notificationState.pausedByUser);
        } catch {
          // ignore
        }
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
      label: `Snooze: ${snoozeLabel}`,
      enabled: false,
    },
    {
      label: 'Snooze (15 minutes)',
      click: () => setSnoozeUntil(Date.now() + 15 * 60 * 1000),
    },
    {
      label: 'Snooze (1 hour)',
      click: () => setSnoozeUntil(Date.now() + 60 * 60 * 1000),
    },
    {
      label: 'Snooze (until tomorrow 8:00 AM)',
      click: () => {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);
        tomorrow.setHours(8, 0, 0, 0);
        setSnoozeUntil(tomorrow.getTime());
      },
    },
    {
      label: 'Clear Snooze',
      enabled: snoozeActive,
      click: () => clearSnooze(),
    },
    { type: 'separator' },
    {
      label: `${notificationState.showNotes ? 'Hide' : 'Show'} Priority Notes`,
      click: () => setFilters({ showNotes: !notificationState.showNotes }),
    },
    {
      label: `${notificationState.showReview ? 'Hide' : 'Show'} CS/Docs Review Alerts`,
      click: () => setFilters({ showReview: !notificationState.showReview }),
    },
    { type: 'separator' },
    {
      label: `Snoozed notes: ${suppressionCounts.snoozed}`,
      enabled: false,
    },
    {
      label: 'Clear snoozed notes',
      enabled: suppressionCounts.snoozed > 0,
      click: () => {
        snoozedNoteUntilById = {};
        saveSuppressionMaps();
        pillLastUpdatedAtMs = Date.now();
        recomputeCombinedPill();
        if (pillSummary.count > 0) renderNotificationPill();
        updateTrayMenu();
      },
    },
    {
      label: `Muted senders: ${suppressionCounts.muted}`,
      enabled: false,
    },
    {
      label: 'Clear muted senders',
      enabled: suppressionCounts.muted > 0,
      click: () => {
        mutedSenderUntilById = {};
        saveSuppressionMaps();
        pillLastUpdatedAtMs = Date.now();
        recomputeCombinedPill();
        if (pillSummary.count > 0) renderNotificationPill();
        updateTrayMenu();
      },
    },
    { type: 'separator' },
    {
      label: 'Show staff status indicators',
      click: () => openStaffStatusWindow(),
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
          await runManualUpdateCheck('about');
        }
      }
    },
    {
      label: `Check for Updates${updateSuffix}`,
      click: () => {
        void runManualUpdateCheck('tray');
      }
    },
    { type: 'separator' },
    {
      label: 'Troubleshooting: Show diagnostics',
      click: () => void showDiagnosticsDialog(),
    },
    {
      label: pillHiddenByUser ? 'Show pill' : 'Hide pill (temporarily)',
      click: () => {
        pillHiddenByUser = !pillHiddenByUser;
        if (pillHiddenByUser) {
          closeNotificationWindow();
        } else {
          try {
            if (pillSummary.count > 0) {
              showMinimizedPill();
            }
          } catch {
            // ignore
          }
        }
        updateTrayMenu();
      }
    },
    {
      label: 'Refresh app (reload)',
      click: () => {
        try {
          mainWindow?.webContents.reloadIgnoringCache();
        } catch {
          // ignore
        }
      }
    },
    {
      label: 'Force refresh notifications',
      click: () => {
        pillLastUpdatedAtMs = Date.now();
        try {
          mainWindow?.webContents.reloadIgnoringCache();
        } catch {
          // ignore
        }
        try {
          if (notificationWindow) {
            renderNotificationPill();
          }
        } catch {
          // ignore
        }
      }
    },
    { type: 'separator' },
    ...(showDebugItems
      ? ([
          {
            label: 'Debug: Show state',
            click: () => {
              void showDebugDialog();
            }
          },
          {
            label: 'Debug: Toggle DevTools (main)',
            click: () => {
              safeToggleDevTools(mainWindow);
            }
          },
          {
            label: 'Debug: Toggle DevTools (pill)',
            click: () => {
              safeToggleDevTools(notificationWindow);
            }
          },
          { type: 'separator' as const },
        ] as const)
      : []),
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

  const safeReload = (reason: string) => {
    try {
      console.warn(`[desktop] Reloading main window (${reason})`);
    } catch {
      // ignore
    }
    try {
      mainWindow?.webContents.reloadIgnoringCache();
    } catch {
      // ignore
    }
  };

  try {
    mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      // Don't spam dialogs; keep last few lines accessible via diagnostics.
      try {
        if (typeof message === 'string' && message.toLowerCase().includes('error')) {
          recentRendererErrors.push({
            type: 'console',
            message: `${message} (${sourceId}:${line})`,
            ts: Date.now(),
            href: (() => { try { return mainWindow?.webContents.getURL(); } catch { return undefined; } })(),
          });
          if (recentRendererErrors.length > 25) {
            recentRendererErrors = recentRendererErrors.slice(-25);
          }
        }
      } catch {
        // ignore
      }
    });
    mainWindow.webContents.on('render-process-gone', (_event, details) => {
      safeReload(`render-process-gone: ${details?.reason || 'unknown'}`);
    });
    mainWindow.webContents.on('unresponsive', () => {
      // Don't force quit; attempt reload.
      safeReload('unresponsive');
    });
    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      try {
        console.warn('[desktop] did-fail-load', { errorCode, errorDescription, validatedURL });
      } catch {
        // ignore
      }
      // If a load fails (bad domain, offline, etc.), retry once via reload.
      safeReload(`did-fail-load: ${errorCode}`);
    });
  } catch {
    // ignore
  }

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

ipcMain.on('desktop:rendererError', async (_event, payload: any) => {
  try {
    const item = {
      type: String(payload?.type || 'error'),
      message: String(payload?.message || 'Renderer error'),
      stack: payload?.stack ? String(payload.stack) : undefined,
      href: payload?.href ? String(payload.href) : undefined,
      ts: Number(payload?.ts || Date.now()),
    };
    recentRendererErrors.push(item);
    if (recentRendererErrors.length > 25) {
      recentRendererErrors = recentRendererErrors.slice(-25);
    }

    // Only pop a dialog at most once per 30 seconds.
    const now = Date.now();
    if (now - rendererErrorDialogShownAt < 30_000) return;
    rendererErrorDialogShownAt = now;

    await dialog.showMessageBox({
      type: 'error',
      title: 'Application error',
      message: 'The app hit a client-side error.',
      detail: `Open Tray → Troubleshooting → Show diagnostics to copy the error details.\n\n${item.message}`,
      buttons: ['OK'],
    });
  } catch {
    // ignore
  }
});

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

const scheduleAutoMinimize = (ms: number = 14_000) => {
  if (notificationTimer) {
    clearTimeout(notificationTimer);
    notificationTimer = null;
  }
  notificationTimer = setTimeout(() => {
    notificationTimer = null;
    try {
      showMinimizedPill();
    } catch {
      // ignore
    }
  }, ms);
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
    // Prevent user dragging the pill window (Windows can glitch and tray may hang).
    try {
      notificationWindow.setMovable(false);
    } catch {
      // ignore
    }
    try {
      notificationWindow.setMinimizable(false);
      notificationWindow.setMaximizable(false);
      (notificationWindow as any).setFullScreenable?.(false);
    } catch {
      // ignore
    }
    try {
      // Block OS-initiated drag/move gestures (if supported on this platform).
      (notificationWindow as any).on?.('will-move', (event: any) => {
        if (isPositioningPillWindow) return;
        try {
          event.preventDefault();
        } catch {
          // ignore
        }
      });
    } catch {
      // ignore
    }
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
    isPositioningPillWindow = true;
    notificationWindow.setPosition(Math.round(clampedX), Math.round(clampedY), false);
    isPositioningPillWindow = false;
    return;
  }
  const margin = 16;
  const x = workArea.x + workArea.width - windowBounds.width - margin;
  const y = workArea.y + workArea.height - windowBounds.height - margin;
  isPositioningPillWindow = true;
  notificationWindow.setPosition(Math.round(x), Math.round(y), false);
  isPositioningPillWindow = false;
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
    const activeIndex = Math.max(0, Math.min(pillIndex, Math.max(0, pillNotes.length - 1)));
    const activeNote = pillNotes.length > 0 ? pillNotes[activeIndex] : null;
    win.webContents.send('desktop:pillState', {
      count: pillSummary.count,
      mode: pillMode,
      updatedAtMs: pillLastUpdatedAtMs,
      activeIndex,
      activeNote,
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
  if (pillHiddenByUser) {
    closeNotificationWindow();
    return;
  }
  pillMode = 'panel';
  renderNotificationPill();
};

const recomputeCombinedPill = () => {
  const combined: PillItem[] = [];
  if (notificationState.showNotes) {
    combined.push(...staffPillNotes);
  }
  if (notificationState.showReview) {
    combined.push(...reviewPillNotes);
  }

  // Best-effort newest-first sort using Date.parse on timestamp labels.
  combined.sort((a, b) => {
    const at = Date.parse(String(a.timestamp || '')) || 0;
    const bt = Date.parse(String(b.timestamp || '')) || 0;
    return bt - at;
  });

  pillNotes = combined;
  pillIndex = 0;
  pillSummary.count =
    (notificationState.showNotes ? staffPillCount : 0)
    + (notificationState.showReview ? reviewPillCount : 0);
};

const showMinimizedPill = () => {
  if (pillSummary.count <= 0) {
    closeNotificationWindow();
    return;
  }
  if (pillHiddenByUser) {
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
      void runManualUpdateCheck('about');
    }
  });
};

const createAppMenu = () => {
  const updateSuffix = getUpdateSuffix();
  const template = [
    {
      label: 'Connect CalAIM',
      submenu: [
        { label: 'About Connect CalAIM', click: showAboutDialog },
        { label: `Check for Updates${updateSuffix}`, click: () => void runManualUpdateCheck('menu') },
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

  autoUpdater.on('checking-for-update', () => {
    setUpdateUi({ state: 'checking', lastCheckedAt: Date.now() });
  });

  autoUpdater.on('update-available', (info: any) => {
    const nextVersion = typeof info?.version === 'string' ? info.version : null;
    setUpdateUi({ state: 'downloading', version: nextVersion, lastCheckedAt: Date.now() });
  });

  autoUpdater.on('update-not-available', () => {
    setUpdateUi({ state: 'upToDate', version: null, lastCheckedAt: Date.now() });
  });

  autoUpdater.on('download-progress', (progress: any) => {
    const nextVersion = updateUiVersion;
    // Keep it simple: expose "downloading" state in the tray label.
    setUpdateUi({ state: 'downloading', version: nextVersion, lastCheckedAt: updateUiLastCheckedAt ?? Date.now() });
    try {
      if (typeof progress?.percent === 'number') {
        // percent is noisy; do not spam dialogs, only keep tray label stable.
      }
    } catch {
      // ignore
    }
  });

  autoUpdater.on('update-downloaded', async (info: any) => {
    const nextVersion = typeof info?.version === 'string' ? info.version : null;
    setUpdateUi({
      state: 'downloaded',
      version: nextVersion,
      lastCheckedAt: Date.now(),
      readyToInstall: true,
      readyVersion: nextVersion,
    });
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
    setUpdateUi({ state: 'error', lastCheckedAt: Date.now() });
  });

  autoUpdater.checkForUpdates().catch(() => undefined);
};

ipcMain.handle('desktop:getState', () => {
  computeEffectivePaused();
  return { ...notificationState };
});

ipcMain.handle('desktop:setPaused', (_event, paused: boolean) => {
  notificationState.pausedByUser = Boolean(paused);
  try {
    prefsStore.set('pausedByUser', notificationState.pausedByUser);
  } catch {
    // ignore
  }
  computeEffectivePaused();
  broadcastState();
  updateTrayMenu();
  return { ...notificationState };
});

ipcMain.handle('desktop:setSnooze', (_event, payload: { untilMs: number }) => {
  setSnoozeUntil(Number(payload?.untilMs || 0));
  return { ...notificationState };
});

ipcMain.handle('desktop:clearSnooze', () => {
  clearSnooze();
  return { ...notificationState };
});

ipcMain.handle('desktop:openStaffStatus', () => {
  openStaffStatusWindow();
  return true;
});

ipcMain.handle('desktop:refreshApp', () => {
  try {
    mainWindow?.webContents.reloadIgnoringCache();
  } catch {
    // ignore
  }
  return true;
});

ipcMain.handle('desktop:snoozeNote', (_event, payload: { noteId: string; untilMs: number }) => {
  const noteId = String(payload?.noteId || '').trim();
  const untilMs = Number(payload?.untilMs || 0);
  if (!noteId) return false;
  if (!untilMs || Number.isNaN(untilMs) || untilMs <= Date.now()) {
    delete snoozedNoteUntilById[noteId];
  } else {
    snoozedNoteUntilById[noteId] = untilMs;
  }
  saveSuppressionMaps();
  pillLastUpdatedAtMs = Date.now();
  staffPillNotes = applySuppressionFilters(staffPillNotes);
  staffPillCount = staffPillNotes.length;
  recomputeCombinedPill();
  if (pillSummary.count > 0) renderNotificationPill();
  updateTrayMenu();
  return true;
});

ipcMain.handle('desktop:clearSnoozeNote', (_event, payload: { noteId: string }) => {
  const noteId = String(payload?.noteId || '').trim();
  if (!noteId) return false;
  delete snoozedNoteUntilById[noteId];
  saveSuppressionMaps();
  pillLastUpdatedAtMs = Date.now();
  staffPillNotes = applySuppressionFilters(staffPillNotes);
  staffPillCount = staffPillNotes.length;
  recomputeCombinedPill();
  if (pillSummary.count > 0) renderNotificationPill();
  updateTrayMenu();
  return true;
});

ipcMain.handle('desktop:muteSender', (_event, payload: { senderId: string; untilMs: number }) => {
  const senderId = String(payload?.senderId || '').trim();
  const untilMs = Number(payload?.untilMs || 0);
  if (!senderId) return false;
  if (!untilMs || Number.isNaN(untilMs) || untilMs <= Date.now()) {
    delete mutedSenderUntilById[senderId];
  } else {
    mutedSenderUntilById[senderId] = untilMs;
  }
  saveSuppressionMaps();
  pillLastUpdatedAtMs = Date.now();
  staffPillNotes = applySuppressionFilters(staffPillNotes);
  staffPillCount = staffPillNotes.length;
  recomputeCombinedPill();
  if (pillSummary.count > 0) renderNotificationPill();
  updateTrayMenu();
  return true;
});

ipcMain.handle('desktop:clearMuteSender', (_event, payload: { senderId: string }) => {
  const senderId = String(payload?.senderId || '').trim();
  if (!senderId) return false;
  delete mutedSenderUntilById[senderId];
  saveSuppressionMaps();
  pillLastUpdatedAtMs = Date.now();
  staffPillNotes = applySuppressionFilters(staffPillNotes);
  staffPillCount = staffPillNotes.length;
  recomputeCombinedPill();
  if (pillSummary.count > 0) renderNotificationPill();
  updateTrayMenu();
  return true;
});

ipcMain.handle('desktop:notify', (_event, payload: { title: string; body: string; openOnNotify?: boolean; actionUrl?: string }) => {
  computeEffectivePaused();
  if (notificationState.effectivePaused) return false;

  if (payload.actionUrl) {
    pillSummary.actionUrl = String(payload.actionUrl);
  }
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
      actionUrl: payload.actionUrl || pillSummary.actionUrl || '/admin/my-notes',
      timestamp: new Date().toISOString(),
    });
  } catch {
    // ignore
  }

  if (payload.openOnNotify) {
    // Show/focus without navigating. Navigating via loadURL during startup can cause a reload
    // loop if the web app re-emits notifications on every load.
    try {
      if (!mainWindow) {
        createWindow();
      }
      mainWindow?.show();
      mainWindow?.focus();
      mainWindow?.webContents.send('desktop:expand');
    } catch {
      // ignore
    }
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
  // Disabled: user-moving the pill can cause Windows artifacts and hang tray interactions.
  // Keep handler as a no-op for backwards compatibility with older renderers.
  void payload;
});

ipcMain.handle('desktop:getPillPosition', () => {
  // Disabled: returning null discourages any drag-from-baseline behavior.
  return null;
});

ipcMain.on('desktop:setPillSummary', (_event, payload: {
  count: number;
  openPanel?: boolean;
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
  pillLastUpdatedAtMs = Date.now();
  const normalized = (payload.notes || []).map((note) => ({
    ...note,
    kind: note.kind || 'note'
  }));
  staffPillNotes = applySuppressionFilters(normalized);
  staffPillCount = staffPillNotes.length;
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
    if (payload.openPanel) {
      showPanel();
      scheduleAutoMinimize();
    } else {
      showMinimizedPill();
    }
  } else {
    closeNotificationWindow();
  }
});

ipcMain.on('desktop:setReviewPillSummary', (_event, payload: {
  count: number;
  openPanel?: boolean;
  notes?: PillItem[];
}) => {
  pillLastUpdatedAtMs = Date.now();
  reviewPillNotes = (payload.notes || []).map((note) => ({
    ...note,
    kind: note.kind || 'docs'
  }));
  reviewPillCount = reviewPillNotes.length;
  recomputeCombinedPill();
  if (pillSummary.count > 0) {
    if (payload.openPanel) {
      showPanel();
      scheduleAutoMinimize();
    } else {
      showMinimizedPill();
    }
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
  await runManualUpdateCheck('menu');
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
