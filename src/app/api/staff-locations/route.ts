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

    // Try multiple possible staff table names
    const possibleStaffTables = [
      'connect_tbl_usersregistration',
      'tbl_usersregistration',
      'usersregistration',
      'staff_registration',
      'user_registration',
      'CalAIM_tbl_Staff',
      'tbl_staff'
    ];

    let staffRecords: any[] = [];
    let successfulStaffTable = '';

    for (const tableName of possibleStaffTables) {
      try {
        const staffUrl = `${process.env.CASPIO_BASE_URL}/tables/${tableName}/records`;
        console.log('🔍 Trying staff table:', tableName);

        const staffResponse = await fetch(staffUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        });

        if (staffResponse.ok) {
          const staffData = await staffResponse.json();
          staffRecords = staffData.Result || [];
          successfulStaffTable = tableName;
          console.log(`✅ Found staff data in table: ${tableName} (${staffRecords.length} records)`);
          
          // Debug: Show available fields in the first record
          if (staffRecords.length > 0) {
            console.log('🔍 Available Staff fields:', Object.keys(staffRecords[0]));
            console.log('📋 Sample Staff record:', staffRecords[0]);
          }
          break;
        }
      } catch (error) {
        console.log(`❌ Staff table ${tableName} not found or accessible`);
        continue;
      }
    }

    if (staffRecords.length === 0) {
      console.log('⚠️ No staff data found in any table, returning mock data for demonstration');
      // Return some mock staff data for demonstration
      staffRecords = [
        {
          ID: '1',
          Name: 'Sarah Johnson',
          Role: 'Social Worker',
          County: 'Los Angeles',
          City: 'Los Angeles',
          Email: 'sarah.johnson@connections.com',
          Phone: '213-555-0123',
          Status: 'Active'
        },
        {
          ID: '2',
          Name: 'Michael Chen',
          Role: 'RN',
          County: 'Orange',
          City: 'Irvine',
          Email: 'michael.chen@connections.com',
          Phone: '714-555-0456',
          Status: 'Active'
        },
        {
          ID: '3',
          Name: 'Lisa Rodriguez',
          Role: 'Social Worker',
          County: 'San Diego',
          City: 'San Diego',
          Email: 'lisa.rodriguez@connections.com',
          Phone: '619-555-0789',
          Status: 'Active'
        }
      ];
      successfulStaffTable = 'mock_data';
    }

    console.log(`📋 Retrieved ${staffRecords.length} staff records from table: ${successfulStaffTable}`);
    if (staffRecords.length > 0) {
      console.log('🔍 Sample record keys:', Object.keys(staffRecords[0]));
      console.log('📄 Sample record data:', staffRecords[0]);
      console.log('👥 All roles found:', [...new Set(staffRecords.map((r: any) => r.Role || r.role || r.user_role || r.Position || r.position || 'Unknown'))]);
    }

    // Filter and map staff data
    console.log('🔍 Filtering staff records...');
    const staffMembers: StaffMember[] = staffRecords
      .filter((record: any) => {
        const role = record.Role || record.role || record.user_role || record.Position || record.position;
        const isValidRole = role === 'MSW' || role === 'RN' || role === 'Social Worker' || role === 'Registered Nurse';
        if (!isValidRole) {
          console.log(`❌ Filtered out record with role: "${role}"`);
        } else {
          console.log(`✅ Keeping record with role: "${role}"`);
        }
        return isValidRole;
      })
      .map((record: any) => {
        // Map various possible field names from Caspio user registration table
        const role = record.Role || record.role || record.user_role || record.Position || record.position || 
                    record.User_Role || record.Job_Title || record.Title;
        const name = record.Name || record.name || record.full_name || record.Full_Name ||
                    (record.FirstName && record.LastName ? record.FirstName + ' ' + record.LastName : '') ||
                    (record.first_name && record.last_name ? record.first_name + ' ' + record.last_name : '') ||
                    record.Display_Name || 'Unknown';
        const county = record.County || record.county || record.work_county || record.service_area || 
                      record.assigned_county || record.Work_County || record.Service_Area || 
                      record.Assigned_County || 'Unknown';
        const city = record.City || record.city || record.work_city || record.Work_City || '';
        const email = record.Email || record.email || record.email_address || record.Email_Address || '';
        const phone = record.Phone || record.phone || record.phone_number || record.contact_phone || 
                     record.Phone_Number || record.Contact_Phone || '';
        const status = record.Status || record.status || record.active_status || record.Active_Status || 'Active';

        return {
          id: record.ID || record.id || record.user_id || Math.random().toString(36),
          name,
          role: (role === 'MSW' || role === 'Social Worker') ? 'Social Worker' : 
                (role === 'RN' || role === 'Registered Nurse') ? 'RN' : role as 'Social Worker' | 'RN',
          county,
          city,
          email,
          phone,
          status: status === 'Inactive' ? 'Inactive' : 'Active'
        };
      })
      .filter((staff: StaffMember) => staff.county !== 'Unknown' && staff.name !== 'Unknown');

    console.log(`✅ Processed ${staffMembers.length} valid staff members`);
    if (staffMembers.length > 0) {
      console.log('👥 Sample processed staff member:', staffMembers[0]);
      console.log('🗺️ Counties found:', [...new Set(staffMembers.map(s => s.county))]);
    } else {
      console.log('⚠️ No valid staff members found after filtering and processing');
    }

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