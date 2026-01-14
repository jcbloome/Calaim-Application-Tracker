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
    
    // First, let's discover what fields actually exist in the table
    console.log('🔍 Discovering actual table structure...');
    const tableStructure = await getTableStructure(accessToken, baseUrl, 'connect_tbl_clients');
    console.log('📋 Table structure:', JSON.stringify(tableStructure, null, 2));
    
    // Mock test data with unique names to avoid conflicts
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const testMembers: MockMember[] = [
      { firstName: 'TestUser', lastName: `APIRoute-${timestamp}`, mco: 'Kaiser Permanente' }
    ];
    
    console.log(`📋 Testing with ${testMembers.length} mock member - SIMPLIFIED TEST (clients table only)`);
    
    const results = [];
    
    for (const member of testMembers) {
      try {
        console.log(`👤 Processing member: ${member.firstName} ${member.lastName}`);
        
        // SIMPLIFIED: Only add to connect_tbl_clients table (no CalAIM_tbl_Members for now)
        const clientResult = await addToClientTable(accessToken, member, baseUrl);
        console.log(`✅ Successfully added to connect_tbl_clients table`);
        
        results.push({
          member: `${member.firstName} ${member.lastName}`,
          success: true,
          clientTableResult: clientResult,
          message: 'Successfully added to clients table only'
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
    Senior_First: member.firstName,
    Senior_Last: member.lastName
    // Using the actual field names from Caspio interface
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
  console.log('📋 connect_tbl_clients table response:', JSON.stringify(result, null, 2));
  console.log('📋 Available fields in response:', Object.keys(result || {}));
  
  // For now, just return the whole result - we'll see what fields are actually returned
  return result;
}

// CalAIM_tbl_Members function removed for simplified testing

// Get table structure/fields
async function getTableStructure(accessToken: string, baseUrl: string, tableName: string): Promise<any> {
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