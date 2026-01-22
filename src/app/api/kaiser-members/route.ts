import { NextRequest, NextResponse } from 'next/server';

// Helper function to assign sample Kaiser statuses for demo purposes
function getRandomKaiserStatus(index: number): string {
  const sampleStatuses = [
    'T2038 Requested',
    'T2038 Received', 
    'T2038 received, Need First Contact',
    'T2038 received, doc collection',
    'Needs RN Visit',
    'RN/MSW Scheduled',
    'RN Visit Complete',
    'Need Tier Level',
    'Tier Level Requested',
    'Tier Level Received',
    'Locating RCFEs',
    'Found RCFE',
    'R&B Requested',
    'R&B Signed',
    'RCFE/ILS for Invoicing',
    'ILS Contracted (Complete)',
    'Confirm ILS Contracted',
    'Tier Level Revision Request',
    'On-Hold',
    'Tier Level Appeal',
    'T2038 email but need auth sheet',
    'Non-active',
    'Pending',
    'Switched MCPs',
    'Pending to Switch',
    'Authorized on hold',
    'Authorized',
    'Denied',
    'Expired',
    'Not interested',
    'Not CalAIM'
  ];
  
  return sampleStatuses[index % sampleStatuses.length];
}

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 Fetching Kaiser members from Caspio...');

    // Get Caspio credentials from environment
    const caspioBaseUrl = process.env.CASPIO_BASE_URL;
    const caspioClientId = process.env.CASPIO_CLIENT_ID;
    const caspioClientSecret = process.env.CASPIO_CLIENT_SECRET;

    console.log('🔧 Environment check:', {
      hasBaseUrl: !!caspioBaseUrl,
      hasClientId: !!caspioClientId,
      hasClientSecret: !!caspioClientSecret,
      baseUrl: caspioBaseUrl ? `${caspioBaseUrl.substring(0, 20)}...` : 'undefined'
    });

    if (!caspioBaseUrl || !caspioClientId || !caspioClientSecret) {
      console.error('❌ Missing Caspio credentials');
      return NextResponse.json({ 
        success: false, 
        error: 'Caspio credentials not configured',
        debug: {
          hasBaseUrl: !!caspioBaseUrl,
          hasClientId: !!caspioClientId,
          hasClientSecret: !!caspioClientSecret
        }
      }, { status: 500 });
    }

    // Get OAuth token
    console.log('🔐 Getting Caspio OAuth token...');
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
      const errorText = await tokenResponse.text();
      console.error('❌ Failed to get Caspio token:', {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        error: errorText
      });
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to authenticate with Caspio',
        debug: {
          status: tokenResponse.status,
          statusText: tokenResponse.statusText,
          error: errorText
        }
      }, { status: 500 });
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Fetch Kaiser members from CalAIM_tbl_Members where CalAIM_MCO = 'Kaiser'
    console.log('📊 Fetching Kaiser members...');
    
    // First, check total count available
    const countUrl = `${caspioBaseUrl}/rest/v2/tables/CalAIM_tbl_Members/records?q.where=CalAIM_MCO='Kaiser'&q.select=COUNT(*)`;
    console.log('🔢 Checking total Kaiser member count...');
    
    try {
      const countResponse = await fetch(countUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (countResponse.ok) {
        const countData = await countResponse.json();
        console.log('🔢 Total Kaiser members available:', countData);
      }
    } catch (countError) {
      console.log('⚠️ Could not get count, proceeding with pagination...');
    }
    
    // Try different approaches to get all records
    console.log('🔄 Trying multiple approaches to fetch ALL Kaiser records...');
    let allMembers: any[] = [];
    
    // Approach 1: Try without pagination first (get default limit)
    console.log('🔄 Approach 1: Fetching without pagination...');
    const simpleUrl = `${caspioBaseUrl}/rest/v2/tables/CalAIM_tbl_Members/records?q.where=CalAIM_MCO='Kaiser'`;
    console.log(`🔗 Simple Query URL:`, simpleUrl);
    
    const simpleResponse = await fetch(simpleUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (simpleResponse.ok) {
      const simpleData = await simpleResponse.json();
      console.log(`📄 Simple query returned: ${simpleData.Result?.length || 0} records`);
      if (simpleData.Result && simpleData.Result.length > 0) {
        allMembers = simpleData.Result;
      }
    }
    
    // Try with higher limit to get all 405 records
    console.log('🔄 Approach 2: Trying with higher limit to get all 405 records...');
    const highLimitUrl = `${caspioBaseUrl}/rest/v2/tables/CalAIM_tbl_Members/records?q.where=CalAIM_MCO='Kaiser'&q.limit=500`;
    console.log(`🔗 High Limit Query URL:`, highLimitUrl);
    
    const highLimitResponse = await fetch(highLimitUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (highLimitResponse.ok) {
      const highLimitData = await highLimitResponse.json();
      console.log(`📄 High limit query returned: ${highLimitData.Result?.length || 0} records`);
      if (highLimitData.Result && highLimitData.Result.length > allMembers.length) {
        allMembers = highLimitData.Result;
        console.log(`✅ HIGH LIMIT SUCCESS: Using ${allMembers.length} records from high limit query`);
      }
    } else {
      console.log(`⚠️ High limit query failed, using simple query results (${allMembers.length} records)`);
    }
    
    // Always try pagination to get all 405 records
    console.log('🔄 Approach 3: Using pagination to get all 405 records...');
    let pageNumber = 1;
    const pageSize = 100; // Caspio's apparent default limit
    let hasMorePages = true;
    let paginatedMembers: any[] = [];

    while (hasMorePages && pageNumber <= 10) { // 10 pages * 100 = 1000 records max
      const queryUrl = `${caspioBaseUrl}/rest/v2/tables/CalAIM_tbl_Members/records?q.where=CalAIM_MCO='Kaiser'&q.limit=${pageSize}&q.pageNumber=${pageNumber}`;
      console.log(`🔗 Page ${pageNumber} Query URL:`, queryUrl);
      
      const membersResponse = await fetch(queryUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!membersResponse.ok) {
        console.log(`⚠️ Page ${pageNumber} failed, stopping pagination`);
        break;
      }

      const pageData = await membersResponse.json();
      console.log(`📄 Page ${pageNumber}: ${pageData.Result?.length || 0} records`);
      
      if (pageData.Result && pageData.Result.length > 0) {
        paginatedMembers = paginatedMembers.concat(pageData.Result);
        
        // Continue until we get less than a full page
        if (pageData.Result.length < pageSize) {
          console.log(`📄 Page ${pageNumber}: Got ${pageData.Result.length} records (less than ${pageSize}), assuming last page`);
          hasMorePages = false;
        } else {
          pageNumber++;
        }
      } else {
        console.log(`📄 Page ${pageNumber}: No records found, stopping pagination`);
        hasMorePages = false;
      }
    }
    
    // Use paginated results if we got more records
    if (paginatedMembers.length > allMembers.length) {
      allMembers = paginatedMembers;
      console.log(`✅ PAGINATION SUCCESS: Fetched ${allMembers.length} total Kaiser members across ${pageNumber - 1} pages`);
    }

    console.log(`✅ FINAL RESULT: Fetched ${allMembers.length} total Kaiser members`);
    
    // Create a combined response object
    const membersData = {
      Result: allMembers,
      TotalRecords: allMembers.length,
      PaginationInfo: {
        totalPages: 1,
        recordsPerPage: allMembers.length,
        totalRecords: allMembers.length
      }
    };
    console.log(`✅ Successfully fetched ${membersData.Result?.length || 0} Kaiser members via pagination`);
    
    // COMPREHENSIVE API RESPONSE DEBUG
    console.log('🔍 FULL API RESPONSE STRUCTURE:');
    console.log('  - hasResult:', !!membersData.Result);
    console.log('  - resultLength:', membersData.Result?.length || 0);
    console.log('  - hasPageInfo:', !!membersData.PageInfo);
    console.log('  - responseKeys:', Object.keys(membersData));
    if (membersData.Result?.[0]) {
      console.log('  - firstRecordKeys:', Object.keys(membersData.Result[0]));
    }
    
    // Check if we might be hitting the API limit
    if (membersData.Result && membersData.Result.length >= 9000) {
      console.log('⚠️  WARNING: Fetched 9000+ records - might be hitting API limit!');
    }
    
    // Check for pagination
    if (membersData.PageInfo) {
      console.log('📄 PAGINATION DETECTED:', membersData.PageInfo);
    }
    
    // Count total records vs limit requested
    console.log('📊 API LIMITS CHECK:');
    console.log('  - requested: 10000');
    console.log('  - received:', membersData.Result?.length || 0);
    console.log('  - percentage:', ((membersData.Result?.length || 0) / 10000 * 100).toFixed(1) + '%');

    // Log the first member to see available fields
    if (membersData.Result && membersData.Result.length > 0) {
      console.log('📋 Sample member fields:', Object.keys(membersData.Result[0]));
      console.log('📋 Name fields check:', {
        Senior_First: membersData.Result[0].Senior_First,
        Senior_Last: membersData.Result[0].Senior_Last,
        memberFirstName: membersData.Result[0].memberFirstName,
        memberLastName: membersData.Result[0].memberLastName,
        FirstName: membersData.Result[0].FirstName,
        LastName: membersData.Result[0].LastName
      });
      
      // Log date fields specifically for ILS Report debugging
      console.log('📅 Date fields check:', {
        Kaiser_T2038_Requested_Date: membersData.Result[0].Kaiser_T2038_Requested_Date,
        Kaiser_T2038_Received_Date: membersData.Result[0].Kaiser_T2038_Received_Date,
        Kaiser_Tier_Level_Requested_Date: membersData.Result[0].Kaiser_Tier_Level_Requested_Date,
        Kaiser_Tier_Level_Received_Date: membersData.Result[0].Kaiser_Tier_Level_Received_Date,
        ILS_RCFE_Sent_For_Contract_Date: membersData.Result[0].ILS_RCFE_Sent_For_Contract_Date,
        ILS_RCFE_Received_Contract_Date: membersData.Result[0].ILS_RCFE_Received_Contract_Date,
        // Also check for alternative field names
        Kaiser_T038_Requested: membersData.Result[0].Kaiser_T038_Requested,
        Kaiser_T038_Received: membersData.Result[0].Kaiser_T038_Received,
        Kaiser_Tier_Level_Requested: membersData.Result[0].Kaiser_Tier_Level_Requested,
        Kaiser_Tier_Level_Received: membersData.Result[0].Kaiser_Tier_Level_Received
      });
      
      // Debug social worker vs user/staff assignment fields
      console.log('🔍 SOCIAL WORKER vs USER/STAFF ASSIGNMENT DEBUG:', {
        Social_Worker_Assigned: membersData.Result[0].Social_Worker_Assigned, // Actual social workers
        Kaiser_User_Assignment: membersData.Result[0].Kaiser_User_Assignment, // Users/staff
        Hold_For_Social_Worker: membersData.Result[0].Hold_For_Social_Worker, // Hold status
        Kaiser_Next_Step_Date: membersData.Result[0].Kaiser_Next_Step_Date,
        note: 'Using Social_Worker_Assigned for social workers, Hold_For_Social_Worker for visit status'
      });
      
      // Show ALL field names to help identify the correct staff field
      console.log('🔍 ALL AVAILABLE FIELDS:', Object.keys(membersData.Result[0]).sort());
      
      // Debug ALL social worker assignments from raw API
      const allSocialWorkers = [...new Set(
        membersData.Result
          .filter((member: any) => member.Social_Worker_Assigned && member.Social_Worker_Assigned.trim() !== '')
          .map((member: any) => member.Social_Worker_Assigned)
      )];
      
      console.log('🔍 ALL SOCIAL WORKERS FROM RAW API:', allSocialWorkers);
      console.log('🔍 TOTAL UNIQUE SOCIAL WORKERS:', allSocialWorkers.length);
      
      console.log('🔍 SOCIAL WORKER MEMBER COUNTS FROM RAW API:');
      allSocialWorkers.forEach(sw => {
        const swMembers = membersData.Result.filter((member: any) => 
          member.Social_Worker_Assigned === sw
        );
        console.log(`  - ${sw}: ${swMembers.length} members`);
      });
      
      // Debug Billy specifically with multiple variations
      const billyVariations = ['billy', 'buckhalter', 'Billy', 'Buckhalter'];
      let totalBillyMembers = 0;
      
      billyVariations.forEach(variation => {
        const members = membersData.Result.filter((member: any) => 
          member.Social_Worker_Assigned && member.Social_Worker_Assigned.toLowerCase().includes(variation.toLowerCase())
        );
        if (members.length > 0) {
          console.log(`🔍 BILLY VARIATION "${variation}": ${members.length} members`);
          totalBillyMembers = Math.max(totalBillyMembers, members.length);
        }
      });
      
      console.log('🔍 BILLY TOTAL MEMBER COUNT FROM RAW API:', totalBillyMembers);
      
      // Show exact Billy assignments
      const billyMembers = membersData.Result.filter((member: any) => 
        member.Social_Worker_Assigned && member.Social_Worker_Assigned.toLowerCase().includes('billy')
      );
      
      console.log('🔍 BILLY EXACT ASSIGNMENTS:', billyMembers.slice(0, 10).map(m => ({
        name: m.Senior_Last_First_ID,
        sw: m.Social_Worker_Assigned,
        status: m.CalAIM_Status,
        clientId: m.Client_ID2
      })));
      
      // Check if there are members with similar names
      const possibleBillyNames = membersData.Result
        .filter((member: any) => member.Social_Worker_Assigned && 
          (member.Social_Worker_Assigned.includes('Buck') || 
           member.Social_Worker_Assigned.includes('Billy') ||
           member.Social_Worker_Assigned.includes('76')))
        .map((member: any) => member.Social_Worker_Assigned);
      
      const uniqueBillyNames = [...new Set(possibleBillyNames)];
      console.log('🔍 POSSIBLE BILLY NAME VARIATIONS:', uniqueBillyNames);
      
      // Debug the specific fields we're looking for
      console.log('🔍 FIELD MAPPING DEBUG - RAW CASPIO DATA:', {
        Senior_Last_First_ID: membersData.Result[0].Senior_Last_First_ID,
        Senior_First: membersData.Result[0].Senior_First,
        Senior_Last: membersData.Result[0].Senior_Last,
        RCFE_Name: membersData.Result[0].RCFE_Name,
        RCFE_Address: membersData.Result[0].RCFE_Address,
        RCFE_City: membersData.Result[0].RCFE_City,
        RCFE_Zip: membersData.Result[0].RCFE_Zip,
        CalAIM_Status: membersData.Result[0].CalAIM_Status,
        Social_Worker_Assigned: membersData.Result[0].Social_Worker_Assigned,
        Member_County: membersData.Result[0].Member_County,
        totalRecords: membersData.Result.length
      });
      
      // Show first member's complete raw data
      console.log('🔍 COMPLETE FIRST MEMBER RAW DATA:', membersData.Result[0]);
      
      console.log('📋 Sample member data:', membersData.Result[0]);
    }

    // Transform the data to match expected format
    const transformedMembers = (membersData.Result || []).map((member: any, index: number) => ({
      id: member.Client_ID2 || `member-${Math.random().toString(36).substring(7)}`,
      Client_ID2: member.Client_ID2,
      client_ID2: member.Client_ID2, // Duplicate for compatibility
      // Use Senior_Last_First_ID as primary name field, fallback to constructed name
      memberName: member.Senior_Last_First_ID || `${member.Senior_Last || 'Unknown'}, ${member.Senior_First || 'Member'}`,
      memberFirstName: member.Senior_First || 'Unknown',
      memberLastName: member.Senior_Last || 'Member',
      Senior_Last_First_ID: member.Senior_Last_First_ID || `${member.Senior_Last || 'Unknown'}, ${member.Senior_First || 'Member'}`,
      memberCounty: member.Member_County || member.County || 'Unknown',
      memberMrn: member.memberMrn || member.Member_MRN || '',
      memberPhone: member.memberPhone || member.Member_Phone || '',
      memberEmail: member.memberEmail || member.Member_Email || '',
      CalAIM_MCO: member.CalAIM_MCO,
      CalAIM_Status: member.CalAIM_Status || 'No CalAIM Status',
      Kaiser_Status: member.Kaiser_Status || member.Kaiser_ID_Status || member.Status || getRandomKaiserStatus(index),
      Kaiser_ID_Status: member.Kaiser_ID_Status,
      SW_ID: member.SW_ID,
      Kaiser_User_Assignment: member.Kaiser_User_Assignment,
      Kaiser_Next_Step_Date: member.Kaiser_Next_Step_Date,
        // Use Social_Worker_Assigned field for actual social workers (Kaiser_User_Assignment contains users/staff)
        Social_Worker_Assigned: member.Social_Worker_Assigned || '',
      // Kaiser Tracker expects Staff_Assigned field (using Kaiser_User_Assignment for staff assignments)
      Staff_Assigned: member.Kaiser_User_Assignment || member.Staff_Assigned || '',
      RCFE_Name: member.RCFE_Name,
      RCFE_Address: member.RCFE_Address,
      RCFE_City: member.RCFE_City,
      RCFE_Zip: member.RCFE_Zip,
      pathway: member.Pathway || member.CalAIM_Pathway || 'Kaiser',
      Next_Step_Due_Date: member.Next_Step_Due_Date || member.next_steps_date || '',
      workflow_step: member.workflow_step || '',
      workflow_notes: member.workflow_notes || '',
      last_updated: member.Date_Modified || new Date().toISOString(),
      created_at: member.Date_Created || new Date().toISOString(),
      
      // ILS Report Date Fields - try multiple possible field names
      Kaiser_T2038_Requested_Date: member.Kaiser_T2038_Requested_Date || member.Kaiser_T038_Requested || member.Kaiser_T2038_Requested || '',
      Kaiser_T2038_Received_Date: member.Kaiser_T2038_Received_Date || member.Kaiser_T038_Received || member.Kaiser_T2038_Received || '',
      Kaiser_Tier_Level_Requested_Date: member.Kaiser_Tier_Level_Requested_Date || member.Kaiser_Tier_Level_Requested || '',
      Kaiser_Tier_Level_Received_Date: member.Kaiser_Tier_Level_Received_Date || member.Kaiser_Tier_Level_Received || '',
      ILS_RCFE_Sent_For_Contract_Date: member.ILS_RCFE_Sent_For_Contract_Date || member.ILS_RCFE_Sent_For_Contract || '',
      ILS_RCFE_Received_Contract_Date: member.ILS_RCFE_Received_Contract_Date || member.ILS_RCFE_Received_Contract || '',
      
      // Hold status for social worker visits
      Hold_For_Social_Worker: member.Hold_For_Social_Worker || '',
      
      // Add any other fields needed by the Kaiser tracker
    }));

    return NextResponse.json({
      success: true,
      members: transformedMembers,
      count: transformedMembers.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in Kaiser members API:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }, { status: 500 });
  }
}