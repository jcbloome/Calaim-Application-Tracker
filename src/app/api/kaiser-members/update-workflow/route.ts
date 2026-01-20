import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { memberId, workflow_step, Next_Step_Due_Date, workflow_notes } = await request.json();

    if (!memberId) {
      return NextResponse.json(
        { success: false, error: 'Missing memberId' },
        { status: 400 }
      );
    }

    // Get Caspio credentials
    const caspioBaseUrl = process.env.CASPIO_BASE_URL || 'https://c7ebl500.caspio.com/rest/v2';
    const clientId = process.env.CASPIO_CLIENT_ID || 'b4c7eac0b7b8e4b6e8c4d3a2f1e5d8c9a6b2c1d4e7f8a9b0c3d6e9f2a5b8c1d4e7';
    const clientSecret = process.env.CASPIO_CLIENT_SECRET || 'f8e7d6c5b4a3928170e9f8d7c6b5a4938271f0e9d8c7b6a5948372e1f0d9c8b7a6';

    // Get OAuth token
    const tokenResponse = await fetch(`${caspioBaseUrl}/oauth/token`, {
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

    if (!tokenResponse.ok) {
      throw new Error('Failed to get Caspio token');
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Prepare update data
    const updateData: any = {
      last_updated: new Date().toISOString(),
    };

    if (workflow_step !== undefined) {
      updateData.workflow_step = workflow_step;
    }

    if (Next_Step_Due_Date !== undefined) {
      updateData.Next_Step_Due_Date = Next_Step_Due_Date;
    }

    if (workflow_notes !== undefined) {
      updateData.workflow_notes = workflow_notes;
    }

    // Update the member record in Caspio
    const updateResponse = await fetch(
      `${caspioBaseUrl}/tables/CalAIM_tbl_Members/records?q.where=Client_ID2='${memberId}'`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      throw new Error(`Failed to update member workflow: ${errorText}`);
    }

    return NextResponse.json({
      success: true,
      message: 'Member workflow updated successfully',
    });

  } catch (error) {
    console.error('Error updating member workflow:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update member workflow' },
      { status: 500 }
    );
  }
}