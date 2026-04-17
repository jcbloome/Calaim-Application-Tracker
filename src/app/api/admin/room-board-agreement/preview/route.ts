import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/firebase-admin';
import { getCaspioCredentialsFromEnv, getCaspioToken } from '@/lib/caspio-api-utils';
import { requireAdminApiAuthFromIdToken } from '@/lib/admin-api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PreviewBody = {
  idToken?: string;
  applicationId?: string;
  userId?: string | null;
};

const clean = (value: unknown, max = 400) => String(value || '').trim().slice(0, max);
const normalizeEmail = (value: unknown) => clean(value, 320).toLowerCase();

const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

function getAuthorizedRepEmail(application: Record<string, any>): string {
  const candidates = [
    application?.repEmail,
    application?.bestContactEmail,
    application?.referrerEmail,
  ];
  return candidates.map((v) => normalizeEmail(v)).find((v) => isValidEmail(v)) || '';
}

function getAuthorizedRepName(application: Record<string, any>): string {
  const repName = [clean(application?.repFirstName, 80), clean(application?.repLastName, 80)]
    .filter(Boolean)
    .join(' ')
    .trim();
  if (repName) return repName;
  const bestName = [clean(application?.bestContactFirstName, 80), clean(application?.bestContactLastName, 80)]
    .filter(Boolean)
    .join(' ')
    .trim();
  if (bestName) return bestName;
  return [clean(application?.memberFirstName, 80), clean(application?.memberLastName, 80)]
    .filter(Boolean)
    .join(' ')
    .trim() || 'Authorized Representative';
}

function formatMoney(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const num = Number(raw.replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(num)) return raw;
  return num.toFixed(2);
}

async function fetchCaspioMemberAndRate(clientId2: string) {
  const credentials = getCaspioCredentialsFromEnv();
  const token = await getCaspioToken(credentials);
  const escapedClientId2 = clientId2.replace(/'/g, "''");

  const memberWhere = `Client_ID2='${escapedClientId2}'`;
  const memberSelect = ['Client_ID2', 'Senior_First', 'Senior_Last', 'RCFE_Name', 'MCO_and_Tier'].join(',');
  const memberUrl =
    `${credentials.baseUrl}/integrations/rest/v3/tables/CalAIM_tbl_Members/records` +
    `?q.select=${encodeURIComponent(memberSelect)}` +
    `&q.where=${encodeURIComponent(memberWhere)}` +
    `&q.limit=1`;
  const memberRes = await fetch(memberUrl, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!memberRes.ok) {
    const err = await memberRes.text().catch(() => '');
    throw new Error(`Failed to load Caspio member (${memberRes.status}): ${err}`);
  }
  const memberJson = (await memberRes.json().catch(() => ({}))) as any;
  const member = Array.isArray(memberJson?.Result) ? memberJson.Result[0] : null;
  if (!member) throw new Error('Member not found in Caspio.');

  const mcoAndTier = clean(member?.MCO_and_Tier, 120);
  let rateRow: any = null;
  if (mcoAndTier) {
    const rateWhere = `MCO='${mcoAndTier.replace(/'/g, "''")}'`;
    const rateSelect = ['MCO', 'Tier', 'Daily_Rate', 'H2022_Monthly_Rate', 'T2038_Rate', 'Unit_Rate', 'Units'].join(',');
    const rateUrl =
      `${credentials.baseUrl}/integrations/rest/v3/tables/CalAIM_tbl_MCO_RCFE_Rates/records` +
      `?q.select=${encodeURIComponent(rateSelect)}` +
      `&q.where=${encodeURIComponent(rateWhere)}` +
      `&q.limit=1`;
    const rateRes = await fetch(rateUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    if (rateRes.ok) {
      const rateJson = (await rateRes.json().catch(() => ({}))) as any;
      rateRow = Array.isArray(rateJson?.Result) ? rateJson.Result[0] || null : null;
    }
  }
  return { member, rateRow };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as PreviewBody;
    const idToken = clean(body?.idToken, 8000);
    const applicationId = clean(body?.applicationId, 200);
    const applicationUserId = clean(body?.userId, 200);
    if (!idToken || !applicationId) {
      return NextResponse.json({ success: false, error: 'Missing required fields.' }, { status: 400 });
    }

    const authz = await requireAdminApiAuthFromIdToken(idToken, { requireTwoFactor: true });
    if (!authz.ok) {
      return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
    }

    const refs = [];
    if (applicationUserId) {
      refs.push(adminDb.collection('users').doc(applicationUserId).collection('applications').doc(applicationId));
    }
    refs.push(adminDb.collection('applications').doc(applicationId));

    let application: Record<string, any> | null = null;
    for (const ref of refs) {
      const snap = await ref.get();
      if (snap.exists) {
        application = (snap.data() || {}) as Record<string, any>;
        break;
      }
    }
    if (!application) {
      return NextResponse.json({ success: false, error: 'Application not found.' }, { status: 404 });
    }

    const clientId2 = clean(
      application.client_ID2 || application.clientId2 || application.Client_ID2,
      120
    );
    if (!clientId2) {
      return NextResponse.json(
        { success: false, error: 'Cannot generate preview: missing client_ID2.' },
        { status: 409 }
      );
    }

    const { member, rateRow } = await fetchCaspioMemberAndRate(clientId2);

    const memberName = [
      clean(application.memberFirstName || member?.Senior_First, 80),
      clean(application.memberLastName || member?.Senior_Last, 80),
    ]
      .filter(Boolean)
      .join(' ')
      .trim() || 'Member';

    const preview = {
      clientId2,
      memberName,
      mrn: clean(application.memberMrn, 80) || null,
      authorizedRepName: getAuthorizedRepName(application),
      authorizedRepEmail: getAuthorizedRepEmail(application),
      rcfeName: clean(member?.RCFE_Name || application?.rcfeName, 180),
      rcfeSignerEmailDefault: normalizeEmail(application?.rcfeAdminEmail || ''),
      mcoAndTier: clean(member?.MCO_and_Tier, 120),
      tierLevel: clean(rateRow?.Tier || '', 20),
      assistedLivingDailyRate: formatMoney(rateRow?.Daily_Rate || rateRow?.Unit_Rate),
      assistedLivingMonthlyRate: formatMoney(rateRow?.H2022_Monthly_Rate),
      agreedRoomBoardAmountDefault: formatMoney(application?.expectedRoomBoardPayment || ''),
    };

    const warnings: string[] = [];
    if (!preview.authorizedRepEmail) warnings.push('Authorized representative email is missing.');
    if (!preview.rcfeName) warnings.push('RCFE name is missing from Caspio member record.');
    if (!preview.mcoAndTier) warnings.push('MCO_and_Tier is missing from Caspio member record.');
    if (!preview.assistedLivingDailyRate && !preview.assistedLivingMonthlyRate) {
      warnings.push('Rate row not found in CalAIM_tbl_MCO_RCFE_Rates for this MCO_and_Tier.');
    }

    return NextResponse.json({
      success: true,
      preview,
      warnings,
    });
  } catch (error: any) {
    console.error('[admin/room-board-agreement/preview] error', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to build agreement preview.' },
      { status: 500 }
    );
  }
}
