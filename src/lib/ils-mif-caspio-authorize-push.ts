import { appendCaspioClientNote } from '@/lib/caspio-client-notes';
import {
  buildIlsMifCaspioReferralNoteText,
  ILS_MIF_TARGET_T2038_RECEIVED_STATUS,
  isIlsMifCaspioAuthorizedStatus,
  isIlsMifCaspioPendingStatus,
  isIlsMifT2038ReceivedStatus,
  isIlsMifT2038RequestedStatus,
  type IlsMifMasterRow,
} from '@/lib/ils-mif-parse';

const clean = (value: unknown) => String(value ?? '').trim();
const esc = (value: unknown) => clean(value).replace(/'/g, "''");
const looksLikeNumericId = (value: unknown) => /^-?\d+(?:\.\d+)?$/.test(clean(value));

export const ILS_MIF_CASPIO_MEMBERS_TABLE = 'CalAIM_tbl_Members';

export type IlsMifCaspioAuthorizePushMemberInput = Pick<
  IlsMifMasterRow,
  | 'rowId'
  | 'memberFirstName'
  | 'memberLastName'
  | 'memberMrn'
  | 'memberMediCalNum'
  | 'clientId2'
  | 'caspioMatchedClientId2'
  | 'caspioMatchedBy'
  | 'authorizationNumberT2038'
  | 'authorizationStartT2038'
  | 'authorizationEndT2038'
  | 'caspioCalAIMStatus'
  | 'referringOrganization'
  | 'careManagerName'
  | 'careManagerPhone'
  | 'careManagerEmail'
  | 'dateReceivedRequestForAuthorization'
  | 'dateOfReferralAuthorizationDecision'
  | 'extraAdminNotes'
  | 'sourceFileName'
>;

export type IlsMifCaspioAuthorizePushResultRow = {
  rowId: string;
  memberName: string;
  clientId2: string;
  authorizationNumberT2038: string;
  authorizationStartT2038: string;
  authorizationEndT2038: string;
  caspioPkId?: string;
  noteStatus?: 'inserted' | 'skipped' | 'failed';
  noteError?: string;
  /** Caspio values before the update (auth-field push only). */
  previousAuthorizationNumberT2038?: string;
  previousAuthorizationStartT2038?: string;
  previousAuthorizationEndT2038?: string;
};

export type IlsMifCaspioAuthorizePushOutcome = {
  authorized: IlsMifCaspioAuthorizePushResultRow[];
  skipped: Array<{ rowId: string; memberName: string; reason: string }>;
  failed: Array<{ rowId: string; memberName: string; reason: string }>;
};

export const toCaspioMmDdYyyy = (rawValue: unknown): string => {
  const raw = clean(rawValue);
  if (!raw) return '';
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    const mm = slash[1].padStart(2, '0');
    const dd = slash[2].padStart(2, '0');
    const yyyy = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    return `${mm}/${dd}/${yyyy}`;
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const dd = String(parsed.getDate()).padStart(2, '0');
    const yyyy = String(parsed.getFullYear());
    return `${mm}/${dd}/${yyyy}`;
  }
  return raw;
};

const buildEqualsClause = (fieldName: string, value: unknown) => {
  const normalizedValue = clean(value);
  if (!normalizedValue) return '';
  if (/^0\d+$/.test(normalizedValue)) {
    return `${fieldName}='${esc(normalizedValue)}'`;
  }
  return looksLikeNumericId(normalizedValue)
    ? `${fieldName}=${normalizedValue}`
    : `${fieldName}='${esc(normalizedValue)}'`;
};

export const resolveIlsMifCaspioClientId2 = (
  member: Pick<IlsMifCaspioAuthorizePushMemberInput, 'clientId2' | 'caspioMatchedClientId2'>
) => clean(member.caspioMatchedClientId2 || member.clientId2);

export const buildIlsMifCaspioAuthorizePayload = (
  member: IlsMifCaspioAuthorizePushMemberInput
): Record<string, string> => {
  const payload: Record<string, string> = {
    CalAIM_Status: 'Authorized',
  };
  const authNumber = clean(member.authorizationNumberT2038);
  const authStart = toCaspioMmDdYyyy(member.authorizationStartT2038);
  const authEnd = toCaspioMmDdYyyy(member.authorizationEndT2038);
  if (authNumber) payload.Authorization_Number_T2038 = authNumber;
  if (authStart) payload.Authorization_Start_Date_T2038 = authStart;
  if (authEnd) payload.Authorization_End_Date_T2038 = authEnd;
  return payload;
};

export const validateIlsMifCaspioAuthorizePushMember = (
  member: IlsMifCaspioAuthorizePushMemberInput
): string | null => {
  const memberName = `${clean(member.memberLastName)}, ${clean(member.memberFirstName)}`.replace(/^,\s*/, '');
  if (!memberName.trim()) return 'Missing member name';
  if (!resolveIlsMifCaspioClientId2(member) && !clean(member.memberMrn) && !clean(member.memberMediCalNum)) {
    return 'Missing Caspio match identity (Client_ID2, MRN, or CIN)';
  }
  if (!clean(member.authorizationNumberT2038)) {
    return 'Missing MIF Authorization Number (T2038)';
  }
  if (!clean(member.authorizationStartT2038)) {
    return 'Missing MIF Authorization Start Date (T2038)';
  }
  if (!clean(member.authorizationEndT2038)) {
    return 'Missing MIF Authorization End Date (T2038)';
  }
  return null;
};

const fetchCaspioMemberRows = async (
  baseUrl: string,
  token: string,
  whereClause: string,
  limit = 3,
  extraSelect?: string
): Promise<Array<Record<string, any>>> => {
  const selectCandidates = [
    ...(extraSelect ? [extraSelect] : []),
    'PK_ID,Client_ID2,Senior_First,Senior_Last,CalAIM_Status,Kaiser_Status,Authorization_Number_T2038,Authorization_Start_Date_T2038,Authorization_End_Date_T2038',
    'PK_ID,Client_ID2,Senior_First,Senior_Last,CalAIM_Status,Kaiser_Status',
    'PK_ID,Client_ID2,Senior_First,Senior_Last,CalAIM_Status,Authorization_Number_T2038,Authorization_Start_Date_T2038,Authorization_End_Date_T2038',
    'PK_ID,Client_ID2,Senior_First,Senior_Last,CalAIM_Status',
    'PK_ID,Client_ID2,Senior_First,Senior_Last',
    'PK_ID,Client_ID2',
  ];
  for (const selectClause of selectCandidates) {
    const url =
      `${baseUrl}/tables/${ILS_MIF_CASPIO_MEMBERS_TABLE}/records` +
      `?q.where=${encodeURIComponent(whereClause)}` +
      `&q.select=${encodeURIComponent(selectClause)}` +
      `&q.orderBy=${encodeURIComponent('PK_ID DESC')}` +
      `&q.limit=${limit}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });
    if (!response.ok) continue;
    const json = await response.json().catch(() => ({} as any));
    const rows = Array.isArray(json?.Result) ? (json.Result as Array<Record<string, any>>) : [];
    if (rows.length > 0) return rows;
  }
  return [];
};

export const findCaspioMemberForIlsMifPush = async (
  baseUrl: string,
  token: string,
  member: Pick<
    IlsMifCaspioAuthorizePushMemberInput,
    'clientId2' | 'caspioMatchedClientId2' | 'memberMrn' | 'memberMediCalNum'
  >,
  extraSelect?: string
): Promise<Record<string, any> | null> => {
  const whereCandidates = new Set<string>();
  const clientId2 = resolveIlsMifCaspioClientId2(member);
  if (clientId2) {
    ['Client_ID2', 'client_ID2'].forEach((fieldName) => {
      const dynamicClause = buildEqualsClause(fieldName, clientId2);
      if (dynamicClause) whereCandidates.add(dynamicClause);
      whereCandidates.add(`${fieldName}='${esc(clientId2)}'`);
      if (looksLikeNumericId(clientId2)) whereCandidates.add(`${fieldName}=${clientId2}`);
    });
  }
  const mrn = clean(member.memberMrn);
  if (mrn) {
    ['Member_MRN', 'MRN', 'Medical_Record_Number'].forEach((fieldName) => {
      const dynamicClause = buildEqualsClause(fieldName, mrn);
      if (dynamicClause) whereCandidates.add(dynamicClause);
    });
  }
  const cin = clean(member.memberMediCalNum);
  if (cin) {
    ['MCP_CIN', 'MediCal_Number', 'Medical_Number', 'CIN'].forEach((fieldName) => {
      const dynamicClause = buildEqualsClause(fieldName, cin);
      if (dynamicClause) whereCandidates.add(dynamicClause);
    });
  }

  for (const whereClause of whereCandidates) {
    const rows = await fetchCaspioMemberRows(baseUrl, token, whereClause, 3, extraSelect);
    if (rows.length > 0) return rows[0];
  }
  return null;
};

export async function pushIlsMifPendingMembersToAuthorizedInCaspio(params: {
  baseUrl: string;
  token: string;
  members: IlsMifCaspioAuthorizePushMemberInput[];
}): Promise<IlsMifCaspioAuthorizePushOutcome> {
  const outcome: IlsMifCaspioAuthorizePushOutcome = {
    authorized: [],
    skipped: [],
    failed: [],
  };

  for (const member of params.members) {
    const rowId = clean(member.rowId);
    const memberName =
      `${clean(member.memberLastName)}, ${clean(member.memberFirstName)}`.replace(/^,\s*/, '') ||
      rowId ||
      'Member';

    const validationError = validateIlsMifCaspioAuthorizePushMember(member);
    if (validationError) {
      outcome.skipped.push({ rowId, memberName, reason: validationError });
      continue;
    }

    try {
      const caspioRow = await findCaspioMemberForIlsMifPush(params.baseUrl, params.token, member);
      if (!caspioRow) {
        outcome.failed.push({ rowId, memberName, reason: 'Caspio member not found' });
        continue;
      }

      const pkId = clean(caspioRow.PK_ID || caspioRow.pk_id);
      const currentStatus = clean(caspioRow.CalAIM_Status || caspioRow.calaim_status);
      if (isIlsMifCaspioAuthorizedStatus(currentStatus)) {
        outcome.skipped.push({
          rowId,
          memberName,
          reason: 'Already Authorized in Caspio',
        });
        continue;
      }
      if (currentStatus && !isIlsMifCaspioPendingStatus(currentStatus)) {
        outcome.skipped.push({
          rowId,
          memberName,
          reason: `Caspio CalAIM_Status is "${currentStatus}", not Pending`,
        });
        continue;
      }

      const updateWhere = pkId ? `PK_ID=${esc(pkId)}` : buildEqualsClause('Client_ID2', resolveIlsMifCaspioClientId2(member));
      if (!updateWhere) {
        outcome.failed.push({ rowId, memberName, reason: 'Unable to build Caspio update key' });
        continue;
      }

      const payload = buildIlsMifCaspioAuthorizePayload(member);
      const url = `${params.baseUrl}/tables/${ILS_MIF_CASPIO_MEMBERS_TABLE}/records?q.where=${encodeURIComponent(updateWhere)}`;
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${params.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        outcome.failed.push({
          rowId,
          memberName,
          reason: `Caspio update failed (HTTP ${response.status})${errorText ? `: ${clean(errorText).slice(0, 180)}` : ''}`,
        });
        continue;
      }

      const clientId2 = clean(caspioRow.Client_ID2 || caspioRow.client_ID2 || resolveIlsMifCaspioClientId2(member));
      const noteText = buildIlsMifCaspioReferralNoteText({
        referringOrganization: member.referringOrganization,
        careManagerName: member.careManagerName,
        careManagerPhone: member.careManagerPhone,
        careManagerEmail: member.careManagerEmail,
        authorizationNumberT2038: member.authorizationNumberT2038,
        authorizationStartT2038: payload.Authorization_Start_Date_T2038 || member.authorizationStartT2038,
        authorizationEndT2038: payload.Authorization_End_Date_T2038 || member.authorizationEndT2038,
        dateReceivedRequestForAuthorization: member.dateReceivedRequestForAuthorization,
        dateOfReferralAuthorizationDecision: member.dateOfReferralAuthorizationDecision,
        extraAdminNotes: member.extraAdminNotes,
        sourceFileName: member.sourceFileName,
      });
      let noteStatus: IlsMifCaspioAuthorizePushResultRow['noteStatus'] = 'skipped';
      let noteError: string | undefined;
      if (noteText) {
        const noteResult = await appendCaspioClientNote({
          clientId2,
          comments: noteText,
          sourceTag: 'ILS MIF Consolidator',
        });
        if (noteResult.reason === 'inserted') {
          noteStatus = 'inserted';
        } else if (noteResult.success && noteResult.skipped) {
          noteStatus = 'skipped';
        } else {
          noteStatus = 'failed';
          noteError = noteResult.error || 'Failed to append Caspio referral note';
        }
      }

      outcome.authorized.push({
        rowId,
        memberName,
        clientId2,
        authorizationNumberT2038: clean(member.authorizationNumberT2038),
        authorizationStartT2038: payload.Authorization_Start_Date_T2038 || '',
        authorizationEndT2038: payload.Authorization_End_Date_T2038 || '',
        caspioPkId: pkId || undefined,
        noteStatus,
        noteError,
      });
    } catch (error: any) {
      outcome.failed.push({
        rowId,
        memberName,
        reason: String(error?.message || 'Unexpected error'),
      });
    }
  }

  return outcome;
}

export type IlsMifCaspioAuthFieldNames = {
  number: string | null;
  start: string | null;
  end: string | null;
};

let cachedAuthFieldNames: { at: number; names: IlsMifCaspioAuthFieldNames } | null = null;

const pickCaspioField = (
  available: string[],
  preferred: string[],
  matches: (lower: string) => boolean
): string | null => {
  const byLower = new Map(available.map((name) => [name.toLowerCase(), name]));
  for (const name of preferred) {
    const hit = byLower.get(name.toLowerCase());
    if (hit) return hit;
  }
  return available.find((name) => matches(name.toLowerCase())) || null;
};

/** Resolve the real T2038 auth field names on CalAIM_tbl_Members from Caspio's table definition. */
export async function resolveIlsMifCaspioAuthFieldNames(
  baseUrl: string,
  token: string
): Promise<IlsMifCaspioAuthFieldNames> {
  if (cachedAuthFieldNames && Date.now() - cachedAuthFieldNames.at < 30 * 60 * 1000) {
    return cachedAuthFieldNames.names;
  }
  const response = await fetch(`${baseUrl}/tables/${ILS_MIF_CASPIO_MEMBERS_TABLE}/fields`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Unable to read Caspio ${ILS_MIF_CASPIO_MEMBERS_TABLE} fields (HTTP ${response.status})`);
  }
  const json = await response.json().catch(() => ({} as any));
  const available = (Array.isArray(json?.Result) ? json.Result : [])
    .map((field: any) => clean(field?.Name))
    .filter(Boolean) as string[];

  const isT2038 = (lower: string) => lower.includes('t2038') || lower.includes('t038');
  const notNextOrExt = (lower: string) => !lower.includes('next') && !lower.includes('ext');
  const names: IlsMifCaspioAuthFieldNames = {
    number: pickCaspioField(
      available,
      ['Authorization_Number_T2038', 'Authorization_Number_T038', 'Auth_Number_T2038', 'T2038_Authorization_Number'],
      (lower) =>
        lower.includes('auth') && (lower.includes('num') || lower.endsWith('_no')) && isT2038(lower) && notNextOrExt(lower)
    ),
    start: pickCaspioField(
      available,
      ['Authorization_Start_Date_T2038', 'Authorization_Start_T2038'],
      (lower) => lower.includes('auth') && lower.includes('start') && isT2038(lower) && notNextOrExt(lower)
    ),
    end: pickCaspioField(
      available,
      ['Authorization_End_Date_T2038', 'Authorization_End_T2038'],
      (lower) => lower.includes('auth') && lower.includes('end') && isT2038(lower) && notNextOrExt(lower)
    ),
  };
  cachedAuthFieldNames = { at: Date.now(), names };
  return names;
}

/**
 * Write MIF T2038 auth number + start/end dates onto the Caspio member.
 * Never changes CalAIM_Status or Kaiser_Status — staff set those in Caspio so assigned staff are informed.
 */
export async function pushIlsMifAuthFieldsToCaspio(params: {
  baseUrl: string;
  token: string;
  members: IlsMifCaspioAuthorizePushMemberInput[];
}): Promise<IlsMifCaspioAuthorizePushOutcome> {
  const outcome: IlsMifCaspioAuthorizePushOutcome = { authorized: [], skipped: [], failed: [] };
  const fieldNames = await resolveIlsMifCaspioAuthFieldNames(params.baseUrl, params.token);
  if (!fieldNames.start && !fieldNames.end && !fieldNames.number) {
    for (const member of params.members) {
      outcome.failed.push({
        rowId: clean(member.rowId),
        memberName: `${clean(member.memberLastName)}, ${clean(member.memberFirstName)}`,
        reason: `No T2038 authorization fields found on Caspio ${ILS_MIF_CASPIO_MEMBERS_TABLE}`,
      });
    }
    return outcome;
  }

  for (const member of params.members) {
    const rowId = clean(member.rowId);
    const memberName =
      `${clean(member.memberLastName)}, ${clean(member.memberFirstName)}`.replace(/^,\s*/, '') ||
      rowId ||
      'Member';

    const validationError = validateIlsMifCaspioAuthorizePushMember(member);
    if (validationError) {
      outcome.skipped.push({ rowId, memberName, reason: validationError });
      continue;
    }

    try {
      const extraSelect = ['PK_ID', 'Client_ID2', fieldNames.number, fieldNames.start, fieldNames.end]
        .filter(Boolean)
        .join(',');
      const caspioRow = await findCaspioMemberForIlsMifPush(params.baseUrl, params.token, member, extraSelect);
      if (!caspioRow) {
        outcome.failed.push({ rowId, memberName, reason: 'Caspio member not found' });
        continue;
      }

      const authNumber = clean(member.authorizationNumberT2038);
      const authStart = toCaspioMmDdYyyy(member.authorizationStartT2038);
      const authEnd = toCaspioMmDdYyyy(member.authorizationEndT2038);
      const payload: Record<string, string> = {};
      if (fieldNames.number && authNumber) payload[fieldNames.number] = authNumber;
      if (fieldNames.start && authStart) payload[fieldNames.start] = authStart;
      if (fieldNames.end && authEnd) payload[fieldNames.end] = authEnd;

      const caspioEnd = fieldNames.end ? toCaspioMmDdYyyy(caspioRow[fieldNames.end]) : '';
      const caspioEndMs = Date.parse(caspioEnd);
      const mifEndMs = Date.parse(authEnd);
      if (Number.isFinite(caspioEndMs) && Number.isFinite(mifEndMs) && caspioEndMs > mifEndMs) {
        outcome.skipped.push({
          rowId,
          memberName,
          reason: `Caspio already has a later auth end (${caspioEnd})`,
        });
        continue;
      }

      const pkId = clean(caspioRow.PK_ID || caspioRow.pk_id);
      const updateWhere = pkId
        ? `PK_ID=${esc(pkId)}`
        : buildEqualsClause('Client_ID2', resolveIlsMifCaspioClientId2(member));
      if (!updateWhere) {
        outcome.failed.push({ rowId, memberName, reason: 'Unable to build Caspio update key' });
        continue;
      }

      const url = `${params.baseUrl}/tables/${ILS_MIF_CASPIO_MEMBERS_TABLE}/records?q.where=${encodeURIComponent(updateWhere)}`;
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${params.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        outcome.failed.push({
          rowId,
          memberName,
          reason: `Caspio update failed (HTTP ${response.status})${errorText ? `: ${clean(errorText).slice(0, 180)}` : ''}`,
        });
        continue;
      }

      outcome.authorized.push({
        rowId,
        memberName,
        clientId2: clean(caspioRow.Client_ID2 || caspioRow.client_ID2 || resolveIlsMifCaspioClientId2(member)),
        authorizationNumberT2038: fieldNames.number ? authNumber : '',
        authorizationStartT2038: fieldNames.start ? authStart : '',
        authorizationEndT2038: fieldNames.end ? authEnd : '',
        caspioPkId: pkId || undefined,
        previousAuthorizationNumberT2038: fieldNames.number ? clean(caspioRow[fieldNames.number]) : '',
        previousAuthorizationStartT2038: fieldNames.start ? toCaspioMmDdYyyy(caspioRow[fieldNames.start]) : '',
        previousAuthorizationEndT2038: caspioEnd,
        ...(fieldNames.number ? {} : { noteError: 'Caspio has no T2038 auth number field — number not pushed' }),
      });
    } catch (error: any) {
      outcome.failed.push({ rowId, memberName, reason: String(error?.message || 'Unexpected error') });
    }
  }

  return outcome;
}

export type IlsMifCaspioT2038StatusPushMemberInput = Pick<
  IlsMifMasterRow,
  | 'rowId'
  | 'memberFirstName'
  | 'memberLastName'
  | 'memberMrn'
  | 'memberMediCalNum'
  | 'clientId2'
  | 'caspioMatchedClientId2'
  | 'caspioMatchedBy'
  | 'caspioKaiserStatus'
  | 'sourceFileName'
>;

export type IlsMifCaspioT2038StatusPushResultRow = {
  rowId: string;
  memberName: string;
  clientId2: string;
  previousKaiserStatus: string;
  kaiserStatus: string;
  caspioPkId?: string;
};

export type IlsMifCaspioT2038StatusPushOutcome = {
  updated: IlsMifCaspioT2038StatusPushResultRow[];
  skipped: Array<{ rowId: string; memberName: string; reason: string }>;
  failed: Array<{ rowId: string; memberName: string; reason: string }>;
};

export const validateIlsMifCaspioT2038StatusPushMember = (
  member: IlsMifCaspioT2038StatusPushMemberInput
): string | null => {
  const memberName = `${clean(member.memberLastName)}, ${clean(member.memberFirstName)}`.replace(/^,\s*/, '');
  if (!memberName.trim()) return 'Missing member name';
  if (!resolveIlsMifCaspioClientId2(member) && !clean(member.memberMrn) && !clean(member.memberMediCalNum)) {
    return 'Missing Caspio match identity (Client_ID2, MRN, or CIN)';
  }
  return null;
};

/** Push Kaiser_Status from T2038 Requested → T2038 Received, doc collection. */
export async function pushIlsMifT2038RequestedToReceivedInCaspio(params: {
  baseUrl: string;
  token: string;
  members: IlsMifCaspioT2038StatusPushMemberInput[];
}): Promise<IlsMifCaspioT2038StatusPushOutcome> {
  const outcome: IlsMifCaspioT2038StatusPushOutcome = {
    updated: [],
    skipped: [],
    failed: [],
  };

  for (const member of params.members) {
    const rowId = clean(member.rowId);
    const memberName =
      `${clean(member.memberLastName)}, ${clean(member.memberFirstName)}`.replace(/^,\s*/, '') ||
      rowId ||
      'Member';

    const validationError = validateIlsMifCaspioT2038StatusPushMember(member);
    if (validationError) {
      outcome.skipped.push({ rowId, memberName, reason: validationError });
      continue;
    }

    try {
      const caspioRow = await findCaspioMemberForIlsMifPush(params.baseUrl, params.token, member);
      if (!caspioRow) {
        outcome.failed.push({ rowId, memberName, reason: 'Caspio member not found' });
        continue;
      }

      const pkId = clean(caspioRow.PK_ID || caspioRow.pk_id);
      const previousKaiserStatus = clean(
        caspioRow.Kaiser_Status || caspioRow.kaiserStatus || member.caspioKaiserStatus
      );
      if (isIlsMifT2038ReceivedStatus(previousKaiserStatus)) {
        outcome.skipped.push({
          rowId,
          memberName,
          reason: `Already "${ILS_MIF_TARGET_T2038_RECEIVED_STATUS}" (or similar Received) in Caspio`,
        });
        continue;
      }
      if (previousKaiserStatus && !isIlsMifT2038RequestedStatus(previousKaiserStatus)) {
        outcome.skipped.push({
          rowId,
          memberName,
          reason: `Caspio Kaiser_Status is "${previousKaiserStatus}", not T2038 Requested`,
        });
        continue;
      }

      const updateWhere = pkId
        ? `PK_ID=${esc(pkId)}`
        : buildEqualsClause('Client_ID2', resolveIlsMifCaspioClientId2(member));
      if (!updateWhere) {
        outcome.failed.push({ rowId, memberName, reason: 'Unable to build Caspio update key' });
        continue;
      }

      const payload = { Kaiser_Status: ILS_MIF_TARGET_T2038_RECEIVED_STATUS };
      const url = `${params.baseUrl}/tables/${ILS_MIF_CASPIO_MEMBERS_TABLE}/records?q.where=${encodeURIComponent(updateWhere)}`;
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${params.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        outcome.failed.push({
          rowId,
          memberName,
          reason: `Caspio update failed (HTTP ${response.status})${errorText ? `: ${clean(errorText).slice(0, 180)}` : ''}`,
        });
        continue;
      }

      const clientId2 = clean(
        caspioRow.Client_ID2 || caspioRow.client_ID2 || resolveIlsMifCaspioClientId2(member)
      );
      outcome.updated.push({
        rowId,
        memberName,
        clientId2,
        previousKaiserStatus,
        kaiserStatus: ILS_MIF_TARGET_T2038_RECEIVED_STATUS,
        caspioPkId: pkId || undefined,
      });
    } catch (error: any) {
      outcome.failed.push({
        rowId,
        memberName,
        reason: String(error?.message || 'Unexpected error'),
      });
    }
  }

  return outcome;
}
