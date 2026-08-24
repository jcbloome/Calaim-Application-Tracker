export function normalizeContactEmail(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

/** Store both display and lowercase email so family claim queries match reliably. */
export function withNormalizedBestContactEmail(email: unknown) {
  const bestContactEmail = String(email ?? '').trim();
  const bestContactEmailLower = normalizeContactEmail(bestContactEmail);
  return { bestContactEmail, bestContactEmailLower };
}
