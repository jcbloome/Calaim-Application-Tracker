import { NextRequest, NextResponse } from 'next/server';

interface CaspioAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

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
 * Get OAuth token from Caspio
 */
async function getCaspioToken(): Promise<string> {
  const baseUrl = 'https://c7ebl500.caspio.com/rest/v2';
  const clientId = 'b721f0c7af4d4f7542e8a28665bfccb07e93f47deb4bda27bc';
  const clientSecret = 'bad425d4a8714c8b95ec2ea9d256fc649b2164613b7e54099c';
  
  const tokenUrl = `${baseUrl}/oauth/token`;
  
  console.log('Making OAuth request to:', tokenUrl);
  console.log('Client ID:', clientId);
  
  // Use URLSearchParams for proper form encoding
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', clientId);
  params.append('client_secret', clientSecret);
  
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: params.toString(),
  });

  console.log('OAuth response status:', response.status);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Caspio OAuth failed:', { status: response.status, error: errorText });
    throw new Error(`Failed to authenticate with Caspio: ${response.status} - ${errorText}`);
  }

  const data: CaspioAuthResponse = await response.json();
  console.log('OAuth token received, expires in:', data.expires_in);
  return data.access_token;
}

/**
 * Fetch members with authorization data from Caspio
 */
async function fetchMembersFromCaspio(token: string): Promise<CaspioMemberRecord[]> {
  const baseUrl = 'https://c7ebl500.caspio.com/rest/v2';
  const apiUrl = `${baseUrl}/tables/CalAIM_tbl_Members/records`;
  
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
    const token = await getCaspioToken();
    console.log('OAuth token obtained successfully');
    
    // Fetch members with authorization data
    console.log('Fetching members from Caspio...');
    const caspioMembers = await fetchMembersFromCaspio(token);
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