/**
 * Caspio / MIF sometimes store coded relationship values (e.g. "1", "4").
 * Those are not usable as free-text labels — return blank so staff can type
 * the real relationship (Daughter, Son, Spouse, POA, etc.).
 */
export function sanitizeRelationshipLabel(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  // Pure numeric lookup codes (and "4.0"-style spreadsheet cells).
  if (/^\d{1,3}(\.0+)?$/.test(raw)) return '';
  return raw;
}
