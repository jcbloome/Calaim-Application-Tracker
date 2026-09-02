/**
 * Shared single auth PDF parsing utilities
 * Used by both Create Application page and MIF Consolidator
 */

import {
  findFirst,
  findLabeledValue,
  extractAddressFromLines,
  extractPhonesFromLines,
  parseMemberName,
  sanitizeParsedName,
  stripTrailingNonNameTokens,
  extractMemberTableFieldsFromLines,
  extractCareManagerFromLines,
  parseAddressParts,
  splitAddressFromLines,
  extractNameFromFileName,
  truncateAtNextLabel,
  normalizeAddressFieldPlacement,
  inferStreetFromCityStateContext,
  extractExtraServiceRequestDetails,
} from './member-data-helpers';
import {
  normalizeMediCalNumber,
  normalizePhoneDigits,
  formatPhoneDashed,
  toMmDdYyyy,
  toNameCase,
} from './member-data-normalize';

export const buildSingleAuthAdminNotes = (details: Record<string, string>) => {
  const heading = 'Single Auth PDF Details';
  const lines = Object.entries(details)
    .filter(([_, v]) => Boolean(String(v || '').trim()))
    .map(([k, v]) => `${k}: ${v}`);
  return lines.length ? `${heading}\n${lines.join('\n')}` : '';
};

export const extractServiceRequestFields = (params: { text: string; fileName: string }) => {
  const text = String(params.text || '');
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const flattened = lines.join('\n');

  const memberNameRaw =
    findFirst(flattened, [
      /(?:member|patient|beneficiary)\s*name\s*[:#-]?\s*([A-Z][A-Z ,.'-]{2,})/i,
      /name\s*[:#-]?\s*([A-Z][A-Z ,.'-]{2,})\s*(?:dob|date of birth|mrn|member id|auth|authorization)/i,
    ]) || extractNameFromFileName(params.fileName);

  const authorizationNumber = findFirst(flattened, [
    /authorization\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Z0-9-]{4,})/i,
    /\bauth(?:orization)?\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Z0-9-]{4,})/i,
    /\bref(?:erence)?\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Z0-9-]{4,})/i,
  ]);

  const authorizationStart = findFirst(flattened, [
    /authorization\s*(?:start|from)\s*(?:date)?\s*[:#-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
    /\beffective\s*date\s*[:#-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
    /\bstart\s*date\s*[:#-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
    /\bfrom\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\s*(?:to|-)\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
  ]);

  const authorizationEnd = findFirst(flattened, [
    /authorization\s*(?:end|to)\s*(?:date)?\s*[:#-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
    /\btermination\s*date\s*[:#-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
    /\bend\s*date\s*[:#-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
    /\bfrom\s*\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\s*(?:to|-)\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
  ]);

  const diagnosticCode = findFirst(flattened, [
    /(?:diagnostic|diagnosis|dx)\s*code\s*[:#-]?\s*([A-Z0-9.-]{3,10})/i,
    /\bicd(?:-10)?\s*[:#-]?\s*([A-Z0-9.-]{3,10})/i,
    /\bdiagnosis\s*[:#-]?\s*([A-Z][0-9][A-Z0-9.-]{1,8})/i,
  ]);

  const memberMrn = findFirst(flattened, [
    /\bmrn(?:\s*(?:number|no\.?|#))?\b\s*[:#-]?\s*(?:\r?\n\s*)?([A-Z0-9-]{4,})/i,
    /medical\s*record\s*(?:number|no\.?|#)\s*[:#-]?\s*(?:\r?\n\s*)?([A-Z0-9-]{4,})/i,
    /member\s*(?:id|identifier)\s*[:#-]?\s*(?:\r?\n\s*)?([A-Z0-9-]{4,})/i,
    /patient\s*(?:id|identifier)\s*[:#-]?\s*(?:\r?\n\s*)?([A-Z0-9-]{4,})/i,
  ]);
  const memberMediCalNum = normalizeMediCalNumber(
    findFirst(flattened, [
      /(?:medi[\s-]*cal|mcp[\s_-]*cin|cin)\s*(?:number|no\.?|#)?\s*[:#-]?\s*(?:\r?\n\s*)?([0-9][A-Z0-9-]{6,})/i,
    ])
  );

  const memberAddressRaw =
    extractAddressFromLines(lines) ||
    findLabeledValue(flattened, '(?:member|patient)?\\s*address', [
      'member\\s*phone',
      'patient\\s*phone',
      'phone',
      'cell\\s*phone',
      'mobile\\s*phone',
      'dob',
      'date\\s*of\\s*birth',
      'email',
      'population\\s*of\\s*focus',
      'provider',
      'authorization',
      'care\\s*manager',
    ]) ||
    findFirst(flattened, [
      /(?:member|patient)\s*address\s*[:#-]?\s*([^\n]{8,})/i,
      /\baddress\s*[:#-]?\s*([^\n]{8,})/i,
    ]);
  const memberAddress = truncateAtNextLabel(memberAddressRaw);
  const splitAddress = splitAddressFromLines(lines);

  const memberDob = findFirst(flattened, [
    /(?:member|patient|beneficiary)?\s*(?:dob|date\s*of\s*birth)\s*[:#-]?\s*(?:\r?\n\s*)?(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
    /\bdob\b\s*[:#-]?\s*(?:\r?\n\s*)?(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
  ]);

  const memberPhone = findFirst(flattened, [
    /member\s*phone\s*[:#-]?\s*(?:\r?\n\s*)?([+()0-9.\-\s]{7,})/i,
    /patient\s*phone\s*[:#-]?\s*(?:\r?\n\s*)?([+()0-9.\-\s]{7,})/i,
    /\bphone\s*[:#-]?\s*(?:\r?\n\s*)?([+()0-9.\-\s]{7,})/i,
  ]);

  const cellPhone = findFirst(flattened, [
    /cell\s*phone\s*[:#-]?\s*(?:\r?\n\s*)?([+()0-9.\-\s]{7,})/i,
    /mobile\s*phone\s*[:#-]?\s*(?:\r?\n\s*)?([+()0-9.\-\s]{7,})/i,
  ]);
  const linePhones = extractPhonesFromLines(lines);
  const memberEmail = String(
    findFirst(flattened, [
      /(?:member|patient)\s*email\s*[:#-]?\s*(?:\r?\n\s*)?([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i,
      /\bemail\s*[:#-]?\s*(?:\r?\n\s*)?([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i,
    ]) || ''
  )
    .trim()
    .toLowerCase();

  const parsedName = sanitizeParsedName(parseMemberName(memberNameRaw));
  const tableFields = extractMemberTableFieldsFromLines(lines);
  const careManagerFields = extractCareManagerFromLines(lines, flattened);
  const parsedAddress = parseAddressParts(memberAddress);

  let updates: Partial<{
    memberFirstName: string;
    memberLastName: string;
    memberMrn: string;
    memberMediCalNum: string;
    confirmMemberMediCalNum: string;
    memberPhone: string;
    memberEmail: string;
    memberDob: string;
    Authorization_Number_T038: string;
    Authorization_Start_T2038: string;
    Authorization_End_T2038: string;
    Diagnostic_Code: string;
    memberCustomaryLocation: string;
    memberCustomaryAddress: string;
    memberCustomaryCity: string;
    memberCustomaryState: string;
    memberCustomaryZip: string;
    memberCustomaryCounty: string;
    contactPhone: string;
    contactEmail: string;
    careManagerName: string;
    careManagerPhone: string;
    careManagerEmail: string;
    notes: string;
  }> = {};

  if (tableFields.memberFirstName || parsedName.firstName) {
    updates.memberFirstName = toNameCase(tableFields.memberFirstName || parsedName.firstName || '');
  }
  if (tableFields.memberLastName || parsedName.lastName) {
    const sanitizedLast = stripTrailingNonNameTokens(tableFields.memberLastName || parsedName.lastName || '');
    updates.memberLastName = toNameCase(sanitizedLast);
  }
  if (memberMrn || tableFields.memberMrn) updates.memberMrn = memberMrn || tableFields.memberMrn || '';
  const resolvedMediCalNum = memberMediCalNum || normalizeMediCalNumber(tableFields.memberMediCalNum || '');
  if (resolvedMediCalNum) {
    updates.memberMediCalNum = resolvedMediCalNum;
    updates.confirmMemberMediCalNum = resolvedMediCalNum;
  }
  if (authorizationNumber) updates.Authorization_Number_T038 = authorizationNumber;
  if (authorizationStart) updates.Authorization_Start_T2038 = toMmDdYyyy(authorizationStart);
  if (authorizationEnd) updates.Authorization_End_T2038 = toMmDdYyyy(authorizationEnd);
  if (diagnosticCode) updates.Diagnostic_Code = diagnosticCode;
  if (memberDob || tableFields.memberDob) updates.memberDob = toMmDdYyyy(memberDob || tableFields.memberDob || '');
  const hasSplitAddressParts = Boolean(
    splitAddress.street || splitAddress.city || splitAddress.state || splitAddress.zip || splitAddress.county
  );
  const resolvedStreetAddress =
    tableFields.memberCustomaryAddress ||
    splitAddress.street ||
    parsedAddress.street ||
    memberAddress;
  if (resolvedStreetAddress) updates.memberCustomaryAddress = resolvedStreetAddress;
  if (tableFields.memberCustomaryCity || splitAddress.city || parsedAddress.city) {
    updates.memberCustomaryCity = tableFields.memberCustomaryCity || splitAddress.city || parsedAddress.city || '';
  }
  if (tableFields.memberCustomaryState || splitAddress.state || parsedAddress.state) {
    updates.memberCustomaryState = tableFields.memberCustomaryState || splitAddress.state || parsedAddress.state || '';
  }
  if (tableFields.memberCustomaryZip || splitAddress.zip || parsedAddress.zip) {
    updates.memberCustomaryZip = tableFields.memberCustomaryZip || splitAddress.zip || parsedAddress.zip || '';
  }
  if (tableFields.memberCustomaryCounty || splitAddress.county || parsedAddress.county) {
    updates.memberCustomaryCounty = tableFields.memberCustomaryCounty || splitAddress.county || parsedAddress.county || '';
  }
  if (!resolvedStreetAddress && hasSplitAddressParts && memberAddress) {
    updates.memberCustomaryAddress = memberAddress;
  }
  if (tableFields.memberPhone || linePhones.cellPhone || linePhones.memberPhone || cellPhone || memberPhone) {
    const normalizedPhone = normalizePhoneDigits(
      tableFields.memberPhone || linePhones.cellPhone || linePhones.memberPhone || cellPhone || memberPhone
    );
    if (normalizedPhone) updates.memberPhone = formatPhoneDashed(normalizedPhone);
  }
  if (tableFields.contactPhone || linePhones.memberPhone || memberPhone) {
    const normalizedContactPhone = normalizePhoneDigits(tableFields.contactPhone || linePhones.memberPhone || memberPhone);
    if (normalizedContactPhone) updates.contactPhone = formatPhoneDashed(normalizedContactPhone);
  }
  if (tableFields.memberEmail || memberEmail) {
    updates.memberEmail = String(tableFields.memberEmail || memberEmail || '').trim().toLowerCase();
  }
  if (careManagerFields.careManagerName) updates.careManagerName = careManagerFields.careManagerName;
  if (careManagerFields.careManagerPhone) updates.careManagerPhone = careManagerFields.careManagerPhone;
  if (careManagerFields.careManagerEmail) updates.careManagerEmail = careManagerFields.careManagerEmail;
  const extraDetails = extractExtraServiceRequestDetails(lines, flattened, tableFields);
  const extraNotes = buildSingleAuthAdminNotes(extraDetails);
  if (extraNotes) updates.notes = extraNotes;
  updates = normalizeAddressFieldPlacement(updates as Record<string, string>);
  if (!updates.memberCustomaryAddress && (updates.memberCustomaryCity || updates.memberCustomaryState)) {
    const inferredStreet = inferStreetFromCityStateContext({
      lines,
      city: updates.memberCustomaryCity,
      state: updates.memberCustomaryState,
      zip: updates.memberCustomaryZip,
    });
    if (inferredStreet) updates.memberCustomaryAddress = toNameCase(inferredStreet);
  }
  return { updates };
};
