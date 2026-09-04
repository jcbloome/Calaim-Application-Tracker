/**
 * ALFT date display/storage helpers.
 * Standard form date format: mm-dd-yyyy
 */

const pad2 = (n: number | string) => String(n).padStart(2, '0');

export function toAlftDateMs(value: unknown): number {
  if (value == null || value === '') return 0;
  try {
    if (typeof (value as any)?.toMillis === 'function') return (value as any).toMillis();
    if (typeof (value as any)?.toDate === 'function') return (value as any).toDate().getTime();
    if (typeof value === 'object') {
      const seconds = Number((value as any).seconds ?? (value as any)._seconds);
      const nanos = Number((value as any).nanoseconds ?? (value as any)._nanoseconds ?? 0);
      if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000 + Math.floor(nanos / 1e6);
    }
    const raw = String(value).trim();
    if (!raw || raw === '[object Object]') return 0;
    const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) {
      const ms = Date.parse(`${iso[1]}-${pad2(iso[2])}-${pad2(iso[3])}T12:00:00`);
      return Number.isFinite(ms) ? ms : 0;
    }
    const dash = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (dash) {
      const ms = Date.parse(`${dash[3]}-${pad2(dash[1])}-${pad2(dash[2])}T12:00:00`);
      return Number.isFinite(ms) ? ms : 0;
    }
    const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slash) {
      const ms = Date.parse(`${slash[3]}-${pad2(slash[1])}-${pad2(slash[2])}T12:00:00`);
      return Number.isFinite(ms) ? ms : 0;
    }
    const ms = Date.parse(raw);
    return Number.isFinite(ms) ? ms : 0;
  } catch {
    return 0;
  }
}

/** Normalize any common date input to mm-dd-yyyy. */
export function toAlftMmDdYyyy(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw || raw === '[object Object]') return '';
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${pad2(iso[2])}-${pad2(iso[3])}-${iso[1]}`;
  const dash = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dash) return `${pad2(dash[1])}-${pad2(dash[2])}-${dash[3]}`;
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) return `${pad2(slash[1])}-${pad2(slash[2])}-${slash[3]}`;
  const ms = toAlftDateMs(value);
  if (!ms) return raw;
  const d = new Date(ms);
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}-${d.getFullYear()}`;
}

/** Valid mm-dd-yyyy (or mm/dd/yyyy) calendar date. */
export function isAlftMmDdYyyy(value: unknown): boolean {
  const normalized = toAlftMmDdYyyy(value);
  const m = normalized.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return false;
  const month = Number(m[1]);
  const day = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900) return false;
  const dt = new Date(year, month - 1, day);
  return dt.getFullYear() === year && dt.getMonth() === month - 1 && dt.getDate() === day;
}

/** Electronic signature notice datetime: mm-dd-yyyy, h:mm:ss AM/PM */
export function formatAlftElectronicSignedAt(value: unknown): string {
  const ms = toAlftDateMs(value);
  if (!ms) {
    const raw = String(value ?? '').trim();
    if (!raw || raw === '[object Object]') return '';
    // Already a notice sentence — leave caller to wrap.
    return raw;
  }
  const d = new Date(ms);
  const datePart = `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}-${d.getFullYear()}`;
  const timePart = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
  return `${datePart}, ${timePart}`;
}

export const ALFT_DATE_FIELD_IDS = new Set([
  'p1_assessment_date',
  'p1_dob',
  'p1_referral_date',
  'p14_date',
]);
