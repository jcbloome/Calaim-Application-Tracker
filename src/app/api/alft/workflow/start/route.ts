import { NextRequest, NextResponse } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';
import { fetchCaspioSocialWorkers, getCaspioCredentialsFromEnv, getCaspioToken } from '@/lib/caspio-api-utils';
import { sendAlftManagerWorkflowStageEmail, sendAlftWorkflowStartEmail } from '@/app/actions/send-email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  idToken?: string;
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
    ispContactConfirmDate?: string;
    swId?: string;
    socialWorkerAssigned?: string;
    prefillSourceMode?: 'cs_summary_app' | 'caspio_selected_fields' | string;
    prefillPurpose?: 'initial' | 'change_condition' | 'review' | string;
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
  const HARD_HOME_MAPPING: Record<string, string> = {
    p2_home_street: 'Normal_Housing_Street',
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
    const forced = clean(HARD_HOME_MAPPING[alftField], 200);
    const candidates = [
      forced,
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

  return {
    alftPlanId: getMapped('p1_plan_id'),
    memberName: getMapped('p1_member_name'),
    memberFirstName: getMapped('p1_first_name'),
    memberLastName: getMapped('p1_last_name'),
    memberMrn: getMapped('p1_mrn'),
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
    assessmentSite: getMapped('p2_assessment_site'),
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
    if (!swId && !swName) {
      return NextResponse.json(
        { success: false, error: 'Member is missing both SW_ID and Social_Worker_Assigned in Caspio.' },
        { status: 409 }
      );
    }

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
        swEmail = clean((match as any)?.email, 220).toLowerCase();
      }
    } catch {
      // best-effort only
    }

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

    // Try to resolve SW user by email or SW_ID for in-app notifications.
    let swUid = '';
    try {
      if (swEmail) {
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
        : 'review';
    const fallbackFromMember = {
      memberName,
      memberFirstName: clean(member?.memberFirstName, 80),
      memberLastName: clean(member?.memberLastName, 80),
      memberMrn,
      birthDate: clean(member?.birthDate, 80),
      memberSex: clean(member?.memberSex, 80),
      memberPrimaryLanguage: clean(member?.memberPrimaryLanguage, 120),
      memberPhone: clean(member?.memberPhone, 80) || clean(member?.ispContactPhone, 80),
      ispFacilityName: clean(member?.ispFacilityName, 240) || clean(member?.ispCurrentLocation, 240),
      ispCurrentAddressStreet: clean(member?.ispCurrentAddressStreet, 240),
      ispCurrentAddressCity: clean(member?.ispCurrentAddressCity, 120),
      ispCurrentAddressState: clean(member?.ispCurrentAddressState, 50),
      ispCurrentAddressZip: clean(member?.ispCurrentAddressZip, 30),
      currentLocationType: '',
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
      const forcedHome = ['Normal_Housing_Street', 'Normal_Housing_City', 'Normal_Housing_State', 'Normal_Housing_Zip'];
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
      resolved.memberName || `${resolved.memberFirstName || ''} ${resolved.memberLastName || ''}`.trim() || memberName,
      180
    );
    const resolvedMemberMrn = clean(resolved.memberMrn || memberMrn, 80);

    const assignmentDoc: Record<string, any> = {
      memberId,
      memberName: resolvedMemberName,
      memberFirstName: clean(resolved.memberFirstName, 80),
      memberLastName: clean(resolved.memberLastName, 80),
      memberMrn: resolvedMemberMrn,
      alftPlanId: clean((resolved as any).alftPlanId || resolvedMemberMrn, 80),
      birthDate: clean(resolved.birthDate, 80),
      memberSex: clean(resolved.memberSex, 80),
      memberPrimaryLanguage: clean(resolved.memberPrimaryLanguage, 120),
      memberPhone: clean(resolved.memberPhone, 80),
      ispCurrentAddressStreet: clean(resolved.ispCurrentAddressStreet, 240),
      ispCurrentAddressCity: clean(resolved.ispCurrentAddressCity, 120),
      ispCurrentAddressState: clean(resolved.ispCurrentAddressState, 50) || 'CA',
      ispCurrentAddressZip: clean(resolved.ispCurrentAddressZip, 30),
      currentLocationType: clean((resolved as any).currentLocationType, 80),
      assessmentSite: clean((resolved as any).assessmentSite, 80),
      homeAddressStreet: clean((resolved as any).homeAddressStreet, 240),
      homeAddressCity: clean((resolved as any).homeAddressCity, 120),
      homeAddressState: clean((resolved as any).homeAddressState, 50) || 'CA',
      homeAddressZip: clean((resolved as any).homeAddressZip, 30),
      ispFacilityName: clean(resolved.ispFacilityName, 240),
      kaiserStatus: clean(member?.kaiserStatus, 120),
      ispCurrentLocation: clean(member?.ispCurrentLocation, 240),
      ispContactPhone: clean(member?.ispContactPhone, 80),
      ispContactEmail: clean(member?.ispContactEmail, 200),
      ispContactConfirmDate: clean(member?.ispContactConfirmDate, 80),
      prefillSourceMode,
      prefillSourceLabel:
        prefillSourceMode === 'cs_summary_app'
          ? 'App CS Summary'
          : 'Caspio selected fields',
      prefillPurpose,
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
      assignedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      status: 'sw_form_in_progress',
      workflowStatus: 'sw_invited_pending_submission',
      workflowStage: 'sw_invited_to_portal',
      workflowSteps: {
        swInviteSent: Boolean(swEmail),
        swSubmittedSigned: false,
        managerReview: 'pending',
        rnReviewSignature: 'pending',
        pdfReady: false,
      },
      workflowInvites: {
        swPortalPath: '/sw-portal/alft-upload',
        managerWorkflowPath: '/admin/alft-tracker',
        invitedAt: admin.firestore.FieldValue.serverTimestamp(),
        invitedByEmail: email || null,
        invitedByName: displayName || null,
      },
    };
    await adminDb.collection('alft_assignments').doc(memberId).set(assignmentDoc, { merge: true });

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

      const managerEmails = managersSnap.docs
        .map((docSnap: any) => ({
          email: clean((docSnap.data() as any)?.email, 220).toLowerCase(),
          name: clean((docSnap.data() as any)?.displayName, 160) || clean((docSnap.data() as any)?.email, 220) || 'Manager',
        }))
        .filter((m: any) => Boolean(m.email));
      if (managerEmails.length > 0) {
        await Promise.all(
          managerEmails.map((manager: any) =>
            sendAlftManagerWorkflowStageEmail({
              to: manager.email,
              managerName: manager.name,
              memberName: resolvedMemberName,
              mrn: resolvedMemberMrn || undefined,
              stageLabel: 'Step 1/5 started (SW invited)',
              nextAction: 'Monitor for SW submission and signature, then review in ALFT tracker.',
              actionUrl: trackerActionUrl,
              triggeredBy: displayName,
            }).catch(() => null)
          )
        );
      }
    } catch {
      // best-effort manager notifications
    }

    let swEmailSent = false;
    if (swEmail) {
      try {
        await sendAlftWorkflowStartEmail({
          to: swEmail,
          socialWorkerName: swName || swEmail,
          memberName: resolvedMemberName,
          mrn: resolvedMemberMrn || undefined,
          portalUrl: '/sw-portal/alft-upload',
          assignedBy: displayName,
        });
        swEmailSent = true;
      } catch {
        swEmailSent = false;
      }
    }

    return NextResponse.json({
      success: true,
      memberId,
      prefillSourceMode,
      csSummaryFound: Boolean(csSummaryApplicationId),
      sw: {
        swId: swId || null,
        swName: swName || null,
        swEmail: swEmail || null,
        swUid: swUid || null,
        emailSent: swEmailSent,
      },
    });
  } catch (e: any) {
    console.error('[alft/workflow/start] error', e);
    return NextResponse.json({ success: false, error: e?.message || 'Failed to start ALFT workflow' }, { status: 500 });
  }
}

