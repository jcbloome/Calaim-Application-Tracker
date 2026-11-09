'use client';

/**
 * Formerly polled for Electron/web review popups.
 * Electron is removed and review popups are retired; keep a no-op mount for layout compatibility.
 */
export function ReviewNotificationPoller() {
  return null;
}
