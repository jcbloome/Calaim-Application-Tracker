import { NextRequest, NextResponse } from 'next/server';
import { getCaspioCredentialsFromEnv, getCaspioToken } from '@/lib/caspio-api-utils';

export async function POST(request: NextRequest) {
  try {
    const { memberId, workflow_step, Next_Step_Due_Date, workflow_notes } = await request.json();

    if (!memberId) {
      return NextResponse.json(
        { success: false, error: 'Missing memberId' },
        { status: 400 }
      );
    }

    const credentials = getCaspioCredentialsFromEnv();
    const accessToken = await getCaspioToken(credentials);

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
      `${credentials.baseUrl}/rest/v2/tables/CalAIM_tbl_Members/records?q.where=Client_ID2='${memberId}'`,
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