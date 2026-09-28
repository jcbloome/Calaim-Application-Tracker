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

const normalizeNotesForCompare = (text: string) =>
  String(text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Merge pre-assessment / push notes with Create App adminNotes without duplicating the
 * ILS Spreadsheet Details (or Single Auth PDF Details) block. Staff often edit the dump
 * in place, so exact `includes()` fails and used to append a second full copy.
 */
export function mergeNotesAvoidingIlsDuplicate(prePushNotes: unknown, adminIntakeNotes: unknown): string {
  const prePush = String(prePushNotes || '').trim();
  const adminIntake = String(adminIntakeNotes || '').trim();
  if (!prePush) return adminIntake;
  if (!adminIntake) return prePush;

  if (prePush.includes(adminIntake)) return prePush;
  if (normalizeNotesForCompare(prePush).includes(normalizeNotesForCompare(adminIntake))) {
    return prePush;
  }

  // Both sides carry the original MIF/ILS dump (pre-push may also have staff free-text).
  if (looksLikeOriginalIlsImportNotes(adminIntake) && looksLikeOriginalIlsImportNotes(prePush)) {
    return prePush;
  }

  // Admin is only the spreadsheet dump and pre-push already has that section heading.
  if (
    looksLikeOriginalIlsImportNotes(adminIntake) &&
    /(?:^|\n)\s*(?:ILS Spreadsheet Details|Single Auth PDF Details)\b/i.test(prePush)
  ) {
    return prePush;
  }

  // Avoid stacking another "Imported intake/admin notes:" wrapper if one is already present
  // and it already contains the same ILS dump.
  if (
    /imported intake\/admin notes:/i.test(prePush) &&
    looksLikeOriginalIlsImportNotes(adminIntake)
  ) {
    return prePush;
  }

  return `${prePush}\n\nImported intake/admin notes:\n${adminIntake}`;
}

/**
 * Collapse duplicate ILS Spreadsheet / Single Auth dumps already present in one notes blob
 * (e.g. staff-edited dump + a second "Imported intake/admin notes:" copy of the same dump).
 */
export function dedupeIlsNotesBlocks(text: unknown): string {
  const raw = String(text || '').trim();
  if (!raw) return '';
  if (!looksLikeOriginalIlsImportNotes(raw) && !/imported intake\/admin notes:/i.test(raw)) {
    return raw;
  }

  const parts = raw.split(
    /\n(?=(?:ILS Spreadsheet Details|Single Auth PDF Details|Imported intake\/admin notes:))/i
  );
  let sawIlsDump = false;
  const kept: string[] = [];

  for (const partRaw of parts) {
    const part = partRaw.trim();
    if (!part) continue;
    const head = part.toLowerCase();

    if (head.startsWith('imported intake/admin notes:')) {
      const body = part.replace(/^imported intake\/admin notes:\s*/i, '').trim();
      if (!body) continue;
      if (looksLikeOriginalIlsImportNotes(body)) {
        if (sawIlsDump) {
          // Keep any non-dump free text that was incorrectly nested under the wrapper.
          const remainder = stripOriginalIlsImportNotes(body);
          if (remainder) kept.push(remainder);
          continue;
        }
        sawIlsDump = true;
        kept.push(body);
        continue;
      }
      kept.push(part);
      continue;
    }

    if (head.startsWith('ils spreadsheet details') || head.startsWith('single auth pdf details')) {
      if (sawIlsDump) continue;
      sawIlsDump = true;
      kept.push(part);
      continue;
    }

    kept.push(part);
    if (looksLikeOriginalIlsImportNotes(part)) sawIlsDump = true;
  }

  return kept.join('\n\n').trim();
}
