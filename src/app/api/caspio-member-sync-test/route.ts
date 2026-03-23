import { NextRequest, NextResponse } from 'next/server';
import { getCaspioServerAccessToken, getCaspioServerConfig } from '@/lib/caspio-server-auth';

interface MockMember {
  firstName: string;
  lastName: string;
  mco: string; // MCO name
}

export async function POST() {
  try {
    console.log('🧪 Starting Caspio Member Sync Test via API route...');
    
    const caspioConfig = getCaspioServerConfig();
    const baseUrl = caspioConfig.restBaseUrl;
    
    // Get Caspio access token first
    console.log('🔑 Attempting to get Caspio access token...');
    const accessToken = await getCaspioServerAccessToken(caspioConfig);
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