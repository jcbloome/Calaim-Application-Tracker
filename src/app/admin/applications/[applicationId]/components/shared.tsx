import { format } from 'date-fns';
import { CheckCircle2 } from 'lucide-react';

export const DEFAULT_SOCIAL_WORKER_HOLD_VALUE = '🔴 Hold';
export const REQUIRED_PRE_PUSH_KAISER_STATUSES = [
  'T2038 Received, Need First Contact',
  'T2038 Received, doc collection',
  'T2038, Not Requested, Doc Collection',
  'T2038 Requested',
] as const;
export const normalizeStatusToken = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
export const REQUIRED_PRE_PUSH_KAISER_STATUS_TOKENS = new Set(
  REQUIRED_PRE_PUSH_KAISER_STATUSES.map((status) => normalizeStatusToken(status))
);
export const isRequiredPrePushKaiserStatus = (value: unknown) =>
  REQUIRED_PRE_PUSH_KAISER_STATUS_TOKENS.has(normalizeStatusToken(value));

export function toMillisSafe(value: unknown): number {
  try {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return Math.round(value);
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (/^\d+$/.test(trimmed)) {
        const parsedNumeric = Number(trimmed);
        if (Number.isFinite(parsedNumeric) && parsedNumeric > 0) {
          return Math.round(parsedNumeric);
        }
      }
      const parsed = new Date(trimmed).getTime();
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    const ts = value as {
      toDate?: () => Date;
      toMillis?: () => number;
      seconds?: number;
      _seconds?: number;
    } | null;
    if (ts && typeof ts.toMillis === 'function') {
      const ms = Number(ts.toMillis());
      if (Number.isFinite(ms) && ms > 0) return ms;
    }
    if (ts && typeof ts.toDate === 'function') {
      const ms = ts.toDate().getTime();
      if (Number.isFinite(ms) && ms > 0) return ms;
    }
    const seconds = typeof ts?.seconds === 'number' ? ts.seconds : ts?._seconds;
    if (typeof seconds === 'number' && seconds > 0) return Math.round(seconds * 1000);
    const ms = new Date(String(value || '')).getTime();
    return Number.isFinite(ms) ? ms : 0;
  } catch {
    return 0;
  }
}

export const ILS_SERVICE_STARTED_EMAIL = 'ils-calaim@ilshealth.com';
export const CLAIMS_EMAIL_TO = 'alberto@carehomefinders.com';
export const CLAIMS_EMAIL_NAME = 'Alberto';
export const DEFAULT_SENDER_PHONE = '800-330-5993';

export function QaDoneMeta({
  done,
  atMs,
  titlePrefix = 'Completed',
}: {
  done?: boolean;
  atMs?: number;
  titlePrefix?: string;
}) {
  if (!done) return null;
  let dateLabel = '';
  if (atMs && Number.isFinite(atMs) && atMs > 0) {
    try {
      dateLabel = format(new Date(atMs), 'MMM d, yyyy');
    } catch {
      dateLabel = '';
    }
  }
  return (
    <span
      className="inline-flex items-center gap-1 shrink-0 text-green-700"
      title={dateLabel ? `${titlePrefix} ${dateLabel}` : titlePrefix}
    >
      <CheckCircle2 className="h-4 w-4" aria-label={titlePrefix} />
      {dateLabel ? <span className="text-[10px] font-medium whitespace-nowrap">{dateLabel}</span> : null}
    </span>
  );
}

export function buildIlsEmailSignature(params: {
  name?: string;
  email?: string;
  phone?: string;
}) {
  const name = String(params.name || '').trim() || 'CalAIM Team';
  const email = String(params.email || '').trim();
  const phone = String(params.phone || '').trim() || DEFAULT_SENDER_PHONE;
  return [
    'Thank You!',
    '',
    name,
    email || null,
    phone || null,
  ]
    .filter((line) => line !== null)
    .join('\n');
}

export function withIlsEmailSignature(body: string, signature: string) {
  const normalizedBody = String(body || '').trim();
  const normalizedSignature = String(signature || '').trim();
  if (!normalizedSignature) return normalizedBody;
  if (/thank\s*you!?/i.test(normalizedBody)) return normalizedBody;
  return `${normalizedBody}\n\n${normalizedSignature}`;
}
