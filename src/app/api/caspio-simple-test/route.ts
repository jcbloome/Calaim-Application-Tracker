import { NextRequest, NextResponse } from 'next/server';

export async function POST() {
  try {
    console.log('🧪 SIMPLE Caspio test - clients table only...');
    
    // Hardcoded credentials
    const baseUrl = 'https://c7ebl500.caspio.com/rest/v2';
    const clientId = 'b721f0c7af4d4f7542e8a28665bfccb07e93f47deb4bda27bc';
    const clientSecret = 'bad425d4a8714c8b95ec2ea9d256fc649b2164613b7e54099c';
    
    // Get access token
    console.log('🔑 Getting access token...');
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenUrl = `https://c7ebl500.caspio.com/oauth/token`;
    
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'User-Agent': 'CalAIM-Application/1.0'
      },
      body: 'grant_type=client_credentials',
    });
    
    console.log(`📡 OAuth response status: ${tokenResponse.status} ${tokenResponse.statusText}`);
    
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('❌ OAuth error response:', errorText);
      throw new Error(`OAuth failed: ${tokenResponse.status} ${errorText}`);
    }
    
    // Check if response has content before parsing JSON
    const responseText = await tokenResponse.text();
    console.log('📄 Raw OAuth response:', responseText);
    
    if (!responseText || responseText.trim() === '') {
      throw new Error('OAuth response is empty');
    }
    
    let tokenData;
    try {
      tokenData = JSON.parse(responseText);
    } catch (parseError) {
      console.error('❌ JSON parse error:', parseError);
      console.error('❌ Raw response that failed to parse:', responseText);
      throw new Error(`Failed to parse OAuth response as JSON: ${parseError}`);
    }
    const accessToken = tokenData.access_token;
    console.log('✅ Got access token');
    
    // Create unique test data
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const testData = {
      Senior_First: 'TestUser',
      Senior_Last: `Simple-${timestamp}`
    };
    
    console.log('📝 Test data:', testData);
    
    // Insert into clients table
    const clientTableUrl = `${baseUrl}/tables/connect_tbl_clients/records`;
    
    const response = await fetch(clientTableUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(testData)
    });
    
    console.log(`📡 Response status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Insert failed:', errorText);
      throw new Error(`Insert failed: ${response.status} ${errorText}`);
    }
    
    // Handle the response - Caspio sometimes returns empty body on successful insert
    const insertResponseText = await response.text();
    console.log('📄 Raw insert response:', insertResponseText);
    
    let result;
    if (insertResponseText && insertResponseText.trim() !== '') {
      try {
        result = JSON.parse(insertResponseText);
      } catch (parseError) {
        console.log('⚠️ Response is not JSON, treating as success');
        result = { message: 'Insert successful but no JSON response' };
      }
    } else {
      console.log('✅ Empty response - Caspio insert successful');
      result = { message: 'Insert successful (empty response)' };
    }
    
    console.log('✅ Success! Response:', JSON.stringify(result, null, 2));
    
    return NextResponse.json({
      success: true,
      message: 'Successfully added to connect_tbl_clients table',
      testData: testData,
      response: result,
      availableFields: Object.keys(result || {})
    });
    
  } catch (error: any) {
    console.error('❌ Test failed:', error);
    return NextResponse.json({
      success: false,
      message: `Test failed: ${error.message}`,
      error: error.toString()
    }, { status: 500 });
  }
}