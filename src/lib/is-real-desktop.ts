export function isRealDesktop() {
  if (typeof window === 'undefined') return false;
  const w = window as any;
  const dn = w?.desktopNotifications;
  const pill = w?.desktopNotificationPill;
  const hasDesktopBridge = Boolean(dn) && !Boolean(dn?.__shim);
  const hasPillBridge = Boolean(pill);
  return hasDesktopBridge || hasPillBridge;
}

