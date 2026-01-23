import { NextRequest, NextResponse } from 'next/server';
import { getCaspioCredentialsFromEnv, getCaspioToken } from '@/lib/caspio-api-utils';

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
    const credentials = getCaspioCredentialsFromEnv();
    const token = await getCaspioToken(credentials);
    
    // Update member record in Caspio
    const apiUrl = `${credentials.baseUrl}/rest/v2/tables/CalAIM_tbl_Members/records`;
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