import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { fetchAllCalAIMMembers, getCaspioCredentialsFromEnv, getCaspioToken } from '@/lib/caspio-api-utils';
import {
  buildConnectionsT2038ClaimPreview,
  buildEdiForConnectionsClaimPreviews,
  CONNECTIONS_CLAIM_SUBMIT_TABLE,
  resolveConnectionsClaimUserIdFk,
  type ClaimSubmitSubmitter,
  type ConnectionsT2038ClaimPreview,
} from '@/lib/kaiser-t2038-connections-claim-submit';
import {
  collectServiceDatesFromClaimRow,
  DEFAULT_NOTES_CLAIMABLE_REASON,
  isClaimRowSubmitted,
  justificationDocId,
  KAISER_T2038_CLAIM_AUDIT_CLAIMS_COLLECTION,
  KAISER_T2038_CLAIM_AUDIT_JUSTIFICATIONS_COLLECTION,
  normalizeClientId2Key,
  parseClaimServiceDate,
  type MonthJustification,
} from '@/lib/kaiser-t2038-claim-audit';
import {
  DEFAULT_T2038_CLAIM_SETTINGS,
  sanitizeT2038ClaimSettings,
  T2038_CLAIMS_SETTINGS_DOC,
} from '@/lib/t2038-claims';
import { DEFAULT_EDI_270_SETTINGS, EDI_SETTINGS_DOC_ID, type Edi270Settings } from '@/lib/x12-270';
import { BATCH_ELIGIBILITY_TEMPLATES_COLLECTION } from '@/lib/batch-eligibility';
import { getAllStaff } from '@/lib/staff-directory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

type ClaimTarget = { clientId2: string; monthKey: string };

function normalizeClientId2(value: unknown) {
  return String(value ?? '')
    .trim()
    .replace(/^0+(?=\d)/, '');
}

function parseTargets(body: Record<string, unknown>): ClaimTarget[] {
  const raw = Array.isArray(body.targets) ? body.targets : [];
  const out: ClaimTarget[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const row = (item || {}) as Record<string, unknown>;
    const clientId2 = String(row.clientId2 || '').trim();
    const monthKey = String(row.monthKey || '').trim();
    if (!clientId2 || !/^\d{4}-\d{2}$/.test(monthKey)) continue;
    const key = `${clientId2}__${monthKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ clientId2, monthKey });
  }
  return out;
}

async function loadMembersByClientId2() {
  const credentials = getCaspioCredentialsFromEnv();
  const result = await fetchAllCalAIMMembers(credentials, {
    includeRawData: true,
    forceRefresh: false,
    cacheTtlMs: 15 * 60 * 1000,
  });
  const rawMembers = (
    Array.isArray(result.rawMembers) ? result.rawMembers : result.members || []
  ) as Array<Record<string, unknown>>;
  const byId = new Map<string, Record<string, unknown>>();
  for (const raw of rawMembers) {
    const id = String(raw.Client_ID2 || raw.client_ID2 || raw.clientId2 || '').trim();
    if (!id) continue;
    byId.set(id, raw);
    const normalized = normalizeClientId2(id);
    if (normalized && !byId.has(normalized)) byId.set(normalized, raw);
  }
  return { byId, credentials };
}

async function loadClaimSettingsAndEdi() {
  let settings = DEFAULT_T2038_CLAIM_SETTINGS;
  let edi: Edi270Settings = { ...DEFAULT_EDI_270_SETTINGS };
  try {
    const { adminDb } = await import('@/firebase-admin');
    const [claimSnap, ediSnap] = await Promise.all([
      adminDb.doc(T2038_CLAIMS_SETTINGS_DOC).get(),
      adminDb.collection(BATCH_ELIGIBILITY_TEMPLATES_COLLECTION).doc(EDI_SETTINGS_DOC_ID).get(),
    ]);
    if (claimSnap.exists) settings = sanitizeT2038ClaimSettings(claimSnap.data());
    if (ediSnap.exists) edi = { ...DEFAULT_EDI_270_SETTINGS, ...(ediSnap.data() as Edi270Settings) };
  } catch {
    // keep defaults
  }
  return { settings, edi };
}

function normalizePersonKey(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function splitPersonName(name: string): { firstName: string; lastName: string } {
  const cleaned = String(name || '').trim();
  if (!cleaned) return { firstName: '', lastName: '' };
  if (cleaned.includes(',')) {
    const [last, first] = cleaned.split(',').map((part) => part.trim());
    return { firstName: first || '', lastName: last || '' };
  }
  const parts = cleaned.split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') };
}

function parseUsersRegistrationRow(row: Record<string, unknown>) {
  const userId = String(
    row.User_ID || row.user_id || row.ID || row.Table_ID || row.connect_tbl_usersregistration_User_ID || ''
  ).trim();
  const firstName = String(
    row.User_First || row.First_Name || row.FirstName || row.connect_tbl_usersregistration_User_First || ''
  ).trim();
  const lastName = String(
    row.User_Last || row.Last_Name || row.LastName || row.connect_tbl_usersregistration_User_Last || ''
  ).trim();
  const email = String(row.Email || row.User_Email || row.email || row.Work_Email || '')
    .trim()
    .toLowerCase();
  const fullName = String(
    row.User_First_Last ||
      row.User_Full_Name ||
      row.connect_tbl_usersregistration_User_First_Last ||
      `${firstName} ${lastName}`
  ).trim();
  return { userId, firstName, lastName, email, fullName };
}

/** Load connect_tbl_usersregistration rows (Firestore cache first, then Caspio). */
async function loadUsersRegistrationRows(adminDb: any): Promise<Record<string, unknown>[]> {
  try {
    const snap = await adminDb.collection('caspio_usersregistration_cache').limit(1500).get();
    if (!snap.empty) {
      return snap.docs.map((doc: { data: () => Record<string, unknown> }) => doc.data() || {});
    }
  } catch (err) {
    console.warn(
      '[kaiser-t2038-claim-submit] usersregistration cache load failed:',
      String((err as { message?: string })?.message || err)
    );
  }
  try {
    const credentials = getCaspioCredentialsFromEnv();
    const token = await getCaspioToken(credentials);
    for (const table of [
      'connect_tbl_usersregistration',
      'tbl_usersregistration',
      'usersregistration',
    ]) {
      const url = `${credentials.baseUrl}/integrations/rest/v3/tables/${encodeURIComponent(
        table
      )}/records?q.pageSize=500&q.pageNumber=1`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      });
      if (!response.ok) continue;
      const data = await response.json().catch(() => ({}));
      const rows = Array.isArray(data?.Result) ? data.Result : [];
      if (rows.length) return rows as Record<string, unknown>[];
    }
  } catch (err) {
    console.warn(
      '[kaiser-t2038-claim-submit] usersregistration Caspio load failed:',
      String((err as { message?: string })?.message || err)
    );
  }
  return [];
}

/**
 * Resolve User_First / User_Last / User_IDfk for the Kaiser Staff who is pushing.
 * Match connect_tbl_usersregistration by email, then by Kaiser Staff name (staff directory / auth name).
 */
async function resolveSubmitterFromKaiserStaff(
  adminDb: any,
  authz: { email?: string; name?: string; uid?: string }
): Promise<ClaimSubmitSubmitter> {
  const email = String(authz.email || '').trim().toLowerCase();
  let authName = String(authz.name || '').trim();

  // Prefer Firestore user display name when token name is blank.
  if (!authName && adminDb && authz.uid) {
    try {
      const userSnap = await adminDb.collection('users').doc(authz.uid).get();
      if (userSnap.exists) {
        const data = userSnap.data() || {};
        authName = String(data.displayName || data.name || data.fullName || '').trim();
      }
    } catch {
      // keep authName blank
    }
  }

  const staffFromEmail = getAllStaff().find((staff) => staff.email.toLowerCase() === email);
  const kaiserStaffName = String(staffFromEmail?.name || authName || '').trim();
  const fromAuth = splitPersonName(authName || kaiserStaffName);
  const fallbackId = resolveConnectionsClaimUserIdFk(email);

  const rows = await loadUsersRegistrationRows(adminDb);
  const nameKeys = new Set(
    [
      normalizePersonKey(kaiserStaffName),
      normalizePersonKey(authName),
      normalizePersonKey(`${fromAuth.firstName} ${fromAuth.lastName}`),
      normalizePersonKey(`${fromAuth.lastName} ${fromAuth.firstName}`),
      normalizePersonKey(`${fromAuth.lastName}, ${fromAuth.firstName}`),
    ].filter(Boolean)
  );

  let match: ReturnType<typeof parseUsersRegistrationRow> | null = null;
  if (email) {
    match =
      rows.map(parseUsersRegistrationRow).find((row) => row.email && row.email === email) || null;
  }
  if (!match && nameKeys.size) {
    match =
      rows.map(parseUsersRegistrationRow).find((row) => {
        const candidates = [
          normalizePersonKey(row.fullName),
          normalizePersonKey(`${row.firstName} ${row.lastName}`),
          normalizePersonKey(`${row.lastName} ${row.firstName}`),
          normalizePersonKey(`${row.lastName}, ${row.firstName}`),
        ];
        return candidates.some((key) => key && nameKeys.has(key));
      }) || null;
  }

  if (match) {
    const userIdNum = Number(match.userId);
    return {
      email: email || match.email,
      firstName: match.firstName || fromAuth.firstName,
      lastName: match.lastName || fromAuth.lastName,
      userIdFk: match.userId
        ? Number.isFinite(userIdNum) && userIdNum > 0
          ? userIdNum
          : match.userId
        : fallbackId,
    };
  }

  return {
    email,
    firstName: fromAuth.firstName,
    lastName: fromAuth.lastName,
    userIdFk: fallbackId,
  };
}

function rememberLastDos(map: Map<string, Date>, clientId2: string, date: Date) {
  const keys = [clientId2, normalizeClientId2(clientId2), normalizeClientId2Key(clientId2)].filter(
    Boolean
  );
  for (const key of keys) {
    const prev = map.get(key);
    if (!prev || date.getTime() > prev.getTime()) map.set(key, date);
  }
}

/**
 * Latest Date_of_Service from the member's last *claimed* claim:
 * - inventory rows with non-blank Claim_Status (submitted / paid — audit "claimed")
 * - plus claimable months already pushed from this tool (caspioDateOfService)
 * Unsubmitted Caspio-only rows (blank Claim_Status) do not count.
 */
async function loadLastDosByClientId2(
  adminDb: any,
  clientId2s: string[]
): Promise<Map<string, Date>> {
  const wanted = new Set(
    clientId2s
      .map((id) => String(id || '').trim())
      .filter(Boolean)
      .flatMap((id) => [id, normalizeClientId2(id), normalizeClientId2Key(id)].filter(Boolean))
  );
  const lastByClient = new Map<string, Date>();
  if (!adminDb || !wanted.size) return lastByClient;
  try {
    const [claimsSnap, justSnap] = await Promise.all([
      adminDb.collection(KAISER_T2038_CLAIM_AUDIT_CLAIMS_COLLECTION).limit(20000).get(),
      adminDb.collection(KAISER_T2038_CLAIM_AUDIT_JUSTIFICATIONS_COLLECTION).limit(5000).get(),
    ]);
    claimsSnap.docs.forEach((doc: { data: () => Record<string, unknown> }) => {
      const data = doc.data() || {};
      if (data.deleted === true) return;
      // Only claimed/submitted rows — same gate as audit month status "claimed".
      if (!isClaimRowSubmitted(data)) return;
      const clientId2 = String(data.Client_ID2 || data.client_ID2 || data.clientId2 || '').trim();
      if (!clientId2 || !wanted.has(clientId2)) return;
      for (const date of collectServiceDatesFromClaimRow(data)) {
        rememberLastDos(lastByClient, clientId2, date);
      }
    });
    justSnap.docs.forEach((doc: { data: () => Record<string, unknown> }) => {
      const data = doc.data() || {};
      if (!String(data.caspioPushedAt || '').trim()) return;
      const clientId2 = String(data.clientId2 || '').trim();
      if (!clientId2 || !wanted.has(clientId2)) return;
      const dos =
        parseClaimServiceDate(data.caspioDateOfService) ||
        parseClaimServiceDate(data.dateOfService);
      if (dos) rememberLastDos(lastByClient, clientId2, dos);
    });
  } catch (err) {
    console.warn(
      '[kaiser-t2038-claim-submit] last claimed DOS load failed:',
      String((err as { message?: string })?.message || err)
    );
  }
  return lastByClient;
}

function buildPreviewsForTargets(
  targets: ClaimTarget[],
  byId: Map<string, Record<string, unknown>>,
  submitter: ClaimSubmitSubmitter,
  settings: ReturnType<typeof sanitizeT2038ClaimSettings>,
  lastDosByClient: Map<string, Date> = new Map()
) {
  const previews: ConnectionsT2038ClaimPreview[] = [];
  const missing: ClaimTarget[] = [];
  // Process earliest months first so multi-month batches chain the 30-day DOS rule.
  const ordered = [...targets].sort((a, b) => {
    const byClient = a.clientId2.localeCompare(b.clientId2);
    if (byClient) return byClient;
    return a.monthKey.localeCompare(b.monthKey);
  });
  const runningLastDos = new Map<string, Date>(lastDosByClient);

  for (const target of ordered) {
    const raw =
      byId.get(target.clientId2) ||
      byId.get(normalizeClientId2(target.clientId2)) ||
      null;
    if (!raw) {
      missing.push(target);
      previews.push({
        id: `${target.clientId2}__${target.monthKey}`,
        clientId2: target.clientId2,
        monthKey: target.monthKey,
        monthLabel: target.monthKey,
        dateOfService: '',
        dateOfServiceIso: '',
        lastDateOfService: '',
        dosAdjustedForLastClaim: false,
        memberName: target.clientId2,
        blockers: [`Member Client_ID2 ${target.clientId2} not found in CalAIM_tbl_Members cache`],
        displayFields: [],
        caspioBody: {},
        fromMember: {},
      });
      continue;
    }
    const lastDos =
      runningLastDos.get(target.clientId2) ||
      runningLastDos.get(normalizeClientId2(target.clientId2)) ||
      null;
    const preview = buildConnectionsT2038ClaimPreview({
      rawMember: raw,
      monthKey: target.monthKey,
      submitter,
      settings,
      lastDateOfService: lastDos,
    });
    previews.push(preview);
    if (preview.dateOfService) {
      // Chain: next month for this member must be ≥30 days after this claim's DOS.
      const parsed = preview.dateOfServiceIso
        ? new Date(
            Number(preview.dateOfServiceIso.slice(0, 4)),
            Number(preview.dateOfServiceIso.slice(4, 6)) - 1,
            Number(preview.dateOfServiceIso.slice(6, 8))
          )
        : null;
      if (parsed && !Number.isNaN(parsed.getTime())) {
        runningLastDos.set(target.clientId2, parsed);
        const normalized = normalizeClientId2(target.clientId2);
        if (normalized) runningLastDos.set(normalized, parsed);
      }
    }
  }
  // Keep response order aligned with request targets when possible.
  const byKey = new Map(previews.map((preview) => [`${preview.clientId2}__${preview.monthKey}`, preview]));
  const sortedForResponse = targets
    .map((target) => byKey.get(`${target.clientId2}__${target.monthKey}`))
    .filter(Boolean) as ConnectionsT2038ClaimPreview[];
  return { previews: sortedForResponse.length ? sortedForResponse : previews, missing };
}

async function insertCaspioClaim(
  credentials: ReturnType<typeof getCaspioCredentialsFromEnv>,
  token: string,
  body: Record<string, string | number>
) {
  // response=rows returns the inserted record (PK_ID) when the table allows it.
  const url = `${credentials.baseUrl}/integrations/rest/v3/tables/${CONNECTIONS_CLAIM_SUBMIT_TABLE}/records?response=rows`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await response.text().catch(() => '');
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  if (!response.ok) {
    console.error('[kaiser-t2038-claim-submit] Caspio insert failed', {
      status: response.status,
      bodyKeys: Object.keys(body),
      response: text.slice(0, 500),
    });
    throw new Error(
      `Caspio insert failed (HTTP ${response.status}): ${text.slice(0, 280) || response.statusText}`
    );
  }
  // Some Caspio apps return 200 with Message / success:false instead of HTTP 4xx.
  const message = String(json.Message || json.message || json.Error || json.error || '').trim();
  if (/fail|error|invalid|denied|required/i.test(message) && !json.Result) {
    console.error('[kaiser-t2038-claim-submit] Caspio insert rejected', {
      bodyKeys: Object.keys(body),
      response: text.slice(0, 500),
    });
    throw new Error(`Caspio insert rejected: ${message.slice(0, 280)}`);
  }
  const result = Array.isArray(json.Result) ? json.Result[0] : json.Result || json;
  return result as Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  const authz = await requireAdminApiAuth(request, { requireTwoFactor: false });
  if (!authz.ok) {
    return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action || 'preview').trim().toLowerCase();
    const targets = parseTargets(body);
    if (!targets.length && action !== 'edi_pushed') {
      return NextResponse.json(
        { success: false, error: 'Provide targets: [{ clientId2, monthKey }].' },
        { status: 400 }
      );
    }

    const { adminDb } = await import('@/firebase-admin');
    const [{ byId, credentials }, { settings, edi }, submitter] = await Promise.all([
      loadMembersByClientId2(),
      loadClaimSettingsAndEdi(),
      resolveSubmitterFromKaiserStaff(adminDb, {
        email: authz.email,
        name: authz.name,
        uid: authz.uid,
      }),
    ]);
    const lastDosByClient =
      targets.length > 0
        ? await loadLastDosByClientId2(
            adminDb,
            targets.map((target) => target.clientId2)
          )
        : new Map<string, Date>();
    const { previews, missing } =
      targets.length > 0
        ? buildPreviewsForTargets(targets, byId, submitter, settings, lastDosByClient)
        : { previews: [] as ConnectionsT2038ClaimPreview[], missing: [] as ClaimTarget[] };

    if (action === 'preview') {
      return NextResponse.json({
        success: true,
        action: 'preview',
        table: CONNECTIONS_CLAIM_SUBMIT_TABLE,
        submitter,
        previewCount: previews.length,
        readyCount: previews.filter((row) => row.blockers.length === 0).length,
        blockedCount: previews.filter((row) => row.blockers.length > 0).length,
        missingMemberCount: missing.length,
        previews,
      });
    }

    if (action === 'push') {
      // Push one claim at a time when previewId is set; otherwise push all ready claims.
      const previewId = String(body.previewId || '').trim();
      let toPush = previewId
        ? previews.filter((row) => row.id === previewId)
        : previews.filter((row) => row.blockers.length === 0);
      // Fallback: match target client+month when id string differs after rebuild.
      if (previewId && !toPush.length && targets.length === 1) {
        const target = targets[0];
        toPush = previews.filter(
          (row) =>
            row.clientId2 === target.clientId2 &&
            row.monthKey === target.monthKey &&
            row.blockers.length === 0
        );
      }
      if (!toPush.length) {
        return NextResponse.json(
          {
            success: false,
            error: previewId
              ? `No ready preview for id ${previewId}${
                  previews[0]?.blockers?.length
                    ? ` (${previews.map((row) => row.blockers.join('; ')).filter(Boolean).join(' · ')})`
                    : ''
                }.`
              : 'No claimable previews ready to push (all blocked).',
            previews,
          },
          { status: 400 }
        );
      }
      const blocked = toPush.filter((row) => row.blockers.length > 0);
      if (blocked.length) {
        return NextResponse.json(
          {
            success: false,
            error: `Cannot push blocked claim(s): ${blocked.map((row) => row.memberName).join(', ')}`,
            previews: toPush,
          },
          { status: 400 }
        );
      }

      const { adminDb } = await import('@/firebase-admin');
      const token = await getCaspioToken(credentials);
      const results: Array<{
        id: string;
        clientId2: string;
        monthKey: string;
        ok: boolean;
        alreadyPushed?: boolean;
        pkId?: string;
        caspioPushedAt?: string;
        error?: string;
        caspioBody: Record<string, string | number>;
      }> = [];

      const dateOfServiceOverride = String(body.dateOfService || '').trim();

      for (const preview of toPush) {
        const docId = justificationDocId(preview.clientId2, preview.monthKey);
        const ref = adminDb.collection(KAISER_T2038_CLAIM_AUDIT_JUSTIFICATIONS_COLLECTION).doc(docId);
        try {
          const existing = await ref.get();
          const existingData = (existing.exists ? existing.data() : {}) as Record<string, unknown>;
          const alreadyAt = String(existingData?.caspioPushedAt || '').trim();
          if (alreadyAt) {
            // Hard-block re-push — do not treat as success.
            results.push({
              id: preview.id,
              clientId2: preview.clientId2,
              monthKey: preview.monthKey,
              ok: false,
              alreadyPushed: true,
              pkId: String(existingData?.caspioClaimPkId || ''),
              caspioPushedAt: alreadyAt,
              error: `Already pushed on ${alreadyAt.slice(0, 10)} — cannot push again.`,
              caspioBody: preview.caspioBody,
            });
            continue;
          }

          const overrideDos =
            toPush.length === 1 && dateOfServiceOverride ? dateOfServiceOverride : '';
          const finalDos = overrideDos || preview.dateOfService;
          const caspioBody = {
            ...preview.caspioBody,
            ...(finalDos ? { Date_of_Service: finalDos } : {}),
          };

          const inserted = await insertCaspioClaim(credentials, token, caspioBody);
          const pkId = String(
            (inserted as Record<string, unknown>)?.PK_ID ||
              (inserted as Record<string, unknown>)?.Record_ID ||
              ''
          );
          const caspioPushedAt = new Date().toISOString();
          const payload: MonthJustification = {
            clientId2: preview.clientId2,
            monthKey: preview.monthKey,
            disposition: 'claimable',
            reason: DEFAULT_NOTES_CLAIMABLE_REASON,
            justifiedBy: String(authz.name || authz.email || authz.uid || 'Admin').trim(),
            justifiedByEmail: String(authz.email || '').trim(),
            updatedAt: caspioPushedAt,
            caspioPushedAt,
            caspioClaimPkId: pkId,
            caspioDateOfService: finalDos,
          };
          await ref.set(
            {
              ...payload,
              uid: authz.uid,
            },
            { merge: true }
          );
          results.push({
            id: preview.id,
            clientId2: preview.clientId2,
            monthKey: preview.monthKey,
            ok: true,
            pkId,
            caspioPushedAt,
            caspioBody,
          });
        } catch (err: unknown) {
          results.push({
            id: preview.id,
            clientId2: preview.clientId2,
            monthKey: preview.monthKey,
            ok: false,
            error: String((err as { message?: string })?.message || err),
            caspioBody: preview.caspioBody,
          });
        }
      }

      const pushed = results.filter((row) => row.ok && !row.alreadyPushed);
      const already = results.filter((row) => row.alreadyPushed);
      const failed = results.filter((row) => !row.ok);
      const ediTargets = toPush.filter((preview) =>
        results.some((row) => row.id === preview.id && row.ok)
      );
      const ediBundle = buildEdiForConnectionsClaimPreviews(ediTargets, byId, edi, settings);

      return NextResponse.json({
        success: failed.length === 0,
        action: 'push',
        table: CONNECTIONS_CLAIM_SUBMIT_TABLE,
        pushedCount: pushed.length,
        alreadyPushedCount: already.length,
        failedCount: failed.length,
        results,
        edi: ediBundle.edi,
        ediIncluded: ediBundle.included,
        ediSkipped: ediBundle.skipped,
        error:
          failed.length > 0
            ? failed.map((row) => row.error || `${row.clientId2}/${row.monthKey} failed`).join(' · ')
            : undefined,
        message:
          failed.length === 0
            ? `Pushed ${pushed.length} claim(s) to ${CONNECTIONS_CLAIM_SUBMIT_TABLE}${
                already.length ? ` · ${already.length} already pushed` : ''
              }. Download EDI for Smart Data Solutions.`
            : `Pushed ${pushed.length}, failed ${failed.length}: ${failed
                .map((row) => row.error || 'unknown')
                .join(' · ')}`,
      });
    }

    if (action === 'edi' || action === 'edi_pushed') {
      let ediPreviews = previews.filter((row) => row.blockers.length === 0);
      if (action === 'edi_pushed') {
        const snap = await adminDb
          .collection(KAISER_T2038_CLAIM_AUDIT_JUSTIFICATIONS_COLLECTION)
          .limit(5000)
          .get();
        const pushedTargets: ClaimTarget[] = [];
        const pushedDosByKey = new Map<string, string>();
        snap.docs.forEach((doc: { data: () => Record<string, unknown> }) => {
          const data = doc.data() || {};
          if (!String(data.caspioPushedAt || '').trim()) return;
          const clientId2 = String(data.clientId2 || '').trim();
          const monthKey = String(data.monthKey || '').trim();
          if (!clientId2 || !/^\d{4}-\d{2}$/.test(monthKey)) return;
          pushedTargets.push({ clientId2, monthKey });
          const dos = String(data.caspioDateOfService || '').trim();
          if (dos) pushedDosByKey.set(`${clientId2}__${monthKey}`, dos);
        });
        const lastDos = await loadLastDosByClientId2(
          adminDb,
          pushedTargets.map((target) => target.clientId2)
        );
        const rebuilt = buildPreviewsForTargets(pushedTargets, byId, submitter, settings, lastDos);
        ediPreviews = rebuilt.previews
          .map((preview) => {
            const storedDos = pushedDosByKey.get(`${preview.clientId2}__${preview.monthKey}`);
            if (!storedDos) return preview;
            return {
              ...preview,
              dateOfService: storedDos,
              caspioBody: { ...preview.caspioBody, Date_of_Service: storedDos },
              blockers: [],
            };
          })
          .filter((row) => Boolean(row.dateOfService));
      }
      const ediBundle = buildEdiForConnectionsClaimPreviews(ediPreviews, byId, edi, settings);
      return NextResponse.json({
        success: true,
        action,
        edi: ediBundle.edi,
        included: ediBundle.included,
        skipped: ediBundle.skipped,
        previews: ediPreviews,
      });
    }

    return NextResponse.json(
      { success: false, error: `Unknown action "${action}". Use preview | push | edi | edi_pushed.` },
      { status: 400 }
    );
  } catch (err: unknown) {
    console.error('[kaiser-t2038-claim-submit]', err);
    return NextResponse.json(
      { success: false, error: String((err as { message?: string })?.message || err) },
      { status: 500 }
    );
  }
}
