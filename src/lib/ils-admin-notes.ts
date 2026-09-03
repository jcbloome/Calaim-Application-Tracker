/** Headings used when Create App imports Kaiser ILS MIF / single-auth rows into adminNotes. */
export const ILS_SPREADSHEET_DETAILS_HEADING = 'ILS Spreadsheet Details';
export const SINGLE_AUTH_PDF_DETAILS_HEADING = 'Single Auth PDF Details';

export function looksLikeOriginalIlsImportNotes(text: unknown): boolean {
  const lower = String(text || '').toLowerCase();
  return (
    lower.includes('ils spreadsheet details') ||
    lower.includes('single auth pdf details')
  );
}

/**
 * Strip the original MIF / ILS spreadsheet dump (and the "Imported intake/admin notes"
 * wrapper around it) so subsequent Caspio client-notes pushes only send updated notes.
 */
export function stripOriginalIlsImportNotes(text: unknown): string {
  const raw = String(text || '').trim();
  if (!raw) return '';
  if (!looksLikeOriginalIlsImportNotes(raw) && !/imported intake\/admin notes:/i.test(raw)) {
    return raw;
  }

  const parts = raw.split(
    /\n(?=(?:ILS Spreadsheet Details|Single Auth PDF Details|Imported intake\/admin notes:))/i
  );
  const kept = parts
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => {
      const head = part.toLowerCase();
      if (head.startsWith('ils spreadsheet details')) return false;
      if (head.startsWith('single auth pdf details')) return false;
      if (head.startsWith('imported intake/admin notes:')) {
        const body = part.replace(/^imported intake\/admin notes:\s*/i, '').trim();
        // Drop the wrapper when it only re-carries the original MIF dump.
        return Boolean(body) && !looksLikeOriginalIlsImportNotes(body);
      }
      return true;
    });

  return kept.join('\n\n').trim();
}
