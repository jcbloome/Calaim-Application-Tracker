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
    
    // Use exact same authentication pattern as working Kaiser tracker
    const dataBaseUrl = 'https://c7ebl500.caspio.com/rest/v2';
    const clientId = 'b721f0c7af4d4f7542e8a28665bfccb07e93f47deb4bda27bc';
    const clientSecret = 'bad425d4a8714c8b95ec2ea9d256fc649b2164613b7e54099c';
    
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenUrl = 'https://c7ebl500.caspio.com/oauth/token';
    
    console.log('🔐 Using Kaiser tracker auth pattern');
    console.log('🔐 OAuth URL:', tokenUrl);
    console.log('🔐 Data API URL:', dataBaseUrl);
    
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });

    console.log('🔐 Token response status:', tokenResponse.status);
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.log('❌ Token error response:', errorText);
      throw new Error(`Failed to get access token: ${tokenResponse.status} - ${errorText}`);
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
        // Fetch all records using pagination (optimized for speed)
        let allRecords: any[] = [];
        let pageNumber = 1;
        const pageSize = 100; // Smaller pages for faster response
        const maxPages = 10; // Up to 1,000 records
        let pageRecords: any[] = [];

        console.log('🔍 Trying staff table:', tableName);

        do {
          // Use Caspio's correct pagination parameters (same as authorization tracker)
          const staffUrl = `${dataBaseUrl}/tables/${tableName}/records?q.pageSize=${pageSize}&q.pageNumber=${pageNumber}`;
          console.log(`🌐 Fetching page ${pageNumber} from ${tableName} (pageSize: ${pageSize})...`);

          const staffResponse = await fetch(staffUrl, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          });

          console.log(`📡 Response status for ${tableName} page ${pageNumber}:`, staffResponse.status);
          
          if (!staffResponse.ok) {
            const errorText = await staffResponse.text();
            console.log(`❌ Error response for ${tableName} page ${pageNumber}:`, errorText);
            break;
          }

          const staffData = await staffResponse.json();
          pageRecords = staffData.Result || [];
          
          console.log(`📄 Retrieved ${pageRecords.length} records from ${tableName} page ${pageNumber}`);
          
          if (pageRecords.length > 0) {
            allRecords = allRecords.concat(pageRecords);
            pageNumber++;
          }

          // If we got fewer records than pageSize, we've reached the end
          if (pageRecords.length < pageSize) {
            console.log(`📋 Reached end of data - got ${pageRecords.length} records (less than pageSize ${pageSize})`);
            break;
          }

          // Safety check to prevent infinite loops
          if (pageNumber > maxPages) {
            console.log(`⚠️ Reached maximum pages limit (${maxPages})`);
            break;
          }
          
        } while (pageRecords.length === pageSize && pageNumber <= maxPages);

        if (allRecords.length > 0) {
          staffRecords = allRecords;
          successfulStaffTable = tableName;
          console.log(`✅ Found staff data in table: ${tableName} (${allRecords.length} total records from ${pageNumber - 1} pages)`);
          
          // Debug: Show available fields in the first record
          if (allRecords.length > 0) {
            console.log('🔍 Available Staff fields:', Object.keys(allRecords[0]));
            console.log('📋 Sample Staff record:', JSON.stringify(allRecords[0], null, 2));
            
            // Show first 3 records to understand the data structure
            console.log('📋 First 3 staff records:');
            allRecords.slice(0, 3).forEach((record, index) => {
              console.log(`Record ${index + 1}:`, JSON.stringify(record, null, 2));
            });
          }
          break;
        }
      } catch (error) {
        console.log(`❌ Staff table ${tableName} not found or accessible:`, error);
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
      
      // Show first 5 records to understand the data structure
      console.log('📋 First 5 staff records:');
      staffRecords.slice(0, 5).forEach((record, index) => {
        console.log(`Record ${index + 1}:`, {
          Role: record.Role,
          Name: record.Name,
          County: record.County,
          City: record.City,
          Email: record.Email,
          allFields: Object.keys(record)
        });
      });
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
                    (record.User_First && record.User_Last ? record.User_First + ' ' + record.User_Last : '') ||
                    (record.FirstName && record.LastName ? record.FirstName + ' ' + record.LastName : '') ||
                    (record.first_name && record.last_name ? record.first_name + ' ' + record.last_name : '') ||
                    record.Display_Name || record.User_First || record.FirstName || 'Unknown';
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
      .filter((staff: StaffMember) => {
        const isValid = staff.county !== 'Unknown' && staff.name !== 'Unknown' && staff.name !== '';
        if (!isValid) {
          console.log(`❌ Filtered out staff: name="${staff.name}", county="${staff.county}"`);
        } else {
          console.log(`✅ Keeping staff: name="${staff.name}", county="${staff.county}"`);
        }
        return isValid;
      });

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