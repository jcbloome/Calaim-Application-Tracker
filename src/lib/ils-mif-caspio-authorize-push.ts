import {
  isIlsMifCaspioAuthorizedStatus,
  isIlsMifCaspioPendingStatus,
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
>;

export type IlsMifCaspioAuthorizePushResultRow = {
  rowId: string;
  memberName: string;
  clientId2: string;
  authorizationNumberT2038: string;
  authorizationStartT2038: string;
  authorizationEndT2038: string;
  caspioPkId?: string;
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

export const resolveIlsMifCaspioClientId2 = (member: IlsMifCaspioAuthorizePushMemberInput) =>
  clean(member.caspioMatchedClientId2 || member.clientId2);

export const buildIlsMifCaspioAuthorizePayload = (
  member: IlsMifCaspioAuthorizePushMemberInput
): Record<string, string> => {
  const payload: Record<string, string> = {
    CalAIM_Status: 'Authorized',
  };
  const authNumber = clean(member.authorizationNumberT2038);
  const authStart = toCaspioMmDdYyyy(member.authorizationStartT2038);
  const authEnd = toCaspioMmDdYyyy(member.authorizationEndT2038);
  if (authNumber) payload.Authorization_Number_T038 = authNumber;
  if (authStart) payload.Authorization_Start_T2038 = authStart;
  if (authEnd) payload.Authorization_End_T2038 = authEnd;
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
  limit = 3
): Promise<Array<Record<string, any>>> => {
  const selectCandidates = [
    'PK_ID,Client_ID2,Senior_First,Senior_Last,CalAIM_Status,Authorization_Number_T038,Authorization_Start_T2038,Authorization_End_T2038',
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
  member: IlsMifCaspioAuthorizePushMemberInput
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
    const rows = await fetchCaspioMemberRows(baseUrl, token, whereClause, 3);
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

      outcome.authorized.push({
        rowId,
        memberName,
        clientId2: clean(caspioRow.Client_ID2 || caspioRow.client_ID2 || resolveIlsMifCaspioClientId2(member)),
        authorizationNumberT2038: clean(member.authorizationNumberT2038),
        authorizationStartT2038: payload.Authorization_Start_T2038 || '',
        authorizationEndT2038: payload.Authorization_End_T2038 || '',
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
