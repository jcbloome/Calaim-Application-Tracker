import { NextRequest, NextResponse } from 'next/server';
import { getCaspioCredentialsFromEnv, getCaspioToken } from '@/lib/caspio-api-utils';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { Resend } from 'resend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ClaimWindow = { from: string | null; to: string | null };
type ClaimResolutionStatus = 'pending-review' | 'notified' | 'corrected' | 'rechecked-pass';

type NormalizedClaim = {
  claimRecordId: string;
  claimNumber: string;
  rcfeRegisteredId: string;
  rcfeName: string;
  serviceLocationName: string;
  claimAcceptance: string;
  clientId2: string;
  mcpCin: string;
  mrn: string;
  lastFirstId2: string;
  clientFirst: string;
  clientLast: string;
  userFirst: string;
  userLast: string;
  emailSubmitter: string;
  submittedAtIso: string | null;
  submittedAtMs: number;
  windows: ClaimWindow[];
};

type IncomingClaim = Partial<NormalizedClaim> & { windows?: Array<Partial<ClaimWindow>> };
type AuthContext = { uid: string; email: string; isSuperAdmin: boolean; isClaimsStaff: boolean };

const DATE_WINDOW_FIELDS: Array<[string, string]> = [
  ['Days_of_Service_First1', 'Days_of_Service_Last1'],
  ['Days_of_Service_First2', 'Days_of_Service_Last2'],
  ['Days_of_Service_First3', 'Days_of_Service_Last3'],
  ['Days_of_Service_First4', 'Days_of_Service_Last4'],
];
const CLAIMS_CACHE_COLLECTION = 'h2022_claim_checker_claims';
const CLAIMS_CACHE_META_COLLECTION = 'system_settings';
const CLAIMS_CACHE_META_DOC = 'h2022_claim_checker_sync';
const CLAIMS_EMAIL_AUDIT_COLLECTION = 'h2022_claim_checker_email_logs';

const normalizeFieldName = (value: unknown) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();

const getField = (row: Record<string, unknown>, candidateKeys: string[]) => {
  const wanted = new Set(candidateKeys.map((v) => normalizeFieldName(v)));
  for (const [k, v] of Object.entries(row)) {
    if (wanted.has(normalizeFieldName(k))) return v;
  }
  return undefined;
};

const parseDateLoose = (value: unknown): string | null => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const mmddyyyy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (mmddyyyy) {
    const mm = String(Number(mmddyyyy[1])).padStart(2, '0');
    const dd = String(Number(mmddyyyy[2])).padStart(2, '0');
    return `${mmddyyyy[3]}-${mm}-${dd}`;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
};

const toRangeMs = (from: string | null, to: string | null) => {
  const start = parseDateLoose(from);
  const end = parseDateLoose(to) || start;
  if (!start || !end) return null;
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  return {
    startMs: Math.min(startMs, endMs),
    endMs: Math.max(startMs, endMs),
  };
};

const rangesOverlap = (a: ClaimWindow, b: ClaimWindow) => {
  const ra = toRangeMs(a.from, a.to);
  const rb = toRangeMs(b.from, b.to);
  if (!ra || !rb) return false;
  return Math.max(ra.startMs, rb.startMs) <= Math.min(ra.endMs, rb.endMs);
};

const normalizeText = (value: unknown) => String(value ?? '').trim();
const normalizeKeyPart = (value: unknown) => String(value ?? '').trim().toLowerCase();
const escapeSqlLiteral = (value: string) => value.replace(/'/g, "''");
const escapeHtml = (value: string) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const normalizeEmailList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || '').trim())
    .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
};
const toDocId = (claimRecordId: string) =>
  `claim_${String(claimRecordId || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')}`;

const normalizeIdentifier = (value: unknown) => {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return '';
  const compact = raw.replace(/[^a-z0-9]/g, '');
  // Caspio rows may contain placeholders like N/A, null, unknown; treat these as missing IDs.
  const invalid = new Set(['na', 'n/a', 'none', 'null', 'unknown', 'notavailable', '']);
  if (invalid.has(raw) || invalid.has(compact)) return '';
  return compact;
};

const cleanIdentifier = (value: unknown) => {
  const trimmed = String(value ?? '').trim();
  return normalizeIdentifier(trimmed) ? trimmed : '';
};

const getIdentityKeys = (claim: NormalizedClaim) =>
  [claim.clientId2, claim.mrn, claim.lastFirstId2]
    .map((v) => normalizeIdentifier(v))
    .filter(Boolean);

const claimsBelongToSameMember = (a: NormalizedClaim, b: NormalizedClaim) => {
  const aIds = [a.mcpCin, a.clientId2, a.mrn, a.lastFirstId2].map(normalizeIdentifier).filter(Boolean);
  const bIds = [b.mcpCin, b.clientId2, b.mrn, b.lastFirstId2].map(normalizeIdentifier).filter(Boolean);
  if (!aIds.length || !bIds.length) return false;
  const bSet = new Set(bIds);
  return aIds.some((id) => bSet.has(id));
};

const claimFingerprint = (claim: NormalizedClaim) =>
  JSON.stringify({
    claimRecordId: claim.claimRecordId,
    claimNumber: claim.claimNumber,
    rcfeRegisteredId: claim.rcfeRegisteredId,
    rcfeName: claim.rcfeName,
    serviceLocationName: claim.serviceLocationName,
    claimAcceptance: claim.claimAcceptance,
    clientId2: claim.clientId2,
    mcpCin: claim.mcpCin,
    mrn: claim.mrn,
    lastFirstId2: claim.lastFirstId2,
    clientFirst: claim.clientFirst,
    clientLast: claim.clientLast,
    userFirst: claim.userFirst,
    userLast: claim.userLast,
    emailSubmitter: claim.emailSubmitter,
    submittedAtIso: claim.submittedAtIso,
    windows: claim.windows.map((w) => ({
      from: w.from || null,
      to: w.to || w.from || null,
    })),
  });

const inSubmittedRange = (claim: NormalizedClaim, fromDate: string | null, toDate: string | null) => {
  if (!fromDate && !toDate) return true;
  if (!claim.submittedAtIso) return false;
  const current = Date.parse(claim.submittedAtIso);
  if (!Number.isFinite(current)) return false;
  const fromMs = fromDate ? Date.parse(fromDate) : Number.NEGATIVE_INFINITY;
  const toMs = toDate ? Date.parse(toDate) : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return true;
  return current >= fromMs && current <= toMs;
};

function buildRejectionEmailTemplate(params: {
  submitterName: string;
  claimRecordId: string;
  memberName: string;
  rcfeName: string;
  submittedAtIso: string | null;
  currentWindows: ClaimWindow[];
  overlaps: Array<{ claimRecordId: string; submittedAtIso: string | null; windows: ClaimWindow[] }>;
}) {
  const safeName = params.submitterName || 'Submitter';
  const subject = `H2022 claim overlap detected: ${params.memberName || 'Member'} (${params.claimRecordId})`;
  const currentWindows = params.currentWindows.length
    ? params.currentWindows
        .map((w, idx) => `${idx + 1}) ${w.from || 'N/A'} - ${w.to || w.from || 'N/A'}`)
        .join(' | ')
    : 'No service dates';
  const overlapLines = params.overlaps.map((conflict) => {
    const windows = conflict.windows.length
      ? conflict.windows
          .map((w, idx) => `${idx + 1}) ${w.from || 'N/A'} - ${w.to || w.from || 'N/A'}`)
          .join(' | ')
      : 'No service dates';
    return `- Prior claim ${conflict.claimRecordId} (submitted ${conflict.submittedAtIso || 'N/A'}), service windows: ${windows}`;
  });

  const bodyText = [
    `Hello ${safeName},`,
    '',
    `Your claim for ${params.memberName || 'Member'} at ${params.rcfeName || 'the RCFE'} (${params.claimRecordId}) was flagged for overlapping service dates and is at risk of rejection.`,
    '',
    `Submitted claim number: ${params.claimRecordId}`,
    `Current claim submitted date: ${params.submittedAtIso || 'N/A'}`,
    `Current claim service windows: ${currentWindows}`,
    '',
    'Conflicting prior submitted claims:',
    ...(overlapLines.length ? overlapLines : ['- No overlap details available.']),
    '',
    'Please notify billing@carehomefinders.com for review. The RCFE must correct and resubmit the claim.',
    '',
    'Thank you,',
    'CalAIM Claims Team',
  ].join('\n');

  return { subject, bodyText };
}

async function requireClaimsAccess(request: NextRequest) {
  const adminCheck = await requireAdminApiAuth(request, { requireTwoFactor: true });
  if (!adminCheck.ok) {
    return adminCheck;
  }
  const { adminDb, uid, email, decodedClaims, isSuperAdmin } = adminCheck;
  const claimsFromToken = Boolean((decodedClaims as Record<string, unknown>)?.isClaimsStaff);

  const [userByUid, userByEmail] = await Promise.all([
    adminDb.collection('users').doc(uid).get(),
    adminDb.collection('users').doc(email).get(),
  ]);
  const userData = userByUid.exists
    ? (userByUid.data() as Record<string, unknown>)
    : userByEmail.exists
      ? (userByEmail.data() as Record<string, unknown>)
      : null;
  const isClaimsStaff = claimsFromToken || Boolean(userData?.isClaimsStaff) || isSuperAdmin;

  if (!isClaimsStaff && !isSuperAdmin) {
    return { ok: false as const, status: 403, error: 'Claims-access staff privileges required' };
  }

  const context: AuthContext = {
    uid,
    email,
    isSuperAdmin,
    isClaimsStaff,
  };
  return { ok: true as const, context };
}

async function fetchH2022Claims(whereClause?: string) {
  const credentials = getCaspioCredentialsFromEnv();
  const token = await getCaspioToken(credentials);
  const table = 'CalAIM_Claim_Submit_RCFE_H2022';
  const selectFields = [
    'PK_ID',
    'Record_ID',
    'ID',
    'Claim_Number',
    'RCFE_Registered_ID',
    'RCFE_Name',
    'Service_Location_Name',
    'Claim_Acceptance',
    'Client_ID2',
    'MCP_CIN',
    'MRN',
    'Last_First_ID2',
    'Client_Last_First_ID2',
    'Client_First',
    'Client_Last',
    'User_First',
    'User_Last',
    'Email_Submitter',
    'Timestamp',
    ...DATE_WINDOW_FIELDS.flat(),
  ];

  const pageSize = 300;
  const maxPages = 30;
  const rows: Record<string, unknown>[] = [];
  let includeSelect = true;
  let includeWhere = Boolean(whereClause && whereClause.trim());
  const normalizedWhere = whereClause && whereClause.trim() ? whereClause.trim() : '';

  const shouldFallbackSelect = (status: number, text: string) => {
    const lower = String(text || '').toLowerCase();
    if (status !== 400) return false;
    return (
      lower.includes('invalid column name') ||
      lower.includes('sqlservererror') ||
      lower.includes('q=select') ||
      lower.includes('q.select')
    );
  };

  const shouldFallbackWhere = (status: number, text: string) => {
    const lower = String(text || '').toLowerCase();
    if (status !== 400) return false;
    return (
      lower.includes('invalid column name') ||
      lower.includes('sqlservererror') ||
      lower.includes('timestamp') ||
      lower.includes('date_submitted') ||
      lower.includes('q.where')
    );
  };

  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const runAttempt = async (opts: { useSelect: boolean; useWhere: boolean }) => {
      const sp = new URLSearchParams();
      if (opts.useWhere && normalizedWhere) sp.set('q.where', normalizedWhere);
      if (opts.useSelect) sp.set('q.select', selectFields.join(','));
      sp.set('q.pageSize', String(pageSize));
      sp.set('q.pageNumber', String(pageNumber));
      const url = `${credentials.baseUrl}/integrations/rest/v3/tables/${table}/records?${sp.toString()}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      const text = !res.ok ? await res.text().catch(() => '') : '';
      return { res, text };
    };

    let attempt = await runAttempt({ useSelect: includeSelect, useWhere: includeWhere });
    if (!attempt.res.ok && includeSelect && shouldFallbackSelect(attempt.res.status, attempt.text)) {
      includeSelect = false;
      attempt = await runAttempt({ useSelect: includeSelect, useWhere: includeWhere });
    }
    if (!attempt.res.ok && includeWhere && shouldFallbackWhere(attempt.res.status, attempt.text)) {
      includeWhere = false;
      attempt = await runAttempt({ useSelect: includeSelect, useWhere: includeWhere });
    }
    if (!attempt.res.ok) {
      throw new Error(`Caspio read failed (${attempt.res.status}): ${attempt.text}`);
    }
    const data = (await attempt.res.json().catch(() => ({}))) as { Result?: unknown[] };
    const pageRows = Array.isArray(data?.Result) ? data.Result : [];
    if (!pageRows.length) break;
    rows.push(...(pageRows as Record<string, unknown>[]));
    if (pageRows.length < pageSize) break;
  }

  return rows;
}

async function setCaspioClaimAcceptanceDenied(params: { claimRecordId: string; claimNumber?: string }) {
  const credentials = getCaspioCredentialsFromEnv();
  const token = await getCaspioToken(credentials);
  const table = 'CalAIM_Claim_Submit_RCFE_H2022';
  const valueSet = new Set(
    [normalizeText(params.claimRecordId), normalizeText(params.claimNumber)]
      .map((v) => v.trim())
      .filter(Boolean)
  );
  const values = Array.from(valueSet);
  if (!values.length) throw new Error('Missing claim identifier for Caspio update.');

  const whereCandidates: string[] = [];
  for (const value of values) {
    const literal = /^-?\d+(?:\.\d+)?$/.test(value) ? value : `'${escapeSqlLiteral(value)}'`;
    whereCandidates.push(`PK_ID=${literal}`);
    whereCandidates.push(`Record_ID=${literal}`);
    whereCandidates.push(`ID=${literal}`);
    whereCandidates.push(`Claim_Number=${literal}`);
  }

  const payloadAttempts: Array<Record<string, string>> = [
    { Claim_Acceptance: 'Denied', CalAIM_Acceptance: 'Denied' },
    { Claim_Acceptance: 'Denied' },
    { CalAIM_Acceptance: 'Denied' },
  ];

  let lastError = 'Unable to set claim acceptance to Denied in Caspio.';
  for (const whereClause of whereCandidates) {
    for (const payload of payloadAttempts) {
      const url =
        `${credentials.baseUrl}/integrations/rest/v3/tables/${table}/records` +
        `?q.where=${encodeURIComponent(whereClause)}`;
      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) return { whereClause, payloadKeys: Object.keys(payload) };
      const text = await res.text().catch(() => '');
      const lower = String(text || '').toLowerCase();
      lastError = `Caspio update failed (${res.status}): ${text || 'Unknown error'}`;
      // Keep trying if schema differs by field name.
      if (res.status === 400 && lower.includes('invalid column name')) continue;
    }
  }
  throw new Error(lastError);
}

async function getCacheMeta() {
  const adminModule = await import('@/firebase-admin');
  const adminDb = adminModule.adminDb;
  const snap = await adminDb.collection(CLAIMS_CACHE_META_COLLECTION).doc(CLAIMS_CACHE_META_DOC).get();
  return snap.exists ? (snap.data() as Record<string, unknown>) : null;
}

async function setCacheMeta(data: Record<string, unknown>) {
  const adminModule = await import('@/firebase-admin');
  const adminDb = adminModule.adminDb;
  await adminDb
    .collection(CLAIMS_CACHE_META_COLLECTION)
    .doc(CLAIMS_CACHE_META_DOC)
    .set(
      {
        ...data,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
}

async function upsertCachedClaims(claims: NormalizedClaim[]) {
  if (!claims.length) return 0;
  const adminModule = await import('@/firebase-admin');
  const adminDb = adminModule.adminDb;
  const chunkSize = 300;
  let written = 0;
  for (let i = 0; i < claims.length; i += chunkSize) {
    const chunk = claims.slice(i, i + chunkSize);
    const batch = adminDb.batch();
    for (const claim of chunk) {
      const ref = adminDb.collection(CLAIMS_CACHE_COLLECTION).doc(toDocId(claim.claimRecordId));
      batch.set(
        ref,
        {
          ...claim,
          submittedAtIso: claim.submittedAtIso || null,
          submittedAtMs: Number.isFinite(claim.submittedAtMs) ? claim.submittedAtMs : 0,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      written += 1;
    }
    await batch.commit();
  }
  return written;
}

async function readCachedClaims(params: {
  rcfeRegisteredId?: string;
  rcfeName?: string;
  syncDateFrom?: string | null;
  syncDateTo?: string | null;
}) {
  const adminModule = await import('@/firebase-admin');
  const adminDb = adminModule.adminDb;
  let query = adminDb.collection(CLAIMS_CACHE_COLLECTION);
  if (params.rcfeRegisteredId) {
    query = query.where('rcfeRegisteredId', '==', params.rcfeRegisteredId);
  } else if (params.rcfeName) {
    query = query.where('rcfeName', '==', params.rcfeName);
  }
  const snap = await query.limit(10000).get();
  const claims = snap.docs
    .map((doc) => doc.data() as IncomingClaim)
    .map((row) => coerceIncomingClaim(row))
    .filter(Boolean) as NormalizedClaim[];
  return claims.filter((claim) => inSubmittedRange(claim, params.syncDateFrom || null, params.syncDateTo || null));
}

async function getWorkflowForClaims(claimRecordIds: string[]) {
  const unique = Array.from(new Set(claimRecordIds.map((id) => normalizeText(id)).filter(Boolean)));
  if (!unique.length) return new Map<string, Record<string, unknown>>();
  const adminModule = await import('@/firebase-admin');
  const adminDb = adminModule.adminDb;
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += 10) chunks.push(unique.slice(i, i + 10));
  const map = new Map<string, Record<string, unknown>>();
  for (const chunk of chunks) {
    const refs = chunk.map((claimRecordId) => adminDb.collection(CLAIMS_CACHE_COLLECTION).doc(toDocId(claimRecordId)));
    const snaps = await adminDb.getAll(...refs);
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const data = snap.data() as Record<string, unknown>;
      const claimRecordId = normalizeText(data?.claimRecordId);
      if (!claimRecordId) continue;
      map.set(claimRecordId, data);
    }
  }
  return map;
}

async function updateClaimResolutionStatus(params: {
  claimRecordId: string;
  status: ClaimResolutionStatus;
  actor: AuthContext;
  note?: string;
}) {
  const claimRecordId = normalizeText(params.claimRecordId);
  if (!claimRecordId) return;
  const adminModule = await import('@/firebase-admin');
  const adminDb = adminModule.adminDb;
  await adminDb
    .collection(CLAIMS_CACHE_COLLECTION)
    .doc(toDocId(claimRecordId))
    .set(
      {
        claimRecordId,
        resolutionStatus: params.status,
        resolutionUpdatedAt: new Date().toISOString(),
        resolutionUpdatedByUid: params.actor.uid,
        resolutionUpdatedByEmail: params.actor.email,
        resolutionNote: normalizeText(params.note),
      },
      { merge: true }
    );
}

function normalizeClaim(row: Record<string, unknown>): NormalizedClaim {
  const claimRecordId =
    normalizeText(getField(row, ['PK_ID', 'Record_ID', 'ID', 'Claim_ID'])) ||
    `claim-${Math.random().toString(36).slice(2, 10)}`;
  const claimNumber = normalizeText(getField(row, ['Claim_Number', 'Claim Number']));
  const rcfeRegisteredId = normalizeText(getField(row, ['RCFE_Registered_ID']));
  const serviceLocationName = normalizeText(
    getField(row, ['Service_Location_Name', 'Service Location Name', 'Service_Location', 'Service Location'])
  );
  const rcfeName = normalizeText(getField(row, ['RCFE_Name'])) || serviceLocationName;
  const claimAcceptance = normalizeText(getField(row, ['Claim_Acceptance']));
  const clientId2 = cleanIdentifier(getField(row, ['Client_ID2']));
  const mcpCin = cleanIdentifier(getField(row, ['MCP_CIN', 'MCP CIN']));
  const mrn = cleanIdentifier(getField(row, ['MRN']));
  const lastFirstId2 = cleanIdentifier(getField(row, ['Last_First_ID2', 'Client_Last_First_ID2', 'Last First ID2']));
  const clientFirst = normalizeText(getField(row, ['Client_First']));
  const clientLast = normalizeText(getField(row, ['Client_Last']));
  const userFirst = normalizeText(getField(row, ['User_First']));
  const userLast = normalizeText(getField(row, ['User_Last']));
  const emailSubmitter = normalizeText(getField(row, ['Email_Submitter']));
  const submittedRaw = getField(row, ['Timestamp', 'Date_Submitted', 'Submitted_At', 'Created_At']);
  const submittedAtIso = parseDateLoose(submittedRaw);
  const submittedAtMs = submittedAtIso ? Date.parse(submittedAtIso) : 0;

  const windows = DATE_WINDOW_FIELDS.map(([first, last]) => {
    const from = parseDateLoose(getField(row, [first]));
    const to = parseDateLoose(getField(row, [last])) || from;
    return { from, to };
  }).filter((w) => Boolean(w.from || w.to));

  return {
    claimRecordId,
    claimNumber,
    rcfeRegisteredId,
    rcfeName,
    serviceLocationName,
    claimAcceptance,
    clientId2,
    mcpCin,
    mrn,
    lastFirstId2,
    clientFirst,
    clientLast,
    userFirst,
    userLast,
    emailSubmitter,
    submittedAtIso,
    submittedAtMs: Number.isFinite(submittedAtMs) ? submittedAtMs : 0,
    windows,
  };
}

function coerceIncomingClaim(row: IncomingClaim): NormalizedClaim | null {
  const claimRecordId = normalizeText(row?.claimRecordId);
  if (!claimRecordId) return null;
  const windows = Array.isArray(row?.windows)
    ? row.windows
        .map((w) => ({
          from: parseDateLoose(w?.from),
          to: parseDateLoose(w?.to) || parseDateLoose(w?.from),
        }))
        .filter((w) => Boolean(w.from || w.to))
    : [];
  const submittedAtIso = parseDateLoose(row?.submittedAtIso);
  const submittedAtMs = submittedAtIso ? Date.parse(submittedAtIso) : 0;
  return {
    claimRecordId,
    claimNumber: normalizeText((row as Record<string, unknown>)?.claimNumber),
    rcfeRegisteredId: normalizeText(row?.rcfeRegisteredId),
    rcfeName: normalizeText(row?.rcfeName) || normalizeText((row as Record<string, unknown>)?.serviceLocationName),
    serviceLocationName:
      normalizeText((row as Record<string, unknown>)?.serviceLocationName) || normalizeText(row?.rcfeName),
    claimAcceptance: normalizeText((row as Record<string, unknown>)?.claimAcceptance),
    clientId2: cleanIdentifier(row?.clientId2),
    mcpCin: cleanIdentifier((row as Record<string, unknown>)?.mcpCin),
    mrn: cleanIdentifier((row as Record<string, unknown>)?.mrn),
    lastFirstId2: cleanIdentifier((row as Record<string, unknown>)?.lastFirstId2),
    clientFirst: normalizeText(row?.clientFirst),
    clientLast: normalizeText(row?.clientLast),
    userFirst: normalizeText(row?.userFirst),
    userLast: normalizeText(row?.userLast),
    emailSubmitter: normalizeText(row?.emailSubmitter),
    submittedAtIso,
    submittedAtMs: Number.isFinite(submittedAtMs) ? submittedAtMs : 0,
    windows,
  };
}

export async function POST(request: NextRequest) {
  try {
    const authCheck = await requireClaimsAccess(request);
    if (!authCheck.ok) {
      return NextResponse.json({ success: false, error: authCheck.error }, { status: authCheck.status });
    }
    const authContext = authCheck.context;

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const actionRaw = String(body?.action || 'check').toLowerCase();
    const action =
      actionRaw === 'sync'
        ? 'sync'
        : actionRaw === 'send_rejection_email'
          ? 'send_rejection_email'
          : actionRaw === 'preview_rejection_email'
            ? 'preview_rejection_email'
            : actionRaw === 'update_claim_status'
              ? 'update_claim_status'
              : actionRaw === 'get_claim_email_history'
                ? 'get_claim_email_history'
                : actionRaw === 'set_claim_acceptance_denied'
                  ? 'set_claim_acceptance_denied'
              : 'check';
    const mode = String(body?.mode || 'single').toLowerCase() === 'batch' ? 'batch' : 'single';
    const rcfeRegisteredId = normalizeText(body?.rcfeRegisteredId);
    const rcfeName = normalizeText(body?.rcfeName);
    const memberClientId2 = normalizeText(body?.memberClientId2);
    const memberFirst = normalizeText(body?.memberFirst);
    const memberLast = normalizeText(body?.memberLast);
    const syncDateFrom = parseDateLoose(body?.syncDateFrom);
    const syncDateTo = parseDateLoose(body?.syncDateTo);
    const providedClaims = Array.isArray(body?.syncedClaims)
      ? (body.syncedClaims as IncomingClaim[]).map(coerceIncomingClaim).filter(Boolean) as NormalizedClaim[]
      : [];

    if (action === 'get_claim_email_history') {
      const claimRecordId = normalizeText(body?.claimRecordId);
      if (!claimRecordId) {
        return NextResponse.json({ success: false, error: 'claimRecordId is required.' }, { status: 400 });
      }
      const adminModule = await import('@/firebase-admin');
      const adminDb = adminModule.adminDb;
      const limit = Math.min(100, Math.max(1, Number(body?.limit || 25)));
      const snap = await adminDb
        .collection(CLAIMS_EMAIL_AUDIT_COLLECTION)
        .where('claimRecordId', '==', claimRecordId)
        .limit(limit)
        .get();
      const rows = snap.docs
        .map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }))
        .sort((a, b) => {
          const aMs = Date.parse(normalizeText(a.createdAt)) || 0;
          const bMs = Date.parse(normalizeText(b.createdAt)) || 0;
          return bMs - aMs;
        });
      return NextResponse.json({
        success: true,
        action: 'get_claim_email_history',
        claimRecordId,
        rows,
      });
    }

    if (action === 'preview_rejection_email') {
      const claimRecordId = normalizeText(body?.claimRecordId);
      const memberName = normalizeText(body?.memberName);
      const rcfeNameForEmail = normalizeText(body?.rcfeName);
      const submitterName = normalizeText(body?.submitterName);
      const submittedAtIso = parseDateLoose(body?.submittedAtIso);
      const currentWindows = Array.isArray(body?.currentWindows)
        ? (body.currentWindows as Array<Partial<ClaimWindow>>).map((w) => ({
            from: parseDateLoose(w?.from),
            to: parseDateLoose(w?.to) || parseDateLoose(w?.from),
          }))
        : [];
      const overlaps = Array.isArray(body?.overlaps)
        ? (body.overlaps as Array<Record<string, unknown>>).map((item) => ({
            claimRecordId: normalizeText(item?.claimRecordId),
            submittedAtIso: parseDateLoose(item?.submittedAtIso),
            windows: Array.isArray(item?.windows)
              ? (item.windows as Array<Partial<ClaimWindow>>).map((w) => ({
                  from: parseDateLoose(w?.from),
                  to: parseDateLoose(w?.to) || parseDateLoose(w?.from),
                }))
              : [],
          }))
        : [];
      const template = buildRejectionEmailTemplate({
        submitterName,
        claimRecordId,
        memberName,
        rcfeName: rcfeNameForEmail,
        submittedAtIso,
        currentWindows,
        overlaps,
      });
      return NextResponse.json({
        success: true,
        action: 'preview_rejection_email',
        template,
      });
    }

    if (action === 'update_claim_status') {
      const claimRecordId = normalizeText(body?.claimRecordId);
      const status = normalizeText(body?.status) as ClaimResolutionStatus;
      const note = normalizeText(body?.note);
      const allowed = new Set<ClaimResolutionStatus>(['pending-review', 'notified', 'corrected', 'rechecked-pass']);
      if (!claimRecordId || !allowed.has(status)) {
        return NextResponse.json({ success: false, error: 'Valid claimRecordId and status are required.' }, { status: 400 });
      }
      await updateClaimResolutionStatus({
        claimRecordId,
        status,
        note,
        actor: authContext,
      });
      return NextResponse.json({
        success: true,
        action: 'update_claim_status',
        claimRecordId,
        status,
      });
    }

    if (action === 'set_claim_acceptance_denied') {
      const claimRecordId = normalizeText(body?.claimRecordId);
      const claimNumber = normalizeText(body?.claimNumber);
      if (!claimRecordId) {
        return NextResponse.json({ success: false, error: 'claimRecordId is required.' }, { status: 400 });
      }
      const adminModule = await import('@/firebase-admin');
      const adminDb = adminModule.adminDb;
      const claimRef = adminDb.collection(CLAIMS_CACHE_COLLECTION).doc(toDocId(claimRecordId));
      const claimSnap = await claimRef.get();
      const claimData = claimSnap.exists ? (claimSnap.data() as Record<string, unknown>) : {};
      const emailCount = Number(claimData?.rejectionEmailCount || 0);
      const lastEmailAt = normalizeText(claimData?.lastRejectionEmailAt);
      if (!lastEmailAt && emailCount <= 0) {
        return NextResponse.json(
          {
            success: false,
            error: 'Send rejection email first before setting claim acceptance to Denied in Caspio.',
          },
          { status: 409 }
        );
      }

      await setCaspioClaimAcceptanceDenied({ claimRecordId, claimNumber });

      const nowIso = new Date().toISOString();
      await claimRef.set(
        {
          claimRecordId,
          claimAcceptance: 'Denied',
          claimAcceptanceUpdatedAt: nowIso,
          claimAcceptanceUpdatedByUid: authContext.uid,
          claimAcceptanceUpdatedByEmail: authContext.email,
        },
        { merge: true }
      );
      await adminDb.collection(CLAIMS_EMAIL_AUDIT_COLLECTION).add({
        createdAt: nowIso,
        claimRecordId,
        eventType: 'claim_acceptance_denied',
        emailType: 'status-update',
        to: null,
        subject: 'Claim acceptance switched to Denied',
        bodyText: `Claim acceptance set to Denied in Caspio by ${authContext.email}.`,
        sentByUid: authContext.uid,
        sentByEmail: authContext.email,
        provider: 'system',
        providerMessageId: null,
      });

      return NextResponse.json({
        success: true,
        action: 'set_claim_acceptance_denied',
        claimRecordId,
        claimAcceptance: 'Denied',
      });
    }

    if (action === 'send_rejection_email') {
      const to = normalizeText(body?.to);
      const subjectInput = normalizeText(body?.subject);
      const bodyTextInput = normalizeText(body?.bodyText);
      const claimRecordId = normalizeText(body?.claimRecordId);
      const memberName = normalizeText(body?.memberName);
      const rcfeNameForEmail = normalizeText(body?.rcfeName);
      const submitterName = normalizeText(body?.submitterName);
      const submittedAtIso = parseDateLoose(body?.submittedAtIso);
      const cc = normalizeEmailList(body?.cc);
      const bcc = normalizeEmailList(body?.bcc);
      const isTest = Boolean(body?.isTest);
      const forceSend = Boolean(body?.forceSend);
      const currentWindows = Array.isArray(body?.currentWindows)
        ? (body.currentWindows as Array<Partial<ClaimWindow>>).map((w) => ({
            from: parseDateLoose(w?.from),
            to: parseDateLoose(w?.to) || parseDateLoose(w?.from),
          }))
        : [];
      const overlaps = Array.isArray(body?.overlaps)
        ? (body.overlaps as Array<Record<string, unknown>>).map((item) => ({
            claimRecordId: normalizeText(item?.claimRecordId),
            submittedAtIso: parseDateLoose(item?.submittedAtIso),
            windows: Array.isArray(item?.windows)
              ? (item.windows as Array<Partial<ClaimWindow>>).map((w) => ({
                  from: parseDateLoose(w?.from),
                  to: parseDateLoose(w?.to) || parseDateLoose(w?.from),
                }))
              : [],
          }))
        : [];

      if (!to || !claimRecordId) {
        return NextResponse.json(
          { success: false, error: 'to and claimRecordId are required.' },
          { status: 400 }
        );
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
        return NextResponse.json({ success: false, error: 'Recipient email is invalid.' }, { status: 400 });
      }

      const template = buildRejectionEmailTemplate({
        submitterName,
        claimRecordId,
        memberName,
        rcfeName: rcfeNameForEmail,
        submittedAtIso,
        currentWindows,
        overlaps,
      });
      const subject = subjectInput || template.subject;
      const bodyText = bodyTextInput || template.bodyText;
      const defaultCc = String(process.env.H2022_REJECTION_CC || '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
      const defaultBcc = String(process.env.H2022_REJECTION_BCC || '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
      const billingEmail = 'billing@carehomefinders.com';
      const ccFinal = Array.from(new Set([...cc, ...normalizeEmailList(defaultCc), billingEmail]));
      const bccFinal = Array.from(new Set([...bcc, ...normalizeEmailList(defaultBcc)]));

      const adminModule = await import('@/firebase-admin');
      const adminDb = adminModule.adminDb;
      const admin = adminModule.default;
      const claimRef = adminDb.collection(CLAIMS_CACHE_COLLECTION).doc(toDocId(claimRecordId));
      const claimSnap = await claimRef.get();
      const claimData = claimSnap.exists ? (claimSnap.data() as Record<string, unknown>) : {};
      const priorEmailAt = normalizeText(claimData?.lastRejectionEmailAt);
      if (!isTest && priorEmailAt && !forceSend) {
        return NextResponse.json(
          {
            success: false,
            requiresConfirmation: true,
            error: `A rejection email was already sent for claim ${claimRecordId} on ${priorEmailAt}.`,
            priorEmail: {
              at: priorEmailAt,
              to: normalizeText(claimData?.lastRejectionEmailTo),
              subject: normalizeText(claimData?.lastRejectionEmailSubject),
            },
          },
          { status: 409 }
        );
      }

      const resendKey = String(process.env.RESEND_API_KEY || '').trim();
      if (!resendKey) {
        return NextResponse.json({ success: false, error: 'RESEND_API_KEY is not configured.' }, { status: 500 });
      }
      const fromAddress = String(process.env.EMAIL_FROM || 'CalAIM Pathfinder <noreply@carehomefinders.com>').trim();
      const resend = new Resend(resendKey);

      const html = `
        <div style="font-family: Arial, sans-serif; font-size: 14px; color: #0f172a; line-height: 1.5;">
          <p style="margin: 0 0 12px;">${escapeHtml(bodyText).replace(/\n/g, '<br/>')}</p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0;" />
          <p style="margin: 0; font-size: 12px; color: #64748b;">
            Claim ID: ${escapeHtml(claimRecordId)}<br/>
            Member: ${escapeHtml(memberName || 'N/A')}<br/>
            RCFE: ${escapeHtml(rcfeNameForEmail || 'N/A')}
          </p>
        </div>
      `;

      const sendResult = await resend.emails.send({
        from: fromAddress,
        to: [to],
        cc: ccFinal,
        bcc: bccFinal,
        subject,
        html,
      });
      if (sendResult.error) {
        return NextResponse.json({ success: false, error: String(sendResult.error.message || 'Email send failed.') }, { status: 500 });
      }

      const nowIso = new Date().toISOString();
      await adminDb.collection(CLAIMS_EMAIL_AUDIT_COLLECTION).add({
        createdAt: nowIso,
        claimRecordId,
        eventType: 'email_sent',
        to,
        cc: ccFinal,
        bcc: bccFinal,
        subject,
        bodyText,
        emailType: isTest ? 'test' : 'production',
        sentByUid: authContext.uid,
        sentByEmail: authContext.email,
        provider: 'resend',
        providerMessageId: sendResult.data?.id || null,
      });

      if (!isTest) {
        await claimRef.set(
          {
            claimRecordId,
            resolutionStatus: 'notified',
            resolutionUpdatedAt: nowIso,
            resolutionUpdatedByUid: authContext.uid,
            resolutionUpdatedByEmail: authContext.email,
            lastRejectionEmailAt: nowIso,
            lastRejectionEmailTo: to,
            lastRejectionEmailSubject: subject,
            rejectionEmailCount: admin.firestore.FieldValue.increment(1),
          },
          { merge: true }
        );
      }

      return NextResponse.json({
        success: true,
        action: 'send_rejection_email',
        isTest,
      });
    }

    const requiresRcfe = action !== 'sync' && action !== 'check' && providedClaims.length === 0;
    if (requiresRcfe && !rcfeRegisteredId && !rcfeName) {
      return NextResponse.json(
        { success: false, error: 'RCFE Registered ID or RCFE Name is required.' },
        { status: 400 }
      );
    }

    if (
      action === 'check' &&
      providedClaims.length === 0 &&
      mode === 'single' &&
      !memberClientId2 &&
      !(memberFirst && memberLast)
    ) {
      return NextResponse.json(
        { success: false, error: 'Single-check mode requires Client_ID2 or both first/last name.' },
        { status: 400 }
      );
    }

    if (action === 'sync') {
      const meta = await getCacheMeta();
      const hasFullSync = Boolean(meta?.fullSyncCompletedAt);
      const requestedForceFull = Boolean(body?.forceFullSync);
      const runFullSync = requestedForceFull || !hasFullSync;
      const lastSyncedAt = parseDateLoose(meta?.lastSyncedAtIso);

      const whereParts: string[] = [];
      if (syncDateFrom) whereParts.push(`Timestamp>='${escapeSqlLiteral(syncDateFrom)}'`);
      if (syncDateTo) whereParts.push(`Timestamp<='${escapeSqlLiteral(syncDateTo)}'`);
      const whereClause = whereParts.length > 0 ? whereParts.join(' AND ') : undefined;

      const fetched = (await fetchH2022Claims(whereClause)).map(normalizeClaim);
      const normalized = fetched.filter((claim) => inSubmittedRange(claim, syncDateFrom, syncDateTo));
      const existingById = await getWorkflowForClaims(normalized.map((claim) => claim.claimRecordId));
      const changedOrNew = normalized.filter((claim) => {
        const existing = existingById.get(claim.claimRecordId);
        if (!existing) return true;
        const existingClaim = coerceIncomingClaim(existing as IncomingClaim);
        if (!existingClaim) return true;
        return claimFingerprint(claim) !== claimFingerprint(existingClaim);
      });
      const written = await upsertCachedClaims(normalized);
      const newestSubmittedAt = normalized.reduce<string | null>((acc, claim) => {
        if (!claim.submittedAtIso) return acc;
        if (!acc) return claim.submittedAtIso;
        return Date.parse(claim.submittedAtIso) > Date.parse(acc) ? claim.submittedAtIso : acc;
      }, lastSyncedAt || null);

      await setCacheMeta({
        fullSyncCompletedAt: runFullSync
          ? new Date().toISOString()
          : String(meta?.fullSyncCompletedAt || ''),
        lastSyncedAtIso: newestSubmittedAt || lastSyncedAt || null,
        lastSyncMode: runFullSync ? 'full' : 'incremental',
        lastSyncFetchedCount: normalized.length,
        lastSyncChangedCount: changedOrNew.length,
        lastSyncWrittenCount: written,
      });

      const syncedSorted = [...(runFullSync ? normalized : changedOrNew)].sort((a, b) => b.submittedAtMs - a.submittedAtMs);
      return NextResponse.json({
        success: true,
        action: 'sync',
        mode,
        syncedAt: new Date().toISOString(),
        syncMode: runFullSync ? 'full' : 'incremental',
        cache: {
          hasFullSync: true,
          previousLastSyncedAt: lastSyncedAt,
          nextLastSyncedAt: newestSubmittedAt || null,
          changedOrNew: changedOrNew.length,
          written,
        },
        filters: {
          from: syncDateFrom,
          to: syncDateTo,
        },
        summary: {
          total: syncedSorted.length,
        },
        rows: syncedSorted,
      });
    }

    const whereParts: string[] = [];
    if (rcfeRegisteredId) whereParts.push(`RCFE_Registered_ID='${escapeSqlLiteral(rcfeRegisteredId)}'`);
    if (!rcfeRegisteredId && rcfeName) whereParts.push(`RCFE_Name='${escapeSqlLiteral(rcfeName)}'`);
    const whereClause = whereParts.join(' AND ') || undefined;

    let dataSource: 'provided' | 'firestore-cache' | 'caspio-live' = 'provided';
    const normalizedRaw =
      providedClaims.length > 0
        ? providedClaims
        : await readCachedClaims({ rcfeRegisteredId, rcfeName, syncDateFrom, syncDateTo });
    if (providedClaims.length === 0) dataSource = 'firestore-cache';
    const fallbackLiveNeeded = providedClaims.length === 0 && normalizedRaw.length === 0;
    const normalizedLive = fallbackLiveNeeded ? (await fetchH2022Claims(whereClause)).map(normalizeClaim) : [];
    if (fallbackLiveNeeded && normalizedLive.length > 0) {
      dataSource = 'caspio-live';
      await upsertCachedClaims(normalizedLive);
    }
    const normalized = (fallbackLiveNeeded ? normalizedLive : normalizedRaw).filter((claim) =>
      inSubmittedRange(claim, syncDateFrom, syncDateTo)
    );

    const filtered = normalized.filter((claim) => {
      if (mode !== 'single') return true;
      if (memberClientId2 && normalizeKeyPart(claim.clientId2) !== normalizeKeyPart(memberClientId2)) return false;
      if (memberFirst && normalizeKeyPart(claim.clientFirst) !== normalizeKeyPart(memberFirst)) return false;
      if (memberLast && normalizeKeyPart(claim.clientLast) !== normalizeKeyPart(memberLast)) return false;
      return true;
    });

    const mcpCinByIdentity = new Map<string, string>();
    for (const claim of filtered) {
      const mcp = cleanIdentifier(claim.mcpCin);
      if (!mcp) continue;
      const keys = getIdentityKeys(claim);
      for (const key of keys) {
        if (!mcpCinByIdentity.has(key)) mcpCinByIdentity.set(key, mcp);
      }
    }
    const enriched = filtered.map((claim) => {
      if (cleanIdentifier(claim.mcpCin)) return claim;
      const keys = getIdentityKeys(claim);
      for (const key of keys) {
        const inferred = mcpCinByIdentity.get(key);
        if (inferred) return { ...claim, mcpCin: inferred };
      }
      return claim;
    });

    const claimsAsc = [...enriched].sort((a, b) => {
      const ts = a.submittedAtMs - b.submittedAtMs;
      if (ts !== 0) return ts;
      return a.claimRecordId.localeCompare(b.claimRecordId);
    });

    const priorByRcfe = new Map<string, NormalizedClaim[]>();
    const workflowByClaimId = await getWorkflowForClaims(claimsAsc.map((c) => c.claimRecordId));
    const results = claimsAsc.map((claim) => {
      const rcfeKey = normalizeKeyPart(claim.rcfeRegisteredId || claim.serviceLocationName || claim.rcfeName);
      const previous = priorByRcfe.get(rcfeKey) || [];
      const previousEligible = previous.filter(
        (priorClaim) =>
          normalizeKeyPart((priorClaim as NormalizedClaim).claimAcceptance) !== 'denied' &&
          claimsBelongToSameMember(claim, priorClaim)
      );

      const overlaps = previousEligible
        .map((priorClaim) => {
          const hasOverlap = claim.windows.some((currentWindow) =>
            priorClaim.windows.some((priorWindow) => rangesOverlap(currentWindow, priorWindow))
          );
          return hasOverlap
            ? {
                claimRecordId: priorClaim.claimRecordId,
                claimNumber: priorClaim.claimNumber,
                submittedAtIso: priorClaim.submittedAtIso,
                clientId2: priorClaim.clientId2,
                mcpCin: priorClaim.mcpCin,
                lastFirstId2: priorClaim.lastFirstId2,
                clientFirst: priorClaim.clientFirst,
                clientLast: priorClaim.clientLast,
                windows: priorClaim.windows,
              }
            : null;
        })
        .filter(Boolean) as Array<{ claimRecordId: string; submittedAtIso: string | null; windows: ClaimWindow[] }>;

      const pass = overlaps.length === 0;
      const workflow = workflowByClaimId.get(claim.claimRecordId) || {};
      const previousStatus = normalizeText(workflow?.resolutionStatus) as ClaimResolutionStatus | '';
      let resolutionStatus: ClaimResolutionStatus =
        previousStatus && ['pending-review', 'notified', 'corrected', 'rechecked-pass'].includes(previousStatus)
          ? previousStatus
          : 'pending-review';
      if (pass) {
        resolutionStatus = 'rechecked-pass';
      } else if (previousStatus === 'rechecked-pass' || !previousStatus) {
        resolutionStatus = 'pending-review';
      }
      priorByRcfe.set(rcfeKey, [...previous, claim]);
      return {
        pass,
        claimRecordId: claim.claimRecordId,
        claimNumber: claim.claimNumber,
        submittedAtIso: claim.submittedAtIso,
        rcfeRegisteredId: claim.rcfeRegisteredId,
        rcfeName: claim.serviceLocationName || claim.rcfeName,
        serviceLocationName: claim.serviceLocationName || claim.rcfeName,
        claimAcceptance: claim.claimAcceptance,
        clientId2: claim.clientId2,
        mcpCin: claim.mcpCin,
        mrn: claim.mrn,
        lastFirstId2: claim.lastFirstId2,
        clientFirst: claim.clientFirst,
        clientLast: claim.clientLast,
        userFirst: claim.userFirst,
        userLast: claim.userLast,
        emailSubmitter: claim.emailSubmitter,
        resolutionStatus,
        lastRejectionEmailAt: normalizeText(workflow?.lastRejectionEmailAt) || null,
        lastRejectionEmailTo: normalizeText(workflow?.lastRejectionEmailTo) || null,
        lastRejectionEmailSubject: normalizeText(workflow?.lastRejectionEmailSubject) || null,
        rejectionEmailCount: Number(workflow?.rejectionEmailCount || 0),
        windows: claim.windows,
        overlaps,
      };
    });

    // Keep claim workflow status aligned with latest overlap outcome.
    if (results.length > 0) {
      const adminModule = await import('@/firebase-admin');
      const adminDb = adminModule.adminDb;
      const batch = adminDb.batch();
      for (const row of results) {
        const ref = adminDb.collection(CLAIMS_CACHE_COLLECTION).doc(toDocId(row.claimRecordId));
        batch.set(
          ref,
          {
            claimRecordId: row.claimRecordId,
            resolutionStatus: row.resolutionStatus,
            resolutionUpdatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      }
      await batch.commit();
    }

    const sortedForDisplay = results.sort((a, b) => {
      const aMs = a.submittedAtIso ? Date.parse(a.submittedAtIso) : 0;
      const bMs = b.submittedAtIso ? Date.parse(b.submittedAtIso) : 0;
      return bMs - aMs;
    });

    const failedCount = sortedForDisplay.filter((r) => !r.pass).length;
    const passedCount = sortedForDisplay.length - failedCount;

    return NextResponse.json({
      success: true,
      action: 'check',
      mode,
      source: dataSource,
      summary: {
        total: sortedForDisplay.length,
        passed: passedCount,
        failed: failedCount,
      },
      rows: sortedForDisplay,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to run H2022 overlap check.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

