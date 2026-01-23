import { NextRequest, NextResponse } from 'next/server';
import { getCaspioCredentialsFromEnv, getCaspioToken } from '@/lib/caspio-api-utils';

export async function POST(request: NextRequest) {
  try {
    const { memberId, status } = await request.json();

    if (!memberId || !status) {
      return NextResponse.json(
        { success: false, error: 'Missing memberId or status' },
        { status: 400 }
      );
    }

    const credentials = getCaspioCredentialsFromEnv();
    const accessToken = await getCaspioToken(credentials);

    // Update the member record in Caspio
    const updateResponse = await fetch(
      `${credentials.baseUrl}/rest/v2/tables/CalAIM_tbl_Members/records?q.where=Client_ID2='${memberId}'`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          Kaiser_Status: status,
          last_updated: new Date().toISOString(),
        }),
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      throw new Error(`Failed to update member status: ${errorText}`);
    }

    return NextResponse.json({
      success: true,
      message: 'Member status updated successfully',
    });

  } catch (error) {
    console.error('Error updating member status:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update member status' },
      { status: 500 }
    );
  }
}