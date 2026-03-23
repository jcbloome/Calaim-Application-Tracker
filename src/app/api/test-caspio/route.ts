import { NextRequest, NextResponse } from 'next/server';
import { getCaspioServerAccessToken, getCaspioServerConfig } from '@/lib/caspio-server-auth';

export async function GET(request: NextRequest) {
  try {
    console.log('🧪 Testing Caspio connection...');

    // Get Caspio credentials from environment
    const caspioConfig = getCaspioServerConfig();

    console.log('🔧 Environment variables:', {
      CASPIO_BASE_URL: caspioConfig.oauthBaseUrl ? 'SET' : 'NOT SET',
      CASPIO_CLIENT_ID: caspioConfig.clientId ? 'SET' : 'NOT SET',
      CASPIO_CLIENT_SECRET: caspioConfig.clientSecret ? 'SET' : 'NOT SET',
    });

    // Test OAuth token request
    console.log('🔐 Testing OAuth token request...');
    const accessToken = await getCaspioServerAccessToken(caspioConfig);
    const tokenResult = {
      status: 200,
      statusText: 'OK',
      headers: {} as Record<string, string>,
    };
    console.log('✅ Token request successful');

    // Test a simple API call (get a few records from CalAIM_tbl_Members)
    console.log('📊 Testing API call with CalAIM_tbl_Members...');
    const testResponse = await fetch(`${caspioConfig.restBaseUrl}/tables/CalAIM_tbl_Members/records?q.limit=5`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
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