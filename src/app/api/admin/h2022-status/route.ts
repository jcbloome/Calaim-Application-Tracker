import { NextRequest, NextResponse } from 'next/server';
import { getCaspioCredentialsFromEnv, getCaspioToken, fetchCaspioRecords } from '@/lib/caspio-api-utils';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PlanBucket = 'kaiser' | 'health_net' | 'other';
type PlanScope = 'all' | 'kaiser' | 'health_net';

type AuthContext = { uid: string; email: string; isSuperAdmin: boolean };

const KAISER_H2022_WARNING_DAYS = 30;
const HEALTH_NET_H2022_WARNING_DAYS = 14;

const MEMBER_SELECT_FIELDS = [
  'Client_ID2',
  'Senior_First',
  'Senior_Last',
  'MCP_CIN',
  'MRN',
  'CalAIM_MCO',
  'CalAIM_Status',
  'Kaiser_Status',
  'Member_County',
  'RCFE_Name',
  'Authorization_Start_Date_H2022',
  'Authorization_End_Date_H2022',
  'Next_Auth_Start_H2022',
  'Next_Auth_End_H2022',
  'Authorization_Start_Date_T2038',
  'Authorization_End_Date_T2038',
  'Next_Auth_Start_T2038',
  'Next_Auth_End_T2038',
];

const normalizeText = (value: unknown) => String(value ?? '').trim();

const isKaiserH2022EligibleStatus = (status: unknown) => {
  const raw = normalizeText(status).toLowerCase();
  return raw === 'authorized' || raw === 'h2022';
};

const classifyPlan = (mco: unknown): PlanBucket => {
  const plan = String(mco || '')
    .trim()
    .toLowerCase();
  if (!plan) return 'other';
  if (plan.includes('kaiser')) return 'kaiser';
  if (plan.includes('health') && plan.includes('net')) return 'health_net';
  return 'other';
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

const startOfLocalDayMs = (d = new Date()) => {
  const next = new Date(d);
  next.setHours(0, 0, 0, 0);
  return next.getTime();
};

const warningWindowDaysForPlan = (plan: PlanBucket) => {
  if (plan === 'kaiser') return KAISER_H2022_WARNING_DAYS;
  if (plan === 'health_net') return HEALTH_NET_H2022_WARNING_DAYS;
  return 0;
};

const buildEndWarning = (plan: PlanBucket, endDate: string | null) => {
  if (!endDate || plan === 'other') {
    return {
      h2022EndWarning: false as const,
      h2022DaysUntilEnd: null as number | null,
      h2022WarningLabel: null as string | null,
    };
  }
  const endMs = Date.parse(`${endDate}T00:00:00`);
  if (!Number.isFinite(endMs)) {
    return {
      h2022EndWarning: false as const,
      h2022DaysUntilEnd: null as number | null,
      h2022WarningLabel: null as string | null,
    };
  }
  const daysUntilEnd = Math.floor((endMs - startOfLocalDayMs()) / (24 * 60 * 60 * 1000));
  const windowDays = warningWindowDaysForPlan(plan);
  if (daysUntilEnd < 0) {
    return {
      h2022EndWarning: true as const,
      h2022DaysUntilEnd: daysUntilEnd,
      h2022WarningLabel: `H2022 ended ${Math.abs(daysUntilEnd)} day${Math.abs(daysUntilEnd) === 1 ? '' : 's'} ago`,
    };
  }
  if (daysUntilEnd <= windowDays) {
    const planLabel = plan === 'kaiser' ? 'Kaiser (1 month)' : 'Health Net (2 weeks)';
    return {
      h2022EndWarning: true as const,
      h2022DaysUntilEnd: daysUntilEnd,
      h2022WarningLabel:
        daysUntilEnd === 0
          ? `H2022 ends today — ${planLabel} warning`
          : `H2022 ends in ${daysUntilEnd} day${daysUntilEnd === 1 ? '' : 's'} — ${planLabel} warning`,
    };
  }
  return {
    h2022EndWarning: false as const,
    h2022DaysUntilEnd: daysUntilEnd,
    h2022WarningLabel: null as string | null,
  };
};

const pickMostUrgentEndDate = (dates: Array<string | null | undefined>): string | null => {
  const valid = dates.map((d) => parseDateLoose(d)).filter((d): d is string => Boolean(d));
  if (!valid.length) return null;
  return valid.sort((a, b) => Date.parse(`${a}T00:00:00`) - Date.parse(`${b}T00:00:00`))[0] || null;
};

async function requireToolsAccess(request: NextRequest) {
  const adminCheck = await requireAdminApiAuth(request, { requireTwoFactor: true });
  if (adminCheck.ok) {
    const context: AuthContext = {
      uid: adminCheck.uid,
      email: adminCheck.email,
      isSuperAdmin: adminCheck.isSuperAdmin,
    };
    return { ok: true as const, context };
  }

  try {
    const authHeader = request.headers.get('authorization') || request.headers.get('Authorization') || '';
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const token = tokenMatch?.[1] ? String(tokenMatch[1]).trim() : '';
    if (!token) return adminCheck;

    const adminModule = await import('@/firebase-admin');
    const adminAuth = adminModule.adminAuth;
    const adminDb = adminModule.adminDb;
    const decoded = await adminAuth.verifyIdToken(token);
    const uid = String(decoded?.uid || '').trim();
    const email = String(decoded?.email || '').trim().toLowerCase();
    if (!uid) return adminCheck;

    const [userByUid, userByEmail] = await Promise.all([
      adminDb.collection('users').doc(uid).get(),
      email ? adminDb.collection('users').doc(email).get() : Promise.resolve({ exists: false } as any),
    ]);
    const userData = userByUid.exists
      ? (userByUid.data() as Record<string, unknown>)
      : userByEmail.exists
        ? (userByEmail.data() as Record<string, unknown>)
        : null;
    const roleLabel = String(userData?.role || '').trim().toLowerCase();
    const isStaff =
      Boolean(userData?.canAccessAllTools) ||
      Boolean(userData?.isStaff) ||
      ['staff', 'admin', 'super admin', 'super_admin'].includes(roleLabel);
    if (!isStaff) return adminCheck;

    const candidates = [userByUid, userByEmail].filter((snap) => snap?.exists);
    let has2fa = false;
    for (const snap of candidates) {
      const data = snap.data() as Record<string, any> | null;
      if (!data || !Boolean(data['2faVerified'])) continue;
      const expiryRaw = data['2faSessionExpiry'];
      const expiry =
        typeof expiryRaw?.toDate === 'function'
          ? expiryRaw.toDate()
          : expiryRaw
            ? new Date(expiryRaw)
            : null;
      if (expiry && !Number.isNaN(expiry.getTime()) && expiry.getTime() > Date.now()) {
        has2fa = true;
        break;
      }
    }
    if (!has2fa) {
      return { ok: false as const, status: 403, error: 'Active two-factor authentication is required' };
    }

    return {
      ok: true as const,
      context: { uid, email, isSuperAdmin: false } satisfies AuthContext,
    };
  } catch {
    return adminCheck;
  }
}

function buildMemberRow(raw: Record<string, unknown>) {
  const mco = normalizeText(raw?.CalAIM_MCO || raw?.MCO || raw?.Health_Plan);
  const plan = classifyPlan(mco);
  const authStart = parseDateLoose(raw?.Authorization_Start_Date_H2022);
  const authEnd = parseDateLoose(raw?.Authorization_End_Date_H2022);
  const nextAuthStartH2022 = parseDateLoose(raw?.Next_Auth_Start_H2022);
  const nextAuthEndH2022 = parseDateLoose(raw?.Next_Auth_End_H2022);
  const authStartT2038 = parseDateLoose(
    raw?.Authorization_Start_Date_T2038 || raw?.Authorization_Start_T2038
  );
  const authEndT2038 = parseDateLoose(raw?.Authorization_End_Date_T2038 || raw?.Authorization_End_T2038);
  const nextAuthStartT2038 = parseDateLoose(raw?.Next_Auth_Start_T2038);
  const nextAuthEndT2038 = parseDateLoose(raw?.Next_Auth_End_T2038);

  let h2022StartDate = authStart;
  let h2022EndDate = authEnd;
  let h2022EndSource: 'authorization' | 'next_auth' | null = authEnd ? 'authorization' : null;

  if (plan === 'health_net') {
    // Health Net renewals use Next_Auth_*_H2022 — check those alongside current auth dates.
    const urgentEnd = pickMostUrgentEndDate([authEnd, nextAuthEndH2022]);
    h2022EndDate = urgentEnd || nextAuthEndH2022 || authEnd;
    h2022StartDate = nextAuthStartH2022 || authStart;
    if (h2022EndDate && nextAuthEndH2022 && h2022EndDate === nextAuthEndH2022) {
      h2022EndSource = 'next_auth';
    } else if (h2022EndDate) {
      h2022EndSource = 'authorization';
    }
  }

  // Prefer next T2038 end when present (same pattern as H2022 for Health Net).
  const t2038EndDate =
    plan === 'health_net'
      ? pickMostUrgentEndDate([authEndT2038, nextAuthEndT2038]) || nextAuthEndT2038 || authEndT2038
      : authEndT2038;
  const t2038StartDate =
    plan === 'health_net' ? nextAuthStartT2038 || authStartT2038 : authStartT2038;

  const warning = buildEndWarning(plan, h2022EndDate);
  let h2022WarningLabel = warning.h2022WarningLabel;
  if (warning.h2022EndWarning && plan === 'health_net' && h2022EndSource === 'next_auth') {
    h2022WarningLabel = `${warning.h2022WarningLabel || 'H2022 ending soon'} (Next_Auth_End_H2022)`;
  }

  const first = normalizeText(raw?.Senior_First);
  const last = normalizeText(raw?.Senior_Last);
  const memberName = [first, last].filter(Boolean).join(' ').trim() || 'Member';

  return {
    clientId2: normalizeText(raw?.Client_ID2 || raw?.client_ID2),
    memberFirst: first,
    memberLast: last,
    memberName,
    mcpCin: normalizeText(raw?.MCP_CIN || raw?.MRN),
    mrn: normalizeText(raw?.MRN),
    mco,
    plan,
    calaimStatus: normalizeText(raw?.CalAIM_Status),
    kaiserStatus: normalizeText(raw?.Kaiser_Status),
    county: normalizeText(raw?.Member_County),
    rcfeName: normalizeText(raw?.RCFE_Name),
    authorizationStartH2022: authStart,
    authorizationEndH2022: authEnd,
    nextAuthStartH2022,
    nextAuthEndH2022,
    h2022StartDate,
    h2022EndDate,
    h2022EndSource,
    authorizationStartT2038: authStartT2038,
    authorizationEndT2038: authEndT2038,
    nextAuthStartT2038,
    nextAuthEndT2038,
    t2038StartDate,
    t2038EndDate,
    missingH2022Dates: !h2022StartDate || !h2022EndDate,
    ...warning,
    h2022WarningLabel,
  };
}

async function pullMembersFromCaspio(planScope: PlanScope) {
  const credentials = getCaspioCredentialsFromEnv();
  const token = await getCaspioToken(credentials);
  const table = 'CalAIM_tbl_Members';

  const whereByScope: Record<PlanScope, string[]> = {
    all: [
      "CalAIM_MCO='Kaiser' AND (CalAIM_Status='Authorized' OR CalAIM_Status='H2022')",
      "CalAIM_MCO='Health Net'",
      "CalAIM_MCO='HealthNet'",
    ],
    kaiser: ["CalAIM_MCO='Kaiser' AND (CalAIM_Status='Authorized' OR CalAIM_Status='H2022')"],
    health_net: ["CalAIM_MCO='Health Net'", "CalAIM_MCO='HealthNet'"],
  };

  const clauses = whereByScope[planScope] || whereByScope.all;
  const allRows: Record<string, unknown>[] = [];
  const seen = new Set<string>();

  for (const where of clauses) {
    try {
      const rows = await fetchCaspioRecords(credentials, token, table, where, 1000);
      for (const row of rows || []) {
        const key =
          normalizeText((row as any)?.Client_ID2) ||
          normalizeText((row as any)?.MCP_CIN) ||
          normalizeText((row as any)?.MRN) ||
          JSON.stringify(row);
        if (seen.has(key)) continue;
        seen.add(key);
        allRows.push(row as Record<string, unknown>);
      }
    } catch (error) {
      console.warn(`[h2022-status] Caspio pull failed for where=${where}:`, error);
    }
  }

  // Fallback: broad pull + in-memory plan filter if exact MCO labels returned nothing.
  if (!allRows.length) {
    try {
      const broad = await fetchCaspioRecords(credentials, token, table, "Client_ID2<>''", 1000);
      for (const row of broad || []) {
        const plan = classifyPlan((row as any)?.CalAIM_MCO);
        if (planScope === 'all') {
          if (plan !== 'kaiser' && plan !== 'health_net') continue;
        } else if (plan !== planScope) {
          continue;
        }
        if (plan === 'kaiser' && !isKaiserH2022EligibleStatus((row as any)?.CalAIM_Status)) {
          continue;
        }
        const key =
          normalizeText((row as any)?.Client_ID2) ||
          normalizeText((row as any)?.MCP_CIN) ||
          normalizeText((row as any)?.MRN);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        allRows.push(row as Record<string, unknown>);
      }
    } catch (error) {
      console.warn('[h2022-status] Broad Caspio fallback failed:', error);
    }
  }

  void MEMBER_SELECT_FIELDS;
  return allRows;
}

export async function POST(request: NextRequest) {
  try {
    const authCheck = await requireToolsAccess(request);
    if (!authCheck.ok) {
      return NextResponse.json({ success: false, error: authCheck.error }, { status: authCheck.status });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const planScopeRaw = String(body?.planScope || body?.pullPlan || 'all')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');
    const planScope: PlanScope =
      planScopeRaw === 'kaiser' || planScopeRaw === 'health_net' || planScopeRaw === 'healthnet'
        ? planScopeRaw === 'healthnet'
          ? 'health_net'
          : (planScopeRaw as 'kaiser' | 'health_net')
        : 'all';

    const rawMembers = await pullMembersFromCaspio(planScope);
    const rows = rawMembers
      .map((row) => buildMemberRow(row))
      .filter((row) => {
        if (planScope === 'all') {
          if (row.plan !== 'kaiser' && row.plan !== 'health_net') return false;
        } else if (row.plan !== planScope) {
          return false;
        }
        // Kaiser H2022 Status page: only Authorized or H2022 CalAIM statuses.
        if (row.plan === 'kaiser' && !isKaiserH2022EligibleStatus(row.calaimStatus)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const aMs = a.h2022EndDate ? Date.parse(`${a.h2022EndDate}T00:00:00`) : Number.POSITIVE_INFINITY;
        const bMs = b.h2022EndDate ? Date.parse(`${b.h2022EndDate}T00:00:00`) : Number.POSITIVE_INFINITY;
        if (aMs !== bMs) return aMs - bMs;
        return a.memberLast.localeCompare(b.memberLast) || a.memberFirst.localeCompare(b.memberFirst);
      });

    const endingSoonKaiser = rows.filter(
      (r) => r.plan === 'kaiser' && r.h2022EndWarning && (r.h2022DaysUntilEnd ?? -1) >= 0
    ).length;
    const endingSoonHealthNet = rows.filter(
      (r) => r.plan === 'health_net' && r.h2022EndWarning && (r.h2022DaysUntilEnd ?? -1) >= 0
    ).length;
    const ended = rows.filter((r) => r.h2022EndWarning && (r.h2022DaysUntilEnd ?? 0) < 0).length;
    const missingDates = rows.filter((r) => r.missingH2022Dates).length;
    const withDates = rows.length - missingDates;

    return NextResponse.json({
      success: true,
      action: 'pull_h2022_dates',
      planScope,
      source: 'caspio-live',
      pulledAt: new Date().toISOString(),
      summary: {
        total: rows.length,
        withDates,
        missingDates,
        endingSoonKaiser,
        endingSoonHealthNet,
        ended,
      },
      rows,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to pull H2022 dates.';
    const lower = message.toLowerCase();
    const isFirebaseAuthFailure =
      lower.includes('active two-factor') ||
      lower.includes('auth token') ||
      lower.includes('admin privileges') ||
      lower.includes('authorization bearer') ||
      lower.includes('missing authorization');
    const isCaspioAuthFailure =
      lower.includes('caspio token') ||
      lower.includes('caspio credentials') ||
      lower.includes('access_token');
    return NextResponse.json(
      {
        success: false,
        error: isCaspioAuthFailure
          ? `Caspio auth failed while pulling H2022 dates: ${message}`
          : isFirebaseAuthFailure
            ? `Auth failed: ${message}`
            : message,
      },
      { status: isFirebaseAuthFailure ? 403 : isCaspioAuthFailure ? 502 : 500 }
    );
  }
}
