import { NextRequest, NextResponse } from 'next/server';

interface TestClient {
  firstName: string;
  lastName: string;
  seniorFirst?: string;
  seniorLast?: string;
  mco: string;
}

export async function POST(request: NextRequest) {
  try {
    console.log('🧪 Starting Single Client → Member Test API...');
    const body = await request.json().catch(() => ({}));
    const requestedFieldNames = Array.isArray(body?.fieldNames)
      ? body.fieldNames.filter((field: any) => typeof field === 'string' && field.trim().length > 0)
      : [];
    const dryRun = body?.dryRun === true;
    const generatedMediCalNumber = generateMediCalNumber();
    const generatedMedicalRecordNumber = generateMedicalRecordNumber();
    
    // Generate sequential test subject names
    const testNumber = Math.floor(Math.random() * 100) + 1;
    const testClient: TestClient = {
      firstName: `TestClient${testNumber}`,
      lastName: `${Date.now()}`,
      seniorFirst: `TestSenior`,
      seniorLast: `TestMember`,
    mco: Math.random() > 0.5 ? 'Kaiser' : 'Health Net'
    };
    
    console.log('👤 Using generated test client data:', testClient);

    // Caspio credentials (hardcoded for testing)
    const baseUrl = 'https://c7ebl500.caspio.com/rest/v2';
    const clientId = 'b721f0c7af4d4f7542e8a28665bfccb07e93f47deb4bda27bc';
    const clientSecret = 'bad425d4a8714c8b95ec2ea9d256fc649b2164613b7e54099c';
    
    console.log('🔑 Getting Caspio access token...');
    const accessToken = await getCaspioAccessToken(clientId, clientSecret);
    
    console.log(`👤 Testing client: ${testClient.firstName} ${testClient.lastName}`);

    if (dryRun) {
      console.log('🧪 Dry run mode: building payload preview only.');
      const writableFields = await getWritableMemberFields(accessToken, baseUrl);
      const previewMemberResult = await createMemberRecord(
        accessToken,
        baseUrl,
        testClient,
        'preview',
        {},
        requestedFieldNames,
        writableFields,
        generatedMediCalNumber,
        generatedMedicalRecordNumber,
        true
      );

      return NextResponse.json({
        success: true,
        message: 'Preview generated',
        clientId: 'preview',
        mco: testClient.mco,
        memberResult: previewMemberResult,
        mappedFieldCount: previewMemberResult?.mappedFieldCount ?? requestedFieldNames.length,
        payloadFieldCount: previewMemberResult?.payloadFieldCount,
        payloadFields: previewMemberResult?.payloadFields,
        payloadPreview: previewMemberResult?.payloadPreview,
        dryRun: true
      });
    }
    
    // Step 1: Create client record
    console.log('📝 Step 1: Creating client record...');
    const clientResult = await createClientRecord(accessToken, baseUrl, testClient);
    
    // Step 2: Query for the real Client_ID2 that Caspio generated
    console.log('🔍 Step 2: Querying for real Client_ID2...');
    const realClientId = await findCreatedClientRecord(accessToken, baseUrl, testClient);
    
    console.log(`✅ Client created with real Caspio ID: ${realClientId}`);
    
    // Step 3: Get the full client record with all fields
    console.log('🔍 Step 3: Retrieving full client record...');
    const retrievedClient = await getClientRecord(accessToken, baseUrl, realClientId);
    
    // Step 3.5: Load CalAIM schema to filter read-only fields
    console.log('🔍 Step 3.5: Loading CalAIM member schema...');
    const writableFields = await getWritableMemberFields(accessToken, baseUrl);

    // Step 4: Create member record with enhanced data
    console.log('📝 Step 4: Creating member record in CalAIM_tbl_Members...');
    const memberResult = await createMemberRecord(
      accessToken,
      baseUrl,
      testClient,
      realClientId,
      retrievedClient,
      requestedFieldNames,
      writableFields,
      generatedMediCalNumber,
      generatedMedicalRecordNumber,
      dryRun
    );
    
    console.log('✅ Single client test completed successfully!');
    
    return NextResponse.json({
      success: true,
      message: `Successfully created client and member records for ${testClient.firstName} ${testClient.lastName}`,
      clientId: realClientId,
      mco: testClient.mco,
      clientResult: clientResult,
      memberResult: memberResult,
      retrievedClient: retrievedClient,
      mappedFieldCount: memberResult?.mappedFieldCount ?? requestedFieldNames.length,
      payloadFieldCount: memberResult?.payloadFieldCount,
      payloadFields: memberResult?.payloadFields,
      dryRun
    });
    
  } catch (error: any) {
    console.error('❌ Single client test failed:', error);
    return NextResponse.json({
      success: false,
      message: error.message || 'Unknown error occurred',
      error: error.toString()
    }, { status: 500 });
  }
}

// Get Caspio OAuth access token
async function getCaspioAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const tokenUrl = 'https://c7ebl500.caspio.com/oauth/token';
  
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'User-Agent': 'CalAIM-Application/1.0'
    },
    body: 'grant_type=client_credentials',
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get access token: ${response.status} ${errorText}`);
  }
  
  const tokenData = await response.json();
  return tokenData.access_token;
}

// Create client record in connect_tbl_clients
async function createClientRecord(accessToken: string, baseUrl: string, testClient: TestClient): Promise<any> {
  const clientTableUrl = `${baseUrl}/tables/connect_tbl_clients/records`;
  
  const clientData = {
    First_Name: testClient.firstName,
    Last_Name: testClient.lastName,
    Senior_First: testClient.seniorFirst || testClient.firstName,
    Senior_Last: testClient.seniorLast || testClient.lastName
  };
  
  console.log('📝 Creating client with data:', clientData);
  
  const response = await fetch(clientTableUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(clientData)
  });
  
  console.log(`📡 Client creation response status: ${response.status} ${response.statusText}`);
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create client record: ${response.status} ${errorText}`);
  }
  
  // Check if response has content
  const responseText = await response.text();
  console.log('📄 Raw client creation response:', responseText);
  
  if (!responseText || responseText.trim() === '') {
    console.log('✅ Empty response - Caspio insert successful');
    // For Caspio, empty response means success - we'll query for the real ID separately
    return { 
      success: true, 
      message: 'Client created successfully (empty response)'
    };
  }
  
  let result;
  try {
    result = JSON.parse(responseText);
  } catch (parseError) {
    console.error('❌ Failed to parse client creation response:', parseError);
    throw new Error(`Failed to parse client creation response: ${parseError.message}`);
  }
  
  console.log('📋 Parsed client creation response:', result);
  return result;
}

// Find the created client record by name to get the real Client_ID2
async function findCreatedClientRecord(accessToken: string, baseUrl: string, testClient: TestClient): Promise<string> {
  const clientRecordUrl = `${baseUrl}/tables/connect_tbl_clients/records`;
  
  // Query for the client we just created by First_Name and Last_Name
  const queryUrl = `${clientRecordUrl}?q.where=First_Name='${testClient.firstName}' AND Last_Name='${testClient.lastName}'&q.orderBy=client_ID2 DESC&q.limit=1`;
  
  console.log(`🔍 Searching for created client: ${testClient.firstName} ${testClient.lastName}`);
  
  const response = await fetch(queryUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to find created client record: ${response.status} ${errorText}`);
  }
  
  const result = await response.json();
  console.log('📋 Client search response:', result);
  
  if (result && result.Result && result.Result.length > 0) {
    const clientRecord = result.Result[0];
    const clientId = clientRecord.client_ID2 || clientRecord.Client_ID2 || clientRecord.Record_ID;
    
    if (clientId) {
      console.log(`✅ Found real Client_ID2: ${clientId}`);
      return clientId.toString();
    }
  }
  
  throw new Error(`Could not find created client record for ${testClient.firstName} ${testClient.lastName}`);
}

// Extract client_ID2 from response
function extractClientId(clientResult: any): string {
  // Handle mock response from empty Caspio response
  if (clientResult && clientResult.client_ID2) {
    return clientResult.client_ID2;
  } else if (clientResult && clientResult.Client_ID2) {
    return clientResult.Client_ID2;
  } else if (clientResult && clientResult.Record_ID) {
    return clientResult.Record_ID;
  } else {
    console.log('Available fields in client response:', Object.keys(clientResult || {}));
    throw new Error('client_ID2/Client_ID2/Record_ID not found in client response');
  }
}

// Get client record by ID
async function getClientRecord(accessToken: string, baseUrl: string, clientId: string): Promise<any> {
  const clientRecordUrl = `${baseUrl}/tables/connect_tbl_clients/records`;
  
  // Use numeric comparison for client_ID2
  const response = await fetch(`${clientRecordUrl}?q.where=client_ID2=${clientId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.warn(`⚠️ Failed to get client record: ${response.status} ${errorText}`);
    return null;
  }
  
  const result = await response.json();
  console.log('📋 Retrieved client record:', result);
  
  if (result && result.Result && result.Result.length > 0) {
    return result.Result[0];
  }
  
  console.warn(`⚠️ No client record found with ID: ${clientId}`);
  return null;
}

// Create member record in CalAIM_tbl_Members
function getCaseInsensitiveValue(source: Record<string, any> | null | undefined, key: string) {
  if (!source) return undefined;
  if (key in source) return source[key];
  const lowerKey = key.toLowerCase();
  const match = Object.keys(source).find((entry) => entry.toLowerCase() === lowerKey);
  return match ? source[match] : undefined;
}

async function createMemberRecord(
  accessToken: string,
  baseUrl: string,
  testClient: TestClient,
  clientId: string,
  retrievedClient: any,
  fieldNames: string[],
  writableFields: Set<string>,
  generatedMediCalNumber: string,
  generatedMedicalRecordNumber: string,
  dryRun: boolean
): Promise<any> {
  const memberTableUrl = `${baseUrl}/tables/CalAIM_tbl_Members/records`;
  
  // Use the correct field names for CalAIM_tbl_Members table
  const memberData: Record<string, any> = {
    client_ID2: clientId,
    Senior_First: retrievedClient?.Senior_First || testClient.seniorFirst || testClient.firstName,
    Senior_Last: retrievedClient?.Senior_Last || testClient.seniorLast || testClient.lastName,
    MediCal_Number: generatedMediCalNumber,
    MCP_CIN: generatedMedicalRecordNumber,
    CalAIM_MCO: testClient.mco
    // Removed DateCreated and LastUpdated as they don't exist in the table
  };

  const mappedFields: Record<string, any> = {};
  const uniqueToken = Date.now().toString().slice(-6);
  const allowAllFields = dryRun || writableFields.size === 0;
  fieldNames.forEach((fieldName) => {
    if (!fieldName || fieldName in memberData) return;
    if (!allowAllFields && !writableFields.has(fieldName)) return;

    const normalizedField = normalizeFieldName(fieldName);
    if (normalizedField === 'medicalnumber' || normalizedField === 'mc') {
      mappedFields[fieldName] = generatedMediCalNumber;
      return;
    }
    if (normalizedField === 'mcpcin' || normalizedField === 'mrn') {
      mappedFields[fieldName] = generatedMedicalRecordNumber;
      return;
    }

    const existingValue = getCaseInsensitiveValue(retrievedClient, fieldName);
    if (existingValue !== undefined && existingValue !== null && existingValue !== '') {
      mappedFields[fieldName] = existingValue;
      return;
    }

    const mockValue = buildMockValueFromName(
      fieldName,
      uniqueToken,
      testClient,
      generatedMediCalNumber,
      generatedMedicalRecordNumber
    );
    if (mockValue !== undefined) {
      mappedFields[fieldName] = mockValue;
    }
  });

  if (false) {
  fieldNames.forEach((fieldName) => {
    if (!fieldName || fieldName in memberData) return;
    if (!writableFields.has(fieldName)) return;
    if (fieldName.toLowerCase() === 'medical_number' || fieldName.toLowerCase() === 'medic al_number') {
      mappedFields[fieldName] = generatedMediCalNumber;
      return;
    }
    if (fieldName.toLowerCase() === 'med ical_number' || fieldName.toLowerCase() === 'medic al_number') {
      mappedFields[fieldName] = generatedMediCalNumber;
      return;
    }
    if (fieldName.toLowerCase() === 'medical_number' || fieldName.toLowerCase() === 'medic al_number') {
      mappedFields[fieldName] = generatedMediCalNumber;
      return;
    }
    if (fieldName.toLowerCase() === 'medic al_number' || fieldName.toLowerCase() === 'medical_number') {
      mappedFields[fieldName] = generatedMediCalNumber;
      return;
    }
    if (fieldName.toLowerCase() === 'medical_number' || fieldName.toLowerCase() === 'medic al_number') {
      mappedFields[fieldName] = generatedMediCalNumber;
      return;
    }
    if (fieldName.toLowerCase() === 'medic al_number' || fieldName.toLowerCase() === 'medical_number') {
      mappedFields[fieldName] = generatedMediCalNumber;
      return;
    }
    if (fieldName.toLowerCase() === 'medical_number' || fieldName.toLowerCase() === 'medic al_number') {
      mappedFields[fieldName] = generatedMediCalNumber;
      return;
    }
    if (fieldName.toLowerCase() === 'medical_number' || fieldName.toLowerCase() === 'medic al_number') {
      mappedFields[fieldName] = generatedMediCalNumber;
      return;
    }
    if (fieldName.toLowerCase() === 'medical_number') {
      mappedFields[fieldName] = generatedMediCalNumber;
      return;
    }
    if (fieldName.toLowerCase() === 'medic al_number') {
      mappedFields[fieldName] = generatedMediCalNumber;
      return;
    }
    if (fieldName.toLowerCase() === 'medic al_number') {
      mappedFields[fieldName] = generatedMediCalNumber;
      return;
    }
    if (fieldName.toLowerCase() === 'medic al_number') {
      mappedFields[fieldName] = generatedMediCalNumber;
      return;
    }
    if (fieldName.toLowerCase() === 'medic al_number') {
      mappedFields[fieldName] = generatedMediCalNumber;
      return;
    }
    if (fieldName.toLowerCase() === 'medical_number') {
      mappedFields[fieldName] = generatedMediCalNumber;
      return;
    }
    if (fieldName.toLowerCase() === 'medic al_number') {
      mappedFields[fieldName] = generatedMediCalNumber;
      return;
    }
    if (fieldName.toLowerCase() === 'medic al_number') {
      mappedFields[fieldName] = generatedMediCalNumber;
      return;
    }
    if (fieldName.toLowerCase() === 'medic al_number') {
      mappedFields[fieldName] = generatedMediCalNumber;
      return;
    }
    if (fieldName.toLowerCase() === 'medic al_number') {
      mappedFields[fieldName] = generatedMediCalNumber;
      return;
    }
    if (fieldName.toLowerCase() === 'medical_number') {
      mappedFields[fieldName] = generatedMediCalNumber;
      return;
    }
    if (fieldName.toLowerCase() === 'medic al_number') {
      mappedFields[fieldName] = generatedMediCalNumber;
      return;
    }
    if (fieldName.toLowerCase() === 'medic al_number') {
      mappedFields[fieldName] = generatedMediCalNumber;
      return;
    }
    if (fieldName.toLowerCase() === 'medic al_number') {
      mappedFields[fieldName] = generatedMediCalNumber;
      return;
    }
    if (fieldName.toLowerCase() === 'medic al_number') {
      mappedFields[fieldName] = generatedMediCalNumber;
      return;
    }
    if (fieldName.toLowerCase() === 'medical_number') {
      mappedFields[fieldName] = generatedMediCalNumber;
      return;
    }
    if (fieldName.toLowerCase() === 'medic al_number') {
      mappedFields[fieldName] = generatedMediCalNumber;
      return;
    }
    if (fieldName.toLowerCase() === 'medical_number') {
      mappedFields[fieldName] = generatedMediCalNumber;
      return;
    }
    if (fieldName.toLowerCase() === 'medic al_number') {
      mappedFields[fieldName] = generatedMediCalNumber;
      return;
    }
    if (fieldName.toLowerCase() === 'medic al_number') {
      mappedFields[fieldName] = generatedMediCalNumber;
      return;
    }
    if (fieldName.toLowerCase() === 'medic al_number') {
      mappedFields[fieldName] = generatedMediCalNumber;
      return;
    }
    if (fieldName.toLowerCase() === 'medic al_number') {
      mappedFields[fieldName] = generatedMediCalNumber;
      return;
    }
    if (fieldName.toLowerCase() === 'medic al_number') {
      mappedFields[fieldName] = generatedMediCalNumber;
      return;
    }
    if (fieldName.toLowerCase() === 'medical_number') {
      mappedFields[fieldName] = generatedMediCalNumber;
      return;
    }
    if (fieldName.toLowerCase() === 'medic al_number') {
      mappedFields[fieldName] = generatedMediCalNumber;
      return;
    }
    if (fieldName.toLowerCase() === 'medical_number') {
      mappedFields[fieldName] = generatedMediCalNumber;
      return;
    }
    if (fieldName.toLowerCase() === 'medic al_number') {
      mappedFields[fieldName] = generatedMediCalNumber;
      return;
    }
    if (fieldName.toLowerCase() === 'medical_number') {
      mappedFields[fieldName] = generatedMediCalNumber;
      return;
    }
    if (fieldName.toLowerCase() === 'medic al_number') {
      mappedFields[fieldName] = generatedMediCalNumber;
      return;
    }
    if (fieldName.toLowerCase() === 'medical_number') {
      mappedFields[fieldName] = generatedMediCalNumber;
      return;
    }
    if (fieldName.toLowerCase() === 'medic al_number') {
      mappedFields[fieldName] = generatedMediCalNumber;
      return;
    }
    const value = getCaseInsensitiveValue(retrievedClient, fieldName);
    if (value === undefined || value === null || value === '') {
      return;
    }
    mappedFields[fieldName] = value;
  });
  }
  fieldNames.forEach((fieldName) => {
    if (!fieldName || fieldName in memberData || fieldName in mappedFields) return;
    if (!allowAllFields && !writableFields.has(fieldName)) return;

    const existingValue = getCaseInsensitiveValue(retrievedClient, fieldName);
    if (existingValue !== undefined && existingValue !== null && existingValue !== '') {
      mappedFields[fieldName] = existingValue;
      return;
    }

    const mockValue = buildMockValueFromName(
      fieldName,
      uniqueToken,
      testClient,
      generatedMediCalNumber,
      generatedMedicalRecordNumber
    );
    if (mockValue !== undefined) {
      mappedFields[fieldName] = mockValue;
    }
  });

  const payload = {
    ...memberData,
    ...mappedFields,
  };
  
  console.log('📝 Creating member with enhanced data:', payload);

  if (dryRun) {
    return {
      dryRun: true,
      payloadPreview: payload,
      payloadFields: Object.keys(payload),
      payloadFieldCount: Object.keys(payload).length,
      mappedFieldCount: Object.keys(mappedFields).length,
    };
  }
  
  const response = await fetch(memberTableUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  
  console.log(`📡 Member creation response status: ${response.status} ${response.statusText}`);
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create member record: ${response.status} ${errorText}`);
  }
  
  // Check if response has content
  const responseText = await response.text();
  console.log('📄 Raw member creation response:', responseText);
  
  if (!responseText || responseText.trim() === '') {
    console.log('✅ Empty response - Caspio member insert successful');
    return { 
      success: true, 
      message: 'Member created successfully (empty response)',
      mappedFieldCount: Object.keys(mappedFields).length,
      payloadFieldCount: Object.keys(payload).length,
      payloadFields: Object.keys(payload),
    };
  }
  
  let result;
  try {
    result = JSON.parse(responseText);
  } catch (parseError) {
    console.error('❌ Failed to parse member creation response:', parseError);
    throw new Error(`Failed to parse member creation response: ${parseError.message}`);
  }
  
  console.log('📋 Parsed member creation response:', result);
  return {
    response: result,
    mappedFieldCount: Object.keys(mappedFields).length,
    payloadFieldCount: Object.keys(payload).length,
    payloadFields: Object.keys(payload),
  };
}

function generateMediCalNumber() {
  const digits = Math.floor(10000000 + Math.random() * 90000000).toString();
  const letter = String.fromCharCode(65 + Math.floor(Math.random() * 26));
  return `9${digits.substring(0, 7)}${letter}`;
}

function generateMedicalRecordNumber() {
  const now = Date.now().toString();
  return now.slice(-8);
}

function normalizeFieldName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function buildMockValueFromName(
  fieldName: string,
  uniqueToken: string,
  testClient: TestClient,
  generatedMediCalNumber: string,
  generatedMedicalRecordNumber: string
) {
  const normalized = fieldName.toLowerCase();
  const cleanToken = uniqueToken.padStart(6, '0');
  const phoneMid = cleanToken.slice(0, 3);
  const phoneSuffix = cleanToken.slice(-4);
  const sampleFirstNames = ['Maria', 'Jose', 'Linda', 'Robert', 'Angela', 'Carlos', 'Tanya', 'Derrick', 'Monica', 'Victor'];
  const sampleLastNames = ['Garcia', 'Johnson', 'Lopez', 'Williams', 'Brown', 'Davis', 'Martinez', 'Hernandez', 'Miller', 'Wilson'];
  const sampleContactNames = ['Fred', 'Henry', 'Angela', 'Monica', 'Victor', 'Tanya'];
  const sampleRcfes = [
    "Henry's Board and Care",
    'Sunset Hills RCFE',
    'Harbor View Assisted Living',
    'Cedar Grove Home',
    'Maplewood Care Center'
  ];
  const sampleAgencies = ['LA Care Partners', 'Community Health Network', 'WellPath Services', 'Golden State Care'];
  const sampleStreets = ['123 Main St', '456 Oak Ave', '789 Pine Rd', '210 Maple Blvd', '982 Sunset Dr'];
  const sampleCities = ['Los Angeles', 'Long Beach', 'Pasadena', 'Glendale', 'Inglewood'];
  const sampleStates = ['CA'];
  const randomItem = (items: string[]) => items[Math.floor(Math.random() * items.length)];
  const formattedPhone = `323-${phoneMid}-${phoneSuffix}`;

  if (normalized === 'medical_number' || normalized === 'mc' || normalized === 'medic al_number') {
    return generatedMediCalNumber;
  }
  if (normalized === 'mcp_cin' || normalized === 'mrn') {
    return generatedMedicalRecordNumber;
  }
  if (normalized.includes('first') && normalized.includes('name')) {
    if (normalized.includes('secondary') || normalized.includes('second')) {
      return randomItem(sampleContactNames);
    }
    return randomItem(sampleFirstNames);
  }
  if (normalized.includes('last') && normalized.includes('name')) {
    return randomItem(sampleLastNames);
  }
  if (normalized.includes('mco') || normalized.includes('healthplan')) {
    return testClient.mco;
  }
  if (normalized.includes('sex')) {
    return 'Female';
  }
  if (normalized.includes('birth') || normalized.includes('dob')) {
    return new Date().toISOString().slice(0, 10);
  }
  if (normalized.includes('rcfe') || normalized.includes('facility') || normalized.includes('board') || normalized.includes('care')) {
    return randomItem(sampleRcfes);
  }
  if (normalized.includes('snf') && (normalized.includes('diversion') || normalized.includes('transition'))) {
    return randomItem(['Diversion', 'Transition', 'Unknown']);
  }
  if (normalized.includes('legal') && normalized.includes('representative')) {
    return Math.random() > 0.5 ? 'Yes' : 'No';
  }
  if (normalized.includes('capacity')) {
    return Math.random() > 0.5 ? 'Yes' : 'No';
  }
  if (normalized.includes('agency')) {
    return randomItem(sampleAgencies);
  }
  if (normalized.includes('county')) {
    return 'Los Angeles';
  }
  if (normalized.includes('email')) {
    return `test+${uniqueToken}@example.com`;
  }
  if (normalized.includes('phone')) {
    if (normalized.includes('secondary') || normalized.includes('second')) {
      return '111-111-1111';
    }
    return formattedPhone;
  }
  if (normalized.includes('address')) {
    return randomItem(sampleStreets);
  }
  if (normalized.includes('city')) {
    return randomItem(sampleCities);
  }
  if (normalized.includes('state')) {
    return randomItem(sampleStates);
  }
  if (normalized.includes('zip')) {
    return '90001';
  }
  if (normalized.includes('age') || normalized.includes('count') || normalized.includes('number')) {
    return 1;
  }
  return `Test_${fieldName}_${uniqueToken}`;
}

async function getWritableMemberFields(accessToken: string, baseUrl: string): Promise<Set<string>> {
  const schemaUrl = `${baseUrl}/tables/CalAIM_tbl_Members`;
  const response = await fetch(schemaUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to load CalAIM schema: ${response.status} ${errorText}`);
  }

  const schema = await response.json();
  const fields = Array.isArray(schema?.Result?.Fields) ? schema.Result.Fields : [];
  const blocked = new Set(['Record_ID', 'DateCreated', 'LastUpdated', 'created_date', 'last_updated']);
  const writable = new Set<string>();

  fields.forEach((field: any) => {
    const name = field?.Name;
    if (!name || blocked.has(name)) return;
    if (field?.IsReadOnly === true || field?.ReadOnly === true) return;
    writable.add(name);
  });

  return writable;
}