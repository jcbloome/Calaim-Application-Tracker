import { NextRequest, NextResponse } from 'next/server';

// Caspio configuration
const CASPIO_BASE_URL = process.env.CASPIO_BASE_URL || 'https://c7ebl500.caspio.com';
const CASPIO_CLIENT_ID = process.env.CASPIO_CLIENT_ID;
const CASPIO_CLIENT_SECRET = process.env.CASPIO_CLIENT_SECRET;

// Get Caspio access token
async function getCaspioToken() {
  if (!CASPIO_CLIENT_ID || !CASPIO_CLIENT_SECRET) {
    throw new Error('Caspio credentials not configured');
  }

  const tokenUrl = `${CASPIO_BASE_URL}/oauth/token`;
  const credentials = Buffer.from(`${CASPIO_CLIENT_ID}:${CASPIO_CLIENT_SECRET}`).toString('base64');

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    throw new Error(`Failed to get Caspio token: ${response.statusText}`);
  }

  const data = await response.json();
  return data.access_token;
}

// Fetch MSW staff from Caspio - get SW_IDs from members, then fetch details from CalAIM_tbl_Social_Worker
async function fetchMSWStaffFromCaspio() {
  try {
    const token = await getCaspioToken();
    
    // Step 1: Get unique SW_IDs from CalAIM_tbl_Members
    const membersUrl = `${CASPIO_BASE_URL}/rest/v2/tables/CalAIM_tbl_Members/records?q.select=SW_ID&q.where=SW_ID IS NOT NULL AND SW_ID != ''&q.groupBy=SW_ID`;
    
    console.log('🔍 Step 1: Fetching unique SW_IDs from CalAIM_tbl_Members...');
    
    const membersResponse = await fetch(membersUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!membersResponse.ok) {
      throw new Error(`Failed to fetch SW_IDs: ${membersResponse.status} ${membersResponse.statusText}`);
    }

    const membersData = await membersResponse.json();
    const swIds = membersData.Result?.map((record: any) => String(record.SW_ID)).filter(Boolean) || [];
    
    console.log(`✅ Found ${swIds.length} unique SW_IDs:`, swIds.slice(0, 10));

    if (swIds.length === 0) {
      return [];
    }

    // Step 2: Fetch all social workers from CalAIM_tbl_Social_Worker table
    console.log('👥 Step 2: Fetching social worker details from CalAIM_tbl_Social_Worker...');
    
    const socialWorkerUrl = `${CASPIO_BASE_URL}/rest/v2/tables/CalAIM_tbl_Social_Worker/records`;
    
    const swResponse = await fetch(socialWorkerUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!swResponse.ok) {
      throw new Error(`Failed to fetch social workers: ${swResponse.status} ${swResponse.statusText}`);
    }

    const swData = await swResponse.json();
    const allSocialWorkers = swData.Result || [];
    
    console.log(`✅ Retrieved ${allSocialWorkers.length} social workers from CalAIM_tbl_Social_Worker`);

    // Step 3: Match SW_IDs from members to social worker table
    const matchedSocialWorkers = new Map();
    
    swIds.forEach(swId => {
      // Find matching social worker by SW_ID
      const matchedSW = allSocialWorkers.find((sw: any) => String(sw.SW_ID) === String(swId));
      
      if (matchedSW) {
        // Use SW_first and SW_last for name, or SW_first_last formula field
        const firstName = matchedSW.SW_first || matchedSW.User_First || '';
        const lastName = matchedSW.SW_last || matchedSW.User_Last || '';
        const fullName = matchedSW.SW_first_last || matchedSW.SW_Last_First || 
                        `${firstName} ${lastName}`.trim() || 
                        `SW ${swId}`;
        
        matchedSocialWorkers.set(swId, {
          id: String(matchedSW.SW_table_id || swId),
          name: fullName,
          email: matchedSW.SW_email || '',
          role: matchedSW.Role || 'MSW',
          sw_id: String(swId),
          phone: '',
          department: '',
          assignedMemberCount: 0,
          rate: matchedSW.Rate || null
        });
      } else {
        // SW_ID found in members but not in social worker table
        console.warn(`⚠️ SW_ID ${swId} found in members but not in CalAIM_tbl_Social_Worker`);
        matchedSocialWorkers.set(swId, {
          id: swId,
          name: `SW ${swId}`,
          email: '',
          role: 'MSW',
          sw_id: swId,
          phone: '',
          department: '',
          assignedMemberCount: 0
        });
      }
    });

    const transformedStaff = Array.from(matchedSocialWorkers.values()).map(staff => ({
      ...staff,
      isActive: true
    }));
    
    console.log(`✅ Matched ${transformedStaff.length} social workers with names and emails`);

    return transformedStaff;

  } catch (error) {
    console.error('❌ Error fetching MSW staff from Caspio:', error);
    throw error;
  }
}

// Get member counts for each staff member
async function getStaffMemberCounts(staffIds: string[]) {
  try {
    const token = await getCaspioToken();
    
    const memberCounts: Record<string, number> = {};
    
    // Get count of members assigned to each staff
    for (const staffId of staffIds) {
      const countUrl = `${CASPIO_BASE_URL}/rest/v2/tables/CalAIM_tbl_Members/records?q.select=COUNT(Client_ID2)&q.where=SW_ID='${staffId}'`;
      
      const response = await fetch(countUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        memberCounts[staffId] = data.Result?.[0]?.['COUNT(Client_ID2)'] || 0;
      } else {
        memberCounts[staffId] = 0;
      }
    }
    
    return memberCounts;
  } catch (error) {
    console.error('❌ Error getting staff member counts:', error);
    return {};
  }
}

export async function GET(request: NextRequest) {
  try {
    console.log('📥 Fetching MSW staff from Caspio CalAIM_tbl_Members...');

    // Fetch MSW staff from Caspio
    const staffMembers = await fetchMSWStaffFromCaspio();
    
    if (staffMembers.length === 0) {
      return NextResponse.json({
        success: true,
        staff: [],
        message: 'No MSW staff found in CalAIM_tbl_Members'
      });
    }

    // Sort by name
    const sortedStaff = staffMembers.sort((a, b) => {
      const nameA = (a.name || '').toString();
      const nameB = (b.name || '').toString();
      return nameA.localeCompare(nameB);
    });

    console.log(`✅ Returning ${sortedStaff.length} MSW staff members with assignment counts`);

    return NextResponse.json({
      success: true,
      staff: sortedStaff,
      message: `Found ${sortedStaff.length} MSW staff members`
    });

  } catch (error: any) {
    console.error('❌ Error fetching MSW staff:', error);
    
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to fetch MSW staff from Caspio',
      staff: []
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action, staffId, memberId } = await request.json();

    if (action === 'assignMember' && staffId && memberId) {
      // Update member's SW_ID in CalAIM_tbl_Members
      const token = await getCaspioToken();
      
      const updateUrl = `${CASPIO_BASE_URL}/rest/v2/tables/CalAIM_tbl_Members/records?q.where=Client_ID2='${memberId}'`;
      
      const updateData = {
        SW_ID: staffId,
        LastUpdated: new Date().toISOString()
      };

      const response = await fetch(updateUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        throw new Error(`Failed to update member assignment: ${response.status} ${response.statusText}`);
      }

      return NextResponse.json({
        success: true,
        message: `Member ${memberId} assigned to staff ${staffId}`
      });
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid action or missing parameters'
    }, { status: 400 });

  } catch (error: any) {
    console.error('❌ Error updating staff assignment:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to update staff assignment'
    }, { status: 500 });
  }
}