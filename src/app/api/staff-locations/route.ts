import { NextRequest, NextResponse } from 'next/server';

// Types for staff data
interface StaffMember {
  id: string;
  name: string;
  role: 'Social Worker' | 'RN';
  county: string;
  city?: string;
  email?: string;
  phone?: string;
  status: 'Active' | 'Inactive';
}

export async function GET(request: NextRequest) {
  try {
    console.log('🏥 Fetching staff locations from Caspio...');

    // Get Caspio access token
    const tokenResponse = await fetch(`${process.env.CASPIO_BASE_URL}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.CASPIO_CLIENT_ID!,
        client_secret: process.env.CASPIO_CLIENT_SECRET!,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to get Caspio access token');
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Fetch staff data from connect_tbl_usersregistration
    const staffUrl = `${process.env.CASPIO_BASE_URL}/tables/connect_tbl_usersregistration/records`;
    console.log('📊 Fetching from:', staffUrl);

    const staffResponse = await fetch(staffUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!staffResponse.ok) {
      const errorText = await staffResponse.text();
      console.error('❌ Failed to fetch staff data:', { status: staffResponse.status, error: errorText });
      throw new Error(`Failed to fetch staff data from Caspio: ${staffResponse.status}`);
    }

    const staffData = await staffResponse.json();
    const staffRecords = staffData.Result || [];

    console.log(`📋 Retrieved ${staffRecords.length} staff records`);
    console.log('🔍 Sample record keys:', Object.keys(staffRecords[0] || {}));

    // Filter and map staff data
    const staffMembers: StaffMember[] = staffRecords
      .filter((record: any) => {
        const role = record.Role || record.role || record.user_role || record.Position || record.position;
        return role === 'Social Worker' || role === 'RN' || role === 'Registered Nurse';
      })
      .map((record: any) => {
        // Map various possible field names from Caspio
        const role = record.Role || record.role || record.user_role || record.Position || record.position;
        const name = record.Name || record.name || record.full_name || record.FirstName + ' ' + record.LastName || 
                    record.first_name + ' ' + record.last_name || 'Unknown';
        const county = record.County || record.county || record.work_county || record.service_area || 
                      record.assigned_county || 'Unknown';
        const city = record.City || record.city || record.work_city || '';
        const email = record.Email || record.email || record.email_address || '';
        const phone = record.Phone || record.phone || record.phone_number || record.contact_phone || '';
        const status = record.Status || record.status || record.active_status || 'Active';

        return {
          id: record.ID || record.id || record.user_id || Math.random().toString(36),
          name,
          role: role === 'Registered Nurse' ? 'RN' : role as 'Social Worker' | 'RN',
          county,
          city,
          email,
          phone,
          status: status === 'Inactive' ? 'Inactive' : 'Active'
        };
      })
      .filter((staff: StaffMember) => staff.county !== 'Unknown' && staff.name !== 'Unknown');

    console.log(`✅ Processed ${staffMembers.length} valid staff members`);

    // Group by county and role
    const staffByCounty = staffMembers.reduce((acc: any, staff) => {
      if (!acc[staff.county]) {
        acc[staff.county] = {
          county: staff.county,
          socialWorkers: [],
          rns: [],
          total: 0
        };
      }

      if (staff.role === 'Social Worker') {
        acc[staff.county].socialWorkers.push(staff);
      } else if (staff.role === 'RN') {
        acc[staff.county].rns.push(staff);
      }

      acc[staff.county].total++;
      return acc;
    }, {});

    const response = {
      success: true,
      data: {
        staffByCounty,
        totalStaff: staffMembers.length,
        counties: Object.keys(staffByCounty).length,
        breakdown: {
          socialWorkers: staffMembers.filter(s => s.role === 'Social Worker').length,
          rns: staffMembers.filter(s => s.role === 'RN').length,
        }
      }
    };

    console.log('📊 Staff summary:', response.data);

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('❌ Error fetching staff locations:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Failed to fetch staff locations',
        data: { staffByCounty: {}, totalStaff: 0, counties: 0, breakdown: { socialWorkers: 0, rns: 0 } }
      },
      { status: 500 }
    );
  }
}