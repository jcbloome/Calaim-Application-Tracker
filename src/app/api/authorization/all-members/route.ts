import { NextRequest, NextResponse } from 'next/server';
import { 
  fetchAllCalAIMMembers, 
  CaspioCredentials 
} from '@/lib/caspio-api-utils';

interface CaspioAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export async function GET(req: NextRequest) {
  try {
    console.log('🚀 API ROUTE CALLED - Authorization Tracker ALL MEMBERS');
    console.log('🔍 Using MCO partitioning method for consistency and scalability...');
    
    // Use the same robust method as social worker assignments
    const credentials: CaspioCredentials = {
      baseUrl: process.env.CASPIO_BASE_URL!,
      clientId: process.env.CASPIO_CLIENT_ID!,
      clientSecret: process.env.CASPIO_CLIENT_SECRET!,
    };

    // Fetch ALL members using the proven MCO partitioning approach, including raw data for authorization fields
    const result = await fetchAllCalAIMMembers(credentials, { includeRawData: true });
    console.log(`✅ Fetched ${result.count} total members using MCO partitioning method`);

    // Work directly with raw members to avoid mapping issues
    const rawMembersWithAuthData = result.rawMembers?.filter(rawMember => 
      rawMember.Authorization_Start_Date_T2038 || 
      rawMember.Authorization_End_Date_T2038 || 
      rawMember.Authorization_Start_Date_H2022 || 
      rawMember.Authorization_End_Date_H2022
    ) || [];
    
    console.log(`📊 Total members: ${result.count}, Members with authorization data: ${rawMembersWithAuthData.length}`);

    // Transform data for Authorization Tracker (directly from raw members with auth data)
    const transformedMembers = rawMembersWithAuthData.map((rawMember: any, index: number) => {
      // Create a unique ID by combining multiple fields to handle duplicate client_ID2s
      const clientId = rawMember.client_ID2 || rawMember.Client_ID2 || '';
      const uniqueId = `${clientId}-${rawMember.Senior_First || ''}-${rawMember.Senior_Last || ''}-${index}`.replace(/\s+/g, '-');
      
      return {
        // Basic info (from raw Caspio data)
        recordId: uniqueId,
        seniorLastFirstId: clientId,
        clientId2: clientId,
        memberFirstName: rawMember.Senior_First || '',
        memberLastName: rawMember.Senior_Last || '',
        memberMediCalNum: rawMember.MC || '',
        memberMrn: rawMember.MCP_CIN || '',
        memberCounty: rawMember.Member_County || 'Los Angeles',
        memberHealthPlan: rawMember.CalAIM_MCO || 'Unknown',
        memberStatus: rawMember.CalAIM_Status || '',
        
        // Authorization fields (from raw Caspio data)
        authStartDateT2038: rawMember.Authorization_Start_Date_T2038 || '',
        authEndDateT2038: rawMember.Authorization_End_Date_T2038 || '',
        authStartDateH2022: rawMember.Authorization_Start_Date_H2022 || '',
        authEndDateH2022: rawMember.Authorization_End_Date_H2022 || '',
        authExtRequestDateT2038: rawMember.Requested_Auth_Extension_T2038 || rawMember.Auth_Ext_Request_Date_T2038 || '',
        authExtRequestDateH2022: rawMember.Requested_Auth_Extension_H2022 || '',
        
        // Additional useful fields (from raw data)
        primaryContact: rawMember.Primary_Contact || '',
        contactPhone: rawMember.Contact_Phone || '',
        contactEmail: rawMember.Contact_Email || '',
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