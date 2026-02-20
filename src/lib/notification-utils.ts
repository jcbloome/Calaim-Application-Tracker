export type NotePriority = 'General' | 'Priority' | 'Urgent';

export const WEB_NOTIFICATIONS_MOTHBALLED = true;

const PRIORITY_ORDER: Record<NotePriority, number> = {
  Urgent: 3,
  Priority: 2,
  General: 1
};

const normalizeRawPriority = (value?: string) => String(value || '').toLowerCase();

export const normalizePriorityLabel = (value?: string): NotePriority => {
  const normalized = normalizeRawPriority(value);
  if (normalized.includes('urgent')) return 'Urgent';
  if (
    normalized.includes('priority') ||
    normalized.includes('immediate') ||
    normalized.includes('high')
  ) {
    return 'Priority';
  }
  return 'General';
};

export const isUrgentPriority = (value?: string) => normalizePriorityLabel(value) === 'Urgent';

export const isPriorityOrUrgent = (value?: string) => {
  const label = normalizePriorityLabel(value);
  return label === 'Priority' || label === 'Urgent';
};

export const getPriorityRank = (value?: string) => {
  return PRIORITY_ORDER[normalizePriorityLabel(value)];
};

type NotificationSettings = {
  userControls?: {
    suppressWebWhenDesktopActive?: boolean;
    webAppNotificationsEnabled?: boolean;
  };
};

type NotificationSettingsGlobal = {
  globalControls?: {
    forceSuppressWebWhenDesktopActive?: boolean;
  };
};

const readLocalStorageJson = <T>(key: string): T | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

export const isWebAlertsEnabled = () => {
  if (WEB_NOTIFICATIONS_MOTHBALLED) return false;
  const settings = readLocalStorageJson<NotificationSettings>('notificationSettings');
  const value = settings?.userControls?.webAppNotificationsEnabled;
  return value === undefined ? true : Boolean(value);
};

export const shouldSuppressWebAlerts = () => {
  if (WEB_NOTIFICATIONS_MOTHBALLED) return true;
  if (typeof window === 'undefined') return false;
  const settings = readLocalStorageJson<NotificationSettings>('notificationSettings');
  const globalSettings = readLocalStorageJson<NotificationSettingsGlobal>('notificationSettingsGlobal');
  const userSuppress = settings?.userControls?.suppressWebWhenDesktopActive;
  const webAppEnabled = settings?.userControls?.webAppNotificationsEnabled;
  const globalForce = Boolean(globalSettings?.globalControls?.forceSuppressWebWhenDesktopActive);

  if (webAppEnabled === true) return globalForce;
  if (webAppEnabled === false) return true;
  return globalForce || userSuppress === true;
};

export const NOTIFICATION_SETTINGS_EVENT = 'notification-settings:changed';

export const notifyNotificationSettingsChanged = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(NOTIFICATION_SETTINGS_EVENT));
};
