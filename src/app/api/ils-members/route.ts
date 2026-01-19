import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    console.log('📥 Fetching ILS members from Caspio...');

    // Get Caspio credentials from environment
    const caspioBaseUrl = process.env.CASPIO_BASE_URL;
    const clientId = process.env.CASPIO_CLIENT_ID;
    const clientSecret = process.env.CASPIO_CLIENT_SECRET;

    if (!caspioBaseUrl || !clientId || !clientSecret) {
      console.error('❌ Missing Caspio environment variables');
      return NextResponse.json(
        { success: false, error: 'Missing Caspio configuration' },
        { status: 500 }
      );
    }

    // Get OAuth token
    const tokenUrl = `${caspioBaseUrl}/oauth/token`;
    const tokenResponse = await fetch(tokenUrl, {
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
      console.error('❌ Failed to get Caspio OAuth token:', tokenResponse.status);
      return NextResponse.json(
        { success: false, error: 'Failed to authenticate with Caspio' },
        { status: 500 }
      );
    }

    const tokenData = await tokenResponse.json();
    console.log('✅ Got Caspio OAuth token');

    // Fetch ILS members from CalAIM_tbl_Members table
    // ILS members are those with ILS_View = 'Yes' or similar criteria
    const membersUrl = `${caspioBaseUrl}/rest/v2/tables/CalAIM_tbl_Members/records?q.where=ILS_View='Yes'&q.limit=1000`;
    
    const membersResponse = await fetch(membersUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!membersResponse.ok) {
      console.error('❌ Failed to fetch ILS members:', membersResponse.status);
      const errorText = await membersResponse.text();
      console.error('Error details:', errorText);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch ILS members from Caspio' },
        { status: 500 }
      );
    }

    const membersData = await membersResponse.json();
    console.log(`📊 Raw Caspio response: ${membersData.Result?.length || 0} records`);

    if (!membersData.Result || !Array.isArray(membersData.Result)) {
      console.error('❌ Invalid response format from Caspio');
      return NextResponse.json(
        { success: false, error: 'Invalid response format from Caspio' },
        { status: 500 }
      );
    }


    // Map Caspio fields to ILS member format using correct field names
    const ilsMembers = membersData.Result.map((member: any) => ({
      memberFirstName: member.Senior_First || '',
      memberLastName: member.Senior_Last || '',
      memberFullName: `${member.Senior_First || ''} ${member.Senior_Last || ''}`.trim(),
      memberMrn: member.MediCal_Number || '',
      CalAIM_Status: member.CalAIM_Status || '',
      Kaiser_Status: member.Kaiser_Status || '',
      pathway: member.SNF_Diversion_or_Transition || '',
      healthPlan: member.CalAIM_MCO || '',
      ILS_View: member.ILS_View || '',
      bestContactFirstName: member.Authorized_Party_First || '',
      bestContactLastName: member.Authorized_Party_Last || '',
      bestContactPhone: member.Authorized_Party_Phone || member.Best_Phone || '',
      bestContactEmail: member.Authorized_Party_Email || '',
      lastUpdated: member.Timestamp || '',
      created_date: member.Timestamp || '',
      client_ID2: member.Client_ID2 || '',
    }));

    console.log(`✅ Successfully processed ${ilsMembers.length} ILS members`);

    return NextResponse.json({
      success: true,
      members: ilsMembers,
      count: ilsMembers.length,
    });

  } catch (error) {
    console.error('❌ Error in ILS members API:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}