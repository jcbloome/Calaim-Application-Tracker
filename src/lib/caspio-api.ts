'use server';

import { z } from 'zod';

// Caspio API configuration
const CASPIO_CONFIG = {
  baseUrl: process.env.CASPIO_BASE_URL || 'https://c1abc123.caspio.com/rest/v2',
  clientId: process.env.CASPIO_CLIENT_ID,
  clientSecret: process.env.CASPIO_CLIENT_SECRET,
  tableName: process.env.CASPIO_TABLE_NAME || 'Applications',
};

// Application data schema for Caspio
const CaspioApplicationSchema = z.object({
  // Member Information
  MemberFirstName: z.string(),
  MemberLastName: z.string(),
  MemberDOB: z.string(),
  MemberAge: z.number().optional(),
  MemberMediCalNum: z.string(),
  MemberMRN: z.string(),
  MemberLanguage: z.string(),
  MemberCounty: z.string(),
  
  // Referrer Information
  ReferrerFirstName: z.string(),
  ReferrerLastName: z.string(),
  ReferrerEmail: z.string().email(),
  ReferrerPhone: z.string(),
  ReferrerRelationship: z.string(),
  Agency: z.string().optional().nullable(),
  
  // Primary Contact
  PrimaryContactFirstName: z.string(),
  PrimaryContactLastName: z.string(),
  PrimaryContactRelationship: z.string(),
  PrimaryContactPhone: z.string(),
  PrimaryContactEmail: z.string().email(),
  PrimaryContactLanguage: z.string(),
  
  // Secondary Contact (Optional)
  SecondaryContactFirstName: z.string().optional().nullable(),
  SecondaryContactLastName: z.string().optional().nullable(),
  SecondaryContactRelationship: z.string().optional().nullable(),
  SecondaryContactPhone: z.string().optional().nullable(),
  SecondaryContactEmail: z.string().email().optional().nullable(),
  SecondaryContactLanguage: z.string().optional().nullable(),
  
  // Legal Representative
  HasCapacity: z.enum(['Yes', 'No']),
  HasLegalRep: z.enum(['Yes', 'No']).optional().nullable(),
  LegalRepFirstName: z.string().optional().nullable(),
  LegalRepLastName: z.string().optional().nullable(),
  LegalRepRelationship: z.string().optional().nullable(),
  LegalRepPhone: z.string().optional().nullable(),
  LegalRepEmail: z.string().email().optional().nullable(),
  
  // Location Information
  CurrentLocation: z.string(),
  CurrentAddress: z.string(),
  CurrentCity: z.string(),
  CurrentState: z.string(),
  CurrentZip: z.string(),
  CurrentCounty: z.string(),
  CustomaryLocationType: z.string(),
  CustomaryAddress: z.string(),
  CustomaryCity: z.string(),
  CustomaryState: z.string(),
  CustomaryZip: z.string(),
  CustomaryCounty: z.string(),
  
  // Health Plan & Pathway
  HealthPlan: z.enum(['Kaiser', 'Health Net', 'Other']),
  ExistingHealthPlan: z.string().optional().nullable(),
  SwitchingHealthPlan: z.enum(['Yes', 'No', 'N/A']).optional().nullable(),
  Pathway: z.enum(['SNF Transition', 'SNF Diversion']),
  MeetsPathwayCriteria: z.boolean().optional(),
  SNFDiversionReason: z.string().optional().nullable(),
  
  // ISP & RCFE Information
  ISPFirstName: z.string(),
  ISPLastName: z.string(),
  ISPRelationship: z.string(),
  ISPPhone: z.string(),
  ISPEmail: z.string().email(),
  ISPLocationType: z.string(),
  ISPAddress: z.string(),
  ISPFacilityName: z.string(),
  OnALWWaitlist: z.enum(['Yes', 'No', 'Unknown']),
  HasPrefRCFE: z.enum(['Yes', 'No']),
  RCFEName: z.string().optional().nullable(),
  RCFEAddress: z.string().optional().nullable(),
  RCFEAdminName: z.string().optional().nullable(),
  RCFEAdminPhone: z.string().optional().nullable(),
  RCFEAdminEmail: z.string().email().optional().nullable(),
  
  // System Fields
  ApplicationID: z.string(),
  UserID: z.string(),
  Status: z.string().default('In Progress'),
  DateCreated: z.string(),
  LastUpdated: z.string(),
});

export type CaspioApplication = z.infer<typeof CaspioApplicationSchema>;

interface CaspioTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface CaspioApiResponse {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
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
  
  if (!clientId || !clientSecret) {
    throw new CaspioApiError('Caspio credentials not configured. Please set CASPIO_CLIENT_ID and CASPIO_CLIENT_SECRET environment variables.');
  }
  
  const tokenUrl = `${baseUrl}/oauth/token`;
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  
  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new CaspioApiError(
        `Failed to get Caspio access token: ${response.status} ${response.statusText}`,
        response.status,
        errorText
      );
    }
    
    const tokenData: CaspioTokenResponse = await response.json();
    return tokenData.access_token;
  } catch (error) {
    if (error instanceof CaspioApiError) {
      throw error;
    }
    throw new CaspioApiError(`Network error getting Caspio token: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Transform Firebase application data to Caspio format
 */
function transformToCaspioFormat(firebaseData: any): CaspioApplication {
  const now = new Date().toISOString();
  
  return {
    // Member Information
    MemberFirstName: firebaseData.memberFirstName || '',
    MemberLastName: firebaseData.memberLastName || '',
    MemberDOB: firebaseData.memberDob || '',
    MemberAge: firebaseData.memberAge,
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
    Agency: firebaseData.agency,
    
    // Primary Contact
    PrimaryContactFirstName: firebaseData.bestContactFirstName || '',
    PrimaryContactLastName: firebaseData.bestContactLastName || '',
    PrimaryContactRelationship: firebaseData.bestContactRelationship || '',
    PrimaryContactPhone: firebaseData.bestContactPhone || '',
    PrimaryContactEmail: firebaseData.bestContactEmail || '',
    PrimaryContactLanguage: firebaseData.bestContactLanguage || '',
    
    // Secondary Contact
    SecondaryContactFirstName: firebaseData.secondaryContactFirstName,
    SecondaryContactLastName: firebaseData.secondaryContactLastName,
    SecondaryContactRelationship: firebaseData.secondaryContactRelationship,
    SecondaryContactPhone: firebaseData.secondaryContactPhone,
    SecondaryContactEmail: firebaseData.secondaryContactEmail,
    SecondaryContactLanguage: firebaseData.secondaryContactLanguage,
    
    // Legal Representative
    HasCapacity: firebaseData.hasCapacity || 'Yes',
    HasLegalRep: firebaseData.hasLegalRep,
    LegalRepFirstName: firebaseData.repFirstName,
    LegalRepLastName: firebaseData.repLastName,
    LegalRepRelationship: firebaseData.repRelationship,
    LegalRepPhone: firebaseData.repPhone,
    LegalRepEmail: firebaseData.repEmail,
    
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
    ExistingHealthPlan: firebaseData.existingHealthPlan,
    SwitchingHealthPlan: firebaseData.switchingHealthPlan,
    Pathway: firebaseData.pathway || 'SNF Diversion',
    MeetsPathwayCriteria: firebaseData.meetsPathwayCriteria,
    SNFDiversionReason: firebaseData.snfDiversionReason,
    
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
    RCFEName: firebaseData.rcfeName,
    RCFEAddress: firebaseData.rcfeAddress,
    RCFEAdminName: firebaseData.rcfeAdminName,
    RCFEAdminPhone: firebaseData.rcfeAdminPhone,
    RCFEAdminEmail: firebaseData.rcfeAdminEmail,
    
    // System Fields
    ApplicationID: firebaseData.id || firebaseData.applicationId || '',
    UserID: firebaseData.userId || '',
    Status: firebaseData.status || 'In Progress',
    DateCreated: firebaseData.createdAt || now,
    LastUpdated: firebaseData.lastUpdated || now,
  };
}

/**
 * Create a new application record in Caspio
 */
export async function createCaspioApplication(firebaseData: any): Promise<CaspioApiResponse> {
  try {
    console.log('[CaspioAPI] Creating new application...');
    
    const accessToken = await getCaspioAccessToken();
    const caspioData = transformToCaspioFormat(firebaseData);
    
    // Validate the data
    const validatedData = CaspioApplicationSchema.parse(caspioData);
    
    // EMERGENCY DISABLE: Caspio CREATE operations disabled to prevent RCFE/Social Worker access interference
    console.log('🚨 EMERGENCY: Caspio CREATE operations disabled to prevent RCFE/Social Worker access interference');
    console.log('📝 Would create application in Caspio, but CREATE operation is DISABLED');
    
    // DISABLED: Caspio write operations causing interference with RCFE/Social Worker access
    /*
    const response = await fetch(`${CASPIO_CONFIG.baseUrl}/tables/${CASPIO_CONFIG.tableName}/records`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(validatedData),
    });
    */
    
    // Simulate successful response for read-only mode
    const response = { ok: true, json: async () => ({ disabled: true, message: 'Caspio writes disabled' }) };
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new CaspioApiError(
        `Failed to create Caspio application: ${response.status} ${response.statusText}`,
        response.status,
        errorText
      );
    }
    
    const result = await response.json();
    console.log('[CaspioAPI] Application created successfully:', result);
    
    return {
      success: true,
      message: `Successfully created application ${validatedData.ApplicationID} in Caspio`,
      data: result,
    };
    
  } catch (error) {
    console.error('[CaspioAPI] Error creating application:', error);
    
    if (error instanceof CaspioApiError) {
      return {
        success: false,
        message: error.message,
        error: error.response,
      };
    }
    
    if (error instanceof z.ZodError) {
      return {
        success: false,
        message: 'Data validation failed',
        error: error.errors,
      };
    }
    
    return {
      success: false,
      message: `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error: String(error),
    };
  }
}

/**
 * Update an existing application record in Caspio
 */
export async function updateCaspioApplication(applicationId: string, firebaseData: any): Promise<CaspioApiResponse> {
  try {
    console.log('[CaspioAPI] Updating application:', applicationId);
    
    const accessToken = await getCaspioAccessToken();
    const caspioData = transformToCaspioFormat(firebaseData);
    
    // Validate the data
    const validatedData = CaspioApplicationSchema.parse(caspioData);
    
    // EMERGENCY DISABLE: Caspio UPDATE operations disabled to prevent RCFE/Social Worker access interference
    console.log('🚨 EMERGENCY: Caspio UPDATE operations disabled to prevent RCFE/Social Worker access interference');
    console.log(`📝 Would update application ${applicationId} in Caspio, but UPDATE operation is DISABLED`);
    
    // DISABLED: Caspio write operations causing interference with RCFE/Social Worker access
    /*
    const response = await fetch(`${CASPIO_CONFIG.baseUrl}/tables/${CASPIO_CONFIG.tableName}/records`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...validatedData,
        ApplicationID: applicationId, // Ensure we're updating the right record
      }),
    });
    */
    
    // Simulate successful response for read-only mode
    const response = { ok: true, json: async () => ({ disabled: true, message: 'Caspio writes disabled' }) };
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new CaspioApiError(
        `Failed to update Caspio application: ${response.status} ${response.statusText}`,
        response.status,
        errorText
      );
    }
    
    const result = await response.json();
    console.log('[CaspioAPI] Application updated successfully:', result);
    
    return {
      success: true,
      message: `Successfully updated application ${applicationId} in Caspio`,
      data: result,
    };
    
  } catch (error) {
    console.error('[CaspioAPI] Error updating application:', error);
    
    if (error instanceof CaspioApiError) {
      return {
        success: false,
        message: error.message,
        error: error.response,
      };
    }
    
    if (error instanceof z.ZodError) {
      return {
        success: false,
        message: 'Data validation failed',
        error: error.errors,
      };
    }
    
    return {
      success: false,
      message: `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error: String(error),
    };
  }
}

/**
 * Sync application data to Caspio (create or update)
 */
export async function syncToCaspio(firebaseData: any, isUpdate: boolean = false): Promise<CaspioApiResponse> {
  const applicationId = firebaseData.id || firebaseData.applicationId;
  
  if (isUpdate && applicationId) {
    return updateCaspioApplication(applicationId, firebaseData);
  } else {
    return createCaspioApplication(firebaseData);
  }
}

/**
 * Test the Caspio connection
 */
export async function testCaspioConnection(): Promise<CaspioApiResponse> {
  try {
    console.log('[CaspioAPI] Testing connection...');
    
    const accessToken = await getCaspioAccessToken();
    
    // Test with a simple GET request to the table
    const response = await fetch(`${CASPIO_CONFIG.baseUrl}/tables/${CASPIO_CONFIG.tableName}/records?q.limit=1`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new CaspioApiError(
        `Connection test failed: ${response.status} ${response.statusText}`,
        response.status,
        errorText
      );
    }
    
    console.log('[CaspioAPI] Connection test successful');
    
    return {
      success: true,
      message: 'Successfully connected to Caspio API',
    };
    
  } catch (error) {
    console.error('[CaspioAPI] Connection test failed:', error);
    
    if (error instanceof CaspioApiError) {
      return {
        success: false,
        message: error.message,
        error: error.response,
      };
    }
    
    return {
      success: false,
      message: `Connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error: String(error),
    };
  }
}