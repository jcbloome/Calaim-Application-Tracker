export const SNF_RESIDENCY_REQUIRED_DAYS = 60;

export const SNF_RESIDENCY_NOTE =
  'Member must have resided in a Skilled Nursing Facility (SNF) for at least 60 days. Count combined hospital–SNF Medicare and Medi-Cal days when applicable.';

export function parseSnfResidencyDays(value: unknown): number | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const normalized = raw.replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const days = Math.floor(Number(normalized));
  if (!Number.isFinite(days) || days < 0 || days > 20000) return null;
  return days;
}

export function buildSnfResidencyFormFields(daysInput: unknown) {
  const days = parseSnfResidencyDays(daysInput);
  if (days == null) {
    return {
      snfResidencyDaysTotal: null as number | null,
      snfResidencyMeets60Days: null as boolean | null,
      snfResidencyNeedsStaffReview: false,
      snfResidencyRecordedAt: null as string | null,
    };
  }
  const meets = days >= SNF_RESIDENCY_REQUIRED_DAYS;
  return {
    snfResidencyDaysTotal: days,
    snfResidencyMeets60Days: meets,
    snfResidencyNeedsStaffReview: !meets,
    snfResidencyRecordedAt: new Date().toISOString(),
  };
}
