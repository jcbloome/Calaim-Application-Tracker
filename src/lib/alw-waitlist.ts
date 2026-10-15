import * as XLSX from 'xlsx';

export const ALW_WAITLIST_CCA_NAME = 'Sierra Hospice Care, Inc';
export const ALW_WAITLIST_TO_EMAIL = 'info@sierra-cca.com';
export const ALW_WAITLIST_FROM = 'Connections CalAIM <noreply@carehomefinders.com>';

export type AlwWaitlistMemberRow = {
  id: string;
  memberName: string;
  memberFirstName: string;
  memberLastName: string;
  homePhone: string;
  dateOfBirth: string;
  gender: string;
  maritalStatusMarried: string;
  mediCalNumber: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  ccaName: string;
  currentResidence: string;
  currentResidenceOther: string;
  legalAuthority: string;
  legalAuthorityOther: string;
  authorizedPartyName: string;
  authorizedPartyRelationship: string;
  authorizedPartyPhone: string;
  authorizedPartyEmail: string;
  bestContactName: string;
  bestContactRelationship: string;
  bestContactPhone: string;
  bestContactEmail: string;
  legalRepresentativeNotified: string;
  apsOrOmbudsmanInvolvement: string;
  alreadyOnAlwWaitlist: string;
  clientId2: string;
  memberHealthPlan: string;
  calaimStatus: string;
  rcfeName: string;
};

const clean = (value: unknown) => String(value ?? '').trim();

const pickFirst = (...values: unknown[]) => {
  for (const value of values) {
    const next = clean(value);
    if (next) return next;
  }
  return '';
};

const normalize = (value: unknown) =>
  clean(value)
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

export function isHealthNetPlan(value: unknown) {
  const plan = normalize(value);
  return plan.includes('health net') || plan.includes('healthnet') || plan === 'hn';
}

export function isAuthorizedCalaimStatus(value: unknown) {
  return normalize(value) === 'authorized';
}

function formatDob(value: unknown) {
  const raw = clean(value);
  if (!raw) return '';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  const mm = String(parsed.getMonth() + 1).padStart(2, '0');
  const dd = String(parsed.getDate()).padStart(2, '0');
  const yyyy = parsed.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function formatGender(value: unknown) {
  const raw = normalize(value);
  if (!raw) return '';
  if (raw === 'm' || raw.startsWith('male') || raw === 'man') return 'Male';
  if (raw === 'f' || raw.startsWith('female') || raw === 'woman') return 'Female';
  return clean(value);
}

function formatYesNo(value: unknown) {
  const raw = normalize(value);
  if (!raw) return '';
  if (['y', 'yes', 'true', '1'].includes(raw)) return 'Yes';
  if (['n', 'no', 'false', '0'].includes(raw)) return 'No';
  return '';
}

function mapCurrentResidence(raw: unknown): { residence: string; other: string } {
  const value = normalize(raw);
  if (!value) return { residence: '', other: '' };
  if (value.includes('acute') || value.includes('hospital')) {
    return { residence: 'Acute Hospital', other: '' };
  }
  if (value.includes('homeless')) return { residence: 'Homeless', other: '' };
  if (
    value.includes('skilled nursing') ||
    value.includes('snf') ||
    value === 'nursing facility' ||
    value.includes('nursing home')
  ) {
    return { residence: 'Skilled Nursing', other: '' };
  }
  if (
    value.includes('rcfe') ||
    value.includes('residential care') ||
    value.includes('assisted living') ||
    value.includes('board and care')
  ) {
    return { residence: 'Residential Care Facility for the Elderly (RCFE)', other: '' };
  }
  if (
    value.includes('home') ||
    value.includes('community') ||
    value.includes('apartment') ||
    value.includes('house') ||
    value.includes('independent')
  ) {
    return { residence: 'At Home', other: '' };
  }
  return { residence: 'Other (please specify)', other: clean(raw) };
}

/** Map a Caspio CalAIM member (raw or transformed) into one ALW waitlist sheet row. */
export function mapCaspioMemberToAlwWaitlistRow(rawMember: Record<string, unknown>, index = 0): AlwWaitlistMemberRow | null {
  const plan = pickFirst(rawMember.CalAIM_MCO, rawMember.memberHealthPlan);
  const status = pickFirst(rawMember.CalAIM_Status, rawMember.memberStatus, rawMember.calaimStatus);
  if (!isHealthNetPlan(plan) || !isAuthorizedCalaimStatus(status)) return null;

  const memberFirstName = pickFirst(rawMember.Senior_First, rawMember.memberFirstName);
  const memberLastName = pickFirst(rawMember.Senior_Last, rawMember.memberLastName);
  const memberName = [memberLastName, memberFirstName].filter(Boolean).join(', ') ||
    [memberFirstName, memberLastName].filter(Boolean).join(' ');
  const clientId2 = pickFirst(rawMember.client_ID2, rawMember.Client_ID2, rawMember.clientId2);
  const mediCalNumber = pickFirst(
    rawMember.MC,
    rawMember.MediCal_Number,
    rawMember.memberMediCalNum,
    rawMember.MCP_CIN
  );
  const rcfeName = pickFirst(rawMember.RCFE_Name, rawMember.rcfeName);
  // Current residence for ALW is the RCFE the member lives at.
  const address = pickFirst(
    rawMember.RCFE_Address,
    rawMember.RCFE_Street,
    rawMember.RCFE_Street_Address,
    rawMember.rcfeAddress,
    rawMember.Member_Address,
    rawMember.Normal_Housing_Street,
    rawMember.ISP_Current_Address
  );
  const city = pickFirst(
    rawMember.RCFE_City,
    rawMember.rcfeCity,
    rawMember.Member_City,
    rawMember.Normal_Housing_City,
    rawMember.ISP_Current_City
  );
  const state = pickFirst(
    rawMember.RCFE_State,
    rawMember.rcfeState,
    rawMember.Member_State,
    rawMember.Normal_Housing_State,
    rawMember.ISP_Current_State,
    'CA'
  );
  const zip = pickFirst(
    rawMember.RCFE_Zip,
    rawMember.rcfeZip,
    rawMember.Member_Zip,
    rawMember.Normal_Housing_Zip,
    rawMember.ISP_Current_Zip
  );
  const county = pickFirst(
    rawMember.RCFE_County,
    rawMember.rcfeCounty,
    rawMember.Member_County,
    rawMember.memberCounty,
    'Los Angeles'
  );
  const homePhone = pickFirst(
    rawMember.Best_Contact_Phone,
    rawMember.Member_Phone,
    rawMember.Contact_Phone,
    rawMember.contactPhone,
    rawMember.RCFE_Owner_Phone,
    rawMember.RCFE_Admin_RCFE_Owner_Phone,
    rawMember.RCFE_Administrator_Phone,
    rawMember.RCFE_Phone
  );
  const livingRaw = pickFirst(
    rcfeName ? 'RCFE' : '',
    rawMember.ISP_Current_Location,
    rawMember.Member_Current_Living_Situation,
    rawMember.Current_Living_Situation,
    rawMember.Describe_Member_Living_Situation,
    rawMember.Name_Where_Residing
  );
  const mappedResidence = mapCurrentResidence(livingRaw);
  const residence = rcfeName
    ? 'Residential Care Facility for the Elderly (RCFE)'
    : mappedResidence.residence;
  const other = rcfeName ? rcfeName : mappedResidence.other;
  const gender = formatGender(
    pickFirst(rawMember.Sex, rawMember.Gender, rawMember.Member_Gender, rawMember.Senior_Gender)
  );
  const alreadyOnAlwWaitlist = formatYesNo(
    pickFirst(rawMember.On_ALW_Waitlist, rawMember.onALWWaitlist)
  );

  const authorizedPartyFirst = pickFirst(
    rawMember.Authorized_Party_First,
    rawMember.authorizedPartyFirst
  );
  const authorizedPartyLast = pickFirst(
    rawMember.Authorized_Party_Last,
    rawMember.authorizedPartyLast
  );
  const authorizedPartyRelationship = pickFirst(
    rawMember.Authorized_Party_Relationship,
    rawMember.authorizedPartyRelationship
  );
  const authorizedPartyPhone = pickFirst(
    rawMember.Authorized_Party_Phone,
    rawMember.authorizedPartyPhone
  );
  const authorizedPartyEmail = pickFirst(
    rawMember.Authorized_Party_Email,
    rawMember.authorizedPartyEmail
  );
  const authorizedPartyName = [authorizedPartyFirst, authorizedPartyLast].filter(Boolean).join(' ').trim();
  const hasAuthorizedParty = Boolean(
    authorizedPartyName ||
      authorizedPartyRelationship ||
      authorizedPartyPhone ||
      authorizedPartyEmail
  );

  const bestContactFirst = pickFirst(
    rawMember.Best_Contact_First,
    rawMember.bestContactFirstName,
    rawMember.bestContactFirst
  );
  const bestContactLast = pickFirst(
    rawMember.Best_Contact_Last,
    rawMember.bestContactLastName,
    rawMember.bestContactLast
  );
  const bestContactRelationship = pickFirst(
    rawMember.Best_Contact_Relationship,
    rawMember.bestContactRelationship
  );
  const bestContactPhone = pickFirst(
    rawMember.Best_Contact_Phone,
    rawMember.bestContactPhone
  );
  const bestContactEmail = pickFirst(
    rawMember.Best_Contact_Email,
    rawMember.bestContactEmail
  );
  const bestContactName = [bestContactFirst, bestContactLast].filter(Boolean).join(' ').trim();
  const hasBestContact = Boolean(
    bestContactName || bestContactRelationship || bestContactPhone || bestContactEmail
  );

  const legalAuthority = hasAuthorizedParty ? 'Other' : 'Applicant';
  const legalAuthorityOther = hasAuthorizedParty
    ? [
        authorizedPartyName
          ? authorizedPartyRelationship
            ? `${authorizedPartyName} (${authorizedPartyRelationship})`
            : authorizedPartyName
          : authorizedPartyRelationship
            ? `Authorized party (${authorizedPartyRelationship})`
            : 'Authorized party',
        authorizedPartyPhone ? `Phone: ${authorizedPartyPhone}` : '',
        authorizedPartyEmail ? `Email: ${authorizedPartyEmail}` : '',
      ]
        .filter(Boolean)
        .join(' · ')
    : hasBestContact
      ? [
          bestContactName
            ? bestContactRelationship
              ? `Best contact: ${bestContactName} (${bestContactRelationship})`
              : `Best contact: ${bestContactName}`
            : bestContactRelationship
              ? `Best contact (${bestContactRelationship})`
              : 'Best contact',
          bestContactPhone ? `Phone: ${bestContactPhone}` : '',
          bestContactEmail ? `Email: ${bestContactEmail}` : '',
        ]
          .filter(Boolean)
          .join(' · ')
      : '';

  return {
    id: pickFirst(clientId2, mediCalNumber, `${memberLastName}-${memberFirstName}-${index}`) || `row-${index}`,
    memberName,
    memberFirstName,
    memberLastName,
    homePhone,
    dateOfBirth: formatDob(
      pickFirst(
        rawMember.Senior_DOB,
        rawMember.DOB,
        rawMember.Date_of_Birth,
        rawMember.Member_DOB,
        rawMember.Birth_Date,
        rawMember.memberDob
      )
    ),
    gender,
    maritalStatusMarried: formatYesNo(
      pickFirst(rawMember.Marital_Status, rawMember.Married, rawMember.Is_Married)
    ),
    mediCalNumber,
    address,
    city,
    state,
    zip,
    county,
    ccaName: ALW_WAITLIST_CCA_NAME,
    currentResidence: residence,
    currentResidenceOther: other,
    legalAuthority,
    legalAuthorityOther,
    authorizedPartyName,
    authorizedPartyRelationship,
    authorizedPartyPhone,
    authorizedPartyEmail,
    bestContactName,
    bestContactRelationship,
    bestContactPhone,
    bestContactEmail,
    legalRepresentativeNotified: 'Yes',
    apsOrOmbudsmanInvolvement: 'No',
    alreadyOnAlwWaitlist,
    clientId2,
    memberHealthPlan: plan,
    calaimStatus: status,
    rcfeName,
  };
}

export function collectAuthorizedHealthNetAlwRows(
  rawMembers: Array<Record<string, unknown>> | null | undefined
): AlwWaitlistMemberRow[] {
  const rows: AlwWaitlistMemberRow[] = [];
  const seen = new Set<string>();
  (Array.isArray(rawMembers) ? rawMembers : []).forEach((raw, index) => {
    const row = mapCaspioMemberToAlwWaitlistRow(raw || {}, index);
    if (!row) return;
    const key = normalize(row.mediCalNumber || row.clientId2 || row.memberName);
    if (key && seen.has(key)) return;
    if (key) seen.add(key);
    rows.push(row);
  });
  rows.sort(
    (a, b) =>
      a.memberLastName.localeCompare(b.memberLastName, undefined, { sensitivity: 'base' }) ||
      a.memberFirstName.localeCompare(b.memberFirstName, undefined, { sensitivity: 'base' })
  );
  return rows;
}

/** Sheet columns aligned to the DHCS Assisted Living Waiver Waitlist Request form. */
export const ALW_WAITLIST_SHEET_COLUMNS: Array<{ key: keyof AlwWaitlistMemberRow; header: string }> = [
  { key: 'memberName', header: "Member's Name" },
  { key: 'homePhone', header: 'Home Phone' },
  { key: 'dateOfBirth', header: 'Date of Birth' },
  { key: 'gender', header: 'Gender (Male/Female)' },
  { key: 'maritalStatusMarried', header: 'Marital Status — Married (Yes/No)' },
  { key: 'mediCalNumber', header: '9-Digit Medi-Cal Number' },
  { key: 'address', header: 'Address (RCFE)' },
  { key: 'city', header: 'City (RCFE)' },
  { key: 'state', header: 'State (RCFE)' },
  { key: 'zip', header: 'Zip (RCFE)' },
  { key: 'county', header: 'County in which the applicant currently resides' },
  { key: 'ccaName', header: 'Care Coordination Agency (CCA) Name' },
  { key: 'currentResidence', header: 'Where is the applicant currently residing?' },
  { key: 'currentResidenceOther', header: 'Current residence — RCFE name / Other' },
  { key: 'rcfeName', header: 'RCFE_Name' },
  { key: 'legalAuthority', header: "Who has the legal authority to make the applicant's health care decisions?" },
  {
    key: 'legalAuthorityOther',
    header: 'Legal authority — Other / Best contact (authorized party or best contact for outreach)',
  },
  { key: 'authorizedPartyName', header: 'Authorized Party Name' },
  { key: 'authorizedPartyRelationship', header: 'Authorized Party Relationship' },
  { key: 'authorizedPartyPhone', header: 'Authorized Party Phone' },
  { key: 'authorizedPartyEmail', header: 'Authorized Party Email' },
  { key: 'bestContactName', header: 'Best Contact Name' },
  { key: 'bestContactRelationship', header: 'Best Contact Relationship' },
  { key: 'bestContactPhone', header: 'Best Contact Phone' },
  { key: 'bestContactEmail', header: 'Best Contact Email' },
  {
    key: 'legalRepresentativeNotified',
    header: 'Was the legal representative notified of this request for the ALW waitlist? (Yes/No)',
  },
  {
    key: 'apsOrOmbudsmanInvolvement',
    header: 'Is there Adult Protective Services or Long-Term Care Ombudsman Involvement? (Yes/No)',
  },
  { key: 'alreadyOnAlwWaitlist', header: 'Already on ALW waitlist in Caspio? (Yes/No)' },
  { key: 'clientId2', header: 'Client_ID2 (reference)' },
  { key: 'calaimStatus', header: 'CalAIM Status (reference)' },
];

export function alwWaitlistRowsToSheetAoA(rows: AlwWaitlistMemberRow[]): (string | number)[][] {
  const header = ALW_WAITLIST_SHEET_COLUMNS.map((col) => col.header);
  const body = rows.map((row) =>
    ALW_WAITLIST_SHEET_COLUMNS.map((col) => clean(row[col.key]))
  );
  return [header, ...body];
}

export function buildAlwWaitlistWorkbookBuffer(rows: AlwWaitlistMemberRow[]): Buffer {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(alwWaitlistRowsToSheetAoA(rows));
  sheet['!cols'] = ALW_WAITLIST_SHEET_COLUMNS.map((col) => ({
    wch: Math.min(48, Math.max(14, col.header.length + 2)),
  }));
  XLSX.utils.book_append_sheet(workbook, sheet, 'ALW Waitlist');

  const cover = XLSX.utils.aoa_to_sheet([
    ['Assisted Living Waiver Waitlist Request'],
    ['State of California – Health and Human Services Agency'],
    ['Department of Health Care Services'],
    [],
    ['Care Coordination Agency (CCA)', ALW_WAITLIST_CCA_NAME],
    ['Recipient', ALW_WAITLIST_TO_EMAIL],
    ['Generated', new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })],
    ['Member count', rows.length],
    ['Source', 'Authorized Health Net members from CalAIM_tbl_Members'],
    [],
    ['Notes'],
    ['Pre-filled from Caspio where available. Blank cells need staff/CCA completion.'],
    ['Program/service checkboxes (IHSS, Hospice, etc.) are left blank for manual completion on the official form.'],
  ]);
  cover['!cols'] = [{ wch: 40 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(workbook, cover, 'Cover');

  const out = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  return Buffer.isBuffer(out) ? out : Buffer.from(out);
}

export function buildAlwWaitlistFileName(generatedAt = new Date()) {
  const y = generatedAt.getFullYear();
  const m = String(generatedAt.getMonth() + 1).padStart(2, '0');
  const d = String(generatedAt.getDate()).padStart(2, '0');
  return `ALW Waitlist Request - Health Net Authorized - ${y}${m}${d}.xlsx`;
}

/** Browser-safe workbook bytes for client downloads. */
export function buildAlwWaitlistWorkbookBytes(rows: AlwWaitlistMemberRow[]): Uint8Array {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(alwWaitlistRowsToSheetAoA(rows));
  sheet['!cols'] = ALW_WAITLIST_SHEET_COLUMNS.map((col) => ({
    wch: Math.min(48, Math.max(14, col.header.length + 2)),
  }));
  XLSX.utils.book_append_sheet(workbook, sheet, 'ALW Waitlist');

  const cover = XLSX.utils.aoa_to_sheet([
    ['Assisted Living Waiver Waitlist Request'],
    ['State of California – Health and Human Services Agency'],
    ['Department of Health Care Services'],
    [],
    ['Care Coordination Agency (CCA)', ALW_WAITLIST_CCA_NAME],
    ['Recipient', ALW_WAITLIST_TO_EMAIL],
    ['Generated', new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })],
    ['Member count', rows.length],
    ['Source', 'Authorized Health Net members from CalAIM_tbl_Members (excluding already on waitlist)'],
    [],
    ['Notes'],
    ['Pre-filled from Caspio where available. Blank cells need staff/CCA completion.'],
    ['Members already on the ALW waitlist were excluded using the uploaded exclusion sheet and/or Caspio On_ALW_Waitlist.'],
  ]);
  cover['!cols'] = [{ wch: 40 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(workbook, cover, 'Cover');

  const out = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as number[];
  return Uint8Array.from(out);
}

export type AlwWaitlistExclusionEntry = {
  mediCalNumber: string;
  clientId2: string;
  memberName: string;
  dateOfBirth: string;
  sourceLabel?: string;
};

export type AlwWaitlistExclusionIndex = {
  mediCalKeys: Set<string>;
  clientIdKeys: Set<string>;
  nameDobKeys: Set<string>;
  entries: AlwWaitlistExclusionEntry[];
};

export function normalizeAlwMediCalKey(value: unknown): string {
  return clean(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function normalizeAlwClientIdKey(value: unknown): string {
  return clean(value).toLowerCase().replace(/\s+/g, '');
}

export function normalizeAlwNameKey(value: unknown): string {
  return normalize(value)
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeAlwDobKey(value: unknown): string {
  const formatted = formatDob(value);
  if (!formatted) return '';
  const parsed = new Date(formatted);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return normalize(formatted).replace(/[^0-9]/g, '');
}

export function alwNameDobKey(name: unknown, dob: unknown): string {
  const nameKey = normalizeAlwNameKey(name);
  const dobKey = normalizeAlwDobKey(dob);
  if (!nameKey || !dobKey) return '';
  return `${nameKey}|${dobKey}`;
}

function headerLooksLike(header: string, ...needles: string[]) {
  const h = normalize(header).replace(/[^a-z0-9]+/g, ' ');
  return needles.some((needle) => h.includes(needle));
}

function pickCell(row: Record<string, unknown>, ...needles: string[]) {
  for (const [key, value] of Object.entries(row || {})) {
    if (headerLooksLike(key, ...needles)) {
      const next = clean(value);
      if (next) return next;
    }
  }
  return '';
}

function isUploadedAlwWaitlistYes(row: Record<string, unknown>): boolean | null {
  // null = column not present / unknown → treat as exclude candidate (legacy sheets)
  let foundColumn = false;
  for (const [key, value] of Object.entries(row || {})) {
    const header = normalize(key).replace(/[^a-z0-9]+/g, ' ');
    const looksLikeWaitlistFlag =
      header.includes('on the alw waitlist') ||
      header.includes('on alw waitlist') ||
      header.includes('already on alw') ||
      header.includes('alw waitlist') ||
      (header.includes('waitlist') && header.includes('member'));
    if (!looksLikeWaitlistFlag) continue;
    foundColumn = true;
    const answer = formatYesNo(value);
    return answer === 'Yes';
  }
  return foundColumn ? false : null;
}

/** Parse an uploaded Excel; only rows marked YES for ALW waitlist are exclusions. */
export function parseAlwAlreadyOnWaitlistWorkbook(fileBuffer: ArrayBuffer): {
  entries: AlwWaitlistExclusionEntry[];
  rowCount: number;
  yesCount: number;
  noCount: number;
  sheetName: string;
} {
  const workbook = XLSX.read(fileBuffer, { type: 'array', cellDates: true });
  const sheetName =
    workbook.SheetNames.find((name) => /waitlist|alw|member/i.test(name)) || workbook.SheetNames[0] || '';
  if (!sheetName) {
    return { entries: [], rowCount: 0, yesCount: 0, noCount: 0, sheetName: '' };
  }
  const sheet = workbook.Sheets[sheetName];
  const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
  const entries: AlwWaitlistExclusionEntry[] = [];
  const seen = new Set<string>();
  let yesCount = 0;
  let noCount = 0;

  jsonRows.forEach((row, index) => {
    const mediCalNumber = pickCell(
      row,
      'medi cal',
      'medical',
      'medicaid',
      'cin',
      'mc number',
      '9 digit'
    );
    const clientId2 = pickCell(row, 'client id2', 'client_id2', 'clientid2', 'client id');
    const memberName =
      pickCell(row, "member's name", 'member name', 'name') ||
      [pickCell(row, 'last name', 'senior last'), pickCell(row, 'first name', 'senior first')]
        .filter(Boolean)
        .join(', ');
    const dateOfBirth = pickCell(row, 'date of birth', 'dob', 'birth');
    if (!mediCalNumber && !clientId2 && !memberName) return;

    const waitlistFlag = isUploadedAlwWaitlistYes(row);
    if (waitlistFlag === false) {
      noCount += 1;
      return; // NO → still need a form / keep on download list
    }
    if (waitlistFlag === true) yesCount += 1;
    // waitlistFlag === null: no YES/NO column — treat every identifiable row as already on waitlist

    const entry: AlwWaitlistExclusionEntry = {
      mediCalNumber,
      clientId2,
      memberName,
      dateOfBirth,
      sourceLabel: `row ${index + 2} (YES)`,
    };
    const dedupe = [
      normalizeAlwMediCalKey(mediCalNumber),
      normalizeAlwClientIdKey(clientId2),
      alwNameDobKey(memberName, dateOfBirth),
    ]
      .filter(Boolean)
      .join('|');
    if (dedupe && seen.has(dedupe)) return;
    if (dedupe) seen.add(dedupe);
    entries.push(entry);
  });

  return { entries, rowCount: jsonRows.length, yesCount, noCount, sheetName };
}

export function buildAlwWaitlistExclusionIndex(
  entries: AlwWaitlistExclusionEntry[] | null | undefined
): AlwWaitlistExclusionIndex {
  const mediCalKeys = new Set<string>();
  const clientIdKeys = new Set<string>();
  const nameDobKeys = new Set<string>();
  const list = Array.isArray(entries) ? entries : [];
  list.forEach((entry) => {
    const mediCal = normalizeAlwMediCalKey(entry?.mediCalNumber);
    const clientId = normalizeAlwClientIdKey(entry?.clientId2);
    const nameDob = alwNameDobKey(entry?.memberName, entry?.dateOfBirth);
    if (mediCal) mediCalKeys.add(mediCal);
    if (clientId) clientIdKeys.add(clientId);
    if (nameDob) nameDobKeys.add(nameDob);
  });
  return { mediCalKeys, clientIdKeys, nameDobKeys, entries: list };
}

export function isAlwMemberExcluded(
  row: AlwWaitlistMemberRow,
  index: AlwWaitlistExclusionIndex
): { excluded: boolean; reason: string } {
  if (normalize(row.alreadyOnAlwWaitlist) === 'yes') {
    return { excluded: true, reason: 'Caspio On_ALW_Waitlist = Yes' };
  }
  const mediCal = normalizeAlwMediCalKey(row.mediCalNumber);
  if (mediCal && index.mediCalKeys.has(mediCal)) {
    return { excluded: true, reason: 'Uploaded sheet: ALW Waitlist = YES' };
  }
  const clientId = normalizeAlwClientIdKey(row.clientId2);
  if (clientId && index.clientIdKeys.has(clientId)) {
    return { excluded: true, reason: 'Uploaded sheet: ALW Waitlist = YES' };
  }
  const nameDob = alwNameDobKey(row.memberName, row.dateOfBirth);
  if (nameDob && index.nameDobKeys.has(nameDob)) {
    return { excluded: true, reason: 'Uploaded sheet: ALW Waitlist = YES' };
  }
  // Also try First Last vs Last, First
  const altName = [row.memberFirstName, row.memberLastName].filter(Boolean).join(' ');
  const altKey = alwNameDobKey(altName, row.dateOfBirth);
  if (altKey && index.nameDobKeys.has(altKey)) {
    return { excluded: true, reason: 'Uploaded sheet: ALW Waitlist = YES' };
  }
  return { excluded: false, reason: '' };
}

export function partitionAlwWaitlistRows(
  rows: AlwWaitlistMemberRow[],
  entries: AlwWaitlistExclusionEntry[] | null | undefined
): {
  included: AlwWaitlistMemberRow[];
  excluded: Array<AlwWaitlistMemberRow & { excludeReason: string }>;
} {
  const index = buildAlwWaitlistExclusionIndex(entries);
  const included: AlwWaitlistMemberRow[] = [];
  const excluded: Array<AlwWaitlistMemberRow & { excludeReason: string }> = [];
  rows.forEach((row) => {
    const match = isAlwMemberExcluded(row, index);
    if (match.excluded) {
      excluded.push({ ...row, excludeReason: match.reason });
    } else {
      included.push(row);
    }
  });
  return { included, excluded };
}
