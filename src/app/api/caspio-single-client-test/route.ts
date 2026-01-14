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
    
    const body = await request.json();
    const testClient: TestClient = body.testClient;
    
    if (!testClient) {
      return NextResponse.json({
        success: false,
        message: 'Test client data is required'
      }, { status: 400 });
    }

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
    const clientId2 = extractClientId(clientResult);
    
    console.log(`✅ Client created with ID: ${clientId2}`);
    
    // Step 2: Retrieve client record to get all fields
    console.log('🔍 Step 2: Retrieving client record...');
    const retrievedClient = await getClientRecord(accessToken, baseUrl, clientId2);
    
    // Step 3: Create member record with enhanced data
    console.log('📝 Step 3: Creating member record...');
    const memberResult = await createMemberRecord(accessToken, baseUrl, testClient, clientId2, retrievedClient);
    
    console.log('✅ Single client test completed successfully!');
    
    return NextResponse.json({
      success: true,
      message: `Successfully created client and member records for ${testClient.firstName} ${testClient.lastName}`,
      clientId: clientId2,
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
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create client record: ${response.status} ${errorText}`);
  }
  
  const result = await response.json();
  console.log('📋 Client creation response:', result);
  return result;
}

// Extract client_ID2 from response
function extractClientId(clientResult: any): string {
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
  
  const response = await fetch(`${clientRecordUrl}?q.where=client_ID2='${clientId}'`, {
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
  
  return null;
}

// Create member record in CalAIM_tbl_Members
async function createMemberRecord(accessToken: string, baseUrl: string, testClient: TestClient, clientId: string, retrievedClient: any): Promise<any> {
  const memberTableUrl = `${baseUrl}/tables/CalAIM_tbl_Members/records`;
  
  const memberData = {
    client_ID2: clientId,
    Client_ID2: clientId, // Include both variations
    memberFirstName: testClient.firstName,
    memberLastName: testClient.lastName,
    CalAIM_MCO: testClient.mco,
    CalAIM_Status: 'New Referral',
    LastUpdated: new Date().toISOString(),
    created_date: new Date().toISOString(),
    // Enhanced fields from client record
    Senior_First: retrievedClient?.Senior_First || testClient.seniorFirst || testClient.firstName,
    Senior_Last: retrievedClient?.Senior_Last || testClient.seniorLast || testClient.lastName
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
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create member record: ${response.status} ${errorText}`);
  }
  
  const result = await response.json();
  console.log('📋 Member creation response:', result);
  return result;
}