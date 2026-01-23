import { NextRequest, NextResponse } from 'next/server';
import { getCaspioCredentialsFromEnv, getCaspioToken } from '@/lib/caspio-api-utils';

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

    const credentials = getCaspioCredentialsFromEnv();

    console.log('🔧 [SW-ASSIGNMENTS] Environment check:', {
      hasBaseUrl: true,
      hasClientId: true,
      hasClientSecret: true,
      baseUrl: credentials.baseUrl ? `${credentials.baseUrl.substring(0, 20)}...` : 'undefined'
    });

    // Get OAuth token
    console.log('🔐 [SW-ASSIGNMENTS] Getting Caspio OAuth token...');
    const accessToken = await getCaspioToken(credentials);
    console.log('✅ [SW-ASSIGNMENTS] Got Caspio access token');

    // Query members assigned to this social worker
    // Look for members where Social_Worker_Assigned or Kaiser_User_Assignment matches the email
    const query = `Social_Worker_Assigned='${email}' OR Kaiser_User_Assignment='${email}'`;
    const membersUrl = `${credentials.baseUrl}/rest/v2/tables/CalAIM_tbl_Members/records?q.where=${encodeURIComponent(query)}`;

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
      console.error('❌ [SW-ASSIGNMENTS] Members fetch error:', {
        status: membersResponse.status,
        statusText: membersResponse.statusText,
        error: errorText,
        url: membersUrl
      });
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to fetch members from Caspio',
        debug: {
          status: membersResponse.status,
          statusText: membersResponse.statusText,
          error: errorText,
          url: membersUrl
        }
      }, { status: 500 });
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