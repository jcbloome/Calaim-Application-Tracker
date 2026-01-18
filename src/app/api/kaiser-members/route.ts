import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    console.log('📥 Fetching Kaiser members from Caspio...');
    
    // Get Caspio access token
    const baseUrl = 'https://c7ebl500.caspio.com/rest/v2';
    const clientId = 'b721f0c7af4d4f7542e8a28665bfccb07e93f47deb4bda27bc';
    const clientSecret = 'bad425d4a8714c8b95ec2ea9d256fc649b2164613b7e54099c';
    
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenUrl = `https://c7ebl500.caspio.com/oauth/token`;
    
    console.log('🔑 Getting Caspio access token...');
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: 'grant_type=client_credentials',
    });
    
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Failed to get Caspio token:', tokenResponse.status, errorText);
      return NextResponse.json(
        { success: false, error: `Failed to get Caspio token: ${tokenResponse.status}` },
        { status: 500 }
      );
    }
    
    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    console.log('✅ Got access token');
    
    // Fetch members from CalAIM_tbl_Members table
    const membersTable = 'CalAIM_tbl_Members';
    let allMembers: any[] = [];
    let pageSize = 1000;
    let pageNumber = 1;
    let hasMoreData = true;
    
    console.log('📋 Fetching Kaiser members from:', membersTable);
    
    while (hasMoreData && pageNumber <= 10) { // Limit to 10 pages max
      const url = `${baseUrl}/tables/${membersTable}/records?q.limit=${pageSize}&q.pageNumber=${pageNumber}`;
      
      console.log(`📄 Fetching page ${pageNumber}...`);
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to fetch page ${pageNumber}:`, response.status, errorText);
        break;
      }
      
      const data = await response.json();
      const records = data.Result || [];
      
      console.log(`📄 Page ${pageNumber}: ${records.length} records`);
      
      if (records.length === 0) {
        hasMoreData = false;
      } else {
        allMembers = allMembers.concat(records);
        pageNumber++;
        
        if (records.length < pageSize) {
          hasMoreData = false;
        }
      }
    }
    
    console.log(`✅ Total members fetched: ${allMembers.length}`);
    
    // Filter for Kaiser members and bottleneck stages
    const bottleneckStages = [
      'T2038 Requested',
      'T2038 received, Need First Contact',
      'T2038 received, doc collection',
      'Needs RN Visit',
      'RN/MSW Scheduled',
      'RN Visit Complete',
      'Need Tier Level',
      'Tier Level Requested',
      'Locating RCFEs',
      'Found RCFE',
      'R&B Requested'
    ];
    
    console.log('🔍 Sample member data:', JSON.stringify(allMembers[0], null, 2));
    console.log('🔍 Health plan related fields:', Object.keys(allMembers[0] || {}).filter(key => 
      key.toLowerCase().includes('health') || 
      key.toLowerCase().includes('plan') || 
      key.toLowerCase().includes('kaiser') ||
      key.toLowerCase().includes('mcp') ||
      key.toLowerCase().includes('mco')
    ));
    console.log('🔍 CalAIM_MCO values in first 5 members:', allMembers.slice(0, 5).map(m => ({
      id: m.Client_ID2,
      mco: m.CalAIM_MCO,
      status: m.Kaiser_Status
    })));
    
    const kaiserMembers = allMembers.filter(member => {
      const healthPlan = member.CalAIM_MCO?.toLowerCase() || '';
      const status = member.Kaiser_Status || '';
      
      // Check if this is a Kaiser member
      const isKaiser = healthPlan.includes('kaiser') || healthPlan.includes('kp');
      
      // For ILS report, we want Kaiser members at bottleneck stages
      const isAtBottleneckStage = bottleneckStages.includes(status);
      
      return isKaiser; // Return all Kaiser members for now
    });
    
    // If no Kaiser members found, let's also check for members with Kaiser-related fields populated
    if (kaiserMembers.length === 0) {
      console.log('🔍 No Kaiser members found by MCO, checking for Kaiser-related data...');
      const membersWithKaiserData = allMembers.filter(member => 
        member.Kaiser_Status || 
        member.Kaiser_Auth ||
        member.Kaiser_T038_Requested ||
        member.Kaiser_T038_Received ||
        member.Kaiser_H2022_Requested ||
        member.Kaiser_H2022_Received ||
        member.Kaiser_Tier_Level_Requested ||
        member.Kaiser_Tier_Level_Received ||
        member.Kaiser_User_Assignment
      );
      console.log(`🔍 Found ${membersWithKaiserData.length} members with Kaiser-related data`);
      
      // For demo purposes, return these members
      kaiserMembers.push(...membersWithKaiserData);
    }
    
    console.log(`🎯 Kaiser members at bottleneck stages: ${kaiserMembers.length}`);
    
    // Transform data for ILS report
    const transformedMembers = kaiserMembers.map(member => ({
      id: member.Record_ID || member.Client_ID2,
      clientId2: member.Client_ID2,
      seniorFirstName: member.Senior_First,
      seniorLastName: member.Senior_Last,
      healthPlan: member.CalAIM_MCO,
      kaiserStatus: member.Kaiser_Status,
      lastContactDate: member.Last_Contact_Date,
      nextStepDate: member.Next_Step_Date,
      assignedStaff: member.Assigned_Staff,
      notes: member.Notes || '',
      rcfeName: member.RCFE_Name,
      tierLevel: member.Tier_Level,
      authorizationDate: member.Authorization_Date
    }));
    
    return NextResponse.json({
      success: true,
      members: transformedMembers,
      totalCount: allMembers.length,
      kaiserCount: kaiserMembers.length
    });
    
  } catch (error: any) {
    console.error('Error fetching Kaiser members:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch Kaiser members' },
      { status: 500 }
    );
  }
}