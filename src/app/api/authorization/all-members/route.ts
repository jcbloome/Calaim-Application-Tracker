import { NextRequest, NextResponse } from 'next/server';

interface CaspioAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

/**
 * Get OAuth token from Caspio
 */
async function getCaspioAccessToken(): Promise<string> {
  const baseUrl = 'https://c7ebl500.caspio.com/rest/v2';
  const clientId = 'b721f0c7af4d4f7542e8a28665bfccb07e93f47deb4bda27bc';
  const clientSecret = 'bad425d4a8714c8b95ec2ea9d256fc649b2164613b7e54099c';
  
  // Try the exact same approach as Firebase Functions
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const tokenUrl = `https://c7ebl500.caspio.com/oauth/token`;
  
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Caspio OAuth failed:', { status: response.status, error: errorText });
    throw new Error('Failed to authenticate with Caspio');
  }

  const data: CaspioAuthResponse = await response.json();
  return data.access_token;
}

export async function GET(req: NextRequest) {
  try {
    console.log('🔍 Fetching ALL members from Caspio for Authorization Tracker...');
    
    // Get OAuth token
    const accessToken = await getCaspioAccessToken();
    console.log('✅ Got Caspio access token successfully');
    
    // Fetch ALL members from CalAIM_tbl_Members table
    const baseUrl = 'https://c7ebl500.caspio.com/rest/v2';
    const apiUrl = `${baseUrl}/tables/CalAIM_tbl_Members/records`;
    const response = await fetch(`${apiUrl}?q.limit=1000`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Failed to fetch members from Caspio:', { status: response.status, error: errorText });
      throw new Error('Failed to fetch member data from Caspio');
    }

    const data = await response.json();
    const allMembers = data.Result || [];
    
    console.log(`📊 Fetched ${allMembers.length} total members from Caspio`);
    
    // Transform data for Authorization Tracker (include ALL members)
    const transformedMembers = allMembers.map((member: any) => {
      return {
        // Basic info using EXACT Caspio field names
        recordId: member.Record_ID || '',
        memberFirstName: member.Senior_First || '',
        memberLastName: member.Senior_Last || '',
        memberMediCalNum: member.MC || '',
        memberMrn: member.MCP_CIN || '',
        memberCounty: member.Member_County || '',
        memberHealthPlan: member.CalAIM_MCP || '',
        memberStatus: member.CalAIM_Status || '',
        
        // Authorization fields - using EXACT field names from your Caspio table
        authStartDateT2038: member.Authorization_Start_Date_T2038 || '',
        authEndDateT2038: member.Authorization_End_Date_T2038 || '',
        authStartDateH2022: member.Authorization_Start_Date_H2022 || '',
        authEndDateH2022: member.Authorization_End_Date_H2022 || '',
        authExtRequestDateT2038: member.Requested_Auth_Extension_T2038 || member.Auth_Ext_Request_Date_T2038 || '',
        authExtRequestDateH2022: member.Requested_Auth_Extension_H2022 || '',
        
        // Additional useful fields
        primaryContact: member.Primary_Contact || '',
        contactPhone: member.Contact_Phone || '',
        contactEmail: member.Contact_Email || '',
      };
    });
    
    console.log(`✅ Transformed ${transformedMembers.length} members for authorization tracking`);
    
    return NextResponse.json({ 
      success: true, 
      members: transformedMembers,
      totalCount: transformedMembers.length 
    });
    
  } catch (error: any) {
    console.error('❌ Error in Authorization API:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Failed to fetch authorization data' 
    }, { status: 500 });
  }
}