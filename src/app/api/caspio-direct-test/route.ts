import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  try {
    console.log('🔧 Direct Caspio API test starting...');
    
    // Real Caspio credentials
    const baseUrl = 'https://c7ebl500.caspio.com/rest/v2';
    const clientId = 'b721f0c7af4d4f7542e8a28665bfccb07e93f47deb4bda27bc';
    const clientSecret = 'bad425d4a8714c8b95ec2ea9d256fc649b2164613b7e54099c';
    
    // Step 1: Get OAuth token
    console.log('🔑 Getting Caspio access token...');
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenUrl = 'https://c7ebl500.caspio.com/oauth/token';
    
    console.log('📤 Token request details:', {
      url: tokenUrl,
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials.substring(0, 20)}...`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: 'grant_type=client_credentials'
    });
    
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: 'grant_type=client_credentials',
    });
    
    console.log('📥 Token response:', {
      status: tokenResponse.status,
      statusText: tokenResponse.statusText,
      ok: tokenResponse.ok
    });
    
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.log('❌ Token error response:', errorText);
      return NextResponse.json({
        success: false,
        message: `Failed to get Caspio token: ${tokenResponse.status} ${tokenResponse.statusText}`,
        error: errorText,
        debug: {
          url: tokenUrl,
          status: tokenResponse.status,
          statusText: tokenResponse.statusText
        }
      }, { status: 500 });
    }
    
    const tokenData = await tokenResponse.json();
    console.log('✅ Got Caspio access token successfully');
    
    return NextResponse.json({
      success: true,
      message: 'Successfully connected to Caspio API',
      tokenReceived: !!tokenData.access_token,
      tokenType: tokenData.token_type || 'unknown'
    });
    
  } catch (error: any) {
    console.error('❌ Direct Caspio test failed:', error);
    return NextResponse.json({
      success: false,
      message: `Direct Caspio test failed: ${error.message}`,
      error: error.toString()
    }, { status: 500 });
  }
}