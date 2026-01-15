import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';

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
  // Use hardcoded credentials (same as other functions)
  const baseUrl = 'https://c7ebl500.caspio.com/rest/v2';
  const clientId = 'b721f0c7af4d4f7542e8a28665bfccb07e93f47deb4bda27bc';
  const clientSecret = 'bad425d4a8714c8b95ec2ea9d256fc649b2164613b7e54099c';
  
  const tokenUrl = `${baseUrl}/oauth/token`;
  
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Caspio OAuth failed:', { status: response.status, error: errorText });
    throw new HttpsError('internal', 'Failed to authenticate with Caspio');
  }

  const data: CaspioAuthResponse = await response.json();
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
    logger.error('Failed to fetch members from Caspio:', { status: response.status, error: errorText });
    throw new HttpsError('internal', 'Failed to fetch member data from Caspio');
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

/**
 * Fetch authorization members from Caspio
 */
export const fetchAuthorizationMembers = onCall(
  { cors: true },
  async (request) => {
    try {
      logger.info('Fetching authorization members from Caspio');
      
      // Get OAuth token
      const token = await getCaspioToken();
      
      // Fetch members with authorization data
      const caspioMembers = await fetchMembersFromCaspio(token);
      
      // Transform data
      const authorizationMembers = caspioMembers.map(transformMemberData);
      
      logger.info(`Successfully fetched ${authorizationMembers.length} authorization members`);
      
      return authorizationMembers;
      
    } catch (error) {
      logger.error('Error in fetchAuthorizationMembers:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', 'Failed to fetch authorization data');
    }
  }
);

/**
 * Update authorization dates for a member
 */
export const updateMemberAuthorization = onCall(
  { cors: true },
  async (request) => {
    try {
      const { memberId, authorizationData } = request.data;
      
      if (!memberId || !authorizationData) {
        throw new HttpsError('invalid-argument', 'Member ID and authorization data are required');
      }
      
      logger.info('Updating member authorization:', { memberId, authorizationData });
      
      // Get OAuth token
      const token = await getCaspioToken();
      
      // Update member record in Caspio
      const baseUrl = 'https://c7ebl500.caspio.com/rest/v2';
      const apiUrl = `${baseUrl}/tables/CalAIM_tbl_Members/records`;
      const whereClause = `Record_ID='${memberId}'`;
      
      const response = await fetch(`${apiUrl}?q.where=${encodeURIComponent(whereClause)}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(authorizationData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Failed to update member authorization:', { status: response.status, error: errorText });
        throw new HttpsError('internal', 'Failed to update authorization data');
      }

      logger.info('Successfully updated member authorization');
      
      return { success: true, message: 'Authorization updated successfully' };
      
    } catch (error) {
      logger.error('Error in updateMemberAuthorization:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', 'Failed to update authorization data');
    }
  }
);