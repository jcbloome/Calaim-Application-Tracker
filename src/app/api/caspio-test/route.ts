import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    console.log('Testing Caspio connection...');
    
    const baseUrl = 'https://c7ebl500.caspio.com/rest/v2';
    const clientId = 'b721f0c7af4d4f7542e8a28665bfccb07e93f47deb4bda27bc';
    const clientSecret = 'bad425d4a8714c8b95ec2ea9d256fc649b2164613b7e54099c';
    
    const tokenUrl = `${baseUrl}/oauth/token`;
    
    console.log('Making OAuth request to:', tokenUrl);
    
    // Try with URLSearchParams and proper form encoding
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    
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