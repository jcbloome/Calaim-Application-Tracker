import { NextRequest, NextResponse } from 'next/server';
import { getCaspioCredentialsFromEnv, getCaspioToken } from '@/lib/caspio-api-utils';

interface CaspioMemberRecord {
  Record_ID: string;
  First_Name: string;
  Last_Name: string;
  MRN: string;
  Health_Plan: string;
  Primary_Contact: string;
  Contact_Phone: string;
  Contact_Email: string;
  
  // Authorization fields
  Authorization_Start_Date_T2038?: string;
  Authorization_End_Date_T2038?: string;
  Authorization_Start_Date_H2022?: string;
  Authorization_End_Date_H2022?: string;
  Auth_Ext_Request_Date_T2038?: string;
  Auth_Ext_Request_Date_H2022?: string;
}

interface AuthorizationMember {
  id: string;
  memberName: string;
  mrn: string;
  healthPlan: string;
  primaryContact: string;
  contactPhone: string;
  contactEmail: string;
  authStartDateT2038?: string;
  authEndDateT2038?: string;
  authStartDateH2022?: string;
  authEndDateH2022?: string;
  authExtRequestDateT2038?: string;
  authExtRequestDateH2022?: string;
}

/**
 * Fetch members with authorization data from Caspio
 */
async function fetchMembersFromCaspio(token: string, baseUrl: string): Promise<CaspioMemberRecord[]> {
  const apiUrl = `${baseUrl}/rest/v2/tables/CalAIM_tbl_Members/records`;
  
  // Only fetch members that have at least one authorization field
  const whereClause = `Authorization_Start_Date_T2038 IS NOT NULL OR Authorization_End_Date_T2038 IS NOT NULL OR Authorization_Start_Date_H2022 IS NOT NULL OR Authorization_End_Date_H2022 IS NOT NULL`;
  
  const response = await fetch(`${apiUrl}?q.where=${encodeURIComponent(whereClause)}&q.limit=1000`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Failed to fetch members from Caspio:', { status: response.status, error: errorText });
    throw new Error('Failed to fetch member data from Caspio');
  }

  const data = await response.json();
  return data.Result || [];
}

/**
 * Transform Caspio member data to authorization format
 */
function transformMemberData(caspioMember: CaspioMemberRecord): AuthorizationMember {
  return {
    id: caspioMember.Record_ID,
    memberName: `${caspioMember.First_Name || ''} ${caspioMember.Last_Name || ''}`.trim(),
    mrn: caspioMember.MRN || '',
    healthPlan: caspioMember.Health_Plan || '',
    primaryContact: caspioMember.Primary_Contact || '',
    contactPhone: caspioMember.Contact_Phone || '',
    contactEmail: caspioMember.Contact_Email || '',
    authStartDateT2038: caspioMember.Authorization_Start_Date_T2038,
    authEndDateT2038: caspioMember.Authorization_End_Date_T2038,
    authStartDateH2022: caspioMember.Authorization_Start_Date_H2022,
    authEndDateH2022: caspioMember.Authorization_End_Date_H2022,
    authExtRequestDateT2038: caspioMember.Auth_Ext_Request_Date_T2038,
    authExtRequestDateH2022: caspioMember.Auth_Ext_Request_Date_H2022,
  };
}

export async function GET(request: NextRequest) {
  try {
    console.log('Fetching authorization members from Caspio via API route');
    
    // Get OAuth token
    console.log('Getting Caspio OAuth token...');
    const credentials = getCaspioCredentialsFromEnv();
    const token = await getCaspioToken(credentials);
    console.log('OAuth token obtained successfully');
    
    // Fetch members with authorization data
    console.log('Fetching members from Caspio...');
    const caspioMembers = await fetchMembersFromCaspio(token, credentials.baseUrl);
    console.log(`Fetched ${caspioMembers.length} members from Caspio`);
    
    // Transform data
    const authorizationMembers = caspioMembers.map(transformMemberData);
    
    console.log(`Successfully transformed ${authorizationMembers.length} authorization members`);
    
    return NextResponse.json(authorizationMembers);
    
  } catch (error) {
    console.error('Detailed error in authorization members API:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json(
      { 
        error: 'Failed to fetch authorization data',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}