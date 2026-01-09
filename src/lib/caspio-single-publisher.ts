import { z } from 'zod';

// Caspio configuration for your two-table structure
const CASPIO_CONFIG = {
  baseUrl: process.env.CASPIO_BASE_URL || 'https://c7ebl500.caspio.com/rest/v2',
  clientId: process.env.CASPIO_CLIENT_ID,
  clientSecret: process.env.CASPIO_CLIENT_SECRET,
  clientsTable: 'connect_tbl_clients',
  membersTable: 'CalAIM_tbl_Members',
};

interface CaspioApiResponse {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
  isDuplicate?: boolean;
}

class CaspioApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: any
  ) {
    super(message);
    this.name = 'CaspioApiError';
  }
}

/**
 * Get access token from Caspio OAuth2
 */
async function getCaspioAccessToken(): Promise<string> {
  const { clientId, clientSecret, baseUrl } = CASPIO_CONFIG;
  
  // Debug logging
  console.log('🔍 Caspio Debug Info:');
  console.log('Base URL:', baseUrl);
  console.log('Client ID exists:', !!clientId);
  console.log('Client Secret exists:', !!clientSecret);
  console.log('Client ID length:', clientId?.length || 0);
  console.log('Client Secret length:', clientSecret?.length || 0);
  
  if (!clientId || !clientSecret) {
    throw new CaspioApiError('Caspio credentials not configured. Please set CASPIO_CLIENT_ID and CASPIO_CLIENT_SECRET environment variables.');
  }
  
  const tokenUrl = `${baseUrl}/oauth/token`;
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  
  console.log('🌐 Making OAuth request to:', tokenUrl);
  
  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    
    console.log('📡 OAuth Response Status:', response.status, response.statusText);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ OAuth Error Response:', errorText);
      throw new CaspioApiError(
        `Failed to get Caspio access token: ${response.status} ${response.statusText}`,
        response.status,
        errorText
      );
    }
    
    const tokenData = await response.json();
    return tokenData.access_token;
  } catch (error) {
    console.log('🚨 OAuth Request Failed:', error);
    if (error instanceof CaspioApiError) {
      throw error;
    }
    
    // More detailed network error logging
    if (error instanceof TypeError && error.message.includes('fetch')) {
      console.log('🌐 Network Error Details:', {
        message: error.message,
        name: error.name,
        stack: error.stack?.substring(0, 200)
      });
    }
    
    throw new CaspioApiError(`Network error getting Caspio token: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Check if member already exists in CalAIM_tbl_Members
 */
async function checkMemberExists(firstName: string, lastName: string): Promise<boolean> {
  try {
    const accessToken = await getCaspioAccessToken();
    
    // Search for existing member by first and last name
    const searchUrl = `${CASPIO_CONFIG.baseUrl}/tables/${CASPIO_CONFIG.membersTable}/records?q.where=MemberFirstName='${firstName}' AND MemberLastName='${lastName}'`;
    
    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (response.ok) {
      const data = await response.json();
      return data.Result && data.Result.length > 0;
    }
    
    return false;
  } catch (error) {
    console.error('[CaspioSinglePublisher] Error checking member existence:', error);
    // If we can't check, assume they don't exist to avoid blocking
    return false;
  }
}

/**
 * Lookup or create client in connect_tbl_clients and get client_ID2
 */
async function getOrCreateClientId(firstName: string, lastName: string): Promise<string> {
  try {
    const accessToken = await getCaspioAccessToken();
    
    // First, try to find existing client
    const searchUrl = `${CASPIO_CONFIG.baseUrl}/tables/${CASPIO_CONFIG.clientsTable}/records?q.where=MemberFirstName='${firstName}' AND MemberLastName='${lastName}'`;
    
    const searchResponse = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (searchResponse.ok) {
      const searchData = await searchResponse.json();
      if (searchData.Result && searchData.Result.length > 0) {
        // Client exists, return the client_ID2
        return searchData.Result[0].client_ID2;
      }
    }
    
    // Client doesn't exist, create new one
    const createResponse = await fetch(`${CASPIO_CONFIG.baseUrl}/tables/${CASPIO_CONFIG.clientsTable}/records`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        MemberFirstName: firstName,
        MemberLastName: lastName,
      }),
    });
    
    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new CaspioApiError(
        `Failed to create client record: ${createResponse.status} ${createResponse.statusText}`,
        createResponse.status,
        errorText
      );
    }
    
    const createData = await createResponse.json();
    return createData.client_ID2; // Assuming Caspio returns the new client_ID2
    
  } catch (error) {
    console.error('[CaspioSinglePublisher] Error getting/creating client ID:', error);
    throw error;
  }
}

/**
 * Transform Firebase application data to Caspio members table format
 */
function transformToMembersFormat(firebaseData: any, clientId: string): any {
  const now = new Date().toISOString();
  
  return {
    client_ID2: clientId,
    ApplicationID: firebaseData.id || firebaseData.applicationId || '',
    UserID: firebaseData.userId || '',
    Status: firebaseData.status || 'In Progress',
    DateCreated: firebaseData.createdAt || now,
    LastUpdated: firebaseData.lastUpdated || now,
    
    // Member Information
    MemberFirstName: firebaseData.memberFirstName || '',
    MemberLastName: firebaseData.memberLastName || '',
    MemberDOB: firebaseData.memberDob || '',
    MemberAge: firebaseData.memberAge || null,
    MemberMediCalNum: firebaseData.memberMediCalNum || '',
    MemberMRN: firebaseData.memberMrn || '',
    MemberLanguage: firebaseData.memberLanguage || '',
    MemberCounty: firebaseData.memberCounty || '',
    
    // Referrer Information
    ReferrerFirstName: firebaseData.referrerFirstName || '',
    ReferrerLastName: firebaseData.referrerLastName || '',
    ReferrerEmail: firebaseData.referrerEmail || '',
    ReferrerPhone: firebaseData.referrerPhone || '',
    ReferrerRelationship: firebaseData.referrerRelationship || '',
    Agency: firebaseData.agency || null,
    
    // Primary Contact
    PrimaryContactFirstName: firebaseData.bestContactFirstName || '',
    PrimaryContactLastName: firebaseData.bestContactLastName || '',
    PrimaryContactRelationship: firebaseData.bestContactRelationship || '',
    PrimaryContactPhone: firebaseData.bestContactPhone || '',
    PrimaryContactEmail: firebaseData.bestContactEmail || '',
    PrimaryContactLanguage: firebaseData.bestContactLanguage || '',
    
    // Secondary Contact
    SecondaryContactFirstName: firebaseData.secondaryContactFirstName || null,
    SecondaryContactLastName: firebaseData.secondaryContactLastName || null,
    SecondaryContactRelationship: firebaseData.secondaryContactRelationship || null,
    SecondaryContactPhone: firebaseData.secondaryContactPhone || null,
    SecondaryContactEmail: firebaseData.secondaryContactEmail || null,
    SecondaryContactLanguage: firebaseData.secondaryContactLanguage || null,
    
    // Legal Representative
    HasCapacity: firebaseData.hasCapacity || 'Yes',
    HasLegalRep: firebaseData.hasLegalRep || null,
    LegalRepFirstName: firebaseData.repFirstName || null,
    LegalRepLastName: firebaseData.repLastName || null,
    LegalRepRelationship: firebaseData.repRelationship || null,
    LegalRepPhone: firebaseData.repPhone || null,
    LegalRepEmail: firebaseData.repEmail || null,
    
    // Location Information
    CurrentLocation: firebaseData.currentLocation || '',
    CurrentAddress: firebaseData.currentAddress || '',
    CurrentCity: firebaseData.currentCity || '',
    CurrentState: firebaseData.currentState || '',
    CurrentZip: firebaseData.currentZip || '',
    CurrentCounty: firebaseData.currentCounty || '',
    CustomaryLocationType: firebaseData.customaryLocationType || '',
    CustomaryAddress: firebaseData.customaryAddress || '',
    CustomaryCity: firebaseData.customaryCity || '',
    CustomaryState: firebaseData.customaryState || '',
    CustomaryZip: firebaseData.customaryZip || '',
    CustomaryCounty: firebaseData.customaryCounty || '',
    
    // Health Plan & Pathway
    HealthPlan: firebaseData.healthPlan || 'Other',
    ExistingHealthPlan: firebaseData.existingHealthPlan || null,
    SwitchingHealthPlan: firebaseData.switchingHealthPlan || null,
    Pathway: firebaseData.pathway || 'SNF Diversion',
    MeetsPathwayCriteria: firebaseData.meetsPathwayCriteria || null,
    SNFDiversionReason: firebaseData.snfDiversionReason || null,
    
    // ISP & RCFE Information
    ISPFirstName: firebaseData.ispFirstName || '',
    ISPLastName: firebaseData.ispLastName || '',
    ISPRelationship: firebaseData.ispRelationship || '',
    ISPPhone: firebaseData.ispPhone || '',
    ISPEmail: firebaseData.ispEmail || '',
    ISPLocationType: firebaseData.ispLocationType || '',
    ISPAddress: firebaseData.ispAddress || '',
    ISPFacilityName: firebaseData.ispFacilityName || '',
    OnALWWaitlist: firebaseData.onALWWaitlist || 'Unknown',
    HasPrefRCFE: firebaseData.hasPrefRCFE || 'No',
    RCFEName: firebaseData.rcfeName || null,
    RCFEAddress: firebaseData.rcfeAddress || null,
    RCFEAdminName: firebaseData.rcfeAdminName || null,
    RCFEAdminPhone: firebaseData.rcfeAdminPhone || null,
    RCFEAdminEmail: firebaseData.rcfeAdminEmail || null,
  };
}

/**
 * Publish a single CS Summary application to Caspio with duplicate checking
 */
export async function publishCsSummaryToCaspio(firebaseData: any): Promise<CaspioApiResponse> {
  try {
    console.log('[CaspioSinglePublisher] Publishing CS Summary to Caspio...');
    
    const firstName = firebaseData.memberFirstName || '';
    const lastName = firebaseData.memberLastName || '';
    
    if (!firstName || !lastName) {
      return {
        success: false,
        message: 'Member first name and last name are required',
      };
    }
    
    // Step 1: Check if member already exists in CalAIM_tbl_Members
    const memberExists = await checkMemberExists(firstName, lastName);
    
    if (memberExists) {
      return {
        success: false,
        message: `Member "${firstName} ${lastName}" already exists in Caspio database. Only one record per member is allowed.`,
        isDuplicate: true,
      };
    }
    
    // Step 2: Get or create client_ID2 from connect_tbl_clients
    const clientId = await getOrCreateClientId(firstName, lastName);
    console.log('[CaspioSinglePublisher] Got client ID:', clientId);
    
    // Step 3: Transform data for CalAIM_tbl_Members
    const memberData = transformToMembersFormat(firebaseData, clientId);
    
    // Step 4: Insert into CalAIM_tbl_Members
    const accessToken = await getCaspioAccessToken();
    
    const response = await fetch(`${CASPIO_CONFIG.baseUrl}/tables/${CASPIO_CONFIG.membersTable}/records`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(memberData),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new CaspioApiError(
        `Failed to create member record: ${response.status} ${response.statusText}`,
        response.status,
        errorText
      );
    }
    
    const result = await response.json();
    console.log('[CaspioSinglePublisher] Successfully published to Caspio');
    
    return {
      success: true,
      message: `Successfully published CS Summary for "${firstName} ${lastName}" to Caspio database`,
      data: result,
    };
    
  } catch (error: any) {
    console.error('[CaspioSinglePublisher] Error publishing CS Summary:', error);
    
    if (error instanceof CaspioApiError) {
      return {
        success: false,
        message: error.message,
        error: error.response,
      };
    }
    
    return {
      success: false,
      message: `Unexpected error: ${error.message}`,
      error: String(error),
    };
  }
}

/**
 * Test the Caspio connection (no data sent)
 */
export async function testCaspioConnection(): Promise<CaspioApiResponse> {
  try {
    console.log('[CaspioSinglePublisher] Testing Caspio connection...');
    
    const accessToken = await getCaspioAccessToken();
    
    // Test both tables
    const clientsResponse = await fetch(`${CASPIO_CONFIG.baseUrl}/tables/${CASPIO_CONFIG.clientsTable}/records?q.limit=1`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    
    const membersResponse = await fetch(`${CASPIO_CONFIG.baseUrl}/tables/${CASPIO_CONFIG.membersTable}/records?q.limit=1`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!clientsResponse.ok) {
      throw new CaspioApiError(`Cannot access connect_tbl_clients: ${clientsResponse.status}`);
    }
    
    if (!membersResponse.ok) {
      throw new CaspioApiError(`Cannot access CalAIM_tbl_Members: ${membersResponse.status}`);
    }
    
    console.log('[CaspioSinglePublisher] Connection test successful');
    
    return {
      success: true,
      message: 'Successfully connected to Caspio API. Both connect_tbl_clients and CalAIM_tbl_Members tables are accessible.',
    };
    
  } catch (error: any) {
    console.error('[CaspioSinglePublisher] Connection test failed:', error);
    
    if (error instanceof CaspioApiError) {
      return {
        success: false,
        message: error.message,
        error: error.response,
      };
    }
    
    return {
      success: false,
      message: `Connection test failed: ${error.message}`,
      error: String(error),
    };
  }
}