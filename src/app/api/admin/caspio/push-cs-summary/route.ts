import { NextRequest, NextResponse } from 'next/server';
import { getCaspioServerAccessToken, getCaspioServerConfig } from '@/lib/caspio-server-auth';
import { caspioWriteBlockedResponse, isCaspioWriteReadOnly } from '@/lib/caspio-write-guard';

const clean = (value: unknown) => String(value ?? '').trim();
const esc = (value: unknown) => clean(value).replace(/'/g, "''");
const looksLikeClientId2 = (fieldName: string) => /client[_\s-]*id2/i.test(clean(fieldName));
const looksLikeHoldForSocialWorkerField = (fieldName: string) =>
  /hold[_\s-]*for[_\s-]*social[_\s-]*worker/i.test(clean(fieldName));
const normalizeFieldName = (fieldName: string) =>
  clean(fieldName)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
const hasValue = (value: unknown) => clean(value).length > 0;
const looksLikePkField = (fieldName: string) => /^pk_id$/i.test(clean(fieldName));
const looksLikeNumericId = (value: unknown) => /^-?\d+(?:\.\d+)?$/.test(clean(value));
const buildEqualsClause = (fieldName: string, value: unknown) => {
  const normalizedValue = clean(value);
  if (!normalizedValue) return '';
  return looksLikeNumericId(normalizedValue)
    ? `${fieldName}=${normalizedValue}`
    : `${fieldName}='${esc(normalizedValue)}'`;
};
const HOLD_FOR_SOCIAL_WORKER_FIELD = 'Hold_For_Social_Worker_Visit';
const HOLD_FOR_SOCIAL_WORKER_VALUE = '🔴 Hold';
const CALAIM_STATUS_FIELD = 'CalAIM_Status';
const MONTHLY_INCOME_FIELD = 'Monthly_Income';
const MCO_AND_TIER_FIELD = 'MCO_and_Tier';
const DEFAULT_KAISER_TIER_VALUE = 'Kaiser-0';
const KAISER_STATUS_FIELD = 'Kaiser_Status';
const PRE_ASSESSMENT_NOTES_FIELD_CANDIDATES = [
  'Pre_Assessment_Care_Needs_Notes',
  'Pre_Assessment_Notes',
  'Care_Needs_Notes',
  'Care_Notes',
];

const buildMemberDataFromMapping = (applicationData: any, mapping?: Record<string, string> | null) => {
  const memberData: Record<string, any> = {};
  if (!mapping || typeof mapping !== 'object') return memberData;

  Object.entries(mapping).forEach(([csField, caspioField]) => {
    if (!caspioField) return;
    const value = applicationData?.[csField];
    if (value === undefined || value === null || value === '') return;
    memberData[caspioField] = value;
  });

  return memberData;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchTableFieldNames(baseUrl: string, token: string, tableName: string): Promise<string[]> {
  const encodedTable = encodeURIComponent(tableName);
  const endpoints = [
    `${baseUrl}/tables/${encodedTable}/fields`,
    `${baseUrl}/tables/${encodedTable}/columns`,
  ];
  for (const url of endpoints) {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) continue;
    const json = await res.json().catch(() => ({} as any));
    const list = Array.isArray(json?.Result) ? json.Result : [];
    const names = list
      .map((item: any) => clean(item?.Name || item?.name))
      .filter(Boolean);
    if (names.length > 0) return names;
  }
  return [];
}

async function createClientAndGetClientId2(
  baseUrl: string,
  token: string,
  firstName: string,
  lastName: string
): Promise<string> {
  const clientTable = 'connect_tbl_clients';
  const createUrl = `${baseUrl}/tables/${clientTable}/records`;
  const createPayload = {
    First_Name: firstName,
    Last_Name: lastName,
  };

  const createResponse = await fetch(createUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(createPayload),
  });
  if (!createResponse.ok) {
    const err = await createResponse.text().catch(() => '');
    throw new Error(`Failed to create client in connect_tbl_clients: ${createResponse.status} ${err}`);
  }
  const createJson = await createResponse.json().catch(() => ({} as any));
  const createResultRow = Array.isArray(createJson?.Result) ? createJson.Result[0] : createJson?.Result;
  const directClientId2 = clean(
    createResultRow?.client_ID2 ||
      createResultRow?.Client_ID2 ||
      createResultRow?.clientid2 ||
      createResultRow?.Record_ID
  );
  if (directClientId2) return directClientId2;

  const where = `First_Name='${esc(firstName)}' AND Last_Name='${esc(lastName)}'`;
  const lookupOrderCandidates = ['client_ID2 DESC', 'Client_ID2 DESC', 'PK_ID DESC'];

  for (let attempt = 1; attempt <= 10; attempt += 1) {
    for (const orderBy of lookupOrderCandidates) {
      const lookupUrl =
        `${baseUrl}/tables/${clientTable}/records` +
        `?q.where=${encodeURIComponent(where)}` +
        `&q.select=${encodeURIComponent('PK_ID,client_ID2,Client_ID2,Record_ID')}` +
        `&q.orderBy=${encodeURIComponent(orderBy)}` +
        `&q.limit=1`;
      const lookupResponse = await fetch(lookupUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (lookupResponse.ok) {
        const lookupJson = await lookupResponse.json().catch(() => ({} as any));
        const row = Array.isArray(lookupJson?.Result) ? lookupJson.Result[0] : null;
        const clientId2 = clean(row?.client_ID2 || row?.Client_ID2 || row?.clientid2 || row?.Record_ID);
        if (clientId2) return clientId2;
      }
    }

    await sleep(250 * attempt);
  }

  throw new Error('Client was created, but generated client_ID2 was not available after retries.');
}

export async function POST(request: NextRequest) {
  try {
    if (isCaspioWriteReadOnly()) {
      return NextResponse.json(caspioWriteBlockedResponse(), { status: 423 });
    }

    const body = await request.json().catch(() => ({} as any));
    const applicationData = body?.applicationData || null;
    const mapping = (body?.mapping || null) as Record<string, string> | null;

    if (!applicationData || typeof applicationData !== 'object') {
      return NextResponse.json({ success: false, message: 'Application data is required.' }, { status: 400 });
    }

    const firstName = clean(applicationData.memberFirstName);
    const lastName = clean(applicationData.memberLastName);
    const assignedStaffName = clean(applicationData?.assignedStaffName);
    const assignedStaffId = clean(applicationData?.assignedStaffId);
    const requestedCalAIMStatus = clean(applicationData?.caspioCalAIMStatus || applicationData?.CalAIM_Status);
    const requestedKaiserStatus = clean(applicationData?.kaiserStatus || applicationData?.Kaiser_Status);
    const requestedSocialWorkerHold = clean(
      applicationData?.holdForSocialWorkerStatus ||
      applicationData?.Hold_For_Social_Worker_Visit ||
      applicationData?.Hold_For_Social_Worker ||
      applicationData?.hold_for_social_worker ||
      HOLD_FOR_SOCIAL_WORKER_VALUE
    ) || HOLD_FOR_SOCIAL_WORKER_VALUE;
    const requestedMonthlyIncome = clean(
      applicationData?.proofIncomeActualAmount ||
      applicationData?.monthlyIncome ||
      applicationData?.Monthly_Income
    );
    const preAssessmentNotes = clean(
      applicationData?.preAssessmentCareNeedsNotes ||
      applicationData?.pre_assessment_care_needs_notes ||
      applicationData?.preAssessmentNotes
    );
    const isDraftLikeForPush =
      clean(applicationData?.status).toLowerCase() === 'draft' ||
      Boolean(applicationData?.createdByAdmin) ||
      Boolean(applicationData?.allowDraftCaspioPush);
    const normalizedHealthPlan = clean(
      applicationData?.healthPlan || applicationData?.CalAIM_MCO || applicationData?.calaimMco
    ).toLowerCase();
    const isKaiserApplication = normalizedHealthPlan === 'kaiser' || normalizedHealthPlan.includes('kaiser');
    if (!firstName || !lastName) {
      return NextResponse.json(
        { success: false, message: 'Member first and last name are required.' },
        { status: 400 }
      );
    }
    if (!assignedStaffName && !assignedStaffId) {
      return NextResponse.json(
        {
          success: false,
          code: 'missing-assigned-staff',
          message: 'Assign staff before pushing this application to Caspio.',
        },
        { status: 400 }
      );
    }
    if (requestedCalAIMStatus !== 'Authorized' && requestedCalAIMStatus !== 'Pending') {
      return NextResponse.json(
        {
          success: false,
          code: 'missing-calaim-status',
          message: 'Select CalAIM Status (Authorized or Pending) on the main application page before pushing to Caspio.',
        },
        { status: 400 }
      );
    }
    if (isKaiserApplication && !requestedKaiserStatus) {
      return NextResponse.json(
        {
          success: false,
          code: 'missing-kaiser-status',
          message: 'Select Kaiser Status on the main application page before pushing this Kaiser application.',
        },
        { status: 400 }
      );
    }
    if (isDraftLikeForPush && !preAssessmentNotes) {
      return NextResponse.json(
        {
          success: false,
          code: 'missing-pre-push-notes',
          message: 'Pre-push notes are required before pushing draft applications to Caspio.',
        },
        { status: 400 }
      );
    }

    const caspioConfig = getCaspioServerConfig();
    const token = await getCaspioServerAccessToken(caspioConfig);
    const baseUrl = caspioConfig.restBaseUrl;
    const membersTable = 'CalAIM_tbl_Members';
    const firstNameField = clean(mapping?.memberFirstName) || 'Senior_First';
    const lastNameField = clean(mapping?.memberLastName) || 'Senior_Last';

    const trySearchMember = async (whereClause: string) => {
      const searchUrl =
        `${baseUrl}/tables/${membersTable}/records` +
        `?q.where=${encodeURIComponent(whereClause)}` +
        `&q.select=${encodeURIComponent('PK_ID,client_ID2,Client_ID2')}` +
        `&q.orderBy=${encodeURIComponent('PK_ID DESC')}` +
        `&q.limit=1`;
      const response = await fetch(searchUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) return null;
      const json = await response.json().catch(() => ({} as any));
      if (Array.isArray(json?.Result) && json.Result.length > 0) {
        return json.Result[0] as Record<string, any>;
      }
      return null;
    };

    const hintedClientId2 = clean(
      applicationData?.clientId2 ||
        applicationData?.client_ID2 ||
        applicationData?.Client_ID2 ||
        applicationData?.caspioClientId2
    );
    const isAlreadySent = Boolean(applicationData?.caspioSent);
    if (hintedClientId2 && !isAlreadySent) {
      return NextResponse.json(
        {
          success: false,
          code: 'client-id2-conflict',
          message:
            'This application already has Client_ID2. Delete the existing record in Caspio Clients Table and CalAIM Members tables before pushing again.',
        },
        { status: 409 }
      );
    }
    const hintedMrn = clean(
      applicationData?.memberMrn ||
        applicationData?.medicalRecordNumber ||
        applicationData?.mrn ||
        applicationData?.Member_MRN
    );

    let existingRow: Record<string, any> | null = null;
    if (hintedClientId2) {
      const clientIdFieldCandidates = ['client_ID2', 'Client_ID2', 'clientid2'];
      for (const clientIdField of clientIdFieldCandidates) {
        if (existingRow) break;
        const whereByClientId = buildEqualsClause(clientIdField, hintedClientId2);
        if (!whereByClientId) continue;
        existingRow = await trySearchMember(whereByClientId);
      }
    }
    if (!existingRow && hintedMrn) {
      const mrnFieldCandidates = [
        'MRN',
        'Member_MRN',
        'Medical_Record_Number',
        'Medical_Record_Number_MRN',
        'MedicalRecordNumber',
      ];
      for (const mrnField of mrnFieldCandidates) {
        if (existingRow) break;
        const whereByMrn = buildEqualsClause(mrnField, hintedMrn);
        if (!whereByMrn) continue;
        existingRow = await trySearchMember(whereByMrn);
      }
    }
    if (!existingRow) {
      const where = `${firstNameField}='${esc(firstName)}' AND ${lastNameField}='${esc(lastName)}'`;
      existingRow = await trySearchMember(where);
    }

    const mappedFields = buildMemberDataFromMapping(applicationData, mapping);
    // Prevent stale draft mappings from sending an invalid hold-column alias.
    // We set this field explicitly below using canonical column naming.
    Object.keys(mappedFields).forEach((fieldName) => {
      if (looksLikeHoldForSocialWorkerField(fieldName)) {
        delete mappedFields[fieldName];
      }
    });
    const mappedClientIdField = Object.keys(mappedFields).find((field) => looksLikeClientId2(field));
    const inferredClientIdFieldFromMap =
      Object.values(mapping || {}).find((field) => looksLikeClientId2(String(field || ''))) || '';
    const clientIdField =
      clean(mappedClientIdField) ||
      clean(String(inferredClientIdFieldFromMap)) ||
      'client_ID2';
    const memberData: Record<string, any> = { ...mappedFields };
    if (!memberData[firstNameField]) memberData[firstNameField] = firstName;
    if (!memberData[lastNameField]) memberData[lastNameField] = lastName;
    const existingClientId2 = clean(existingRow?.client_ID2 || existingRow?.Client_ID2);
    if (existingClientId2) {
      memberData[clientIdField] = existingClientId2;
    } else {
      const currentClientId = clean(memberData[clientIdField]);
      if (!currentClientId || currentClientId === '0') {
        const generatedClientId2 = await createClientAndGetClientId2(baseUrl, token, firstName, lastName);
        memberData[clientIdField] = generatedClientId2;
      }
    }
    if (hasValue(assignedStaffName) && !hasValue(memberData.Kaiser_User_Assignment)) {
      // Keep Kaiser tracker assignment in Caspio aligned with admin assignment at push time.
      memberData.Kaiser_User_Assignment = assignedStaffName;
    }
    memberData[CALAIM_STATUS_FIELD] = requestedCalAIMStatus;
    if (isKaiserApplication && requestedKaiserStatus) {
      memberData[KAISER_STATUS_FIELD] = requestedKaiserStatus;
    }
    if (requestedMonthlyIncome && !hasValue(memberData[MONTHLY_INCOME_FIELD])) {
      memberData[MONTHLY_INCOME_FIELD] = requestedMonthlyIncome;
    }
    const memberFieldNames = await fetchTableFieldNames(baseUrl, token, membersTable).catch(() => []);
    const fieldNameByNormalized = new Map<string, string>();
    memberFieldNames.forEach((name) => {
      fieldNameByNormalized.set(normalizeFieldName(name), name);
    });
    if (preAssessmentNotes) {
      const mappedNotesField = Object.keys(memberData).find(
        (name) =>
          normalizeFieldName(name).includes('preassessment') &&
          normalizeFieldName(name).includes('notes')
      );
      const notesFieldName =
        mappedNotesField ||
        PRE_ASSESSMENT_NOTES_FIELD_CANDIDATES.find((name) => fieldNameByNormalized.has(normalizeFieldName(name)));
      if (notesFieldName) {
        memberData[notesFieldName] = preAssessmentNotes;
      }
    }
    const holdFieldCandidates = [
      HOLD_FOR_SOCIAL_WORKER_FIELD,
      'Hold_For_Social_Worker',
      'Hold_for_Social_Worker_Visit',
      'Hold_for_Social_Worker',
      'HoldForSocialWorker',
    ];
    const holdFieldName =
      holdFieldCandidates.find((name) => fieldNameByNormalized.has(normalizeFieldName(name))) ||
      HOLD_FOR_SOCIAL_WORKER_FIELD;
    // Always put pushed members into Social Worker hold queue.
    memberData[holdFieldName] = requestedSocialWorkerHold;
    Object.keys(memberData).forEach((key) => {
      if (looksLikePkField(key)) delete memberData[key];
    });
    if (Object.keys(memberData).length === 0) {
      return NextResponse.json(
        {
          success: false,
          code: 'missing-mapping',
          message: 'No mapped Caspio fields were found. Please lock mapping in Admin → Caspio Test first.',
        },
        { status: 400 }
      );
    }

    const isUpdate = Boolean(existingRow?.PK_ID || existingRow?.pk_id);
    if (!isUpdate && isKaiserApplication) {
      // Only set default tier on first insert for Kaiser applications.
      memberData[MCO_AND_TIER_FIELD] = DEFAULT_KAISER_TIER_VALUE;
    }
    const updateWhere = isUpdate ? `PK_ID=${Number(existingRow?.PK_ID || existingRow?.pk_id || 0)}` : '';
    const upsertUrl = isUpdate
      ? `${baseUrl}/tables/${membersTable}/records?q.where=${encodeURIComponent(updateWhere)}`
      : `${baseUrl}/tables/${membersTable}/records`;
    const upsertMethod = isUpdate ? 'PUT' : 'POST';
    const doUpsert = async (payload: Record<string, any>) =>
      fetch(upsertUrl, {
      method: upsertMethod,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    let upsertResponse = await doUpsert(memberData);

    // Some Caspio tables may not have Kaiser_User_Assignment. If so, retry once without it.
    if (!upsertResponse.ok && hasValue(memberData.Kaiser_User_Assignment)) {
      const firstErrText = await upsertResponse.text().catch(() => '');
      const mentionsMissingAssignmentColumn =
        /columnnotfound/i.test(firstErrText) && /kaiser_user_assignment/i.test(firstErrText);
      if (mentionsMissingAssignmentColumn) {
        const fallbackData = { ...memberData };
        delete fallbackData.Kaiser_User_Assignment;
        upsertResponse = await doUpsert(fallbackData);
      } else {
        return NextResponse.json(
          {
            success: false,
            code: isUpdate ? 'caspio-update-failed' : 'caspio-insert-failed',
            message: isUpdate
              ? 'Failed to update member record in Caspio.'
              : 'Failed to insert member record in Caspio.',
            details: {
              caspioStatus: upsertResponse.status,
              caspioError: firstErrText,
              memberName: `${firstName} ${lastName}`.trim(),
              clientIdField,
              mode: isUpdate ? 'update' : 'create',
            },
          },
          { status: 500 }
        );
      }
    }

    if (!upsertResponse.ok) {
      const firstErrorBody = await upsertResponse.text().catch(() => '');
      const holdPattern = /columnnotfound/i.test(firstErrorBody) && /hold[_\s-]*for[_\s-]*social[_\s-]*worker/i.test(firstErrorBody);
      if (holdPattern) {
        const fallbackData = { ...memberData };
        Object.keys(fallbackData).forEach((key) => {
          if (looksLikeHoldForSocialWorkerField(key)) delete fallbackData[key];
        });
        // Retry with canonical field in case table metadata was stale or endpoint returned a variant.
        fallbackData[HOLD_FOR_SOCIAL_WORKER_FIELD] = requestedSocialWorkerHold;
        upsertResponse = await doUpsert(fallbackData);
        if (upsertResponse.ok) {
          const result = await upsertResponse.json().catch(() => ({} as any));
          return NextResponse.json({
            success: true,
            message: isUpdate
              ? `Successfully updated Caspio profile for "${firstName} ${lastName}".`
              : `Successfully published CS Summary for "${firstName} ${lastName}" to Caspio.`,
            mode: isUpdate ? 'update' : 'create',
            clientId2: clean(memberData[clientIdField]),
            data: result,
          });
        }
        // Last-chance fallback: some Caspio environments expose no hold column on this table.
        // Keep the member update unblocked by retrying without hold-related fields.
        const noHoldData = { ...memberData };
        Object.keys(noHoldData).forEach((key) => {
          if (looksLikeHoldForSocialWorkerField(key)) delete noHoldData[key];
        });
        upsertResponse = await doUpsert(noHoldData);
        if (upsertResponse.ok) {
          const result = await upsertResponse.json().catch(() => ({} as any));
          return NextResponse.json({
            success: true,
            message: isUpdate
              ? `Successfully updated Caspio profile for "${firstName} ${lastName}" (hold column not available on this table).`
              : `Successfully published CS Summary for "${firstName} ${lastName}" to Caspio (hold column not available on this table).`,
            mode: isUpdate ? 'update' : 'create',
            clientId2: clean(memberData[clientIdField]),
            warning: 'hold-field-missing',
            data: result,
          });
        }
      }
      const caspioError = await upsertResponse.text().catch(() => '') || firstErrorBody;
      return NextResponse.json(
        {
          success: false,
          code: isUpdate ? 'caspio-update-failed' : 'caspio-insert-failed',
          message: isUpdate
            ? 'Failed to update member record in Caspio.'
            : 'Failed to insert member record in Caspio.',
          details: {
            caspioStatus: upsertResponse.status,
            caspioError,
            memberName: `${firstName} ${lastName}`.trim(),
            clientIdField,
            holdFieldTried: holdFieldName,
            membersTableFieldCount: memberFieldNames.length,
            mode: isUpdate ? 'update' : 'create',
          },
        },
        { status: 500 }
      );
    }

    const result = await upsertResponse.json().catch(() => ({} as any));
    return NextResponse.json({
      success: true,
      message: isUpdate
        ? `Successfully updated Caspio profile for "${firstName} ${lastName}".`
        : `Successfully published CS Summary for "${firstName} ${lastName}" to Caspio.`,
      mode: isUpdate ? 'update' : 'create',
      clientId2: clean(memberData[clientIdField]),
      data: result,
    });
  } catch (error: any) {
    console.error('Caspio push API error:', error);
    return NextResponse.json(
      {
        success: false,
        code: 'internal',
        message: 'Unexpected error while publishing CS Summary to Caspio.',
        details: { rawError: String(error?.message || 'Unknown error') },
      },
      { status: 500 }
    );
  }
}

