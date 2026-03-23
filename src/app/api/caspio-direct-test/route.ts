import { NextRequest, NextResponse } from 'next/server';
import { getCaspioServerAccessToken, getCaspioServerConfig } from '@/lib/caspio-server-auth';

export async function GET() {
  try {
    console.log('🔧 Direct Caspio API test starting...');
    
    const caspioConfig = getCaspioServerConfig();
    
    // Step 1: Get OAuth token
    console.log('🔑 Getting Caspio access token...');
    const tokenUrl = `${caspioConfig.oauthBaseUrl}/oauth/token`;
    
    console.log('📤 Token request details:', {
      url: tokenUrl,
      method: 'POST',
      headers: {
        Authorization: 'Basic [redacted]',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: 'grant_type=client_credentials'
    });
    
    const accessToken = await getCaspioServerAccessToken(caspioConfig);
    console.log('✅ Got Caspio access token successfully');
    
    return NextResponse.json({
      success: true,
      message: 'Successfully connected to Caspio API',
      tokenReceived: !!accessToken,
      tokenType: 'Bearer'
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