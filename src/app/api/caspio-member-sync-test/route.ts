import { NextRequest, NextResponse } from 'next/server';

interface MockMember {
  firstName: string;
  lastName: string;
  mco: string; // MCO name
}

export async function POST() {
  try {
    console.log('🧪 Starting Caspio Member Sync Test via API route...');
    
    // Use hardcoded credentials (same as Kaiser function)
    const baseUrl = 'https://c7ebl500.caspio.com/rest/v2';
    const clientId = 'b721f0c7af4d4f7542e8a28665bfccb07e93f47deb4bda27bc';
    const clientSecret = 'bad425d4a8714c8b95ec2ea9d256fc649b2164613b7e54099c';
    
    // Get Caspio access token first
    console.log('🔑 Attempting to get Caspio access token...');
    const accessToken = await getCaspioAccessToken(baseUrl, clientId, clientSecret);
    console.log('✅ Caspio access token obtained successfully');
    
    // Mock test data (simplified for initial testing)
    const testMembers: MockMember[] = [
      { firstName: 'John', lastName: 'Smith', mco: 'Kaiser Permanente' }
    ];
    
    console.log(`📋 Testing with ${testMembers.length} mock member`);
    
    const results = [];
    
    for (const member of testMembers) {
      try {
        console.log(`👤 Processing member: ${member.firstName} ${member.lastName}`);
        
        // Step 1: Add to connect_tbl_clients table and get client_ID2
        const clientId = await addToClientTable(accessToken, member, baseUrl);
        console.log(`✅ Added to connect_tbl_clients table, client_ID2: ${clientId}`);
        
        // Step 2: Add to CalAIM_tbl_Members with client_ID2 and MCO
        const memberResult = await addToMemberTable(accessToken, member, clientId, baseUrl);
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
    
    return NextResponse.json({
      success: true,
      message: `Caspio member sync test completed: ${successCount}/${testMembers.length} successful`,
      results: results,
      summary: {
        totalTested: testMembers.length,
        successful: successCount,
        failed: testMembers.length - successCount
      }
    });
    
  } catch (error: any) {
    console.error('❌ Caspio member sync test failed:', error);
    
    return NextResponse.json({
      success: false,
      message: `Caspio member sync test failed: ${error.message}`,
      error: error.toString()
    }, { status: 500 });
  }
}

// Get Caspio OAuth access token
async function getCaspioAccessToken(baseUrl: string, clientId: string, clientSecret: string): Promise<string> {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  
  // Try the working endpoint first (without /rest/v2)
  const tokenUrl = `https://c7ebl500.caspio.com/oauth/token`;
  
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
async function addToClientTable(accessToken: string, member: MockMember, baseUrl: string): Promise<string> {
  const clientTableUrl = `${baseUrl}/tables/connect_tbl_clients/records`;
  
  const clientData = {
    First_Name: member.firstName,
    Last_Name: member.lastName
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
async function addToMemberTable(accessToken: string, member: MockMember, clientId: string, baseUrl: string): Promise<any> {
  const memberTableUrl = `${baseUrl}/tables/CalAIM_tbl_Members/records`;
  
  const memberData = {
    client_ID2: clientId,
    memberFirstName: member.firstName,
    memberLastName: member.lastName,
    CalAIM_MCO: member.mco,
    CalAIM_Status: 'New Referral',
    LastUpdated: new Date().toISOString(),
    created_date: new Date().toISOString()
  };
  
  console.log(`📝 Adding to CalAIM_tbl_Members:`, memberData);
  
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