/** Shared H2022 authorization end-date warning (Kaiser ~30d, Health Net ~14d). */

export type H2022PlanBucket = 'kaiser' | 'health_net' | 'other';

export type H2022EndWarning = {
  h2022EndWarning: boolean;
  h2022DaysUntilEnd: number | null;
  h2022WarningLabel: string | null;
  h2022EndDate: string | null;
};

const KAISER_H2022_WARNING_DAYS = 30;
const HEALTH_NET_H2022_WARNING_DAYS = 14;

const startOfLocalDayMs = (d = new Date()) => {
  const next = new Date(d);
  next.setHours(0, 0, 0, 0);
  return next.getTime();
};

export const resolveH2022PlanBucket = (raw?: unknown): H2022PlanBucket => {
  const plan = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!plan) return 'other';
  if (plan.includes('kaiser')) return 'kaiser';
  if (plan.includes('health') && plan.includes('net')) return 'health_net';
  return 'other';
};

const warningWindowDaysForPlan = (plan: H2022PlanBucket) => {
  if (plan === 'kaiser') return KAISER_H2022_WARNING_DAYS;
  if (plan === 'health_net') return HEALTH_NET_H2022_WARNING_DAYS;
  return 0;
};

/** Normalize Caspio/Firestore date strings to YYYY-MM-DD when possible. */
export const normalizeH2022EndDateIso = (raw?: unknown): string | null => {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export const buildH2022EndWarning = (
  planRaw: unknown,
  h2022EndRaw: unknown
): H2022EndWarning => {
  const plan = resolveH2022PlanBucket(planRaw);
  const h2022EndDate = normalizeH2022EndDateIso(h2022EndRaw);
  if (!h2022EndDate || plan === 'other') {
    return {
      h2022EndWarning: false,
      h2022DaysUntilEnd: null,
      h2022WarningLabel: null,
      h2022EndDate,
    };
  }
  const endMs = Date.parse(`${h2022EndDate}T00:00:00`);
  if (!Number.isFinite(endMs)) {
    return {
      h2022EndWarning: false,
      h2022DaysUntilEnd: null,
      h2022WarningLabel: null,
      h2022EndDate,
    };
  }
  const daysUntilEnd = Math.floor((endMs - startOfLocalDayMs()) / (24 * 60 * 60 * 1000));
  const windowDays = warningWindowDaysForPlan(plan);
  if (daysUntilEnd < 0) {
    return {
      h2022EndWarning: true,
      h2022DaysUntilEnd: daysUntilEnd,
      h2022WarningLabel: `H2022 ended ${Math.abs(daysUntilEnd)} day${
        Math.abs(daysUntilEnd) === 1 ? '' : 's'
      } ago`,
      h2022EndDate,
    };
  }
  if (daysUntilEnd <= windowDays) {
    const planLabel = plan === 'kaiser' ? 'Kaiser (1 month)' : 'Health Net (2 weeks)';
    return {
      h2022EndWarning: true,
      h2022DaysUntilEnd: daysUntilEnd,
      h2022WarningLabel:
        daysUntilEnd === 0
          ? `H2022 ends today — ${planLabel} warning`
          : `H2022 ends in ${daysUntilEnd} day${daysUntilEnd === 1 ? '' : 's'} — ${planLabel} warning`,
      h2022EndDate,
    };
  }
  return {
    h2022EndWarning: false,
    h2022DaysUntilEnd: daysUntilEnd,
    h2022WarningLabel: null,
    h2022EndDate,
  };
};
