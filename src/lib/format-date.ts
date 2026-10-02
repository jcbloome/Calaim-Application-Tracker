import { toAlftDateMs } from '@/lib/alft-dates';

/**
 * Shared date display helpers. Accepts Firestore Timestamps, {seconds,nanoseconds}
 * objects, Date, epoch ms, ISO strings, and Caspio-style mm/dd/yyyy or mm-dd-yyyy.
 * Date-only strings are treated as local noon so they never shift a day.
 * All output uses Pacific time so every staff member sees the same values.
 */

const TIME_ZONE = 'America/Los_Angeles';

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  month: '2-digit',
  day: '2-digit',
  year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  month: '2-digit',
  day: '2-digit',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
});

export function toDateMs(value: unknown): number {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : 0;
  }
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : 0;
  return toAlftDateMs(value);
}

/** 10/02/2026 */
export function formatDate(value: unknown, fallback = ''): string {
  const ms = toDateMs(value);
  return ms ? dateFormatter.format(ms) : fallback;
}

/** 10/02/2026, 3:45 PM */
export function formatDateTime(value: unknown, fallback = ''): string {
  const ms = toDateMs(value);
  return ms ? dateTimeFormatter.format(ms) : fallback;
}

/** 3:45 PM */
export function formatTime(value: unknown, fallback = ''): string {
  const ms = toDateMs(value);
  return ms ? timeFormatter.format(ms) : fallback;
}

/** "just now", "5 min ago", "3 hr ago", "yesterday", "4 days ago", then the date. */
export function formatRelative(value: unknown, fallback = '', now: number = Date.now()): string {
  const ms = toDateMs(value);
  if (!ms) return fallback;
  const diffSec = Math.round((now - ms) / 1000);
  if (diffSec < 0) return formatDateTime(ms, fallback);
  if (diffSec < 45) return 'just now';
  const minutes = Math.round(diffSec / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return formatDate(ms, fallback);
}
