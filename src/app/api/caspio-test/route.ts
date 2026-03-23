import { NextRequest, NextResponse } from 'next/server';
import { getCaspioServerConfig } from '@/lib/caspio-server-auth';

export async function GET(request: NextRequest) {
  try {
    console.log('Testing Caspio connection...');
    
    const caspioConfig = getCaspioServerConfig();
    
    const tokenUrl = `${caspioConfig.oauthBaseUrl}/oauth/token`;
    
    console.log('Making OAuth request to:', tokenUrl);
    
    // Try with URLSearchParams and proper form encoding
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', caspioConfig.clientId);
    params.append('client_secret', caspioConfig.clientSecret);
    
    console.log('Request body:', params.toString());
    
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: params.toString(),
    });

    console.log('OAuth response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Caspio OAuth failed:', { status: response.status, error: errorText });
      return NextResponse.json({
        success: false,
        error: `OAuth failed: ${response.status}`,
        details: errorText
      }, { status: 500 });
    }

    const data = await response.json();
    console.log('OAuth successful, token received');
    
    return NextResponse.json({
      success: true,
      message: 'Caspio OAuth successful',
      tokenExpires: data.expires_in
    });
    
  } catch (error) {
    console.error('Error testing Caspio connection:', error);
    return NextResponse.json({
      success: false,
      error: 'Connection test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}