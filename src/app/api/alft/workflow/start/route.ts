import { NextRequest, NextResponse } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';
import { fetchCaspioSocialWorkers, getCaspioCredentialsFromEnv, getCaspioToken } from '@/lib/caspio-api-utils';
import { sendAlftWorkflowStartEmail } from '@/app/actions/send-email';
import { getRcfeLocationSnapshot } from '@/lib/isp-visit-location';
import { sanitizeRelationshipLabel } from '@/lib/sanitize-relationship-label';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  idToken?: string;
  overrideRecipientEmail?: string;
  customEmailBody?: string;
  member?: {
    id?: string;
    memberName?: string;
    memberFirstName?: string;
    memberLastName?: string;
    memberMrn?: string;
    birthDate?: string;
    memberSex?: string;
    memberPrimaryLanguage?: string;
    memberPhone?: string;
    ispCurrentAddressStreet?: string;
    ispCurrentAddressCity?: string;
    ispCurrentAddressState?: string;
    ispCurrentAddressZip?: string;
    currentLocationType?: string;
    currentLocationTypeOther?: string;
    assessmentSite?: string;
    homeAddressStreet?: string;
    homeAddressCity?: string;
    homeAddressState?: string;
    homeAddressZip?: string;
    ispFacilityName?: string;
    kaiserStatus?: string;
    ispCurrentLocation?: string;
    ispContactPhone?: string;
    ispContactEmail?: string;
    ispContact2First?: string;
    ispContact2Last?: string;
    ispContact2Relationship?: string;
    ispContact2Email?: string;
    ispContact2Phone?: string;
    ispContactConfirmDate?: string;
    ispContactName?: string;
    ispContactRelationship?: string;
    otherResponder?: string;
    otherResponderName?: string;
    otherResponderRelationship?: string;
    swId?: string;
    socialWorkerAssigned?: string;
    assignedSwEmail?: string;
    prefillSourceMode?: 'cs_summary_app' | 'caspio_selected_fields' | string;
    prefillPurpose?: 'initial' | 'change_condition' | 'review' | string;
    visitLocationSource?: 'rcfe' | 'isp_location' | string;
    askCaregiverOnArrival?: boolean;
    caspioSourceRecord?: Record<string, unknown>;
  };
};

const clean = (v: unknown, max = 400) => String(v ?? '').trim().slice(0, max);
const cleanLower = (v: unknown, max = 120) => clean(v, max).toLowerCase();
const formatSocialWorkerName = (raw: unknown) => {
  let value = clean(raw, 180).replace(/\s+\d+$/, '').trim();
  if (!value) return '';
  if (value.includes(',')) {
    const [last, first] = value.split(',', 2).map((part) => clean(part, 120));
    value = `${first || ''} ${last || ''}`.trim();
  }
  return value
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .split(' ')
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : ''))
    .join(' ')
    .trim();
};
const normalizeMemberName = (input: { first?: unknown; last?: unknown; full?: unknown }) => {
  const first = clean(input.first, 120).replace(/\s+\d+$/, '').trim();
  const last = clean(input.last, 120).replace(/\s+\d+$/, '').trim();
  if (first || last) return `${first} ${last}`.trim();
  const full = clean(input.full, 220);
  if (!full) return '';
  if (full.includes(',')) {
    const [ln, fn] = full.split(',', 2).map((part) => clean(part, 120).replace(/\s+\d+$/, '').trim());
    return `${fn || ''} ${ln || ''}`.trim();
  }
  return full.replace(/\s+\d+$/, '').trim();
};
const pickFirst = (row: Record<string, any> | null | undefined, keys: string[]) => {
  const source = row || {};
  for (const key of keys) {
    const value = clean(source[key], 500);
    if (value) return value;
  }
  return '';
};

async function findApplicationByClientId(adminDb: any, memberId: string) {
  const variants = ['client_ID2', 'clientId2', 'Client_ID2', 'caspioClientId2'];
  const snaps = await Promise.all(
    variants.map((field) => adminDb.collection('applications').where(field, '==', memberId).limit(5).get())
  );
  const docs = snaps.flatMap((s: any) => s.docs || []);
  if (!docs.length) return null;
  const sorted = docs.sort((a: any, b: any) => {
    const aMs = new Date(String((a.data() as any)?.updatedAt || (a.data() as any)?.createdAt || 0)).getTime() || 0;
    const bMs = new Date(String((b.data() as any)?.updatedAt || (b.data() as any)?.createdAt || 0)).getTime() || 0;
    return bMs - aMs;
  });
  const latest = sorted[0];
  return { id: clean(latest?.id, 160), data: (latest?.data() || {}) as Record<string, any> };
}

async function fetchCaspioMemberByClientId(params: {
  memberId: string;
  credentials: { baseUrl: string; clientId: string; clientSecret: string };
  fieldNames: string[];
}) {
  const { memberId, credentials, fieldNames } = params;
  const accessToken = await getCaspioToken(credentials);
  const escapedMemberId = String(memberId || '').replace(/'/g, "''");
  const whereCandidates = [`Client_ID2='${escapedMemberId}'`, `client_ID2='${escapedMemberId}'`];
  for (const where of whereCandidates) {
    const url = `${credentials.baseUrl}/integrations/rest/v3/tables/CalAIM_tbl_Members/records` +
      `?q.where=${encodeURIComponent(where)}` +
      `&q.select=${encodeURIComponent('*')}` +
      `&q.limit=1`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });
    if (!res.ok) continue;
    const data = (await res.json().catch(() => ({}))) as any;
    const rows = Array.isArray(data?.Result) ? data.Result : [];
    if (rows.length > 0) return rows[0] as Record<string, unknown>;
  }
  return null;
}

function resolveMappedCaspioPrefill(
  mappingRows: Record<string, { primary?: string; fallbacks?: string[] }>,
  sourceRecord: Record<string, unknown>,
  fallbackFromMember: Record<string, string>
) {
  const source = sourceRecord || {};
  const sourceRaw = (((sourceRecord as any) || {}).caspioRaw || {}) as Record<string, unknown>;
  const HARD_HOME_MAPPING: Record<string, string | string[]> = {
    p2_home_street: ['Normal_Housing_Address', 'Normal_Housing_Street'],
    p2_home_city: 'Normal_Housing_City',
    p2_home_state: 'Normal_Housing_State',
    p2_home_zip: 'Normal_Housing_Zip',
  };
  const getCaseInsensitive = (obj: Record<string, unknown>, key: string) => {
    const direct = obj[key];
    if (direct !== undefined && direct !== null) return direct;
    const wanted = String(key || '').trim().toLowerCase();
    if (!wanted) return undefined;
    const hit = Object.keys(obj).find((k) => String(k || '').trim().toLowerCase() === wanted);
    return hit ? obj[hit] : undefined;
  };
  const getFromSources = (key: string) => {
    const fromPrimary = getCaseInsensitive(source as Record<string, unknown>, key);
    if (fromPrimary !== undefined && fromPrimary !== null) return fromPrimary;
    const fromRaw = getCaseInsensitive(sourceRaw, key);
    if (fromRaw !== undefined && fromRaw !== null) return fromRaw;
    return undefined;
  };
  const resolveAliasToken = (raw: unknown, depth = 0): string => {
    const text = clean(raw, 500);
    if (!text) return '';
    if (depth > 4) return text;
    const token = text.match(/^\[@field:([^\]]+)\]$/i);
    if (!token) return text;
    const nextRaw = getFromSources(token[1]);
    if (nextRaw === undefined || nextRaw === null) return '';
    return resolveAliasToken(nextRaw, depth + 1);
  };
  const getMapped = (alftField: string) => {
    const row = mappingRows?.[alftField] || {};
    const forced = HARD_HOME_MAPPING[alftField];
    const forcedCandidates = Array.isArray(forced)
      ? forced.map((f) => clean(f, 200)).filter(Boolean)
      : [clean(forced, 200)].filter(Boolean);
    const candidates = [
      ...forcedCandidates,
      clean(row?.primary, 200),
      ...((row?.fallbacks || []).map((f) => clean(f, 200))),
    ].filter(Boolean);
    for (const fieldName of candidates) {
      const raw = getFromSources(fieldName);
      const value = resolveAliasToken(raw);
      if (value) return value;
    }
    return '';
  };

  const getRawMcpCin = () => {
    const raw = clean(getFromSources('MCP_CIN') || getFromSources('MCP CIN'), 120);
    if (!raw) return '';
    return resolveAliasToken(raw);
  };
  const mcpCin = getRawMcpCin();

  return {
    alftPlanId: mcpCin || getMapped('p1_plan_id'),
    memberName: getMapped('p1_member_name'),
    memberFirstName: getMapped('p1_first_name'),
    memberLastName: getMapped('p1_last_name'),
    memberMrn: mcpCin || getMapped('p1_mrn'),
    birthDate: getMapped('p1_dob'),
    memberSex: getMapped('p1_sex'),
    memberPrimaryLanguage: getMapped('p1_primary_language'),
    memberPhone: getMapped('p1_phone'),
    ispFacilityName: getMapped('p2_facility_name'),
    ispCurrentAddressStreet: getMapped('p2_current_street'),
    ispCurrentAddressCity: getMapped('p2_current_city'),
    ispCurrentAddressState: getMapped('p2_current_state'),
    ispCurrentAddressZip: getMapped('p2_current_zip'),
    currentLocationType: getMapped('p2_current_type'),
    currentLocationTypeOther: getMapped('p2_current_type_other'),
    assessmentSite: getMapped('p2_assessment_site'),
    otherResponder: getMapped('p1_other_responder'),
    otherResponderName: getMapped('p1_other_responder_name'),
    otherResponderRelationship: getMapped('p1_other_responder_relationship'),
    homeAddressStreet: getMapped('p2_home_street'),
    homeAddressCity: getMapped('p2_home_city'),
    homeAddressState: getMapped('p2_home_state'),
    homeAddressZip: getMapped('p2_home_zip'),
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const idToken = clean(body?.idToken, 12000);
    const overrideRecipientEmail = clean(body?.overrideRecipientEmail, 220).toLowerCase();
    const customEmailBody = clean(body?.customEmailBody, 20000);
    const member = body?.member || {};
    const memberId = clean(member?.id, 200);
    if (!idToken) return NextResponse.json({ success: false, error: 'Missing idToken' }, { status: 400 });
    if (!memberId) return NextResponse.json({ success: false, error: 'Missing member.id' }, { status: 400 });

    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;
    const adminDb = adminModule.adminDb;
    const adminAuth = adminModule.adminAuth;

    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = clean(decoded?.uid, 128);
    const email = clean((decoded as any)?.email, 220).toLowerCase();
    const displayName = clean((decoded as any)?.name, 160) || email || 'Admin';
    if (!uid) return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 });
    let senderPhone = '';
    try {
      const senderSnap = await adminDb.collection('users').doc(uid).get();
      const senderData = senderSnap.exists ? (senderSnap.data() as Record<string, unknown>) : {};
      senderPhone = clean(
        (senderData as any)?.phone ||
          (senderData as any)?.phoneNumber ||
          (senderData as any)?.staffPhone ||
          (senderData as any)?.mobilePhone,
        80
      );
    } catch {
      senderPhone = '';
    }

    let isAdmin = Boolean((decoded as any)?.admin) || Boolean((decoded as any)?.superAdmin);
    if (!isAdmin && isHardcodedAdminEmail(email)) isAdmin = true;
    if (!isAdmin) {
      const [adminRole, superAdminRole] = await Promise.all([
        adminDb.collection('roles_admin').doc(uid).get(),
        adminDb.collection('roles_super_admin').doc(uid).get(),
      ]);
      isAdmin = adminRole.exists || superAdminRole.exists;
    }
    if (!isAdmin) {
      return NextResponse.json({ success: false, error: 'Admin access required to start ALFT workflow.' }, { status: 403 });
    }

    const swId = clean(member?.swId, 80).toLowerCase();
    const swName = formatSocialWorkerName(member?.socialWorkerAssigned);
    const rawAssignedSwEmail = clean(member?.assignedSwEmail, 220).toLowerCase();
    const isUsableSwEmail = (email: string) =>
      Boolean(email) &&
      email.includes('@') &&
      !email.endsWith('@example.com') &&
      !email.endsWith('@example.org') &&
      !email.endsWith('@test.com');
    const directAssignedSwEmail = isUsableSwEmail(rawAssignedSwEmail) ? rawAssignedSwEmail : '';
    if (!swId && !swName && !directAssignedSwEmail) {
      return NextResponse.json(
        { success: false, error: 'Member is missing SW assignment details (SW_ID, Social_Worker_Assigned, and assigned SW email).' },
        { status: 409 }
      );
    }

    // Prefer CalAIM_tbl_Social_Worker.SW_email over any client-provided address.
    let swEmail = '';
    let caspioStaff: Array<{ sw_id?: string; email?: string; name?: string }> = [];
    try {
      if (swId || swName) {
        const credentials = getCaspioCredentialsFromEnv();
        const staff = await fetchCaspioSocialWorkers(credentials, { includeAssignmentCounts: false });
        caspioStaff = (staff || []) as Array<{ sw_id?: string; email?: string; name?: string }>;
        const normalizedSwName = formatSocialWorkerName(swName);
        let match = staff.find((s) => clean((s as any)?.sw_id, 80).toLowerCase() === swId);
        if (!match && normalizedSwName) {
          const byName = staff.filter((s) => formatSocialWorkerName((s as any)?.name) === normalizedSwName);
          if (byName.length === 1) match = byName[0];
        }
        const caspioEmail = clean((match as any)?.email, 220).toLowerCase();
        if (isUsableSwEmail(caspioEmail)) swEmail = caspioEmail;
      }
    } catch {
      // best-effort only
    }
    if (!swEmail) swEmail = directAssignedSwEmail;

    // Fallback: try SW management docs in Firestore if Caspio lookup didn't yield an email.
    if (!swEmail) {
      try {
        if (swId) {
          const bySwIdLower = await adminDb.collection('socialWorkers').where('sw_id', '==', swId).limit(1).get();
          if (!bySwIdLower.empty) swEmail = clean((bySwIdLower.docs[0]?.data() as any)?.email, 220).toLowerCase();
        }
        if (!swEmail && swId) {
          const bySwIdUpper = await adminDb.collection('socialWorkers').where('SW_ID', '==', swId).limit(1).get();
          if (!bySwIdUpper.empty) swEmail = clean((bySwIdUpper.docs[0]?.data() as any)?.email, 220).toLowerCase();
        }
      } catch {
        // ignore fallback lookup failures
      }
    }

    // Last-resort fallback: match by normalized SW name within Caspio social worker roster.
    if (!swEmail && swName && caspioStaff.length > 0) {
      const normalizedSwName = formatSocialWorkerName(swName);
      if (normalizedSwName) {
        const byName = caspioStaff.filter((s) => formatSocialWorkerName((s as any)?.name) === normalizedSwName);
        if (byName.length === 1) {
          swEmail = clean((byName[0] as any)?.email, 220).toLowerCase();
        }
      }
    }

    const recipientEmail = overrideRecipientEmail || swEmail;

    // Try to resolve SW user by email or SW_ID for in-app notifications.
    let swUid = '';
    try {
      if (!overrideRecipientEmail && swEmail) {
        const byEmail = await adminDb.collection('users').where('email', '==', swEmail).limit(1).get();
        if (!byEmail.empty) swUid = clean(byEmail.docs[0]?.id, 128);
      }
      if (!swUid && swId) {
        const bySwIdLower = await adminDb.collection('users').where('sw_id', '==', swId).limit(1).get();
        if (!bySwIdLower.empty) swUid = clean(bySwIdLower.docs[0]?.id, 128);
      }
      if (!swUid && swId) {
        const bySwIdUpper = await adminDb.collection('users').where('SW_ID', '==', swId).limit(1).get();
        if (!bySwIdUpper.empty) swUid = clean(bySwIdUpper.docs[0]?.id, 128);
      }
    } catch {
      // ignore lookup failures
    }

    const memberName =
      clean(member?.memberName, 180) ||
      clean(`${clean(member?.memberFirstName, 80)} ${clean(member?.memberLastName, 80)}`, 180) ||
      'Member';
    const memberMrn = clean(member?.memberMrn, 80);
    const prefillSourceMode = cleanLower(member?.prefillSourceMode, 60) === 'cs_summary_app'
      ? 'cs_summary_app'
      : 'caspio_selected_fields';
    const rawPrefillPurpose = cleanLower(member?.prefillPurpose, 60);
    const prefillPurpose =
      rawPrefillPurpose === 'initial' || rawPrefillPurpose === 'change_condition' || rawPrefillPurpose === 'review'
        ? rawPrefillPurpose
        : '';
    if (!prefillPurpose) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Purpose of this assessment is required before inviting the social worker. Set Initial, Change of Condition, or Review in ISP Workflow (step 4).',
        },
        { status: 400 }
      );
    }
    const rawVisitLocationSource = cleanLower(member?.visitLocationSource, 40);
    const visitLocationSource =
      rawVisitLocationSource === 'rcfe' || rawVisitLocationSource === 'isp_location'
        ? rawVisitLocationSource
        : '';
    const askCaregiverOnArrival = Boolean(member?.askCaregiverOnArrival);
    const fallbackFromMember = {
      memberName: normalizeMemberName({
        first: member?.memberFirstName,
        last: member?.memberLastName,
        full: memberName,
      }),
      memberFirstName: clean(member?.memberFirstName, 80),
      memberLastName: clean(member?.memberLastName, 80),
      memberMrn,
      birthDate: clean(member?.birthDate, 80),
      memberSex: clean(member?.memberSex, 80),
      memberPrimaryLanguage: clean(member?.memberPrimaryLanguage, 120),
      memberPhone: clean(member?.memberPhone, 80) || clean(member?.ispContactPhone, 80),
      ispFacilityName: clean(member?.ispFacilityName, 240) || clean(member?.ispCurrentLocation, 240),
      ispCurrentLocation: clean(member?.ispCurrentLocation, 240) || clean(member?.ispFacilityName, 240),
      ispContactName: clean(member?.ispContactName, 180),
      ispContactRelationship: clean(member?.ispContactRelationship, 180),
      otherResponder: clean(member?.otherResponder, 10),
      otherResponderName: clean(member?.otherResponderName, 180),
      otherResponderRelationship: clean(member?.otherResponderRelationship, 180),
      ispContactPhone: clean(member?.ispContactPhone, 80) || clean(member?.memberPhone, 80),
      ispContactEmail: clean(member?.ispContactEmail, 200),
      ispContactConfirmDate: clean(member?.ispContactConfirmDate, 120),
      ispCurrentAddressStreet: clean(member?.ispCurrentAddressStreet, 240),
      ispCurrentAddressCity: clean(member?.ispCurrentAddressCity, 120),
      ispCurrentAddressState: clean(member?.ispCurrentAddressState, 50),
      ispCurrentAddressZip: clean(member?.ispCurrentAddressZip, 30),
      currentLocationType: '',
      currentLocationTypeOther: '',
      assessmentSite: '',
      homeAddressStreet: '',
      homeAddressCity: '',
      homeAddressState: clean(member?.homeAddressState, 50) || 'CA',
      homeAddressZip: '',
    };

    let mappingRows: Record<string, { primary?: string; fallbacks?: string[] }> = {};
    try {
      const mappingSnap = await adminDb.collection('admin-settings').doc('alft-caspio-field-mapping').get();
      const mappingData = mappingSnap.exists ? (mappingSnap.data() as any) : {};
      mappingRows = (mappingData?.rows || {}) as Record<string, { primary?: string; fallbacks?: string[] }>;
    } catch {
      mappingRows = {};
    }

    const caspioSourceRecord =
      member && typeof (member as any).caspioSourceRecord === 'object' && (member as any).caspioSourceRecord
        ? ((member as any).caspioSourceRecord as Record<string, unknown>)
        : {};
    let liveMappedSource: Record<string, unknown> | null = null;
    try {
      const credentials = getCaspioCredentialsFromEnv();
      const mappedFields = Object.values(mappingRows || {})
        .map((r: any) => clean(r?.primary, 200))
        .filter(Boolean);
      const forcedHome = ['Normal_Housing_Address', 'Normal_Housing_Street', 'Normal_Housing_City', 'Normal_Housing_State', 'Normal_Housing_Zip'];
      liveMappedSource = await fetchCaspioMemberByClientId({
        memberId,
        credentials,
        fieldNames: [...mappedFields, ...forcedHome, 'MemberCity', 'Member_City', 'City', 'State', 'Zip'],
      });
    } catch {
      liveMappedSource = null;
    }
    const caspioResolved = resolveMappedCaspioPrefill(
      mappingRows,
      (liveMappedSource || caspioSourceRecord || {}) as Record<string, unknown>,
      fallbackFromMember
    );

    let csSummaryResolved: Record<string, string> = {};
    let csSummaryApplicationId = '';
    if (prefillSourceMode === 'cs_summary_app') {
      try {
        const app = await findApplicationByClientId(adminDb, memberId);
        if (app?.data) {
          csSummaryApplicationId = clean(app.id, 160);
          const appData = app.data;
          csSummaryResolved = {
            memberName: pickFirst(appData, ['memberName']) || [
              pickFirst(appData, ['memberFirstName', 'Member_First_Name']),
              pickFirst(appData, ['memberLastName', 'Member_Last_Name']),
            ].filter(Boolean).join(' ').trim(),
            memberFirstName: pickFirst(appData, ['memberFirstName', 'Member_First_Name']),
            memberLastName: pickFirst(appData, ['memberLastName', 'Member_Last_Name']),
            memberMrn: pickFirst(appData, ['memberMrn', 'MCP_CIN', 'Member_MRN']),
            alftPlanId: pickFirst(appData, ['memberMrn', 'MCP_CIN', 'Member_MRN']),
            birthDate: pickFirst(appData, ['memberDob', 'Birth_Date']),
            memberSex: pickFirst(appData, ['sex', 'memberSex', 'Gender']),
            memberPrimaryLanguage: pickFirst(appData, ['memberLanguage', 'Primary_Language', 'Language']),
            memberPhone: pickFirst(appData, ['memberPhone', 'contactPhone', 'bestContactPhone']),
            ispFacilityName: pickFirst(appData, ['ispFacilityName', 'currentLocation', 'RCFE_Name']),
            ispCurrentAddressStreet: pickFirst(appData, ['currentAddress', 'ispAddress', 'memberAddress']),
            ispCurrentAddressCity: pickFirst(appData, ['currentCity', 'ispCity', 'memberCity']),
            ispCurrentAddressState: pickFirst(appData, ['currentState', 'ispState', 'memberState']),
            ispCurrentAddressZip: pickFirst(appData, ['currentZip', 'ispZip', 'memberZip']),
            currentLocationType: pickFirst(appData, ['whereLiving', 'Where_Living']),
            assessmentSite: pickFirst(appData, ['assessment', 'Assessment']),
            homeAddressStreet: pickFirst(appData, ['normalHousingStreet', 'Normal_Housing_Street', 'normalHousingAddress', 'Normal_Housing_Address', 'memberAddress']),
            homeAddressCity: pickFirst(appData, ['normalHousingCity', 'City', 'memberCity']),
            homeAddressState: pickFirst(appData, ['normalHousingState', 'State', 'memberState']) || 'CA',
            homeAddressZip: pickFirst(appData, ['normalHousingZip', 'Zip', 'memberZip']),
          };
        }
      } catch {
        csSummaryResolved = {};
      }
    }

    const resolved =
      prefillSourceMode === 'cs_summary_app'
        ? {
            ...fallbackFromMember,
            ...csSummaryResolved,
          }
        : {
            ...fallbackFromMember,
            ...caspioResolved,
          };
    const resolvedMemberName = clean(
      normalizeMemberName({
        first: resolved.memberFirstName,
        last: resolved.memberLastName,
        full: resolved.memberName || memberName,
      }) || memberName,
      180
    );
    const resolvedMemberMrn = clean(resolved.memberMrn || memberMrn, 80);
    const caspioSource = ((liveMappedSource || caspioSourceRecord || {}) as Record<string, unknown>) || {};
    const caspioContactFirst = pickFirst(caspioSource as any, ['ISP_Contact_First']);
    const caspioContactLast = pickFirst(caspioSource as any, ['ISP_Contact_Last']);
    const caspioContactName = [
      clean(caspioContactFirst, 120),
      clean(caspioContactLast, 120),
    ]
      .filter(Boolean)
      .join(' ')
      .trim();
    const ispContactName = clean(
      caspioContactName ||
        pickFirst(caspioSource as any, ['ISP_Contact_Name', 'RCFE_Admin_Name', 'Contact_Name']) ||
        (resolved as any).ispContactName ||
        member?.ispContactName,
      180
    );
    const ispContactRelationship = sanitizeRelationshipLabel(
      clean(
        pickFirst(caspioSource as any, ['ISP_Contact_Relationship', 'Contact_Relationship']) ||
          (resolved as any).otherResponderRelationship ||
          (resolved as any).ispContactRelationship ||
          member?.otherResponderRelationship ||
          member?.ispContactRelationship,
        180
      )
    );
    const otherResponderName = clean(
      (resolved as any).otherResponderName || member?.otherResponderName || ispContactName,
      180
    );
    const otherResponderRelationship = sanitizeRelationshipLabel(
      clean(
        (resolved as any).otherResponderRelationship ||
          member?.otherResponderRelationship ||
          ispContactRelationship,
        180
      )
    );
    const otherResponderRaw = clean(
      (resolved as any).otherResponder || member?.otherResponder,
      10
    ).toLowerCase();
    const otherResponder = otherResponderRaw === 'yes' || otherResponderRaw === 'no'
      ? otherResponderRaw
      : (otherResponderName || otherResponderRelationship ? 'yes' : 'no');
    const ispLocation = clean(
      pickFirst(caspioSource as any, ['ISP_Contact_Location']) ||
        (resolved as any).ispCurrentLocation ||
        (resolved as any).ispFacilityName ||
        member?.ispCurrentLocation,
      240
    );
    const facilityType = clean(
      pickFirst(caspioSource as any, ['ISP_Location_Type']) ||
        (resolved as any).currentLocationType ||
        member?.currentLocationType,
      120
    );
    const facilityName = clean(
      pickFirst(caspioSource as any, ['ISP_Contact_Location']) ||
        (resolved as any).ispFacilityName ||
        member?.ispFacilityName,
      240
    );
    const currentLocationTypeOther = clean(
      (resolved as any).currentLocationTypeOther ||
        member?.currentLocationTypeOther ||
        facilityType,
      120
    );
    const caspioStreet = clean(pickFirst(caspioSource as any, ['ISP_Contact_Address']), 240);
    const caspioCity = clean(pickFirst(caspioSource as any, ['ISP_Contact_City']), 120);
    const caspioState = clean(pickFirst(caspioSource as any, ['ISP_Contact_State']), 50);
    const caspioZip = clean(pickFirst(caspioSource as any, ['ISP_Contact_Zip']), 30);
    const caspioAddress = clean(
      [caspioStreet, caspioCity, caspioState, caspioZip].filter(Boolean).join(', '),
      400
    );
    const ispAddress = clean(
      caspioAddress ||
        [
          resolved.ispCurrentAddressStreet,
          resolved.ispCurrentAddressCity,
          resolved.ispCurrentAddressState,
          resolved.ispCurrentAddressZip,
        ]
          .map((x) => clean(x, 120))
          .filter(Boolean)
          .join(', '),
      400
    );
    const ispContactPhone = clean(
      pickFirst(caspioSource as any, ['ISP_Contact_Phone']) ||
        (resolved as any).ispContactPhone ||
        member?.ispContactPhone,
      80
    );
    const ispContactEmail = clean(
      pickFirst(caspioSource as any, ['ISP_Contact_Email', 'Member_Email']) ||
        (resolved as any).ispContactEmail ||
        member?.ispContactEmail,
      220
    ).toLowerCase();
    const ispContactConfirmDate = clean(
      pickFirst(caspioSource as any, ['ISP_Contact_Confirm_Field', 'ISP_Contact_Confirm_Date', 'ISP_Contact_Confirm', 'ISP_Confirm_Date']) ||
        (resolved as any).ispContactConfirmDate ||
        member?.ispContactConfirmDate,
      120
    );
    const ispContact2First = clean(
      pickFirst(caspioSource as any, ['ISP_Contact_2_First']) || member?.ispContact2First,
      120
    );
    const ispContact2Last = clean(
      pickFirst(caspioSource as any, ['ISP_Contact_2_Last']) || member?.ispContact2Last,
      120
    );
    const ispContact2Relationship = clean(
      pickFirst(caspioSource as any, ['ISP_Contact_2_Relationship']) || member?.ispContact2Relationship,
      180
    );
    const ispContact2Phone = clean(
      pickFirst(caspioSource as any, ['ISP_Contact_2_Phone']) || member?.ispContact2Phone,
      80
    );
    const ispContact2Email = clean(
      pickFirst(caspioSource as any, ['ISP_Contact_2_Email']) || member?.ispContact2Email,
      220
    ).toLowerCase();
    const hasIspContactPhone = Boolean(ispContactPhone);
    const hasFacilityTypeOrName = Boolean(facilityType || facilityName || ispLocation);
    const missingIspFields = [
      !ispAddress ? 'ISP address' : '',
      !hasFacilityTypeOrName ? 'Facility type or facility name' : '',
      !hasIspContactPhone
        ? 'ISP contact phone (Caspio ISP_Contact_Phone — RCFE front desk phone is OK)'
        : '',
    ].filter(Boolean);
    if (missingIspFields.length > 0) {
      return NextResponse.json(
        { success: false, error: `Missing required ISP contact fields: ${missingIspFields.join(', ')}` },
        { status: 409 }
      );
    }

    const assignmentRef = adminDb.collection('alft_assignments').doc(memberId);
    const existingAssignmentSnap = await assignmentRef.get();
    const existingAssignment = existingAssignmentSnap.exists ? ((existingAssignmentSnap.data() as Record<string, unknown>) || {}) : {};
    const existingDeliveryLogs = Array.isArray((existingAssignment as any)?.swEmailDeliveryLog)
      ? (((existingAssignment as any).swEmailDeliveryLog as any[]) || [])
      : [];
    const isResendAttempt = existingDeliveryLogs.some((entry: any) => String(entry?.status || '').toLowerCase() === 'sent');
    const existingInvitedAt = (existingAssignment as any)?.workflowInvites?.invitedAt || null;
    const existingFirstInvitedAt =
      (existingAssignment as any)?.workflowInvites?.firstInvitedAt ||
      existingInvitedAt ||
      (existingAssignment as any)?.workflowStepsAt?.swInviteSentAt ||
      null;
    const existingInviteSendCount = Number((existingAssignment as any)?.workflowInvites?.inviteSendCount);
    const nextInviteSendCount =
      (Number.isFinite(existingInviteSendCount) && existingInviteSendCount > 0
        ? existingInviteSendCount
        : existingDeliveryLogs.filter((entry: any) => String(entry?.status || '').toLowerCase() === 'sent')
            .length) + 1;

    // Assessor/CM Referral Date = date invite was sent to SW (keep first send on resend).
    const toYmd = (value: unknown) => {
      const raw = clean(value, 40);
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
      const ms =
        value && typeof (value as any)?.toDate === 'function'
          ? (value as any).toDate().getTime()
          : Date.parse(String(value || ''));
      if (!Number.isFinite(ms) || ms <= 0) return '';
      const dt = new Date(ms);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    };
    const now = new Date();
    const todayYmd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const swInviteDateYmd =
      toYmd((existingAssignment as any)?.assessorCmReferralDate) ||
      toYmd((existingAssignment as any)?.workflowInvites?.referralDateYmd) ||
      toYmd((existingAssignment as any)?.workflowInvites?.invitedAt) ||
      toYmd((existingAssignment as any)?.workflowStepsAt?.swInviteSentAt) ||
      todayYmd;

    const assignmentDoc: Record<string, any> = {
      memberId,
      memberName: resolvedMemberName,
      memberFirstName: clean(resolved.memberFirstName, 80),
      memberLastName: clean(resolved.memberLastName, 80),
      memberMrn: resolvedMemberMrn,
      alftPlanId: clean(resolvedMemberMrn || (resolved as any).alftPlanId, 80),
      birthDate: clean(resolved.birthDate, 80),
      memberSex: clean(resolved.memberSex, 80),
      memberPrimaryLanguage: clean(resolved.memberPrimaryLanguage, 120),
      memberPhone: clean(resolved.memberPhone, 80),
      ispCurrentAddressStreet: caspioStreet,
      ispCurrentAddressCity: caspioCity,
      ispCurrentAddressState: caspioState || 'CA',
      ispCurrentAddressZip: caspioZip,
      currentLocationType: clean((resolved as any).currentLocationType, 80),
      currentLocationTypeOther: clean((resolved as any).currentLocationTypeOther, 120),
      assessmentSite: clean((resolved as any).assessmentSite, 80),
      homeAddressStreet: clean((resolved as any).homeAddressStreet, 240),
      homeAddressCity: clean((resolved as any).homeAddressCity, 120),
      homeAddressState: clean((resolved as any).homeAddressState, 50) || 'CA',
      homeAddressZip: clean((resolved as any).homeAddressZip, 30),
      ispFacilityName: clean(resolved.ispFacilityName, 240),
      ispCurrentLocation: ispLocation,
      currentLocationType: facilityType,
      currentLocationTypeOther,
      ispContactName,
      ispContactRelationship,
      ispContactPhone,
      ispContactEmail,
      ispContact2First,
      ispContact2Last,
      ispContact2Relationship,
      ispContact2Phone,
      ispContact2Email,
      ispContactConfirmDate,
      kaiserStatus: clean(member?.kaiserStatus, 120),
      prefillSourceMode,
      prefillSourceLabel:
        prefillSourceMode === 'cs_summary_app'
          ? 'App CS Summary'
          : 'Caspio selected fields',
      prefillPurpose,
      visitLocationSource: visitLocationSource || null,
      askCaregiverOnArrival,
      assessorCmReferralDate: swInviteDateYmd,
      otherResponder,
      otherResponderName,
      otherResponderRelationship,
      prefillContext: {
        csSummaryApplicationId: csSummaryApplicationId || null,
        csSummaryFound: Boolean(csSummaryApplicationId),
        mappingConfigured: Object.keys(mappingRows || {}).length > 0,
      },
      assignedSwId: swId || null,
      assignedSwEmail: swEmail || '',
      assignedSwName: swName || (swId ? `SW ID ${swId}` : 'Social Worker'),
      caspioSocialWorkerAssigned: swName || '',
      assignedByEmail: email || null,
      assignedByName: displayName || null,
      assignedByPhone: senderPhone || null,
      assignedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      // Daily action reminder emails default ON; preserve explicit off from ISP Tracker.
      dailyActionReminderEnabled:
        typeof (existingAssignment as any)?.dailyActionReminderEnabled === 'boolean'
          ? Boolean((existingAssignment as any).dailyActionReminderEnabled)
          : true,
      status: 'prefill_ready',
      workflowStatus: 'prefill_ready_pending_sw_invite',
      workflowStage: 'prefill_verified_ready_to_invite',
      workflowSteps: {
        swInviteSent: false,
        swSubmittedSigned: false,
        managerReview: 'pending',
        rnReviewSignature: 'pending',
        pdfReady: false,
      },
      workflowInvites: {
        swPortalPath: '/sw-portal/alft-upload',
        managerWorkflowPath: '/admin/alft-tracker',
        // Keep original invite timestamp on re-send so history stays visible in ISP Workflow.
        invitedAt:
          isResendAttempt && existingInvitedAt
            ? existingInvitedAt
            : admin.firestore.FieldValue.serverTimestamp(),
        firstInvitedAt:
          existingFirstInvitedAt || admin.firestore.FieldValue.serverTimestamp(),
        lastInvitedAt: admin.firestore.FieldValue.serverTimestamp(),
        inviteSendCount: nextInviteSendCount,
        invitedByEmail: email || null,
        invitedByName: displayName || null,
      },
    };
    await assignmentRef.set(assignmentDoc, { merge: true });

    if (!recipientEmail) {
      await assignmentRef.set(
        {
          swEmailDeliveryLog: admin.firestore.FieldValue.arrayUnion({
            status: 'missing_recipient',
            recipientEmail: null,
            atIso: new Date().toISOString(),
            triggeredByName: displayName || null,
            triggeredByEmail: email || null,
            isResend: isResendAttempt,
            error: 'No social worker email is assigned.',
          }),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return NextResponse.json(
        {
          success: false,
          error:
            'Could not send SW email because no social worker email is assigned. Please verify SW assignment/email and try again.',
          memberId,
          sw: {
            swId: swId || null,
            swName: swName || null,
            swEmail: null,
            swUid: swUid || null,
            emailSent: false,
          },
        },
        { status: 409 }
      );
    }

    // Notify SW in-app if we can resolve the user.
    if (swUid) {
      await adminDb.collection('staff_notifications').add({
        userId: swUid,
        recipientName: swName || swEmail || 'Social Worker',
        title: 'ALFT form assigned',
        message: `${resolvedMemberName} • MRN ${resolvedMemberMrn || '—'}\nPlease log in to SW Portal and submit ALFT with signature.`,
        memberName,
        type: 'alft_assignment_start',
        priority: 'Priority',
        status: 'Open',
        isRead: false,
        source: 'system',
        createdBy: uid,
        createdByName: displayName,
        senderName: displayName,
        senderId: uid,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        actionUrl: '/sw-portal/alft-upload',
        memberClientId: memberId,
      });
    }

    const trackerQuery = new URLSearchParams({
      member: resolvedMemberName,
      memberId,
    }).toString();
    const trackerActionUrl = `/admin/alft-tracker?${trackerQuery}`;

    // Notify Kaiser assignment managers in-app that workflow started.
    try {
      const managersSnap = await adminDb.collection('users').where('isKaiserAssignmentManager', '==', true).get();
      const managerWrites = managersSnap.docs.map((docSnap: any) =>
        adminDb.collection('staff_notifications').add({
          userId: clean(docSnap.id, 128),
          recipientName: clean((docSnap.data() as any)?.displayName, 160) || clean((docSnap.data() as any)?.email, 200) || 'Manager',
          title: 'ALFT workflow started',
          message: `${resolvedMemberName} • MRN ${resolvedMemberMrn || '—'}\nSW invited to submit ALFT form on portal.`,
          memberName,
          type: 'alft_workflow_started',
          priority: 'normal',
          status: 'Open',
          isRead: false,
          source: 'system',
          createdBy: uid,
          createdByName: displayName,
          senderName: displayName,
          senderId: uid,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          actionUrl: trackerActionUrl,
          memberClientId: memberId,
        })
      );
      await Promise.all(managerWrites);

      // Do not email managers on initial SW invite — keep in-app notifications only.
      // Admins get noreply emails when action is required (SW submit, RN sign, etc.).
    } catch {
      // best-effort manager notifications
    }

    let swEmailSent = false;
    try {
      // First ISP assignment often hits SWs who are Portal On but never received a Firebase login.
      // Provision Auth now so they can use Forgot password / sign in after the invite.
      try {
        const { ensureSocialWorkerAuthUser } = await import('@/lib/sw-auth-provision');
        await ensureSocialWorkerAuthUser({
          email: recipientEmail,
          displayName: swName || recipientEmail,
          swId: swId || undefined,
          createdBy: email || uid || 'alft-workflow-start',
          activatePortal: true,
        });
      } catch (provisionError) {
        console.warn('SW auth provision during ALFT invite failed (continuing invite):', provisionError);
      }

      await sendAlftWorkflowStartEmail({
        to: recipientEmail,
        socialWorkerName: swName || recipientEmail,
        memberName: resolvedMemberName,
        mrn: resolvedMemberMrn || undefined,
        portalUrl: '/sw-portal/alft-upload',
        assignedBy: displayName,
        assignedByEmail: email || undefined,
        assignedByPhone: senderPhone || undefined,
        // Do not BCC the sending admin on the SW invite — admins are emailed only when action is required
        // (e.g. SW submit/sign, RN sign).
        customEmailBody: customEmailBody || undefined,
        ispContactName,
        ispContactRelationship,
        ispAddress,
        facilityName,
        facilityType,
        ispLocation,
        ispContactPhone,
        ispContactEmail,
        ispContact2First,
        ispContact2Last,
        ispContact2Relationship,
        ispContact2Phone,
        ispContact2Email,
        ispLastVerified: ispContactConfirmDate,
        assessmentPurpose: prefillPurpose || undefined,
        visitLocationSource: visitLocationSource || undefined,
        askCaregiverOnArrival,
      });
      swEmailSent = true;
      await assignmentRef.set(
        {
          status: 'sw_form_in_progress',
          workflowStatus: 'sw_invited_pending_submission',
          workflowStage: 'sw_invited_to_portal',
          // ISP Assignment page only lists members assigned through the app.
          ispAssignmentTracked: true,
          ispAssignmentTrackedAt: admin.firestore.FieldValue.serverTimestamp(),
          ispAssignmentTrackedSource: 'isp_workflow_invite',
          workflowSteps: {
            swInviteSent: true,
            swSubmittedSigned: false,
            managerReview: 'pending',
            rnReviewSignature: 'pending',
            pdfReady: false,
          },
          workflowStepsAt: {
            swInviteSentAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          workflowInvites: {
            swPortalPath: '/sw-portal/alft-upload',
            managerWorkflowPath: '/admin/alft-tracker',
            invitedAt:
              isResendAttempt && existingInvitedAt
                ? existingInvitedAt
                : admin.firestore.FieldValue.serverTimestamp(),
            firstInvitedAt:
              existingFirstInvitedAt || admin.firestore.FieldValue.serverTimestamp(),
            lastInvitedAt: admin.firestore.FieldValue.serverTimestamp(),
            inviteSendCount: nextInviteSendCount,
            invitedByEmail: email || null,
            invitedByName: displayName || null,
            referralDateYmd: swInviteDateYmd,
          },
          assessorCmReferralDate: swInviteDateYmd,
          swEmailDeliveryLog: admin.firestore.FieldValue.arrayUnion({
            status: 'sent',
            recipientEmail: recipientEmail,
            atIso: new Date().toISOString(),
            triggeredByName: displayName || null,
            triggeredByEmail: email || null,
            isResend: isResendAttempt,
            error: null,
          }),
          ispWorkflowActivityLog: admin.firestore.FieldValue.arrayUnion({
            event: 'sw_invite_sent',
            atIso: new Date().toISOString(),
            byName: displayName || null,
            byEmail: email || null,
            recipientEmail: recipientEmail || null,
            isResend: isResendAttempt,
            details: isResendAttempt ? `SW invite re-sent (#${nextInviteSendCount})` : 'SW invite sent',
          }),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      // Caspio client note: RN/MSW visit scheduled (ISP invite sent) — same table as pathway notes.
      try {
        const { appendCaspioClientNote } = await import('@/lib/caspio-client-notes');
        await appendCaspioClientNote({
          clientId2: memberId,
          comments: [
            'RN/MSW visit scheduled (ALFT/ISP invite sent to social worker).',
            `Member: ${resolvedMemberName || memberId}.`,
            `SW: ${swName || recipientEmail || '—'}.`,
            `Invited by: ${displayName || email || '—'}.`,
            isResendAttempt ? 'Re-send invite.' : '',
          ]
            .filter(Boolean)
            .join(' '),
          assignedStaffName: displayName || undefined,
          sourceTag: 'alft-visit-scheduled',
        });
      } catch (noteErr) {
        console.warn('[alft/workflow/start] Caspio note failed:', noteErr);
      }
    } catch (sendErr: any) {
      await assignmentRef.set(
        {
          swEmailDeliveryLog: admin.firestore.FieldValue.arrayUnion({
            status: 'failed',
            recipientEmail: recipientEmail || null,
            atIso: new Date().toISOString(),
            triggeredByName: displayName || null,
            triggeredByEmail: email || null,
            isResend: isResendAttempt,
            error: String(sendErr?.message || 'Failed to deliver SW email.'),
          }),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return NextResponse.json(
        {
          success: false,
          error: String(sendErr?.message || 'Failed to deliver SW email. Please verify recipient and retry.'),
          memberId,
          sw: {
            swId: swId || null,
            swName: swName || null,
            swEmail: recipientEmail || null,
            swUid: swUid || null,
            emailSent: false,
          },
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      memberId,
      prefillSourceMode,
      csSummaryFound: Boolean(csSummaryApplicationId),
      sw: {
        swId: swId || null,
        swName: swName || null,
        swEmail: recipientEmail || null,
        swUid: swUid || null,
        emailSent: swEmailSent,
      },
    });
  } catch (e: any) {
    console.error('[alft/workflow/start] error', e);
    return NextResponse.json({ success: false, error: e?.message || 'Failed to start ALFT workflow' }, { status: 500 });
  }
}

