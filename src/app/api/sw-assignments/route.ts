import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');

    if (!email) {
      return NextResponse.json(
        { error: 'Email parameter is required' },
        { status: 400 }
      );
    }

    console.log(`🔍 [SW-ASSIGNMENTS] Fetching assignments for SW: ${email}`);

    // Get Caspio credentials from environment
    const baseUrl = process.env.CASPIO_BASE_URL || 'https://c7ebl500.caspio.com/rest/v2';
    const clientId = process.env.CASPIO_CLIENT_ID || 'b721f0c7af4d4f7542e8a28665bfccb07e93f47deb4bda27bc';
    const clientSecret = process.env.CASPIO_CLIENT_SECRET || 'bad425d4a8714c8b95ec2ea9d256fc649b2164613b7e54099c';
    const tableName = process.env.CASPIO_TABLE_NAME || 'CalAIM_tbl_Members';

    // Get OAuth token
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenUrl = `https://c7ebl500.caspio.com/oauth/token`;

    console.log('🔑 [SW-ASSIGNMENTS] Getting Caspio access token...');
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: 'grant_type=client_credentials',
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('❌ [SW-ASSIGNMENTS] OAuth Error:', errorText);
      throw new Error(`Failed to get Caspio token: ${tokenResponse.status} ${errorText}`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    console.log('✅ [SW-ASSIGNMENTS] Got Caspio access token');

    // Query members assigned to this social worker
    // Look for members where Social_Worker_Assigned, Staff_Assigned or Kaiser_User_Assignment matches the email
    const query = `Social_Worker_Assigned='${email}' OR Staff_Assigned='${email}' OR Kaiser_User_Assignment='${email}'`;
    const membersUrl = `${baseUrl}/tables/${tableName}/records?q.where=${encodeURIComponent(query)}`;

    console.log('📊 [SW-ASSIGNMENTS] Fetching assigned members...');
    const membersResponse = await fetch(membersUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!membersResponse.ok) {
      const errorText = await membersResponse.text();
      console.error('❌ [SW-ASSIGNMENTS] Members fetch error:', errorText);
      throw new Error(`Failed to fetch members: ${membersResponse.status} ${errorText}`);
    }

    const membersData = await membersResponse.json();
    console.log(`✅ [SW-ASSIGNMENTS] Found ${membersData.Result?.length || 0} assigned members`);

    // Group members by RCFE facility
    const rcfeFacilities = new Map();
    const members = membersData.Result || [];

    members.forEach((member: any) => {
      const rcfeName = member.RCFE_Name || 'Unknown RCFE';
      const rcfeAddress = member.RCFE_Address || 'Address not available';
      
      if (!rcfeFacilities.has(rcfeName)) {
        rcfeFacilities.set(rcfeName, {
          id: rcfeName.toLowerCase().replace(/\s+/g, '-'),
          name: rcfeName,
          address: rcfeAddress,
          city: member.Member_City || 'Unknown',
          county: member.Member_County || 'Los Angeles',
          members: []
        });
      }

      rcfeFacilities.get(rcfeName).members.push({
        id: member.client_ID2 || member.id || Math.random().toString(),
        name: `${member.Senior_First || ''} ${member.Senior_Last || ''}`.trim(),
        roomNumber: member.Room_Number || undefined,
        careLevel: member.Care_Level || 'Medium',
        lastVisit: member.Last_Visit_Date || undefined,
        nextVisit: member.Next_Visit_Date || undefined,
        status: member.CalAIM_Status === 'Authorized' ? 'Active' : 'Inactive',
        notes: member.Visit_Notes || undefined
      });
    });

    const facilities = Array.from(rcfeFacilities.values());

    console.log(`📋 [SW-ASSIGNMENTS] Organized into ${facilities.length} RCFE facilities`);

    return NextResponse.json({
      success: true,
      socialWorker: {
        email: email,
        assignedMembers: members.length,
        rcfeFacilities: facilities.length
      },
      facilities: facilities,
      totalMembers: members.length
    });

  } catch (error: any) {
    console.error('❌ [SW-ASSIGNMENTS] Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch SW assignments',
        details: error.message 
      },
      { status: 500 }
    );
  }
}