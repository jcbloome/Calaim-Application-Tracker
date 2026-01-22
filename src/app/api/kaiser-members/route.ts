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
    const queryUrl = `${caspioBaseUrl}/rest/v2/tables/CalAIM_tbl_Members/records?q.where=CalAIM_MCO='Kaiser'&q.limit=1000`;
    console.log('🔗 Query URL:', queryUrl);
    
    const membersResponse = await fetch(queryUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!membersResponse.ok) {
      const errorText = await membersResponse.text();
      console.error('❌ Failed to fetch Kaiser members:', {
        status: membersResponse.status,
        statusText: membersResponse.statusText,
        error: errorText
      });
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to fetch Kaiser members from Caspio',
        debug: {
          status: membersResponse.status,
          statusText: membersResponse.statusText,
          error: errorText
        }
      }, { status: 500 });
    }

    const membersData = await membersResponse.json();
    console.log(`✅ Successfully fetched ${membersData.Result?.length || 0} Kaiser members`);

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
      
      // Debug staff assignment fields specifically
      console.log('🔍 STAFF ASSIGNMENT FIELDS DEBUG:', {
        Social_Worker_Assigned: membersData.Result[0].Social_Worker_Assigned,
        Kaiser_User_Assignment: membersData.Result[0].Kaiser_User_Assignment,
        kaiser_user_assignment: membersData.Result[0].kaiser_user_assignment,
        SW_ID: membersData.Result[0].SW_ID,
        Staff_Assigned: membersData.Result[0].Staff_Assigned,
        Kaiser_Next_Step_Date: membersData.Result[0].Kaiser_Next_Step_Date,
        allStaffFields: Object.keys(membersData.Result[0]).filter(key => 
          key.toLowerCase().includes('staff') || 
          key.toLowerCase().includes('assign') ||
          key.toLowerCase().includes('user') ||
          key.toLowerCase().includes('next') ||
          key.toLowerCase().includes('date') ||
          key.toLowerCase().includes('social') ||
          key.toLowerCase().includes('worker')
        )
      });
      
      // Show ALL field names to help identify the correct staff field
      console.log('🔍 ALL AVAILABLE FIELDS:', Object.keys(membersData.Result[0]).sort());
      
      console.log('📋 Sample member data:', membersData.Result[0]);
    }

    // Transform the data to match expected format
    const transformedMembers = (membersData.Result || []).map((member: any, index: number) => ({
      id: member.Client_ID2 || `member-${Math.random().toString(36).substring(7)}`,
      Client_ID2: member.Client_ID2,
      client_ID2: member.Client_ID2, // Duplicate for compatibility
      memberFirstName: member.Senior_First || member.memberFirstName || member.Member_First_Name || member.FirstName || 'Unknown',
      memberLastName: member.Senior_Last || member.memberLastName || member.Member_Last_Name || member.LastName || 'Member',
      memberCounty: member.memberCounty || member.County || member.Member_County || 'Unknown',
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
        Staff_Assigned: member.Kaiser_User_Assignment || 
                        member.Social_Worker_Assigned ||
                        member.kaiser_user_assignment || 
                        member['Kaiser User Assignment'] ||
                        member.KaiserUserAssignment ||
                        member.Kaiser_Staff_Assignment ||
                        member.SW_ID || 
                        member.Staff_Assigned || 
                        member.Assigned_Staff ||
                        member.AssignedStaff ||
                        '',
        Social_Worker_Assigned: member.Kaiser_User_Assignment || 
                               member.Social_Worker_Assigned ||
                               '',
      RCFE_Name: member.RCFE_Name,
      pathway: member.Pathway || member.CalAIM_Pathway || 'Kaiser',
      Next_Step_Due_Date: member.Next_Step_Due_Date || member.next_steps_date || '',
      workflow_step: member.workflow_step || '',
      workflow_notes: member.workflow_notes || '',
      lastUpdated: member.Date_Modified || new Date().toISOString(),
      created_at: member.Date_Created || new Date().toISOString(),
      
      // ILS Report Date Fields - try multiple possible field names
      Kaiser_T2038_Requested_Date: member.Kaiser_T2038_Requested_Date || member.Kaiser_T038_Requested || member.Kaiser_T2038_Requested || '',
      Kaiser_T2038_Received_Date: member.Kaiser_T2038_Received_Date || member.Kaiser_T038_Received || member.Kaiser_T2038_Received || '',
      Kaiser_Tier_Level_Requested_Date: member.Kaiser_Tier_Level_Requested_Date || member.Kaiser_Tier_Level_Requested || '',
      Kaiser_Tier_Level_Received_Date: member.Kaiser_Tier_Level_Received_Date || member.Kaiser_Tier_Level_Received || '',
      ILS_RCFE_Sent_For_Contract_Date: member.ILS_RCFE_Sent_For_Contract_Date || member.ILS_RCFE_Sent_For_Contract || '',
      ILS_RCFE_Received_Contract_Date: member.ILS_RCFE_Received_Contract_Date || member.ILS_RCFE_Received_Contract || '',
      
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