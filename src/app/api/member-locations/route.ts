import { NextRequest, NextResponse } from 'next/server';

// Types for CalAIM Member data
interface CalAIMMember {
  id: string;
  recordId?: string;
  seniorLastFirstId?: string;
  clientId2?: string;
  firstName: string;
  lastName: string;
  county: string;
  city?: string;
  currentLocation?: string;
  customaryCounty?: string;
  customaryCity?: string;
  healthPlan?: string;
  pathway?: string;
  status?: string;
  kaiserStatus?: string;
  calaimStatus?: string;
  assignedStaff?: string;
  rcfeRegisteredId?: string;
  rcfeName?: string;
  rcfeAddress?: string;
  rcfeCity?: string;
  rcfeState?: string;
  rcfeZip?: string;
  rcfeCounty?: string;
}

export async function GET(request: NextRequest) {
  try {
    console.log('👥 Fetching CalAIM member locations from Caspio...');
    
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

    // Fetch CalAIM members from the members table
    const membersTable = 'CalAIM_tbl_Members';
    let allMembers: any[] = [];
    let pageNumber = 1;
    const pageSize = 100;
    const maxPages = 50; // Up to 5,000 members
    let pageRecords: any[] = [];

    console.log('📊 Fetching CalAIM members...');

    do {
      const membersUrl = `${caspioBaseUrl}/rest/v2/tables/${membersTable}/records?q.pageSize=${pageSize}&q.pageNumber=${pageNumber}`;
      console.log(`🌐 Fetching page ${pageNumber} from ${membersTable}...`);

      const membersResponse = await fetch(membersUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      console.log(`📡 Response status for ${membersTable} page ${pageNumber}:`, membersResponse.status);
      
      if (!membersResponse.ok) {
        const errorText = await membersResponse.text();
        console.log(`❌ Error response for ${membersTable} page ${pageNumber}:`, errorText);
        break;
      }

      const membersData = await membersResponse.json();
      pageRecords = membersData.Result || [];
      
      console.log(`📄 Retrieved ${pageRecords.length} members from page ${pageNumber}`);
      
      if (pageRecords.length > 0) {
        allMembers = allMembers.concat(pageRecords);
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

    console.log(`✅ Found ${allMembers.length} total CalAIM members from ${pageNumber - 1} pages`);
    
    // Debug: Show available fields in the first record
    if (allMembers.length > 0) {
      console.log('🔍 Available member fields:', Object.keys(allMembers[0]));
      console.log('📋 Sample member record:', allMembers[0]);
      
      // Use EXACT same debugging as authorization tracker with unique ID fields
      console.log('🔍 First 5 members CalAIM_Status values with unique IDs:');
      allMembers.slice(0, 5).forEach((member, index) => {
        console.log(`Member ${index + 1}:`, {
          Name: `${member.Senior_First} ${member.Senior_Last}`,
          Record_ID: member.Record_ID,
          Senior_Last_First_ID: member.Senior_Last_First_ID,
          Client_ID2: member.Client_ID2,
          CalAIM_Status: member.CalAIM_Status,
          statusType: typeof member.CalAIM_Status,
          statusLength: member.CalAIM_Status ? member.CalAIM_Status.length : 0
        });
      });
      
      const uniqueStatuses = [...new Set(allMembers.map(m => m.CalAIM_Status).filter(Boolean))];
      console.log('📊 Unique CalAIM_Status values in member data:', uniqueStatuses);
      console.log('📊 Status value counts:');
      uniqueStatuses.forEach(status => {
        const count = allMembers.filter(m => m.CalAIM_Status === status).length;
        console.log(`  "${status}": ${count} members`);
      });
      
      // Check for any status that might be "Authorized" with different casing or spaces
      const allStatusValues = allMembers.map(m => m.CalAIM_Status).filter(Boolean);
      const authorizedVariations = allStatusValues.filter(status => 
        status && (
          status.toLowerCase().includes('auth') ||
          status.toLowerCase().includes('approve') ||
          status.toLowerCase().includes('active')
        )
      );
      console.log('🔍 Status values containing "auth", "approve", or "active":', [...new Set(authorizedVariations)]);
      
      // Show raw status values for first 10 members
      console.log('🔍 Raw CalAIM_Status values for first 10 members:');
      allMembers.slice(0, 10).forEach((member, index) => {
        console.log(`  ${index + 1}. "${member.CalAIM_Status}" (length: ${member.CalAIM_Status?.length || 0}, type: ${typeof member.CalAIM_Status})`);
      });
    }

    // FILTER RAW DATA FIRST - EXACT same approach as authorization tracker
    const authorizedMembers = allMembers.filter(member => 
      member.CalAIM_Status === 'Authorized'
    );
    
    console.log(`📊 Total members: ${allMembers.length}, Authorized members: ${authorizedMembers.length}`);

    // Map member data using EXACT same field mapping as authorization tracker (using filtered authorized members)
    const members: CalAIMMember[] = authorizedMembers.map((record: any) => {
      // Use EXACT same field names as authorization tracker
      const firstName = record.Senior_First || record.MemberFirstName || record.FirstName || 'Unknown';
      const lastName = record.Senior_Last || record.MemberLastName || record.LastName || 'Unknown';
      const county = record.Member_County || record.MemberCounty || record.County || 'Unknown';
      const city = record.MemberCity || record.City || record.CurrentCity || '';
      const currentLocation = record.CurrentLocation || record.current_location || '';
      const customaryCounty = record.CustomaryCounty || record.customary_county || '';
      const customaryCity = record.CustomaryCity || record.customary_city || '';
      
      // Use same health plan mapping as authorization tracker
      const healthPlan = record.CalAIM_MCO || record.CalAIM_MCP || record.HealthPlan || record.MC_Plan || 
                        record.Health_Plan || record.MCP || record.MCO || record.Plan_Name || 'Unknown';
      const pathway = record.Pathway || record.pathway || '';
      
      // Use EXACT same CalAIM_Status field as authorization tracker
      const status = record.CalAIM_Status || 'Unknown';
      const kaiserStatus = record.Kaiser_Status || record.kaiser_status || '';
      const assignedStaff = record.kaiser_user_assignment || record.assigned_staff || '';
      
      // RCFE Information using the registered ID and related fields
      const rcfeRegisteredId = record.RCFE_Registered_ID || record.rcfe_registered_id || '';
      const rcfeName = record.RCFEName || record.rcfe_name || record.RCFE_Name || '';
      const rcfeAddress = record.RCFE_Address || record.RCFEAddress || record.rcfe_address || '';
      const rcfeCity = record.RCFE_City || record.rcfe_city || '';
      const rcfeState = record.RCFE_State || record.rcfe_state || 'CA';
      const rcfeZip = record.RCFE_Zip || record.rcfe_zip || '';
      const rcfeCounty = record.RCFE_County || record.rcfe_county || '';

      return {
        id: record.Record_ID || record.ID || record.id || Math.random().toString(36),
        recordId: record.Record_ID || '',
        seniorLastFirstId: record.Senior_Last_First_ID || '',
        clientId2: record.Client_ID2 || '',
        firstName,
        lastName,
        county,
        city,
        currentLocation,
        customaryCounty,
        customaryCity,
        healthPlan,
        pathway,
        status,
        kaiserStatus,
        calaimStatus: status,
        assignedStaff,
        rcfeRegisteredId,
        rcfeName,
        rcfeAddress,
        rcfeCity,
        rcfeState,
        rcfeZip,
        rcfeCounty
      };
    });

    console.log(`📊 Total processed members before filtering: ${members.length}`);
    
    // Since we already filtered for authorized members at the raw data level, 
    // just filter for valid names (same as authorization tracker approach)
    const filteredMembers = members.filter((member: CalAIMMember) => {
      const hasValidName = member.firstName !== 'Unknown' && member.lastName !== 'Unknown';
      
      if (!hasValidName) {
        console.log(`❌ Filtering out member with invalid name: "${member.firstName}" "${member.lastName}"`);
      } else {
        console.log(`✅ Including authorized member: ${member.firstName} ${member.lastName} (Status: "${member.calaimStatus}")`);
      }
      
      return hasValidName;
    });

    console.log(`✅ Filtered to ${filteredMembers.length} valid authorized CalAIM members`);
    
    // Show some examples of authorized members
    if (filteredMembers.length > 0) {
      console.log('✅ Sample authorized members with unique IDs:');
      filteredMembers.slice(0, 3).forEach((member, index) => {
        console.log(`  ${index + 1}. ${member.firstName} ${member.lastName} - ${member.county} County`, {
          Status: member.calaimStatus,
          Record_ID: member.recordId,
          Senior_Last_First_ID: member.seniorLastFirstId,
          Client_ID2: member.clientId2,
          RCFE_ID: member.rcfeRegisteredId
        });
      });
    }

    console.log(`✅ Processed ${members.length} valid authorized CalAIM members`);
    
    // Debug: Show members with RCFE assignments
    const membersWithRCFE = filteredMembers.filter(m => m.rcfeRegisteredId && String(m.rcfeRegisteredId).trim() !== '');
    console.log(`🏠 Authorized members with RCFE assignments: ${membersWithRCFE.length}`);
    
    if (membersWithRCFE.length > 0) {
      console.log('📋 Sample members with RCFE assignments:');
      membersWithRCFE.slice(0, 5).forEach((member, index) => {
        console.log(`  ${index + 1}. ${member.firstName} ${member.lastName} → RCFE ID: ${member.rcfeRegisteredId} (${member.rcfeName})`);
      });
    }

    // Group by county
    const membersByCounty = filteredMembers.reduce((acc: any, member) => {
      if (!acc[member.county]) {
        acc[member.county] = {
          county: member.county,
          members: [],
          totalMembers: 0,
          activeMembers: 0,
          kaiserMembers: 0,
          healthNetMembers: 0,
          snfTransition: 0,
          snfDiversion: 0
        };
      }

      acc[member.county].members.push(member);
      acc[member.county].totalMembers++;
      
      if (member.status === 'Active' || member.calaimStatus === 'Active') {
        acc[member.county].activeMembers++;
      }
      
      if (member.healthPlan === 'Kaiser') {
        acc[member.county].kaiserMembers++;
      } else if (member.healthPlan === 'Health Net') {
        acc[member.county].healthNetMembers++;
      }
      
      if (member.pathway === 'SNF Transition') {
        acc[member.county].snfTransition++;
      } else if (member.pathway === 'SNF Diversion') {
        acc[member.county].snfDiversion++;
      }

      return acc;
    }, {});

    // Also group by city for more granular data
    const membersByCity = filteredMembers.reduce((acc: any, member) => {
      const cityKey = member.city ? `${member.city}, ${member.county}` : member.county;
      
      if (!acc[cityKey]) {
        acc[cityKey] = {
          city: member.city || 'County-wide',
          county: member.county,
          members: [],
          totalMembers: 0
        };
      }

      acc[cityKey].members.push(member);
      acc[cityKey].totalMembers++;

      return acc;
    }, {});

    // Group by RCFE facility using Registered ID for accurate matching
    const membersByRCFE = filteredMembers
      .filter(member => member.rcfeRegisteredId && String(member.rcfeRegisteredId).trim() !== '')
      .reduce((acc: any, member) => {
        const rcfeKey = member.rcfeRegisteredId; // Use registered ID as unique key
        
        if (!acc[rcfeKey]) {
          acc[rcfeKey] = {
            rcfeRegisteredId: member.rcfeRegisteredId,
            rcfeName: member.rcfeName,
            rcfeAddress: member.rcfeAddress,
            rcfeCity: member.rcfeCity,
            rcfeState: member.rcfeState,
            rcfeZip: member.rcfeZip,
            rcfeCounty: member.rcfeCounty || member.county, // Use RCFE county or member county
            county: member.county, // Member's county for location
            members: [],
            totalMembers: 0,
            uniqueMembers: new Set() // Track unique members by ID
          };
        }

        // Use unique ID to avoid duplicates
        const memberUniqueId = member.seniorLastFirstId || member.clientId2 || member.recordId || member.id;
        if (!acc[rcfeKey].uniqueMembers.has(memberUniqueId)) {
          acc[rcfeKey].uniqueMembers.add(memberUniqueId);
          acc[rcfeKey].members.push(member);
          acc[rcfeKey].totalMembers++;
        }

        return acc;
      }, {});

    // Clean up the uniqueMembers Set from the final data (not serializable)
    Object.values(membersByRCFE).forEach((rcfe: any) => {
      delete rcfe.uniqueMembers;
    });

    console.log(`🏠 RCFEs with members: ${Object.keys(membersByRCFE).length}`);
    if (Object.keys(membersByRCFE).length > 0) {
      console.log('📋 RCFE facilities with member counts:');
      Object.entries(membersByRCFE).forEach(([rcfeId, data]: [string, any]) => {
        console.log(`  RCFE ID: ${rcfeId} → ${data.rcfeName} (${data.totalMembers} members)`);
      });
    }

    const response = {
      success: true,
      data: {
        membersByCounty,
        membersByCity,
        membersByRCFE,
        totalMembers: filteredMembers.length,
        counties: Object.keys(membersByCounty).length,
        cities: Object.keys(membersByCity).length,
        rcfesWithMembers: Object.keys(membersByRCFE).length,
        breakdown: {
          active: filteredMembers.filter(m => m.status === 'Active' || m.calaimStatus === 'Active').length,
          kaiser: filteredMembers.filter(m => m.healthPlan === 'Kaiser').length,
          healthNet: filteredMembers.filter(m => m.healthPlan === 'Health Net').length,
          snfTransition: filteredMembers.filter(m => m.pathway === 'SNF Transition').length,
          snfDiversion: filteredMembers.filter(m => m.pathway === 'SNF Diversion').length,
        },
        sourceTable: membersTable
      }
    };

    console.log('👥 CalAIM members summary:', response.data);

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('❌ Error fetching CalAIM member locations:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Failed to fetch CalAIM member locations',
        data: { 
          membersByCounty: {}, 
          membersByCity: {},
          membersByRCFE: {},
          totalMembers: 0, 
          counties: 0,
          cities: 0,
          rcfesWithMembers: 0,
          breakdown: { active: 0, kaiser: 0, healthNet: 0, snfTransition: 0, snfDiversion: 0 },
          sourceTable: 'none'
        }
      },
      { status: 500 }
    );
  }
}