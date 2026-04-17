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

const getWeekStartYmd = (date = new Date()): string => {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0 Sun ... 6 Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  return d.toISOString().slice(0, 10);
};

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
    return hasAuthEmail && !hasOfficialAuth;
  });
  const t2038Requested = rows.filter((m: any) => {
    const requested = Boolean(toYmd(m?.Kaiser_T2038_Requested || m?.Kaiser_T2038_Requested_Date));
    const received = Boolean(toYmd(m?.Kaiser_T2038_Received_Date || m?.Kaiser_T2038_Received || m?.Kaiser_T038_Received));
    return requested && !received;
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
  const h2022EndingWithin1Month = h2022Eligible.filter((m: any) => isWithinNext30Days(m?.Authorization_End_Date_H2022));

  const totalInQueues = new Set<string>([
    ...t2038AuthOnly.map((m: any) => String(m?.Client_ID2 || m?.client_ID2 || m?.id || '').trim()).filter(Boolean),
    ...t2038Requested.map((m: any) => String(m?.Client_ID2 || m?.client_ID2 || m?.id || '').trim()).filter(Boolean),
    ...t2038ReceivedUnreachable.map((m: any) => String(m?.Client_ID2 || m?.client_ID2 || m?.id || '').trim()).filter(Boolean),
    ...tierRequested.map((m: any) => String(m?.Client_ID2 || m?.client_ID2 || m?.id || '').trim()).filter(Boolean),
    ...tierAppeals.map((m: any) => String(m?.Client_ID2 || m?.client_ID2 || m?.id || '').trim()).filter(Boolean),
    ...rbPendingIlsContract.map((m: any) => String(m?.Client_ID2 || m?.client_ID2 || m?.id || '').trim()).filter(Boolean),
    ...h2022AuthDatesWith.map((m: any) => String(m?.Client_ID2 || m?.client_ID2 || m?.id || '').trim()).filter(Boolean),
    ...h2022AuthDatesWithout.map((m: any) => String(m?.Client_ID2 || m?.client_ID2 || m?.id || '').trim()).filter(Boolean),
  ]).size;

  return {
    totalInQueues,
    t2038AuthOnly: t2038AuthOnly.length,
    t2038Requested: t2038Requested.length,
    t2038ReceivedUnreachable: t2038ReceivedUnreachable.length,
    tierRequested: tierRequested.length,
    tierAppeals: tierAppeals.length,
    rbPendingIlsContract: rbPendingIlsContract.length,
    h2022AuthDatesWith: h2022AuthDatesWith.length,
    h2022AuthDatesWithout: h2022AuthDatesWithout.length,
    finalAtRcfeWithDates: finalAtRcfeWithDates.length,
    finalAtRcfeWithoutDates: finalAtRcfeWithoutDates.length,
    h2022EndingWithin1Month: h2022EndingWithin1Month.length,
  };
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
      const counts = await computeCurrentCounts();
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

