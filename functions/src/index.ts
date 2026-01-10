import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

admin.initializeApp();

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

// Caspio API Integration Function
export const testCaspioConnection = onCall(async (request) => {
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
    const baseUrl = 'https://c7ebl500.caspio.com/rest/v2';
    const clientId = process.env.CASPIO_CLIENT_ID;
    const clientSecret = process.env.CASPIO_CLIENT_SECRET;
    
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

// Publish CS Summary to Caspio Function
export const publishCsSummaryToCaspio = onCall(async (request) => {
  try {
    const applicationData = request.data;
    
    if (!applicationData) {
      throw new HttpsError('invalid-argument', 'Application data is required');
    }
    
    console.log('📤 Publishing CS Summary to Caspio via Functions...');
    
    // Get Caspio access token
    const baseUrl = 'https://c7ebl500.caspio.com/rest/v2';
    const clientId = process.env.CASPIO_CLIENT_ID;
    const clientSecret = process.env.CASPIO_CLIENT_SECRET;
    
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