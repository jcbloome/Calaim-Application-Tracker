import { onCall, HttpsError } from "firebase-functions/v2/https";

interface MockMember {
  firstName: string;
  lastName: string;
  mco: string; // MCO name
  seniorFirst?: string; // Optional senior/guardian first name
  seniorLast?: string; // Optional senior/guardian last name
}

interface CaspioClientResponse {
  client_ID2: string;
  [key: string]: any;
}

// Test function to sync mock member data to Caspio
export const testCaspioMemberSync = onCall({
  cors: true
}, async (request) => {
  try {
    console.log('🧪 Starting Caspio Member Sync Test...');
    
    // Use hardcoded credentials for testing (same as Kaiser function)
    const baseUrl = 'https://c7ebl500.caspio.com/rest/v2';
    const clientId = 'b721f0c7af4d4f7542e8a28665bfccb07e93f47deb4bda27bc';
    const clientSecret = 'bad425d4a8714c8b95ec2ea9d256fc649b2164613b7e54099c';
    
    console.log('🔍 Using hardcoded credentials for testing...');
    
    // Get Caspio access token first
    console.log('🔑 Attempting to get Caspio access token...');
    const accessToken = await getCaspioAccessToken();
    console.log('✅ Caspio access token obtained successfully');
    
    // Mock test data with unique names to avoid conflicts
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const testMembers: MockMember[] = [
      { 
        firstName: 'TestUser', 
        lastName: `Firebase-${timestamp}`, 
        mco: 'Kaiser Permanente',
        seniorFirst: 'Senior',
        seniorLast: `Guardian-${timestamp}`
      }
    ];
    
    console.log(`📋 Testing with ${testMembers.length} mock member`);
    
    const results = [];
    
    for (const member of testMembers) {
      try {
        console.log(`👤 Processing member: ${member.firstName} ${member.lastName}`);
        
        // Step 1: Add to connect_tbl_clients table and get client_ID2
        const clientId = await addToClientTable(accessToken, member);
        console.log(`✅ Added to connect_tbl_clients table, client_ID2: ${clientId}`);
        
        // Step 2: Add to CalAIM_tbl_Members with client_ID2 and MCO
        const memberResult = await addToMemberTable(accessToken, member, clientId);
        console.log(`✅ Added to CalAIM_tbl_Members`);
        
        results.push({
          member: `${member.firstName} ${member.lastName}`,
          clientId: clientId,
          mco: member.mco,
          success: true,
          clientTableResult: clientId,
          memberTableResult: memberResult
        });
        
      } catch (memberError: any) {
        console.error(`❌ Error processing ${member.firstName} ${member.lastName}:`, memberError);
        results.push({
          member: `${member.firstName} ${member.lastName}`,
          success: false,
          error: memberError.message
        });
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    console.log(`✅ Test complete: ${successCount}/${testMembers.length} members processed successfully`);
    
    return {
      success: true,
      message: `Caspio member sync test completed: ${successCount}/${testMembers.length} successful`,
      results: results,
      summary: {
        totalTested: testMembers.length,
        successful: successCount,
        failed: testMembers.length - successCount
      }
    };
    
  } catch (error: any) {
    console.error('❌ Caspio member sync test failed:', error);
    console.error('❌ Error name:', error.name);
    console.error('❌ Error message:', error.message);
    console.error('❌ Error code:', error.code);
    console.error('❌ Error stack:', error.stack);
    
    // Provide more specific error information
    let errorMessage = error.message || 'Unknown error occurred';
    if (error.code) {
      errorMessage = `${error.code}: ${errorMessage}`;
    }
    
    throw new HttpsError('internal', `Caspio member sync test failed: ${errorMessage}`);
  }
});

// Get Caspio OAuth access token
async function getCaspioAccessToken(): Promise<string> {
  const baseUrl = 'https://c7ebl500.caspio.com';
  const clientId = 'b721f0c7af4d4f7542e8a28665bfccb07e93f47deb4bda27bc';
  const clientSecret = 'bad425d4a8714c8b95ec2ea9d256fc649b2164613b7e54099c';
  
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const tokenUrl = `${baseUrl}/oauth/token`;
  
  console.log(`🔑 Getting access token from: ${tokenUrl}`);
  
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
  
  console.log(`📡 OAuth response: ${response.status} ${response.statusText}`);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ OAuth failed: ${response.status} ${errorText}`);
    throw new Error(`Failed to get access token: ${response.status} ${errorText}`);
  }
  
  const tokenData = await response.json();
  console.log(`✅ Access token obtained, length: ${tokenData.access_token?.length || 0}`);
  return tokenData.access_token;
}

// Add member to Client table and return client_ID2
async function addToClientTable(accessToken: string, member: MockMember): Promise<string> {
  const baseUrl = 'https://c7ebl500.caspio.com/rest/v2';
  const clientTableUrl = `${baseUrl}/tables/connect_tbl_clients/records`;
  
  const clientData = {
    First_Name: member.firstName,
    Last_Name: member.lastName,
    Senior_First: member.seniorFirst || member.firstName, // Use senior name if provided, fallback to member name
    Senior_Last: member.seniorLast || member.lastName
    // Removed Date_Created and Status as they don't exist in the table
  };
  
  console.log(`📝 Adding to connect_tbl_clients table:`, clientData);
  
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
    throw new Error(`Failed to add to connect_tbl_clients table: ${response.status} ${errorText}`);
  }
  
  const result = await response.json();
  console.log('📋 connect_tbl_clients table response:', result);
  
  // Extract client_ID2 from response (try different possible field names)
  if (result && result.client_ID2) {
    return result.client_ID2;
  } else if (result && result.Client_ID2) {
    return result.Client_ID2;
  } else if (result && result.Record_ID) {
    return result.Record_ID;
  } else {
    console.log('Available fields in response:', Object.keys(result || {}));
    throw new Error('client_ID2/Client_ID2/Record_ID not found in connect_tbl_clients table response');
  }
}

// Add member to CalAIM_tbl_Members with client_ID2 and MCO
async function addToMemberTable(accessToken: string, member: MockMember, clientId: string): Promise<any> {
  const baseUrl = 'https://c7ebl500.caspio.com/rest/v2';
  const memberTableUrl = `${baseUrl}/tables/CalAIM_tbl_Members/records`;
  
  // First, get the client record to retrieve Senior_First and Senior_Last
  console.log(`🔍 Retrieving client record with ID: ${clientId}`);
  const clientRecord = await getClientRecord(accessToken, clientId);
  
  const memberData = {
    client_ID2: clientId,
    memberFirstName: member.firstName,
    memberLastName: member.lastName,
    CalAIM_MCO: member.mco,
    CalAIM_Status: 'New Referral',
    LastUpdated: new Date().toISOString(),
    created_date: new Date().toISOString(),
    // Add the additional fields from client table
    Senior_First: clientRecord?.Senior_First || clientRecord?.First_Name || member.firstName,
    Senior_Last: clientRecord?.Senior_Last || clientRecord?.Last_Name || member.lastName,
    Client_ID2: clientId // Explicitly include Client_ID2 as well
  };
  
  console.log(`📝 Adding to CalAIM_tbl_Members with enhanced data:`, memberData);
  
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
    throw new Error(`Failed to add to CalAIM_tbl_Members: ${response.status} ${errorText}`);
  }
  
  const result = await response.json();
  console.log('📋 CalAIM_tbl_Members response:', result);
  
  return result;
}

// Get client record by client_ID2 to retrieve Senior_First and Senior_Last
async function getClientRecord(accessToken: string, clientId: string): Promise<any> {
  const baseUrl = 'https://c7ebl500.caspio.com/rest/v2';
  const clientRecordUrl = `${baseUrl}/tables/connect_tbl_clients/records`;
  
  console.log(`🔍 Fetching client record with ID: ${clientId}`);
  
  // Query for the specific client record
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
    return null; // Return null if we can't fetch the record
  }
  
  const result = await response.json();
  console.log('📋 Client record response:', result);
  
  // Return the first record if found
  if (result && result.Result && result.Result.length > 0) {
    return result.Result[0];
  }
  
  console.warn(`⚠️ No client record found with ID: ${clientId}`);
  return null;
}

// Check what tables are available
async function checkAvailableTables(accessToken: string): Promise<any> {
  const baseUrl = 'https://c7ebl500.caspio.com/rest/v2';
  const tablesUrl = `${baseUrl}/tables`;
  
  console.log(`🔍 Checking tables at: ${tablesUrl}`);
  
  const response = await fetch(tablesUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.log(`❌ Failed to get tables: ${response.status} ${errorText}`);
    return { error: `${response.status}: ${errorText}` };
  }
  
  const result = await response.json();
  return result;
}

// Get table structure/fields
async function getTableStructure(accessToken: string, tableName: string): Promise<any> {
  const baseUrl = 'https://c7ebl500.caspio.com/rest/v2';
  const tableUrl = `${baseUrl}/tables/${tableName}`;
  
  console.log(`🔍 Checking table structure at: ${tableUrl}`);
  
  const response = await fetch(tableUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.log(`❌ Failed to get table structure: ${response.status} ${errorText}`);
    return { error: `${response.status}: ${errorText}` };
  }
  
  const result = await response.json();
  return result;
}