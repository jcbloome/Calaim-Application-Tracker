import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    console.log('🧪 Testing Caspio connection...');

    // Get Caspio credentials from environment
    const caspioBaseUrl = process.env.CASPIO_BASE_URL;
    const caspioClientId = process.env.CASPIO_CLIENT_ID;
    const caspioClientSecret = process.env.CASPIO_CLIENT_SECRET;

    console.log('🔧 Environment variables:', {
      CASPIO_BASE_URL: caspioBaseUrl ? 'SET' : 'NOT SET',
      CASPIO_CLIENT_ID: caspioClientId ? 'SET' : 'NOT SET',
      CASPIO_CLIENT_SECRET: caspioClientSecret ? 'SET' : 'NOT SET',
    });

    if (!caspioBaseUrl || !caspioClientId || !caspioClientSecret) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing Caspio environment variables',
        missing: {
          CASPIO_BASE_URL: !caspioBaseUrl,
          CASPIO_CLIENT_ID: !caspioClientId,
          CASPIO_CLIENT_SECRET: !caspioClientSecret
        }
      }, { status: 500 });
    }

    // Test OAuth token request
    console.log('🔐 Testing OAuth token request...');
    const tokenResponse = await fetch(`${caspioBaseUrl}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: caspioClientId,
        client_secret: caspioClientSecret,
      }),
    });

    const tokenResult = {
      status: tokenResponse.status,
      statusText: tokenResponse.statusText,
      headers: Object.fromEntries(tokenResponse.headers.entries()),
    };

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('❌ Token request failed:', tokenResult, errorText);
      return NextResponse.json({ 
        success: false, 
        error: 'OAuth token request failed',
        tokenResponse: tokenResult,
        errorBody: errorText
      }, { status: 500 });
    }

    const tokenData = await tokenResponse.json();
    console.log('✅ Token request successful');

    // Test a simple API call (get a few records from CalAIM_tbl_Members)
    console.log('📊 Testing API call with CalAIM_tbl_Members...');
    const testResponse = await fetch(`${caspioBaseUrl}/rest/v2/tables/CalAIM_tbl_Members/records?q.limit=5`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    const apiResult = {
      status: testResponse.status,
      statusText: testResponse.statusText,
    };

    if (!testResponse.ok) {
      const errorText = await testResponse.text();
      console.error('❌ API test failed:', apiResult, errorText);
      return NextResponse.json({ 
        success: false, 
        error: 'API test call failed',
        tokenResponse: tokenResult,
        apiResponse: apiResult,
        errorBody: errorText
      }, { status: 500 });
    }

    const apiData = await testResponse.json();
    console.log('✅ API test successful');

    return NextResponse.json({
      success: true,
      message: 'Caspio connection test successful',
      tokenResponse: tokenResult,
      apiResponse: apiResult,
      recordsFound: apiData.Result?.length || 0,
      sampleRecord: apiData.Result?.[0] || null,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in Caspio test:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}