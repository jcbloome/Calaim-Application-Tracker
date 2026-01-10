import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";

admin.initializeApp();

// Define secrets for Caspio API
const caspioBaseUrl = defineSecret("CASPIO_BASE_URL");
const caspioClientId = defineSecret("CASPIO_CLIENT_ID");
const caspioClientSecret = defineSecret("CASPIO_CLIENT_SECRET");

// Run every day at 9:00 AM (Los Angeles time)
export const checkMissingForms = onSchedule({
  schedule: "0 9 * * *",
  timeZone: "America/Los_Angeles",
}, async (event) => {

  const db = admin.firestore();
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);

  console.log("🔍 Checking for missing forms created before:", sevenDaysAgo);

  // Find applications that are 'Incomplete' and older than 7 days
  const snapshot = await db.collection("applications")
    .where("status", "==", "Incomplete")
    .where("createdAt", "<", sevenDaysAgo)
    .get();

  if (snapshot.empty) {
    console.log("✅ No missing forms found.");
    return;
  }

  // Loop through the results
  snapshot.forEach(doc => {
    const data = doc.data();
    console.log(`⚠️ Found Missing Form: Client ${data.clientName} (ID: ${doc.id})`);
  });
});

// Simple test function without secrets first
export const testBasicConnection = onCall(async (request) => {
  try {
    console.log('🔍 Testing basic connectivity from Firebase Functions...');
    
    // Test basic connectivity first
    const httpTest = await fetch('https://httpbin.org/get', {
      method: 'GET',
      headers: { 'User-Agent': 'CalAIM-Functions-Test' }
    });
    
    console.log('✅ Basic HTTP test:', httpTest.status, httpTest.statusText);
    
    // Test Caspio domain
    const caspioTest = await fetch('https://c7ebl500.caspio.com', {
      method: 'GET',
      headers: { 'User-Agent': 'CalAIM-Caspio-Test' }
    });
    
    console.log('✅ Caspio domain test:', caspioTest.status, caspioTest.statusText);
    
    return {
      success: true,
      message: 'Basic connectivity successful from Firebase Functions',
      tests: {
        httpTest: httpTest.status,
        caspioTest: caspioTest.status
      }
    };
    
  } catch (error: any) {
    console.error('❌ Basic connection test failed:', error);
    throw new HttpsError('internal', `Connection test failed: ${error.message}`);
  }
});

// Caspio API Integration Function
export const testCaspioConnection = onCall({
  secrets: [caspioBaseUrl, caspioClientId, caspioClientSecret]
}, async (request) => {
  try {
    console.log('🔍 Testing Caspio connection from Firebase Functions...');
    
    // Test basic connectivity first
    const httpTest = await fetch('https://httpbin.org/get', {
      method: 'GET',
      headers: { 'User-Agent': 'CalAIM-Functions-Test' }
    });
    
    console.log('✅ Basic HTTP test:', httpTest.status, httpTest.statusText);
    
    // Test Caspio domain
    const caspioTest = await fetch('https://c7ebl500.caspio.com', {
      method: 'GET',
      headers: { 'User-Agent': 'CalAIM-Caspio-Test' }
    });
    
    console.log('✅ Caspio domain test:', caspioTest.status, caspioTest.statusText);
    
    // Test Caspio OAuth endpoint
    const baseUrl = caspioBaseUrl.value() || 'https://c7ebl500.caspio.com/rest/v2';
    const clientId = caspioClientId.value();
    const clientSecret = caspioClientSecret.value();
    
    console.log('🔍 Secret values:', {
      baseUrl: baseUrl,
      clientIdLength: clientId?.length || 0,
      clientSecretLength: clientSecret?.length || 0
    });
    
    if (!clientId || !clientSecret) {
      throw new HttpsError('failed-precondition', 'Caspio credentials not configured');
    }
    
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenUrl = `${baseUrl}/oauth/token`;
    
    console.log('🔑 Testing Caspio OAuth at:', tokenUrl);
    
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    
    console.log('📡 OAuth Response:', tokenResponse.status, tokenResponse.statusText);
    
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.log('❌ OAuth Error:', errorText);
      throw new HttpsError('internal', `Caspio OAuth failed: ${tokenResponse.status} ${errorText}`);
    }
    
    const tokenData = await tokenResponse.json();
    console.log('✅ Successfully got Caspio access token');
    
    return {
      success: true,
      message: 'Caspio connection successful from Firebase Functions',
      tests: {
        httpTest: httpTest.status,
        caspioTest: caspioTest.status,
        oauthTest: tokenResponse.status
      }
    };
    
  } catch (error: any) {
    console.error('❌ Caspio connection test failed:', error);
    throw new HttpsError('internal', `Connection test failed: ${error.message}`);
  }
});

// Fetch Kaiser members from Caspio
export const fetchKaiserMembersFromCaspio = onCall(async (request) => {
  try {
    console.log('📥 Fetching Kaiser members from Caspio...');
    
    // Get Caspio access token
    const baseUrl = 'https://c7ebl500.caspio.com/rest/v2';
    const clientId = 'b721f0c7af4d4f7542e8a28665bfccb07e93f47deb4bda27bc';
    const clientSecret = 'bad425d4a8714c8b95ec2ea9d256fc649b2164613b7e54099c';
    
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenUrl = `https://c7ebl500.caspio.com/oauth/token`;
    
    console.log('🔑 Getting Caspio access token...');
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: 'grant_type=client_credentials',
    });
    
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new HttpsError('internal', `Failed to get Caspio token: ${tokenResponse.status} ${errorText}`);
    }
    
    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    console.log('✅ Got access token');
    
    // Fetch all members from CalAIM_tbl_Members table
    const membersTable = 'CalAIM_tbl_Members';
    const fetchUrl = `${baseUrl}/tables/${membersTable}/records`;
    
    console.log('📋 Fetching members from:', fetchUrl);
    
    const membersResponse = await fetch(fetchUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!membersResponse.ok) {
      const errorText = await membersResponse.text();
      throw new HttpsError('internal', `Failed to fetch members: ${membersResponse.status} ${errorText}`);
    }
    
    const membersData = await membersResponse.json();
    console.log('✅ Successfully fetched members:', membersData.Result?.length || 0);
    
    // Transform Caspio data to match our Kaiser tracker format
    const transformedMembers = (membersData.Result || []).map((member: any) => ({
      // Basic info
      memberFirstName: member.MemberFirstName || '',
      memberLastName: member.MemberLastName || '',
      memberMediCalNum: member.MemberMediCalNum || '',
      memberMrn: member.MemberMRN || member.MRN || '',
      memberCounty: member.MemberCounty || member.member_county || '',
      
      // Key linking field
      client_ID2: member.client_ID2 || '',
      
      // Kaiser specific fields
      MCP_CIN: member.MCP_CIN || '',
      CalAIM_MCP: member.CalAIM_MCP || '',
      Kaiser_Status: member.Kaiser_Status || member.Kaiser_Stathus || 'Pending',
      CalAIM_Status: member.CalAIM_Status || 'Pending',
      kaiser_user_assignment: member.kaiser_user_assignment || '',
      
      // Additional Caspio fields
      ApplicationID: member.ApplicationID || '',
      UserID: member.UserID || '',
      Status: member.Status || '',
      
      // Contact information
      ReferrerFirstName: member.ReferrerFirstName || '',
      ReferrerLastName: member.ReferrerLastName || '',
      ReferrerEmail: member.ReferrerEmail || '',
      ReferrerPhone: member.ReferrerPhone || '',
      
      // Health plan info
      HealthPlan: member.HealthPlan || '',
      Pathway: member.Pathway || '',
      
      // Dates and tracking
      DateCreated: member.DateCreated || '',
      next_steps_date: member.next_steps_date || '',
      last_updated: member.LastUpdated || member.last_updated || '',
      
      // Caspio record info
      caspio_id: member.client_ID2 || member.id || '',
      source: 'caspio'
    }));
    
    return {
      success: true,
      message: `Successfully fetched ${transformedMembers.length} members from Caspio`,
      members: transformedMembers,
      total: transformedMembers.length
    };
    
  } catch (error: any) {
    console.error('❌ Error fetching Caspio members:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Unexpected error: ${error.message}`);
  }
});

// Simplified publish function for testing
export const publishCsSummaryToCaspioSimple = onCall(async (request) => {
  try {
    const applicationData = request.data;
    
    if (!applicationData) {
      throw new HttpsError('invalid-argument', 'Application data is required');
    }
    
    console.log('📤 Publishing CS Summary to Caspio via Functions (Simple)...');
    console.log('📋 Application data received:', JSON.stringify(applicationData, null, 2));
    
    // Use hardcoded credentials temporarily
    const baseUrl = 'https://c7ebl500.caspio.com/rest/v2';
    const clientId = 'b721f0c7af4d4f7542e8a28665bfccb07e93f47deb4bda27bc';
    const clientSecret = 'bad425d4a8714c8b95ec2ea9d256fc649b2164613b7e54099c';
    
    // Try different token URL format
    const tokenUrl = `https://c7ebl500.caspio.com/oauth/token`;
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    
    console.log('🔑 Getting Caspio access token...');
    console.log('🔗 Token URL:', tokenUrl);
    console.log('🔑 Authorization header length:', credentials.length);
    
    // Try multiple approaches for OAuth
    console.log('🔄 Trying OAuth approach 1: Standard form data');
    let tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: 'grant_type=client_credentials',
    });
    
    // If that fails, try with different content type
    if (!tokenResponse.ok && tokenResponse.status === 415) {
      console.log('🔄 Trying OAuth approach 2: JSON body');
      tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ grant_type: 'client_credentials' }),
      });
    }
    
    // If still fails, try without rest/v2 in URL
    if (!tokenResponse.ok && tokenResponse.status === 415) {
      console.log('🔄 Trying OAuth approach 3: Alternative URL');
      const altTokenUrl = `https://c7ebl500.caspio.com/rest/v2/oauth/token`;
      tokenResponse = await fetch(altTokenUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: 'grant_type=client_credentials',
      });
    }
    
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.log('❌ OAuth Error:', errorText);
      throw new HttpsError('internal', `Failed to get Caspio token: ${tokenResponse.status} ${errorText}`);
    }
    
    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    console.log('✅ Got access token');
    
    // Check if member already exists
    const firstName = applicationData.memberFirstName || '';
    const lastName = applicationData.memberLastName || '';
    
    if (!firstName || !lastName) {
      throw new HttpsError('invalid-argument', 'Member first name and last name are required');
    }
    
    console.log(`🔍 Checking if member "${firstName} ${lastName}" already exists...`);
    
    const membersTable = 'CalAIM_tbl_Members';
    
    // First, let's check what fields are available in the table
    console.log('🔍 Getting table schema...');
    const schemaUrl = `${baseUrl}/tables/${membersTable}/fields`;
    
    const schemaResponse = await fetch(schemaUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (schemaResponse.ok) {
      const schemaData = await schemaResponse.json();
      console.log('📋 Available table fields:', JSON.stringify(schemaData, null, 2));
    } else {
      console.log('⚠️ Could not get table schema:', schemaResponse.status);
    }
    
    const searchUrl = `${baseUrl}/tables/${membersTable}/records?q.where=MemberFirstName='${firstName}' AND MemberLastName='${lastName}'`;
    
    const searchResponse = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (searchResponse.ok) {
      const searchData = await searchResponse.json();
      console.log('🔍 Search result:', searchData);
      if (searchData.Result && searchData.Result.length > 0) {
        throw new HttpsError('already-exists', `Member "${firstName} ${lastName}" already exists in Caspio database`);
      }
    }
    
    // Transform and insert data - Bob Jones test with basic fields
    const memberData = {
      MemberFirstName: firstName,
      MemberLastName: lastName,
      MemberDOB: applicationData.memberDob || '',
      MemberMediCalNum: applicationData.memberMediCalNum || '',
    };
    
    console.log('📝 Sending Bob Jones test data:', memberData);
    
    console.log('📝 Inserting member data:', memberData);
    
    const insertResponse = await fetch(`${baseUrl}/tables/${membersTable}/records`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(memberData),
    });
    
    if (!insertResponse.ok) {
      const errorText = await insertResponse.text();
      console.log('❌ Insert Error:', errorText);
      throw new HttpsError('internal', `Failed to insert member record: ${insertResponse.status} ${errorText}`);
    }
    
    const result = await insertResponse.json();
    console.log('✅ Successfully published CS Summary to Caspio:', result);
    
    return {
      success: true,
      message: `Successfully published CS Summary for "${firstName} ${lastName}" to Caspio database`,
      data: result,
    };
    
  } catch (error: any) {
    console.error('❌ Error publishing CS Summary:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Unexpected error: ${error.message}`);
  }
});

// Publish CS Summary to Caspio Function
export const publishCsSummaryToCaspio = onCall({
  secrets: [caspioBaseUrl, caspioClientId, caspioClientSecret]
}, async (request) => {
  try {
    const applicationData = request.data;
    
    if (!applicationData) {
      throw new HttpsError('invalid-argument', 'Application data is required');
    }
    
    console.log('📤 Publishing CS Summary to Caspio via Functions...');
    
    // Get Caspio access token
    const baseUrl = caspioBaseUrl.value() || 'https://c7ebl500.caspio.com/rest/v2';
    const clientId = caspioClientId.value();
    const clientSecret = caspioClientSecret.value();
    
    if (!clientId || !clientSecret) {
      throw new HttpsError('failed-precondition', 'Caspio credentials not configured');
    }
    
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenUrl = `${baseUrl}/oauth/token`;
    
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new HttpsError('internal', `Failed to get Caspio token: ${tokenResponse.status} ${errorText}`);
    }
    
    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    
    // Check if member already exists
    const firstName = applicationData.memberFirstName || '';
    const lastName = applicationData.memberLastName || '';
    
    if (!firstName || !lastName) {
      throw new HttpsError('invalid-argument', 'Member first name and last name are required');
    }
    
    const membersTable = 'CalAIM_tbl_Members';
    const searchUrl = `${baseUrl}/tables/${membersTable}/records?q.where=MemberFirstName='${firstName}' AND MemberLastName='${lastName}'`;
    
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
        throw new HttpsError('already-exists', `Member "${firstName} ${lastName}" already exists in Caspio database`);
      }
    }
    
    // Transform and insert data (simplified for now)
    const memberData = {
      ApplicationID: applicationData.id || '',
      UserID: applicationData.userId || '',
      Status: applicationData.status || 'In Progress',
      MemberFirstName: firstName,
      MemberLastName: lastName,
      MemberDOB: applicationData.memberDob || '',
      MemberMediCalNum: applicationData.memberMediCalNum || '',
      // Add more fields as needed
    };
    
    const insertResponse = await fetch(`${baseUrl}/tables/${membersTable}/records`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(memberData),
    });
    
    if (!insertResponse.ok) {
      const errorText = await insertResponse.text();
      throw new HttpsError('internal', `Failed to insert member record: ${insertResponse.status} ${errorText}`);
    }
    
    const result = await insertResponse.json();
    console.log('✅ Successfully published CS Summary to Caspio');
    
    return {
      success: true,
      message: `Successfully published CS Summary for "${firstName} ${lastName}" to Caspio database`,
      data: result,
    };
    
  } catch (error: any) {
    console.error('❌ Error publishing CS Summary:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Unexpected error: ${error.message}`);
  }
});