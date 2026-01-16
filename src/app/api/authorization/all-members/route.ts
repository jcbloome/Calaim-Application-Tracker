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
    console.log('🚀 API ROUTE CALLED - Authorization Tracker ALL MEMBERS');
    console.log('🔍 Fetching ALL members from Caspio for Authorization Tracker...');
    
    // Get OAuth token
    const accessToken = await getCaspioAccessToken();
    console.log('✅ Got Caspio access token successfully');
    
    // Fetch ALL members from CalAIM_tbl_Members table with pagination
    const baseUrl = 'https://c7ebl500.caspio.com/rest/v2';
    const apiUrl = `${baseUrl}/tables/CalAIM_tbl_Members/records`;
    
    let allMembers: any[] = [];
    let pageToken = '';
    let pageCount = 0;
    let offset = 0;
    const limit = 1000;
    const maxPages = 10; // Safety limit
    let pageMembers: any[] = [];
    
    do {
      // Try both token-based and offset-based pagination
      const url = pageToken 
        ? `${apiUrl}?q.limit=${limit}&q.pageToken=${pageToken}`
        : `${apiUrl}?q.limit=${limit}&q.offset=${offset}`;
        
      console.log(`📄 Fetching page ${pageCount + 1} from Caspio...`);
      
      const response = await fetch(url, {
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
      pageMembers = data.Result || [];
      allMembers = allMembers.concat(pageMembers);
      
      pageToken = data.NextPageToken || '';
      pageCount++;
      offset += limit;
      
      console.log(`📊 Page ${pageCount}: ${pageMembers.length} members, Total so far: ${allMembers.length}`);
      console.log(`🔍 Response metadata:`, {
        hasNextPageToken: !!data.NextPageToken,
        nextPageToken: data.NextPageToken,
        resultCount: pageMembers.length,
        responseKeys: Object.keys(data),
        nextOffset: offset
      });
      
      // If we got fewer records than the limit and no next page token, we're done
      if (pageMembers.length < limit && !pageToken) {
        console.log('📋 Reached end of data - fewer records than limit and no next page token');
        break;
      }
      
      // Debug first few members' health plan fields
      if (pageCount === 1 && pageMembers.length > 0) {
        console.log('🔍 Sample health plan fields from first member:');
        const sample = pageMembers[0];
        console.log('- CalAIM_MCP:', sample.CalAIM_MCP);
        console.log('- MC_Plan:', sample.MC_Plan);
        console.log('- Health_Plan:', sample.Health_Plan);
        console.log('- MCP:', sample.MCP);
        console.log('- MCP_CIN:', sample.MCP_CIN);
        console.log('- Name_Other_MCP:', sample.Name_Other_MCP);
        console.log('- Will_Swith_To_What_MCP:', sample.Will_Swith_To_What_MCP);
        console.log('- All MCP/Plan fields:', Object.keys(sample).filter(key => key.toLowerCase().includes('plan') || key.toLowerCase().includes('mcp') || key.toLowerCase().includes('kaiser') || key.toLowerCase().includes('health')));
        console.log('- First 10 field names:', Object.keys(sample).slice(0, 10));
        console.log('- Sample member data:', JSON.stringify(sample, null, 2).substring(0, 500) + '...');
      }
      
    } while ((pageToken || pageMembers.length === limit) && pageCount < maxPages);
    
    console.log(`📊 Final total: ${allMembers.length} members from ${pageCount} pages`);
    
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
        memberHealthPlan: member.CalAIM_MCO || member.CalAIM_MCP || member.HealthPlan || member.MC_Plan || member.Health_Plan || member.MCP || member.MCO || member.Plan_Name || 'Unknown',
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