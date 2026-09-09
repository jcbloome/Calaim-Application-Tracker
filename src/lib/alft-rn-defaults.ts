/** Default RN (Leslie Lopez) license for ALFT signature blocks. */
export const DEFAULT_ALFT_RN_LICENSE_NUMBER = '95357474';

export function isDefaultAlftRnName(name: unknown): boolean {
  const normalized = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (!normalized) return false;
  if (normalized === 'leslie' || normalized === 'leslie lopez') return true;
  // e.g. "Leslie Lopez, RN" / "Leslie (RN)"
  return /^leslie(\s+lopez)?\b/.test(normalized);
}

/** Always use Leslie's license when the RN print name is Leslie. */
export function resolveAlftRnLicenseNumber(printName: unknown, currentLicense?: unknown): string {
  if (isDefaultAlftRnName(printName)) return DEFAULT_ALFT_RN_LICENSE_NUMBER;
  return String(currentLicense || '').trim();
}
