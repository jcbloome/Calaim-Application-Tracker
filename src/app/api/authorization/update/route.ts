import { NextRequest, NextResponse } from 'next/server';

interface CaspioAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

/**
 * Get OAuth token from Caspio
 */
async function getCaspioToken(): Promise<string> {
  const baseUrl = 'https://c7ebl500.caspio.com/rest/v2';
  const clientId = 'b721f0c7af4d4f7542e8a28665bfccb07e93f47deb4bda27bc';
  const clientSecret = 'bad425d4a8714c8b95ec2ea9d256fc649b2164613b7e54099c';
  
  const tokenUrl = `${baseUrl}/oauth/token`;
  
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Caspio OAuth failed:', { status: response.status, error: errorText });
    throw new Error('Failed to authenticate with Caspio');
  }

  const data: CaspioAuthResponse = await response.json();
  return data.access_token;
}

export async function POST(request: NextRequest) {
  try {
    const { memberId, authorizationData } = await request.json();
    
    if (!memberId || !authorizationData) {
      return NextResponse.json(
        { error: 'Member ID and authorization data are required' },
        { status: 400 }
      );
    }
    
    console.log('Updating member authorization:', { memberId, authorizationData });
    
    // Get OAuth token
    const token = await getCaspioToken();
    
    // Update member record in Caspio
    const baseUrl = 'https://c7ebl500.caspio.com/rest/v2';
    const apiUrl = `${baseUrl}/tables/CalAIM_tbl_Members/records`;
    const whereClause = `Record_ID='${memberId}'`;
    
    const response = await fetch(`${apiUrl}?q.where=${encodeURIComponent(whereClause)}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(authorizationData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to update member authorization:', { status: response.status, error: errorText });
      return NextResponse.json(
        { error: 'Failed to update authorization data' },
        { status: 500 }
      );
    }

    console.log('Successfully updated member authorization');
    
    return NextResponse.json({ 
      success: true, 
      message: 'Authorization updated successfully' 
    });
    
  } catch (error) {
    console.error('Error in update authorization API:', error);
    return NextResponse.json(
      { error: 'Failed to update authorization data' },
      { status: 500 }
    );
  }
}