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

// Update Kaiser status in Caspio
export const updateKaiserStatusInCaspio = onCall(async (request) => {
  try {
    const { client_ID2, Kaiser_Status, CalAIM_Status, kaiser_user_assignment, next_steps_date } = request.data;
    
    if (!client_ID2) {
      throw new HttpsError('invalid-argument', 'client_ID2 is required to update Caspio record');
    }
    
    console.log(`📝 Updating Kaiser status in Caspio for client_ID2: ${client_ID2}`);
    
    // Get Caspio access token
    const baseUrl = 'https://c7ebl500.caspio.com/rest/v2';
    const clientId = 'b721f0c7af4d4f7542e8a28665bfccb07e93f47deb4bda27bc';
    const clientSecret = 'bad425d4a8714c8b95ec2ea9d256fc649b2164613b7e54099c';
    
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenUrl = `https://c7ebl500.caspio.com/oauth/token`;
    
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
    
    // Update the record in Caspio
    const membersTable = 'CalAIM_tbl_Members';
    const updateUrl = `${baseUrl}/tables/${membersTable}/records?q.where=client_ID2='${client_ID2}'`;
    
    const updateData: any = {
      LastUpdated: new Date().toISOString()
    };
    
    if (Kaiser_Status) updateData.Kaiser_Status = Kaiser_Status;
    if (CalAIM_Status) updateData.CalAIM_Status = CalAIM_Status;
    if (kaiser_user_assignment) updateData.kaiser_user_assignment = kaiser_user_assignment;
    if (next_steps_date) updateData.next_steps_date = next_steps_date;
    
    console.log('📝 Update data:', updateData);
    
    const updateResponse = await fetch(updateUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updateData),
    });
    
    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      throw new HttpsError('internal', `Failed to update Caspio record: ${updateResponse.status} ${errorText}`);
    }
    
    const result = await updateResponse.json();
    console.log('✅ Successfully updated Caspio record');
    
    return {
      success: true,
      message: `Successfully updated Kaiser status in Caspio for client_ID2: ${client_ID2}`,
      data: result,
    };
    
  } catch (error: any) {
    console.error('❌ Error updating Caspio:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Unexpected error: ${error.message}`);
  }
});

// Sync Kaiser status from App to Firebase and Caspio
export const syncKaiserStatus = onCall(async (request) => {
  try {
    const { applicationId, client_ID2, Kaiser_Status, CalAIM_Status, kaiser_user_assignment, next_steps_date } = request.data;
    
    console.log(`🔄 Syncing Kaiser status for application: ${applicationId}, client_ID2: ${client_ID2}`);
    
    // Update Firebase first
    if (applicationId) {
      const db = admin.firestore();
      const appRef = db.collection('applications').doc(applicationId);
      
      const updateData: any = {
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      };
      
      if (Kaiser_Status) updateData.Kaiser_Status = Kaiser_Status;
      if (CalAIM_Status) updateData.CalAIM_Status = CalAIM_Status;
      if (kaiser_user_assignment) updateData.kaiser_user_assignment = kaiser_user_assignment;
      if (next_steps_date) updateData.next_steps_date = next_steps_date;
      if (client_ID2) updateData.client_ID2 = client_ID2;
      
      await appRef.update(updateData);
      console.log('✅ Updated Firebase application');
    }
    
    // Update Caspio if we have client_ID2
    if (client_ID2) {
      console.log('📝 Updating Caspio record...');
      
      // Get Caspio access token
      const baseUrl = 'https://c7ebl500.caspio.com/rest/v2';
      const clientId = 'b721f0c7af4d4f7542e8a28665bfccb07e93f47deb4bda27bc';
      const clientSecret = 'bad425d4a8714c8b95ec2ea9d256fc649b2164613b7e54099c';
      
      const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      const tokenUrl = `https://c7ebl500.caspio.com/oauth/token`;
      
      const tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: 'grant_type=client_credentials',
      });
      
      if (tokenResponse.ok) {
        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;
        
        // Update the record in Caspio
        const membersTable = 'CalAIM_tbl_Members';
        const updateUrl = `${baseUrl}/tables/${membersTable}/records?q.where=client_ID2='${client_ID2}'`;
        
        const updateData: any = {
          LastUpdated: new Date().toISOString()
        };
        
        if (Kaiser_Status) updateData.Kaiser_Status = Kaiser_Status;
        if (CalAIM_Status) updateData.CalAIM_Status = CalAIM_Status;
        if (kaiser_user_assignment) updateData.kaiser_user_assignment = kaiser_user_assignment;
        if (next_steps_date) updateData.next_steps_date = next_steps_date;
        
        const updateResponse = await fetch(updateUrl, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updateData),
        });
        
        if (updateResponse.ok) {
          console.log('✅ Updated Caspio record');
        } else {
          console.log('⚠️ Failed to update Caspio record:', updateResponse.status);
        }
      }
    }
    
    return {
      success: true,
      message: 'Successfully synced Kaiser status to both Firebase and Caspio',
    };
    
  } catch (error: any) {
    console.error('❌ Error syncing Kaiser status:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Sync error: ${error.message}`);
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
    
    // Fetch all members from CalAIM_tbl_Members table with pagination
    const membersTable = 'CalAIM_tbl_Members';
    let allMembers: any[] = [];
    let pageSize = 1000; // Caspio's max page size
    let pageNumber = 1;
    let hasMoreData = true;
    
    console.log('📋 Fetching all members from:', membersTable);
    
    while (hasMoreData) {
      // Try to filter for Kaiser members if possible, otherwise get all
      const fetchUrl = `${baseUrl}/tables/${membersTable}/records?q.pageSize=${pageSize}&q.pageNumber=${pageNumber}`;
      
      console.log(`📄 Fetching page ${pageNumber} (up to ${pageSize} records)...`);
      
      const membersResponse = await fetch(fetchUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!membersResponse.ok) {
        const errorText = await membersResponse.text();
        throw new HttpsError('internal', `Failed to fetch members page ${pageNumber}: ${membersResponse.status} ${errorText}`);
      }
      
      const membersData = await membersResponse.json();
      const pageResults = membersData.Result || [];
      
      console.log(`✅ Page ${pageNumber}: ${pageResults.length} members`);
      
      if (pageResults.length > 0) {
        allMembers = allMembers.concat(pageResults);
        pageNumber++;
        
        // If we got less than the page size, we've reached the end
        if (pageResults.length < pageSize) {
          hasMoreData = false;
        }
      } else {
        hasMoreData = false;
      }
      
      // Safety check to prevent infinite loops
      if (pageNumber > 50) {
        console.log('⚠️ Reached maximum page limit (50), stopping pagination');
        hasMoreData = false;
      }
    }
    
    console.log(`✅ Successfully fetched ALL members: ${allMembers.length} total records`);
    
    // Filter for Kaiser members using CalAIM_MCP field
    const kaiserMembers = allMembers.filter(member => 
      member.CalAIM_MCP === 'Kaiser'
    );
    
    console.log(`🏥 Filtered to Kaiser members: ${kaiserMembers.length} out of ${allMembers.length} total`);
    
    // Debug: Log first member's fields to verify correct mapping
    if (kaiserMembers.length > 0) {
      console.log('📋 Sample Kaiser member fields:', Object.keys(kaiserMembers[0]));
      console.log('📋 Sample Kaiser member data with CORRECT field names:', {
        Senior_First: kaiserMembers[0].Senior_First,
        Senior_Last: kaiserMembers[0].Senior_Last,
        MC: kaiserMembers[0].MC,
        MCP_CIN: kaiserMembers[0].MCP_CIN,
        Member_County: kaiserMembers[0].Member_County,
        SNF_Diversion_or_Transition: kaiserMembers[0].SNF_Diversion_or_Transition,
        CalAIM_Status: kaiserMembers[0].CalAIM_Status,
        Kaiser_Status: kaiserMembers[0].Kaiser_Status,
        Kaiser_User_Assignment: kaiserMembers[0].Kaiser_User_Assignment,
        CalAIM_MCP: kaiserMembers[0].CalAIM_MCP,
        client_ID2: kaiserMembers[0].client_ID2
      });
    }
    
    const transformedMembers = kaiserMembers.map((member: any) => ({
      // Basic info using EXACT Caspio field names
      memberFirstName: member.Senior_First || '',
      memberLastName: member.Senior_Last || '',
      memberMediCalNum: member.MC || '',
      memberMrn: member.MCP_CIN || '', // MCP_CIN is MRN for Kaiser
      memberCounty: member.Member_County || '',
      
      // Key linking field
      client_ID2: member.client_ID2 || '',
      
      // Kaiser specific fields
      MCP_CIN: member.MCP_CIN || '',
      CalAIM_MCP: member.CalAIM_MCP || '',
      Kaiser_Status: member.Kaiser_Status || 'Pending',
      CalAIM_Status: member.CalAIM_Status || 'Pending',
      kaiser_user_assignment: member.Kaiser_User_Assignment || '',
      
      // Pathway information
      pathway: member.SNF_Diversion_or_Transition || '',
      
      // Health plan info
      HealthPlan: member.CalAIM_MCP || 'Kaiser',
      
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