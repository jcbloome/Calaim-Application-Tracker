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

// Fetch MSW staff from Caspio
async function fetchMSWStaffFromCaspio() {
  try {
    const token = await getCaspioToken();
    
    // First, get unique SW_ID values from CalAIM_tbl_Members
    const membersUrl = `${CASPIO_BASE_URL}/rest/v2/tables/CalAIM_tbl_Members/records?q.select=SW_ID&q.where=SW_ID IS NOT NULL AND SW_ID != ''&q.groupBy=SW_ID`;
    
    console.log('🔍 Fetching unique SW_IDs from CalAIM_tbl_Members...');
    
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
    const swIds = membersData.Result?.map((record: any) => record.SW_ID).filter(Boolean) || [];
    
    console.log(`✅ Found ${swIds.length} unique SW_IDs:`, swIds);

    if (swIds.length === 0) {
      return [];
    }

    // Now fetch staff details from connect_tbl_userregistration table
    // Build query to get staff info for these SW_IDs
    const staffQuery = swIds.map(id => `Record_ID='${id}'`).join(' OR ');
    const staffUrl = `${CASPIO_BASE_URL}/rest/v2/tables/connect_tbl_userregistration/records?q.where=${encodeURIComponent(staffQuery)}`;
    
    console.log('👥 Fetching staff details from connect_tbl_userregistration...');
    
    const staffResponse = await fetch(staffUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!staffResponse.ok) {
      throw new Error(`Failed to fetch staff details: ${staffResponse.status} ${staffResponse.statusText}`);
    }

    const staffData = await staffResponse.json();
    const staffMembers = staffData.Result || [];
    
    console.log(`✅ Retrieved ${staffMembers.length} staff members from Caspio`);

    // Transform staff data to our format
    const transformedStaff = staffMembers.map((staff: any) => ({
      id: staff.Record_ID || staff.id,
      name: `${staff.first_name || ''} ${staff.last_name || ''}`.trim() || 'Unknown Staff',
      email: staff.email || '',
      role: staff.role || 'MSW',
      sw_id: staff.Record_ID,
      phone: staff.phone || '',
      department: staff.department || '',
      isActive: staff.status === 'Active' || staff.is_active === true,
      // Count assigned members for this staff
      assignedMemberCount: 0 // Will be populated separately if needed
    }));

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

    // Get member counts for each staff
    const staffIds = staffMembers.map(staff => staff.sw_id).filter(Boolean);
    const memberCounts = await getStaffMemberCounts(staffIds);
    
    // Add member counts to staff data
    const staffWithCounts = staffMembers.map(staff => ({
      ...staff,
      assignedMemberCount: memberCounts[staff.sw_id] || 0
    }));

    // Sort by name
    const sortedStaff = staffWithCounts.sort((a, b) => a.name.localeCompare(b.name));

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