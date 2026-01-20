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
    
    // Generate sequential test subject names
    const testNumber = Math.floor(Math.random() * 100) + 1;
    const testClient: TestClient = {
      firstName: `TestClient`,
      lastName: `${testNumber}_${Date.now()}`,
      seniorFirst: `TestSenior`,
      seniorLast: `${testNumber}_${Date.now()}`,
      mco: Math.random() > 0.5 ? 'Kaiser Permanente' : 'Health Net'
    };
    
    console.log('👤 Using generated test client data:', testClient);

    // Caspio credentials (hardcoded for testing)
    const baseUrl = 'https://c7ebl500.caspio.com/rest/v2';
    const clientId = 'b721f0c7af4d4f7542e8a28665bfccb07e93f47deb4bda27bc';
    const clientSecret = 'bad425d4a8714c8b95ec2ea9d256fc649b2164613b7e54099c';
    
    console.log('🔑 Getting Caspio access token...');
    const accessToken = await getCaspioAccessToken(clientId, clientSecret);
    
    console.log(`👤 Testing client: ${testClient.firstName} ${testClient.lastName}`);
    
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
    
    // Step 4: Create member record with enhanced data
    console.log('📝 Step 4: Creating member record in CalAIM_tbl_Members...');
    const memberResult = await createMemberRecord(accessToken, baseUrl, testClient, realClientId, retrievedClient);
    
    console.log('✅ Single client test completed successfully!');
    
    return NextResponse.json({
      success: true,
      message: `Successfully created client and member records for ${testClient.firstName} ${testClient.lastName}`,
      clientId: realClientId,
      mco: testClient.mco,
      clientResult: clientResult,
      memberResult: memberResult,
      retrievedClient: retrievedClient
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
async function createMemberRecord(accessToken: string, baseUrl: string, testClient: TestClient, clientId: string, retrievedClient: any): Promise<any> {
  const memberTableUrl = `${baseUrl}/tables/CalAIM_tbl_Members/records`;
  
  // Use the correct field names for CalAIM_tbl_Members table
  const memberData = {
    client_ID2: clientId,
    Senior_First: retrievedClient?.Senior_First || testClient.seniorFirst || testClient.firstName,
    Senior_Last: retrievedClient?.Senior_Last || testClient.seniorLast || testClient.lastName,
    CalAIM_MCO: testClient.mco,
    CalAIM_Status: 'New Referral'
    // Removed DateCreated and LastUpdated as they don't exist in the table
  };
  
  console.log('📝 Creating member with enhanced data:', memberData);
  
  const response = await fetch(memberTableUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(memberData)
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
      message: 'Member created successfully (empty response)'
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
  return result;
}