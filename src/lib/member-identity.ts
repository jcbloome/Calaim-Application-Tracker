export type IdentityMatchReasonCode =
  | 'match_by_client_id2'
  | 'match_by_mrn'
  | 'match_by_medi_cal'
  | 'match_by_name_dob'
  | 'match_by_name'
  | 'conflict_client_id2_mismatch'
  | 'conflict_mrn_mismatch'
  | 'conflict_medi_cal_mismatch'
  | 'conflict_name_mismatch';

export type IdentitySignals = {
  firstNameToken: string;
  lastNameToken: string;
  dobToken: string;
  mrnToken: string;
  mediCalToken: string;
  clientId2Token: string;
  identifierTokens: Set<string>;
};

type SignalSourceOptions = {
  firstNameFields?: string[];
  lastNameFields?: string[];
  dobFields?: string[];
  mrnFields?: string[];
  mediCalFields?: string[];
  clientId2Fields?: string[];
  extraIdentifierFields?: string[];
};

const DEFAULT_FIRST_NAME_FIELDS = ['memberFirstName', 'Senior_First', 'First_Name', 'firstName'];
const DEFAULT_LAST_NAME_FIELDS = ['memberLastName', 'Senior_Last', 'Last_Name', 'lastName'];
const DEFAULT_DOB_FIELDS = ['memberDob', 'Birth_Date', 'DOB', 'dob', 'Date_Of_Birth'];
const DEFAULT_MRN_FIELDS = [
  'MRN',
  'Member_MRN',
  'memberMrn',
  'Medical_Record_Number',
  'Medical_Record_Number_MRN',
  'MedicalRecordNumber',
];
const DEFAULT_MEDI_CAL_FIELDS = [
  'memberMediCalNum',
  'memberMediCalNumber',
  'MCP_CIN',
  'MediCal_Number',
  'Medical_Number',
  'CIN',
];
const DEFAULT_CLIENT_ID2_FIELDS = ['client_ID2', 'Client_ID2', 'clientId2', 'caspioClientId2', 'clientid2'];

const pickFirstRawValue = (record: Record<string, any> | null, fields: string[]) => {
  if (!record || !fields.length) return '';
  for (const field of fields) {
    if (!field) continue;
    const value = record[field];
    if (value !== undefined && value !== null && String(value).trim()) return String(value);
  }
  return '';
};

export const normalizeIdentityToken = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/** Match tokens that differ only by leading zeros (Excel vs Caspio/app MRNs). */
export const identityTokenLookupKeys = (value: unknown): string[] => {
  const normalized = normalizeIdentityToken(value);
  if (!normalized) return [];
  const keys = new Set<string>([normalized]);
  const stripped = normalized.replace(/^0+/, '');
  if (stripped) keys.add(stripped);
  if (/^\d+$/.test(stripped) && stripped.length < 12) {
    keys.add(stripped.padStart(12, '0'));
  }
  return Array.from(keys);
};

export const normalizeLooseIdentityText = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

export const buildNameToken = (firstName: unknown, lastName: unknown) =>
  `${normalizeIdentityToken(firstName)}|${normalizeIdentityToken(lastName)}`;

export const extractIdentitySignals = (
  record: Record<string, any> | null,
  options: SignalSourceOptions = {}
): IdentitySignals => {
  const firstNameFields = options.firstNameFields || DEFAULT_FIRST_NAME_FIELDS;
  const lastNameFields = options.lastNameFields || DEFAULT_LAST_NAME_FIELDS;
  const dobFields = options.dobFields || DEFAULT_DOB_FIELDS;
  const mrnFields = options.mrnFields || DEFAULT_MRN_FIELDS;
  const mediCalFields = options.mediCalFields || DEFAULT_MEDI_CAL_FIELDS;
  const clientId2Fields = options.clientId2Fields || DEFAULT_CLIENT_ID2_FIELDS;

  const firstNameToken = normalizeIdentityToken(pickFirstRawValue(record, firstNameFields));
  const lastNameToken = normalizeIdentityToken(pickFirstRawValue(record, lastNameFields));
  const dobToken = normalizeIdentityToken(pickFirstRawValue(record, dobFields));
  const mrnToken = normalizeIdentityToken(pickFirstRawValue(record, mrnFields));
  const mediCalToken = normalizeIdentityToken(pickFirstRawValue(record, mediCalFields));
  const clientId2Token = normalizeIdentityToken(pickFirstRawValue(record, clientId2Fields));

  const identifierTokens = new Set<string>();
  [mrnToken, mediCalToken, clientId2Token].forEach((token) => {
    if (token) identifierTokens.add(token);
  });
  [...mrnFields, ...mediCalFields, ...clientId2Fields, ...(options.extraIdentifierFields || [])].forEach((field) => {
    const token = normalizeIdentityToken(record?.[field]);
    if (token) identifierTokens.add(token);
  });

  return {
    firstNameToken,
    lastNameToken,
    dobToken,
    mrnToken,
    mediCalToken,
    clientId2Token,
    identifierTokens,
  };
};

export const evaluateIdentityConflict = (
  expected: IdentitySignals,
  candidate: IdentitySignals
): { isConflict: boolean; reasonCodes: IdentityMatchReasonCode[] } => {
  const reasonCodes: IdentityMatchReasonCode[] = [];
  const tokensCompatible = (left: string, right: string) => {
    if (!left || !right) return false;
    const leftKeys = new Set(identityTokenLookupKeys(left));
    return identityTokenLookupKeys(right).some((key) => leftKeys.has(key));
  };

  const hasNameMismatch =
    Boolean(expected.firstNameToken && expected.lastNameToken && candidate.firstNameToken && candidate.lastNameToken) &&
    (expected.firstNameToken !== candidate.firstNameToken || expected.lastNameToken !== candidate.lastNameToken);
  if (hasNameMismatch) reasonCodes.push('conflict_name_mismatch');

  const hasClientId2Mismatch =
    Boolean(expected.clientId2Token && candidate.clientId2Token) &&
    !tokensCompatible(expected.clientId2Token, candidate.clientId2Token);
  if (hasClientId2Mismatch) reasonCodes.push('conflict_client_id2_mismatch');

  // Only treat as conflict when BOTH sides have that identifier and they disagree.
  // Missing MRN/Medi-Cal on the Caspio row must not reject a valid Client_ID2 match.
  const hasMrnMismatch =
    Boolean(expected.mrnToken && candidate.mrnToken) && !tokensCompatible(expected.mrnToken, candidate.mrnToken);
  if (hasMrnMismatch) reasonCodes.push('conflict_mrn_mismatch');

  const hasMediCalMismatch =
    Boolean(expected.mediCalToken && candidate.mediCalToken) &&
    !tokensCompatible(expected.mediCalToken, candidate.mediCalToken);
  if (hasMediCalMismatch) reasonCodes.push('conflict_medi_cal_mismatch');

  return {
    isConflict: reasonCodes.length > 0,
    reasonCodes,
  };
};

export const evaluateIdentityMatch = (
  expected: IdentitySignals,
  candidate: IdentitySignals
): { score: number; reasonCode: IdentityMatchReasonCode | null } => {
  if (expected.clientId2Token && candidate.clientId2Token && expected.clientId2Token === candidate.clientId2Token) {
    return { score: 500, reasonCode: 'match_by_client_id2' };
  }
  if (expected.mrnToken && candidate.identifierTokens.has(expected.mrnToken)) {
    return { score: 400, reasonCode: 'match_by_mrn' };
  }
  if (expected.mediCalToken && candidate.identifierTokens.has(expected.mediCalToken)) {
    return { score: 300, reasonCode: 'match_by_medi_cal' };
  }
  const hasNameMatch =
    Boolean(expected.firstNameToken && expected.lastNameToken) &&
    expected.firstNameToken === candidate.firstNameToken &&
    expected.lastNameToken === candidate.lastNameToken;
  if (!hasNameMatch) return { score: 0, reasonCode: null };
  if (expected.dobToken && candidate.dobToken && expected.dobToken === candidate.dobToken) {
    return { score: 220, reasonCode: 'match_by_name_dob' };
  }
  return { score: 200, reasonCode: 'match_by_name' };
};

export const buildApplicationIdentityAliases = (record: Record<string, any>) => {
  const aliases = new Set<string>();
  const signals = extractIdentitySignals(record, {
    dobFields: ['memberDob', 'Birth_Date', 'DOB'],
    mrnFields: ['memberMrn', 'MRN', 'Member_MRN', 'Medical_Record_Number'],
    mediCalFields: ['memberMediCalNum', 'confirmMemberMediCalNum', 'MediCal_Number', 'Medical_Number', 'MCP_CIN', 'CIN'],
    clientId2Fields: ['client_ID2', 'clientId2', 'caspioClientId2', 'Client_ID2'],
  });
  if (signals.mrnToken) aliases.add(`mrn:${signals.mrnToken}`);
  if (signals.clientId2Token) aliases.add(`client:${signals.clientId2Token}`);
  if (signals.mediCalToken) aliases.add(`medi:${signals.mediCalToken}`);
  const fullNameToken = buildNameToken(signals.firstNameToken, signals.lastNameToken);
  if (signals.firstNameToken && signals.lastNameToken && signals.dobToken) {
    aliases.add(`name_dob:${fullNameToken}|${signals.dobToken}`);
  }
  const planToken = normalizeLooseIdentityText(record?.healthPlan);
  const pathwayToken = normalizeLooseIdentityText(record?.pathway);
  if (signals.firstNameToken && signals.lastNameToken && (planToken || pathwayToken)) {
    aliases.add(`name_plan_path:${fullNameToken}|${planToken}|${pathwayToken}`);
  }
  return aliases;
};

