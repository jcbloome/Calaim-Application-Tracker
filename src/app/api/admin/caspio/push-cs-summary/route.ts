import { NextRequest, NextResponse } from 'next/server';
import { getCaspioServerAccessToken, getCaspioServerConfig } from '@/lib/caspio-server-auth';

const clean = (value: unknown) => String(value ?? '').trim();
const esc = (value: unknown) => clean(value).replace(/'/g, "''");
const looksLikeClientId2 = (fieldName: string) => /client[_\s-]*id2/i.test(clean(fieldName));
const hasValue = (value: unknown) => clean(value).length > 0;

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

  const where = `First_Name='${esc(firstName)}' AND Last_Name='${esc(lastName)}'`;
  const lookupUrl =
    `${baseUrl}/tables/${clientTable}/records` +
    `?q.where=${encodeURIComponent(where)}` +
    `&q.orderBy=${encodeURIComponent('client_ID2 DESC')}` +
    `&q.limit=1`;

  for (let attempt = 1; attempt <= 8; attempt += 1) {
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
      const clientId2 = clean(row?.client_ID2 || row?.Client_ID2 || row?.Record_ID);
      if (clientId2) return clientId2;
    }

    await sleep(250 * attempt);
  }

  throw new Error('Client was created, but generated client_ID2 was not available after retries.');
}

export async function POST(request: NextRequest) {
  try {
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

    const caspioConfig = getCaspioServerConfig();
    const token = await getCaspioServerAccessToken(caspioConfig);
    const baseUrl = caspioConfig.restBaseUrl;
    const membersTable = 'CalAIM_tbl_Members';
    const firstNameField = clean(mapping?.memberFirstName) || 'Senior_First';
    const lastNameField = clean(mapping?.memberLastName) || 'Senior_Last';

    const where = `${firstNameField}='${esc(firstName)}' AND ${lastNameField}='${esc(lastName)}'`;
    const searchUrl = `${baseUrl}/tables/${membersTable}/records?q.where=${encodeURIComponent(where)}&q.limit=1`;
    const searchResponse = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    if (searchResponse.ok) {
      const searchJson = await searchResponse.json().catch(() => ({} as any));
      if (Array.isArray(searchJson?.Result) && searchJson.Result.length > 0) {
        return NextResponse.json(
          { success: false, code: 'already-exists', message: `Member "${firstName} ${lastName}" already exists in Caspio.` },
          { status: 409 }
        );
      }
    }

    const generatedClientId2 = await createClientAndGetClientId2(baseUrl, token, firstName, lastName);

    const mappedFields = buildMemberDataFromMapping(applicationData, mapping);
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
    const currentClientId = clean(memberData[clientIdField]);
    if (!currentClientId || currentClientId === '0') memberData[clientIdField] = generatedClientId2;
    if (hasValue(assignedStaffName) && !hasValue(memberData.Kaiser_User_Assignment)) {
      // Keep Kaiser tracker assignment in Caspio aligned with admin assignment at push time.
      memberData.Kaiser_User_Assignment = assignedStaffName;
    }
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

    const insertUrl = `${baseUrl}/tables/${membersTable}/records`;
    let insertResponse = await fetch(insertUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(memberData),
    });

    // Some Caspio tables may not have Kaiser_User_Assignment. If so, retry once without it.
    if (!insertResponse.ok && hasValue(memberData.Kaiser_User_Assignment)) {
      const firstErrText = await insertResponse.text().catch(() => '');
      const mentionsMissingAssignmentColumn =
        /columnnotfound/i.test(firstErrText) && /kaiser_user_assignment/i.test(firstErrText);
      if (mentionsMissingAssignmentColumn) {
        const fallbackData = { ...memberData };
        delete fallbackData.Kaiser_User_Assignment;
        insertResponse = await fetch(insertUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(fallbackData),
        });
      } else {
        return NextResponse.json(
          {
            success: false,
            code: 'caspio-insert-failed',
            message: 'Failed to insert member record in Caspio.',
            details: {
              caspioStatus: insertResponse.status,
              caspioError: firstErrText,
              memberName: `${firstName} ${lastName}`.trim(),
              generatedClientId2,
              clientIdField,
            },
          },
          { status: 500 }
        );
      }
    }

    if (!insertResponse.ok) {
      const caspioError = await insertResponse.text().catch(() => '');
      return NextResponse.json(
        {
          success: false,
          code: 'caspio-insert-failed',
          message: 'Failed to insert member record in Caspio.',
          details: {
            caspioStatus: insertResponse.status,
            caspioError,
            memberName: `${firstName} ${lastName}`.trim(),
            generatedClientId2,
            clientIdField,
          },
        },
        { status: 500 }
      );
    }

    const result = await insertResponse.json().catch(() => ({} as any));
    return NextResponse.json({
      success: true,
      message: `Successfully published CS Summary for "${firstName} ${lastName}" to Caspio.`,
      clientId2: generatedClientId2,
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

