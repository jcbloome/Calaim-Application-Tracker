import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/firebase-admin';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const normalizeStatus = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const hasMeaningfulValue = (value: unknown) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  return Boolean(normalized) && !['null', 'undefined', 'n/a'].includes(normalized);
};

const toYmd = (value: unknown): string => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (lower === 'null' || lower === 'undefined' || lower === 'n/a') return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) {
    const mm = String(us[1]).padStart(2, '0');
    const dd = String(us[2]).padStart(2, '0');
    const yyyy = String(us[3]);
    return `${yyyy}-${mm}-${dd}`;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
};

const isFinalMemberAtRcfe = (value: unknown): boolean => {
  const normalized = normalizeStatus(value).replace(/[^a-z0-9]+/g, ' ').trim();
  return normalized === 'final member at rcfe' || normalized === 'final at rcfe';
};

const isRbPendingOrFinalAtRcfeStatus = (value: unknown): boolean => {
  const normalized = normalizeStatus(value).replace(/[^a-z0-9]+/g, ' ').trim();
  return (
    normalized === 'r b sent pending ils contract' ||
    normalized === 'r b pending ils contract' ||
    normalized === 'final member at rcfe' ||
    normalized === 'final at rcfe'
  );
};

const isT2038RequestedStatus = (value: unknown): boolean => {
  const compact = normalizeStatus(value).replace(/[^a-z0-9]+/g, ' ').trim();
  return compact === 't2038 requested';
};

const isVettingAppealStatus = (value: unknown): boolean => {
  const normalized = normalizeStatus(value).replace(/[^a-z0-9]+/g, ' ').trim();
  return normalized === 'vetting appeal' || normalized === 'vetting appeals';
};

const isWithinNext30Days = (value: unknown): boolean => {
  const ymd = toYmd(value);
  if (!ymd) return false;
  const endDate = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(endDate.getTime())) return false;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const warningCutoff = new Date(today);
  warningCutoff.setDate(warningCutoff.getDate() + 30);
  return endDate >= today && endDate <= warningCutoff;
};

const isPastOrWithinNext30Days = (value: unknown): boolean => {
  const ymd = toYmd(value);
  if (!ymd) return false;
  const endDate = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(endDate.getTime())) return false;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const warningCutoff = new Date(today);
  warningCutoff.setDate(warningCutoff.getDate() + 30);
  return endDate <= warningCutoff;
};

const getWeekStartYmd = (date = new Date()): string => {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0 Sun ... 6 Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  return d.toISOString().slice(0, 10);
};

const memberIdFor = (member: any): string =>
  String(member?.Client_ID2 || member?.client_ID2 || member?.id || '').trim();

const computeCurrentCounts = async () => {
  const cacheSnap = await adminDb
    .collection('caspio_members_cache')
    .where('CalAIM_MCO', '==', 'Kaiser')
    .limit(5000)
    .get();
  const rows = cacheSnap.docs.map((d) => d.data() as any);

  const t2038AuthOnly = rows.filter((m: any) => {
    const hasAuthEmail = hasMeaningfulValue(m?.T2038_Auth_Email_Kaiser);
    const hasOfficialAuth =
      hasMeaningfulValue(m?.Kaiser_T2038_Received_Date) ||
      hasMeaningfulValue(m?.Kaiser_T2038_Received) ||
      hasMeaningfulValue(m?.Kaiser_T038_Received);
    return hasAuthEmail && !hasOfficialAuth && isT2038RequestedStatus(m?.Kaiser_Status);
  });
  const t2038Requested = rows.filter((m: any) => {
    const requested = Boolean(toYmd(m?.Kaiser_T2038_Requested || m?.Kaiser_T2038_Requested_Date));
    const received = Boolean(toYmd(m?.Kaiser_T2038_Received_Date || m?.Kaiser_T2038_Received || m?.Kaiser_T038_Received));
    const hasAuthEmail = hasMeaningfulValue(m?.T2038_Auth_Email_Kaiser);
    const statusRequested = isT2038RequestedStatus(m?.Kaiser_Status);
    if (statusRequested) return !hasAuthEmail && !received;
    return requested && !received && !hasAuthEmail;
  });
  const t2038ReceivedUnreachable = rows.filter((m: any) => {
    const compactStatus = normalizeStatus(m?.Kaiser_Status).replace(/[^a-z0-9]+/g, ' ').trim();
    return compactStatus === 't2038 received unreachable';
  });
  const tierRequested = rows.filter((m: any) => {
    const requested = Boolean(
      toYmd(
        m?.Kaiser_Tier_Level_Requested ||
          m?.Kaiser_Tier_Level_Requested_Date ||
          m?.Tier_Level_Request_Date ||
          m?.Tier_Level_Requested_Date ||
          m?.Tier_Request_Date
      )
    );
    const received = Boolean(
      toYmd(m?.Kaiser_Tier_Level_Received_Date || m?.Kaiser_Tier_Level_Received || m?.Tier_Level_Received_Date || m?.Tier_Received_Date)
    );
    return requested && !received;
  });
  const tierAppeals = rows.filter((m: any) => {
    const compactStatus = normalizeStatus(m?.Kaiser_Status).replace(/[^a-z0-9]+/g, ' ').trim();
    return compactStatus === 'tier level appeals' || compactStatus === 'tier level appeal';
  });
  const vettingAppeal = rows.filter((m: any) => isVettingAppealStatus(m?.Kaiser_Status));
  const rbPendingIlsContract = rows.filter((m: any) => {
    const byStatus = isRbPendingOrFinalAtRcfeStatus(m?.Kaiser_Status);
    const rbRequested = Boolean(toYmd(m?.Kaiser_H2022_Requested));
    const rbReceived = Boolean(toYmd(m?.Kaiser_H2022_Received));
    return (byStatus || rbRequested) && !rbReceived;
  });

  const h2022Eligible = rows.filter((m: any) => isRbPendingOrFinalAtRcfeStatus(m?.Kaiser_Status));
  const h2022AuthDatesWith = h2022Eligible.filter(
    (m: any) => Boolean(toYmd(m?.Authorization_Start_Date_H2022)) && Boolean(toYmd(m?.Authorization_End_Date_H2022))
  );
  const h2022AuthDatesWithout = h2022Eligible.filter(
    (m: any) => !toYmd(m?.Authorization_Start_Date_H2022) || !toYmd(m?.Authorization_End_Date_H2022)
  );
  const finalAtRcfeWithDates = h2022Eligible.filter(
    (m: any) =>
      isFinalMemberAtRcfe(m?.Kaiser_Status) &&
      Boolean(toYmd(m?.Authorization_Start_Date_H2022)) &&
      Boolean(toYmd(m?.Authorization_End_Date_H2022))
  );
  const finalAtRcfeWithoutDates = h2022Eligible.filter(
    (m: any) =>
      isFinalMemberAtRcfe(m?.Kaiser_Status) &&
      (!toYmd(m?.Authorization_Start_Date_H2022) || !toYmd(m?.Authorization_End_Date_H2022))
  );
  const missingEndDateFinalOrRb = h2022Eligible.filter(
    (m: any) => !toYmd(m?.Authorization_End_Date_H2022)
  );
  const h2022ReauthRequired = h2022Eligible.filter((m: any) =>
    isPastOrWithinNext30Days(m?.Authorization_End_Date_H2022)
  );
  const h2022ReauthSent = h2022ReauthRequired.filter((m: any) =>
    hasMeaningfulValue(m?.Auth_Ext_Request_Date_H2022) || Boolean(toYmd(m?.Auth_Ext_Request_Date_H2022))
  );
  const h2022ReauthNotSent = h2022ReauthRequired.filter((m: any) =>
    !hasMeaningfulValue(m?.Auth_Ext_Request_Date_H2022) && !toYmd(m?.Auth_Ext_Request_Date_H2022)
  );
  const h2022EndingWithin1Month = h2022Eligible.filter((m: any) => isWithinNext30Days(m?.Authorization_End_Date_H2022));

  const queueMemberIds = {
    t2038AuthOnly: t2038AuthOnly.map(memberIdFor).filter(Boolean),
    t2038Requested: t2038Requested.map(memberIdFor).filter(Boolean),
    t2038ReceivedUnreachable: t2038ReceivedUnreachable.map(memberIdFor).filter(Boolean),
    tierRequested: tierRequested.map(memberIdFor).filter(Boolean),
    tierAppeals: tierAppeals.map(memberIdFor).filter(Boolean),
    vettingAppeal: vettingAppeal.map(memberIdFor).filter(Boolean),
    rbPendingIlsContract: rbPendingIlsContract.map(memberIdFor).filter(Boolean),
    h2022AuthDatesWith: h2022AuthDatesWith.map(memberIdFor).filter(Boolean),
    h2022AuthDatesWithout: h2022AuthDatesWithout.map(memberIdFor).filter(Boolean),
    finalAtRcfeWithDates: finalAtRcfeWithDates.map(memberIdFor).filter(Boolean),
    finalAtRcfeWithoutDates: finalAtRcfeWithoutDates.map(memberIdFor).filter(Boolean),
    missingEndDateFinalOrRb: missingEndDateFinalOrRb.map(memberIdFor).filter(Boolean),
    h2022ReauthRequired: h2022ReauthRequired.map(memberIdFor).filter(Boolean),
    h2022ReauthSent: h2022ReauthSent.map(memberIdFor).filter(Boolean),
    h2022ReauthNotSent: h2022ReauthNotSent.map(memberIdFor).filter(Boolean),
    h2022EndingWithin1Month: h2022EndingWithin1Month.map(memberIdFor).filter(Boolean),
  } as const;

  const totalInQueues = new Set<string>([
    ...queueMemberIds.t2038AuthOnly,
    ...queueMemberIds.t2038Requested,
    ...queueMemberIds.t2038ReceivedUnreachable,
    ...queueMemberIds.tierRequested,
    ...queueMemberIds.tierAppeals,
    ...queueMemberIds.vettingAppeal,
    ...queueMemberIds.rbPendingIlsContract,
    ...queueMemberIds.h2022AuthDatesWith,
    ...queueMemberIds.h2022AuthDatesWithout,
  ]).size;

  const counts = {
    totalInQueues,
    t2038AuthOnly: t2038AuthOnly.length,
    t2038Requested: t2038Requested.length,
    t2038ReceivedUnreachable: t2038ReceivedUnreachable.length,
    tierRequested: tierRequested.length,
    tierAppeals: tierAppeals.length,
    vettingAppeal: vettingAppeal.length,
    rbPendingIlsContract: rbPendingIlsContract.length,
    h2022AuthDatesWith: h2022AuthDatesWith.length,
    h2022AuthDatesWithout: h2022AuthDatesWithout.length,
    finalAtRcfeWithDates: finalAtRcfeWithDates.length,
    finalAtRcfeWithoutDates: finalAtRcfeWithoutDates.length,
    missingEndDateFinalOrRb: missingEndDateFinalOrRb.length,
    h2022ReauthRequired: h2022ReauthRequired.length,
    h2022ReauthSent: h2022ReauthSent.length,
    h2022ReauthNotSent: h2022ReauthNotSent.length,
    h2022EndingWithin1Month: h2022EndingWithin1Month.length,
  } as const;

  return { counts, queueMemberIds };
};

export async function POST(request: NextRequest) {
  try {
    const authz = await requireAdminApiAuth(request, { requireTwoFactor: true });
    if (!authz.ok) {
      return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
    }

    const body = (await request.json().catch(() => ({}))) as any;
    const action = String(body?.action || 'list').trim().toLowerCase();
    const limit = Math.min(52, Math.max(1, Number(body?.limit || 26)));

    if (action === 'capture') {
      const { counts, queueMemberIds } = await computeCurrentCounts();
      const now = new Date();
      const weekStartYmd = getWeekStartYmd(now);
      const weekLabel = `Week of ${weekStartYmd}`;
      await adminDb.collection('ils_weekly_tracker_snapshots').doc(weekStartYmd).set(
        {
          weekStartYmd,
          weekLabel,
          capturedAtIso: now.toISOString(),
          capturedByUid: authz.uid,
          capturedByEmail: authz.email,
          counts,
          queueMemberIds,
        },
        { merge: true }
      );
    }

    const snap = await adminDb
      .collection('ils_weekly_tracker_snapshots')
      .orderBy('weekStartYmd', 'desc')
      .limit(limit)
      .get();
    const snapshots = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

    return NextResponse.json({ success: true, snapshots });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to load ILS weekly tracker data' }, { status: 500 });
  }
}

