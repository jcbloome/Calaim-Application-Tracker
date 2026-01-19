import { NextRequest, NextResponse } from 'next/server';

// Types for RCFE data
interface RCFE {
  id: string;
  name: string;
  county: string;
  city?: string;
  address?: string;
  phone?: string;
  capacity?: number;
  licensedBeds?: number;
  status: 'Active' | 'Inactive';
  licenseNumber?: string;
  contactPerson?: string;
}

export async function GET(request: NextRequest) {
  try {
    console.log('🏠 Fetching RCFE locations from Caspio...');
    
    // Use environment variables for Caspio credentials
    const caspioBaseUrl = process.env.CASPIO_BASE_URL;
    const caspioClientId = process.env.CASPIO_CLIENT_ID;
    const caspioClientSecret = process.env.CASPIO_CLIENT_SECRET;

    if (!caspioBaseUrl || !caspioClientId || !caspioClientSecret) {
      throw new Error('Missing Caspio environment variables');
    }
    
    console.log('🔐 Getting Caspio access token...');
    
    const tokenResponse = await fetch(`${caspioBaseUrl}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: caspioClientId,
        client_secret: caspioClientSecret,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to get Caspio access token');
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Try multiple possible RCFE table names
    const possibleTables = [
      'CalAIM_tbl_New_RCFE_Registration',
      'connect_tbl_rcfe',
      'tbl_rcfe',
      'rcfe_facilities',
      'facilities',
      'connect_tbl_facilities',
      'CalAIM_tbl_RCFEs',
      'tbl_facilities'
    ];

    let rcfeRecords: any[] = [];
    let successfulTable = '';

    for (const tableName of possibleTables) {
      try {
        // Fetch all records using pagination (optimized for speed)
        let allRecords: any[] = [];
        let pageNumber = 1;
        const pageSize = 100; // Smaller pages for faster response
        const maxPages = 10; // Up to 1,000 records (should cover your 250+ RCFEs)
        let pageRecords: any[] = [];

        console.log('🔍 Trying table:', tableName);

        do {
          // Use Caspio's correct pagination parameters (same as authorization tracker)
          const rcfeUrl = `${caspioBaseUrl}/rest/v2/tables/${tableName}/records?q.pageSize=${pageSize}&q.pageNumber=${pageNumber}`;
          console.log(`🌐 Fetching page ${pageNumber} from ${tableName} (pageSize: ${pageSize})...`);

          const rcfeResponse = await fetch(rcfeUrl, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          });

          console.log(`📡 Response status for ${tableName} page ${pageNumber}:`, rcfeResponse.status);
          
          if (!rcfeResponse.ok) {
            const errorText = await rcfeResponse.text();
            console.log(`❌ Error response for ${tableName} page ${pageNumber}:`, errorText);
            break;
          }

          const rcfeData = await rcfeResponse.json();
          pageRecords = rcfeData.Result || [];
          
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
          rcfeRecords = allRecords;
          successfulTable = tableName;
          console.log(`✅ Found RCFE data in table: ${tableName} (${allRecords.length} total records from ${pageNumber - 1} pages)`);
          
          // Debug: Show available fields in the first record
          if (allRecords.length > 0) {
            console.log('🔍 Available RCFE fields:', Object.keys(allRecords[0]));
            console.log('📋 Sample RCFE record:', allRecords[0]);
            
            // Show first 5 records to understand the data structure
            console.log('🏠 First 5 RCFE records with registered IDs:');
            allRecords.slice(0, 5).forEach((record, index) => {
              console.log(`RCFE ${index + 1}:`, {
                Name: record.Name || record.RCFE_Name,
                RegisteredID: record.RCFE_Registered_ID || record.ID || record.id,
                County: record.County,
                City: record.City,
                Address: record.Address,
                Capacity: record.Capacity,
                allFields: Object.keys(record)
              });
            });
          }
          break;
        }
      } catch (error) {
        console.log(`❌ Table ${tableName} not found or accessible:`, error);
        continue;
      }
    }

    if (rcfeRecords.length === 0) {
      console.log('⚠️ No RCFE data found in any table, returning mock data for demonstration');
      // Return some mock RCFE data for demonstration
      rcfeRecords = [
        {
          ID: '1',
          Name: 'Sunrise Senior Living',
          County: 'Los Angeles',
          City: 'Beverly Hills',
          Address: '123 Sunset Blvd',
          Phone: '310-555-0123',
          Capacity: 50,
          Status: 'Active',
          License_Number: 'RCFE-LA-001'
        },
        {
          ID: '2', 
          Name: 'Golden Years Care Home',
          County: 'Orange',
          City: 'Irvine',
          Address: '456 Orange Ave',
          Phone: '714-555-0456',
          Capacity: 25,
          Status: 'Active',
          License_Number: 'RCFE-OR-002'
        },
        {
          ID: '3',
          Name: 'Bay Area Senior Care',
          County: 'Santa Clara',
          City: 'San Jose',
          Address: '789 Tech Way',
          Phone: '408-555-0789',
          Capacity: 75,
          Status: 'Active',
          License_Number: 'RCFE-SC-003'
        }
      ];
      successfulTable = 'mock_data';
    }

    console.log(`📋 Retrieved ${rcfeRecords.length} RCFE records from ${successfulTable}`);
    if (rcfeRecords.length > 0) {
      console.log('🔍 Sample RCFE record keys:', Object.keys(rcfeRecords[0] || {}));
    }

    // Map RCFE data
    const rcfes: RCFE[] = rcfeRecords.map((record: any) => {
      // Map field names from CalAIM_tbl_New_RCFE_Registration (user-confirmed field names)
      const name = record.RCFE_Name || record.Name || record.name || record.facility_name || record.FacilityName || 
                  record.Facility_Name || record.Business_Name || 'Unknown Facility';
      const county = record.RCFE_County || record.County || record.county || record.service_county || record.location_county || 
                    record.Service_County || record.Location_County || 'Unknown';
      const city = record.RCFE_City || record.City || record.city || record.location_city || record.Service_City || 
                  record.Location_City || '';
      const state = record.RCFE_State || record.State || record.state || 'CA';
      const street = record.RCFE_Street || record.Address || record.address || record.street_address || record.full_address || 
                     record.Street_Address || record.Full_Address || record.Physical_Address || '';
      const zip = record.RCFE_Zip || record.Zip || record.zip || record.ZipCode || record.postal_code || '';
      const address = street ? `${street}${city ? ', ' + city : ''}${state ? ', ' + state : ''}${zip ? ' ' + zip : ''}` : 'Unknown';
      const phone = record.Phone || record.phone || record.contact_phone || record.phone_number || 
                   record.Contact_Phone || record.Phone_Number || '';
      const capacity = record.Capacity || record.capacity || record.bed_count || record.licensed_beds || 
                      record.Licensed_Beds || record.Bed_Count || 0;
      const status = record.Status || record.status || record.active_status || record.Active_Status || 'Active';
      const licenseNumber = record.License_Number || record.license_number || record.license_id || 
                           record.facility_license || record.Facility_License || record.RCFE_License || '';
      const contactPerson = record.Contact_Person || record.contact_person || record.administrator || 
                           record.primary_contact || record.Administrator || record.Primary_Contact || '';

      return {
        id: record.ID || record.id || record.facility_id || record.RCFE_Registered_ID || Math.random().toString(36),
        registeredId: record.RCFE_Registered_ID || record.ID || record.id,
        name,
        county,
        city,
        address,
        phone,
        capacity: parseInt(capacity) || 0,
        licensedBeds: parseInt(capacity) || 0,
        status: status === 'Inactive' ? 'Inactive' : 'Active',
        licenseNumber,
        contactPerson
      };
    }).filter((rcfe: RCFE) => rcfe.county !== 'Unknown' && rcfe.name !== 'Unknown Facility');

    console.log(`✅ Processed ${rcfes.length} valid RCFEs`);

    // Group by county
    const rcfesByCounty = rcfes.reduce((acc: any, rcfe) => {
      if (!acc[rcfe.county]) {
        acc[rcfe.county] = {
          county: rcfe.county,
          facilities: [],
          totalCapacity: 0,
          activeCount: 0,
          inactiveCount: 0
        };
      }

      acc[rcfe.county].facilities.push(rcfe);
      acc[rcfe.county].totalCapacity += rcfe.capacity || 0;
      
      if (rcfe.status === 'Active') {
        acc[rcfe.county].activeCount++;
      } else {
        acc[rcfe.county].inactiveCount++;
      }

      return acc;
    }, {});

    const response = {
      success: true,
      data: {
        rcfesByCounty,
        totalRCFEs: rcfes.length,
        counties: Object.keys(rcfesByCounty).length,
        totalCapacity: rcfes.reduce((sum, rcfe) => sum + (rcfe.capacity || 0), 0),
        breakdown: {
          active: rcfes.filter(r => r.status === 'Active').length,
          inactive: rcfes.filter(r => r.status === 'Inactive').length,
        },
        sourceTable: successfulTable
      }
    };

    console.log('🏠 RCFE summary:', response.data);

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('❌ Error fetching RCFE locations:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Failed to fetch RCFE locations',
        data: { 
          rcfesByCounty: {}, 
          totalRCFEs: 0, 
          counties: 0, 
          totalCapacity: 0,
          breakdown: { active: 0, inactive: 0 },
          sourceTable: 'none'
        }
      },
      { status: 500 }
    );
  }
}