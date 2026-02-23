export const SW_DAILY_LOGIN_DAY_KEY = 'sw:dailyLoginDay';

const pad2 = (n: number) => String(n).padStart(2, '0');

export function getTodayLocalDayKey(date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function msUntilNextLocalMidnight(date = new Date()): number {
  const next = new Date(date);
  next.setHours(24, 0, 0, 0);
  return Math.max(0, next.getTime() - date.getTime());
}

export function readStoredSwLoginDay(): string | null {
  try {
    if (typeof window === 'undefined') return null;
    const v = window.localStorage.getItem(SW_DAILY_LOGIN_DAY_KEY);
    return v ? String(v).trim() : null;
  } catch {
    return null;
  }
}

export function writeStoredSwLoginDay(dayKey: string) {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SW_DAILY_LOGIN_DAY_KEY, dayKey);
  } catch {
    // ignore
  }
}

export function clearStoredSwLoginDay() {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(SW_DAILY_LOGIN_DAY_KEY);
  } catch {
    // ignore
  }
}

