import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { adminAuth, adminDb, default as admin } from '@/firebase-admin';
import { getCaspioCredentialsFromEnv, getCaspioToken } from '@/lib/caspio-api-utils';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';
import { sendRoomBoardTierAgreementInviteEmail } from '@/app/actions/send-email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type InviteBody = {
  idToken?: string;
  applicationId?: string;
  userId?: string | null;
  rcfeSignerEmail?: string;
  rcfeSignerName?: string;
  agreedRoomBoardAmount?: string;
};

const clean = (value: unknown, max = 400) => String(value || '').trim().slice(0, max);
const normalizeEmail = (value: unknown) => clean(value, 320).toLowerCase();

const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

const base64UrlToken = (bytes = 32) =>
  crypto
    .randomBytes(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

async function canManageRoomBoardAgreement(idToken: string) {
  const decoded = await adminAuth.verifyIdToken(idToken);
  const uid = clean(decoded?.uid, 128);
  const email = normalizeEmail((decoded as any)?.email);
  if (!uid) return { ok: false as const, status: 401, error: 'Invalid token' };

  const hasAdminClaim = Boolean((decoded as any)?.admin) || Boolean((decoded as any)?.superAdmin);
  if (hasAdminClaim || isHardcodedAdminEmail(email)) {
    return { ok: true as const, uid, email };
  }

  const [adminRole, superAdminRole] = await Promise.all([
    adminDb.collection('roles_admin').doc(uid).get(),
    adminDb.collection('roles_super_admin').doc(uid).get(),
  ]);
  let isAdmin = adminRole.exists || superAdminRole.exists;
  if (!isAdmin && email) {
    const [emailAdminRole, emailSuperAdminRole] = await Promise.all([
      adminDb.collection('roles_admin').doc(email).get(),
      adminDb.collection('roles_super_admin').doc(email).get(),
    ]);
    isAdmin = emailAdminRole.exists || emailSuperAdminRole.exists;
  }
  if (!isAdmin) return { ok: false as const, status: 403, error: 'Unauthorized' };
  return { ok: true as const, uid, email };
}

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
  const memberSelect = [
    'Client_ID2',
    'Senior_First',
    'Senior_Last',
    'RCFE_Name',
    'MCO_and_Tier',
  ].join(',');
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
    const rateSelect = [
      'MCO',
      'Tier',
      'Daily_Rate',
      'H2022_Monthly_Rate',
      'T2038_Rate',
      'Unit_Rate',
      'Units',
    ].join(',');
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
    const body = (await req.json().catch(() => ({}))) as InviteBody;
    const idToken = clean(body?.idToken, 8000);
    const applicationId = clean(body?.applicationId, 200);
    const applicationUserId = clean(body?.userId, 200);
    const rcfeSignerEmailInput = normalizeEmail(body?.rcfeSignerEmail);
    const rcfeSignerNameInput = clean(body?.rcfeSignerName, 160);
    const agreedRoomBoardAmountInput = clean(body?.agreedRoomBoardAmount, 40);

    if (!idToken || !applicationId) {
      return NextResponse.json({ success: false, error: 'Missing required fields.' }, { status: 400 });
    }
    const authz = await canManageRoomBoardAgreement(idToken);
    if (!authz.ok) {
      return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
    }

    const refs = [];
    if (applicationUserId) {
      refs.push(adminDb.collection('users').doc(applicationUserId).collection('applications').doc(applicationId));
    }
    refs.push(adminDb.collection('applications').doc(applicationId));

    let applicationRef: FirebaseFirestore.DocumentReference | null = null;
    let application: Record<string, any> | null = null;
    for (const ref of refs) {
      const snap = await ref.get();
      if (snap.exists) {
        applicationRef = ref;
        application = (snap.data() || {}) as Record<string, any>;
        break;
      }
    }
    if (!applicationRef || !application) {
      return NextResponse.json({ success: false, error: 'Application not found.' }, { status: 404 });
    }

    const clientId2 = clean(
      application.client_ID2 || application.clientId2 || application.Client_ID2,
      120
    );
    if (!clientId2) {
      return NextResponse.json(
        { success: false, error: 'Cannot generate agreement: missing client_ID2.' },
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
    const mrn = clean(application.memberMrn, 80);

    const mcoAndTier = clean(member?.MCO_and_Tier, 120);
    const rcfeName = clean(member?.RCFE_Name || application?.rcfeName, 180);
    const assistedLivingDailyRate = formatMoney(rateRow?.Daily_Rate || rateRow?.Unit_Rate);
    const assistedLivingMonthlyRate = formatMoney(rateRow?.H2022_Monthly_Rate);
    const tierLevel = clean(rateRow?.Tier || '', 20);

    const memberRepEmail = getAuthorizedRepEmail(application);
    const memberRepName = getAuthorizedRepName(application);
    const rcfeSignerEmail = rcfeSignerEmailInput;
    const rcfeSignerName =
      rcfeSignerNameInput ||
      [clean(application?.rcfeAdminFirstName, 80), clean(application?.rcfeAdminLastName, 80)]
        .filter(Boolean)
        .join(' ')
        .trim() ||
      'RCFE Signer';

    if (!isValidEmail(memberRepEmail)) {
      return NextResponse.json(
        { success: false, error: 'No valid authorized representative email found on application.' },
        { status: 409 }
      );
    }
    if (!isValidEmail(rcfeSignerEmail)) {
      return NextResponse.json(
        { success: false, error: 'A valid RCFE signer email is required.' },
        { status: 400 }
      );
    }

    if (!agreedRoomBoardAmountInput) {
      return NextResponse.json(
        { success: false, error: 'Agreed room and board amount is required.' },
        { status: 400 }
      );
    }
    const agreedRoomBoardAmount = formatMoney(agreedRoomBoardAmountInput);

    const memberRepToken = base64UrlToken(32);
    const rcfeToken = base64UrlToken(32);
    const memberRepTokenHash = sha256(memberRepToken);
    const rcfeTokenHash = sha256(rcfeToken);

    const requestRef = adminDb.collection('room_board_agreement_requests').doc();
    const requestId = clean(requestRef.id, 200);
    const nowTs = admin.firestore.FieldValue.serverTimestamp();

    await requestRef.set({
      requestId,
      createdAt: nowTs,
      updatedAt: nowTs,
      status: 'invited',
      applicationId,
      applicationUserId: applicationUserId || null,
      clientId2,
      memberName,
      mrn: mrn || null,
      rcfeName: rcfeName || null,
      mcoAndTier: mcoAndTier || null,
      tierLevel: tierLevel || null,
      assistedLivingDailyRate: assistedLivingDailyRate || null,
      assistedLivingMonthlyRate: assistedLivingMonthlyRate || null,
      agreedRoomBoardAmount: agreedRoomBoardAmount || null,
      signers: {
        memberRep: {
          email: memberRepEmail,
          name: memberRepName,
          tokenHash: memberRepTokenHash,
          requestedAt: nowTs,
          signedAt: null,
          signedName: null,
          relationship: null,
          phone: null,
          signatureStoragePath: null,
        },
        rcfe: {
          email: rcfeSignerEmail,
          name: rcfeSignerName,
          tokenHash: rcfeTokenHash,
          requestedAt: nowTs,
          signedAt: null,
          signedName: null,
          title: null,
          phone: null,
          address: null,
          signatureStoragePath: null,
        },
      },
      audit: {
        invitedByUid: authz.uid,
        invitedByEmail: authz.email || null,
      },
    });

    await applicationRef.set(
      {
        roomBoardTierAgreement: {
          requestId,
          status: 'invited',
          invitedAt: nowTs,
          memberRepEmail,
          rcfeSignerEmail,
          rcfeName: rcfeName || null,
          mcoAndTier: mcoAndTier || null,
          tierLevel: tierLevel || null,
          assistedLivingDailyRate: assistedLivingDailyRate || null,
          assistedLivingMonthlyRate: assistedLivingMonthlyRate || null,
          agreedRoomBoardAmount: agreedRoomBoardAmount || null,
        },
        lastUpdated: nowTs,
      },
      { merge: true }
    );

    const memberSignUrl = `/agreement-sign/${encodeURIComponent(memberRepToken)}`;
    const rcfeSignUrl = `/agreement-sign/${encodeURIComponent(rcfeToken)}`;

    const [memberInviteResult, rcfeInviteResult] = await Promise.all([
      sendRoomBoardTierAgreementInviteEmail({
        to: memberRepEmail,
        recipientName: memberRepName || 'Authorized Representative',
        recipientRoleLabel: 'Member/Authorized Representative',
        memberName,
        mrn: mrn || undefined,
        rcfeName: rcfeName || undefined,
        mcoAndTier: mcoAndTier || undefined,
        assistedLivingDailyRate: assistedLivingDailyRate || undefined,
        assistedLivingMonthlyRate: assistedLivingMonthlyRate || undefined,
        agreedRoomBoardAmount: agreedRoomBoardAmount || undefined,
        signUrl: memberSignUrl,
      }).catch(() => null),
      sendRoomBoardTierAgreementInviteEmail({
        to: rcfeSignerEmail,
        recipientName: rcfeSignerName || 'RCFE Signer',
        recipientRoleLabel: 'RCFE',
        memberName,
        mrn: mrn || undefined,
        rcfeName: rcfeName || undefined,
        mcoAndTier: mcoAndTier || undefined,
        assistedLivingDailyRate: assistedLivingDailyRate || undefined,
        assistedLivingMonthlyRate: assistedLivingMonthlyRate || undefined,
        agreedRoomBoardAmount: agreedRoomBoardAmount || undefined,
        signUrl: rcfeSignUrl,
      }).catch(() => null),
    ]);

    return NextResponse.json({
      success: true,
      requestId,
      status: 'invited',
      memberRepEmail,
      rcfeSignerEmail,
      rcfeName,
      mcoAndTier,
      tierLevel,
      assistedLivingDailyRate,
      assistedLivingMonthlyRate,
      agreedRoomBoardAmount,
      emailsSent: {
        memberRep: Boolean(memberInviteResult),
        rcfe: Boolean(rcfeInviteResult),
      },
    });
  } catch (error: any) {
    console.error('[admin/room-board-agreement/invite] error', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to create room and board agreement invites.' },
      { status: 500 }
    );
  }
}
