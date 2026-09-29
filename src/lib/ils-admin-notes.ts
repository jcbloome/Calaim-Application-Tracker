/** Headings used when Create App imports Kaiser ILS MIF / single-auth rows into adminNotes. */
export const ILS_SPREADSHEET_DETAILS_HEADING = 'ILS Spreadsheet Details';
export const SINGLE_AUTH_PDF_DETAILS_HEADING = 'Single Auth PDF Details';

const cleanNoteValue = (value: unknown) => String(value ?? '').trim();

const noteLine = (label: string, value: unknown) => {
  const cleaned = cleanNoteValue(value);
  return cleaned ? `${label}: ${cleaned}` : '';
};

/**
 * Build the "Single Auth PDF Details" admin-notes block from parsed PDF / vision fields
 * so staff can review address, contact, auth, and care-manager data before Caspio push.
 */
export function buildSingleAuthPdfDetailsNotes(details: Record<string, unknown>): string {
  const d = details || {};
  const memberName = [cleanNoteValue(d.memberFirstName), cleanNoteValue(d.memberLastName)]
    .filter(Boolean)
    .join(' ');
  const street =
    cleanNoteValue(d.memberCustomaryAddress) ||
    cleanNoteValue(d.memberAddress) ||
    cleanNoteValue(d.memberMailingAddress);
  const city = cleanNoteValue(d.memberCustomaryCity) || cleanNoteValue(d.memberCity);
  const state = cleanNoteValue(d.memberCustomaryState) || cleanNoteValue(d.memberState);
  const zip = cleanNoteValue(d.memberCustomaryZip) || cleanNoteValue(d.memberZip);
  const county = cleanNoteValue(d.memberCustomaryCounty) || cleanNoteValue(d.memberCounty);
  const cityStateZip = [city && state ? `${city}, ${state}` : city || state, zip].filter(Boolean).join(' ');
  const fullAddress = [street, cityStateZip].filter(Boolean).join(', ');

  const lines = [
    SINGLE_AUTH_PDF_DETAILS_HEADING,
    noteLine('Source File', d.sourceFileName),
    noteLine('Member Name', memberName),
    noteLine('MRN', d.memberMrn),
    noteLine('Medi-Cal / CIN', d.memberMediCalNum || d.confirmMemberMediCalNum),
    noteLine('DOB', d.memberDob),
    noteLine('Member Address', street || fullAddress),
    noteLine('City', city),
    noteLine('State', state),
    noteLine('ZIP', zip),
    noteLine('County', county),
    noteLine('Member Phone', d.memberPhone || d.primaryPhoneNumber),
    noteLine('Cell / Contact Phone', d.contactPhone || d.cellPhone),
    noteLine('Member Email', d.memberEmail),
    noteLine('Contact Email', d.contactEmail),
    noteLine('Preferred Language', d.preferredLanguage),
    noteLine('Age', d.age),
    noteLine('Plan ID', d.planId),
    noteLine('Population of Focus', d.populationOfFocus),
    noteLine('Provider', d.providerName),
    noteLine('CPT Code', d.cptCode),
    noteLine(
      'Authorization #',
      d.Authorization_Number_T038 || d.authorizationNumberT2038 || d.authorizationNumber
    ),
    noteLine(
      'Authorization Start',
      d.Authorization_Start_T2038 || d.authorizationStartT2038
    ),
    noteLine('Authorization End', d.Authorization_End_T2038 || d.authorizationEndT2038),
    noteLine('Diagnostic Code', d.Diagnostic_Code || d.diagnosticCode),
    noteLine('Care Manager', d.careManagerName),
    noteLine('Care Manager Phone', d.careManagerPhone),
    noteLine('Care Manager Email', d.careManagerEmail),
    noteLine('Referring Organization', d.referringOrganization),
    noteLine('Emergency/Alternate Contact', d.emergencyContactName),
    noteLine('Emergency Contact Relationship', d.emergencyContactRelationship),
    noteLine('Emergency Contact Phone', d.emergencyContactPhone),
    noteLine('Emergency Contact Email', d.emergencyContactEmail),
    noteLine('Special Instructions', d.specialInstructions),
  ].filter(Boolean);

  return lines.length > 1 ? lines.join('\n') : '';
}

/** Remove a leading Single Auth PDF Details block so it can be merged without duplicating the heading. */
export function stripSingleAuthPdfDetailsHeading(text: unknown): string {
  return String(text || '')
    .replace(/^\s*Single Auth PDF Details\s*\n?/i, '')
    .trim();
}

/**
 * Rebuild/enrich Single Auth PDF notes from application fields so address, phone, email,
 * auth, and care-manager data appear in the Notes panel before Caspio push — even when
 * the original import only stored a sparse Preferred Language / Age / Plan ID dump.
 */
export function enrichSingleAuthAdminNotesFromApplication(
  adminNotes: unknown,
  application: Record<string, unknown> | null | undefined
): string {
  const existing = String(adminNotes || '').trim();
  const intakeSource = String(application?.intakeSource || '').trim().toLowerCase();
  const isSingleAuth =
    /single auth pdf details/i.test(existing) ||
    intakeSource.includes('single_authorization') ||
    intakeSource.includes('single_auth');
  if (!isSingleAuth || !application) return existing;

  const rebuilt = buildSingleAuthPdfDetailsNotes({
    sourceFileName: application.ilsMifSourceFileName || application.singleAuthSourceFileName,
    memberFirstName: application.memberFirstName,
    memberLastName: application.memberLastName,
    memberMrn: application.memberMrn,
    memberMediCalNum: application.memberMediCalNum || application.confirmMemberMediCalNum,
    memberDob: application.memberDob,
    memberCustomaryAddress: application.memberCustomaryAddress,
    memberCustomaryCity: application.memberCustomaryCity,
    memberCustomaryState: application.memberCustomaryState,
    memberCustomaryZip: application.memberCustomaryZip,
    memberCustomaryCounty: application.memberCustomaryCounty,
    memberPhone: application.memberPhone,
    contactPhone: application.contactPhone || application.bestContactPhone,
    memberEmail: application.memberEmail,
    contactEmail: application.contactEmail || application.bestContactEmail,
    careManagerName: application.careManagerName,
    careManagerPhone: application.careManagerPhone,
    careManagerEmail: application.careManagerEmail,
    Authorization_Number_T038: application.Authorization_Number_T038,
    Authorization_Start_T2038: application.Authorization_Start_T2038,
    Authorization_End_T2038: application.Authorization_End_T2038,
    Diagnostic_Code: application.Diagnostic_Code,
  });
  if (!rebuilt) return existing;

  const leftover = stripSingleAuthPdfDetailsHeading(existing);
  if (!leftover) return rebuilt;

  const rebuiltLower = rebuilt.toLowerCase();
  const uniqueExtraLines = leftover
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      const label = line.split(':')[0]?.trim().toLowerCase() || '';
      if (!label) return false;
      return !rebuiltLower.includes(`${label}:`);
    });

  return uniqueExtraLines.length ? `${rebuilt}\n${uniqueExtraLines.join('\n')}` : rebuilt;
}

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
