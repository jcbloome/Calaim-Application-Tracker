export function isPlaceholderRcfeName(name: unknown): boolean {
  const s = String(name ?? '').trim();
  if (!s) return false;
  // "CalAIM_Use" is a temporary placeholder used before an actual RCFE is selected.
  // Treat any variant like "CalAIM_Use", "CalAIM Use", "CalAIM-Use" as placeholder.
  return /\bcalaim[\s_-]*use\b/i.test(s);
}

/**
 * Returns a normalized RCFE name that is valid for assignment workflows.
 * If the RCFE is missing or a known placeholder, returns an empty string.
 */
export function normalizeRcfeNameForAssignment(name: unknown): string {
  const s = String(name ?? '').trim();
  if (!s) return '';
  if (isPlaceholderRcfeName(s)) return '';
  return s;
}

