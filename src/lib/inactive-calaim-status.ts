export const INACTIVE_CALAIM_STATUSES = [
  'Closed',
  'Denied',
  'Member Died',
  'Non-Active',
  'Not Interested',
] as const;

export type InactiveCalaimStatus = (typeof INACTIVE_CALAIM_STATUSES)[number];

const normalize = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

/** Map a CalAIM status string onto an inactive label, or null when the member stays active. */
export function canonicalInactiveCalaimStatus(value: unknown): InactiveCalaimStatus | null {
  const status = normalize(value);
  if (!status) return null;
  if (status === 'closed' || status === 'case closed' || status.endsWith(' closed')) return 'Closed';
  if (status === 'denied') return 'Denied';
  if (
    status === 'member died' ||
    status === 'died' ||
    status === 'deceased' ||
    status === 'passed away' ||
    status.includes('member died') ||
    status.includes('passed away')
  ) {
    return 'Member Died';
  }
  if (status === 'non active' || status === 'nonactive' || status === 'inactive') return 'Non-Active';
  if (status.includes('not interested') || status.includes('no longer interested')) return 'Not Interested';
  return null;
}

export function applicationInactiveCalaimStatus(app: {
  caspioCalAIMStatus?: unknown;
  CalAIM_Status?: unknown;
  calaimStatus?: unknown;
} | null | undefined): InactiveCalaimStatus | null {
  if (!app) return null;
  return (
    canonicalInactiveCalaimStatus(app.caspioCalAIMStatus) ||
    canonicalInactiveCalaimStatus(app.CalAIM_Status) ||
    canonicalInactiveCalaimStatus(app.calaimStatus)
  );
}

export function isInactiveCalaimApplication(app: Parameters<typeof applicationInactiveCalaimStatus>[0]) {
  return Boolean(applicationInactiveCalaimStatus(app));
}
