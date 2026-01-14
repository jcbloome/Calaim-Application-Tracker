import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    console.log('🔧 API Route: Received request');
    
    const { functionName, data } = await request.json();
    console.log(`🔧 API Route: Testing function ${functionName}`);
    
    // For now, let's just test basic connectivity without Firebase Admin
    if (functionName === 'simpleTest') {
      console.log('✅ API Route: Simple test successful');
      return NextResponse.json({
        success: true,
        message: 'API Route working perfectly! Firebase Functions connectivity bypassed.',
        timestamp: new Date().toISOString(),
        method: 'api-route-proxy',
        userAuth: true,
        userUid: 'api-route-test'
      });
    }
    
    if (functionName === 'testCaspioMemberSync') {
      console.log('🔧 API Route: Starting REAL Caspio member sync test');
      
      // Real Caspio credentials
      const baseUrl = 'https://c7ebl500.caspio.com/rest/v2';
      const clientId = 'b721f0c7af4d4f7542e8a28665bfccb07e93f47deb4bda27bc';
      const clientSecret = 'bad425d4a8714c8b95ec2ea9d256fc649b2164613b7e54099c';
      
      try {
        // Step 1: Get Caspio OAuth token
        console.log('🔑 Getting Caspio access token...');
        const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        const tokenUrl = 'https://c7ebl500.caspio.com/oauth/token';
        
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
          throw new Error(`Failed to get Caspio token: ${tokenResponse.status} ${errorText}`);
        }
        
        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;
        console.log('✅ Got Caspio access token');
        
        // Step 2: Test with just ONE member first
        const testMembers = [
          { firstName: 'TestUser', lastName: 'APIRoute', mco: 'Kaiser Permanente' }
        ];
        
        const results = [];
        
        for (const member of testMembers) {
          try {
            console.log(`👤 Processing member: ${member.firstName} ${member.lastName}`);
            
            // Step 2a: Add to connect_tbl_clients table
            console.log(`📝 Preparing client data for ${member.firstName} ${member.lastName}`);
            const clientData = {
              First_Name: member.firstName,
              Last_Name: member.lastName,
              Date_Created: new Date().toISOString(),
              Status: 'Active'
            };
            
            console.log('📤 Client data to send:', clientData);
            
            const clientResponse = await fetch(`${baseUrl}/tables/connect_tbl_clients/records`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(clientData),
            });
            
            if (!clientResponse.ok) {
              const errorText = await clientResponse.text();
              throw new Error(`Failed to add to connect_tbl_clients: ${clientResponse.status} ${errorText}`);
            }
            
            const clientResult = await clientResponse.json();
            const clientId = clientResult.client_ID2 || clientResult.Client_ID2 || clientResult.Record_ID || 'UNKNOWN';
            console.log(`✅ Added to connect_tbl_clients, client_ID2: ${clientId}`);
            
            // Step 2b: Add to CalAIM_tbl_Members table
            const memberData = {
              client_ID2: clientId,
              MemberFirstName: member.firstName,
              MemberLastName: member.lastName,
              CalAIM_MCO: member.mco,
              CalAIM_Status: 'New Referral',
              LastUpdated: new Date().toISOString(),
              DateCreated: new Date().toISOString()
            };
            
            const memberResponse = await fetch(`${baseUrl}/tables/CalAIM_tbl_Members/records`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(memberData),
            });
            
            if (!memberResponse.ok) {
              const errorText = await memberResponse.text();
              throw new Error(`Failed to add to CalAIM_tbl_Members: ${memberResponse.status} ${errorText}`);
            }
            
            console.log(`✅ Added to CalAIM_tbl_Members for ${member.firstName} ${member.lastName}`);
            
            results.push({
              member: `${member.firstName} ${member.lastName}`,
              mco: member.mco,
              success: true,
              clientId: clientId,
              message: 'Successfully synced to REAL Caspio database'
            });
            
          } catch (memberError: any) {
            console.error(`❌ Failed to process ${member.firstName} ${member.lastName}:`, memberError);
            results.push({
              member: `${member.firstName} ${member.lastName}`,
              mco: member.mco,
              success: false,
              clientId: null,
              message: memberError.message
            });
          }
        }
        
        const successCount = results.filter(r => r.success).length;
        console.log(`✅ Real Caspio test complete: ${successCount}/${testMembers.length} members processed successfully`);
        
        return NextResponse.json({
          success: true,
          message: `REAL Caspio member sync completed: ${successCount}/${testMembers.length} successful`,
          results: results,
          summary: {
            totalTested: testMembers.length,
            successful: successCount,
            failed: testMembers.length - successCount
          }
        });
        
      } catch (error: any) {
        console.error('❌ Real Caspio test failed:', error);
        return NextResponse.json({
          success: false,
          message: `Real Caspio test failed: ${error.message}`,
          error: error.toString()
        }, { status: 500 });
      }
    }
    
    return NextResponse.json({
      success: false,
      message: `Unknown function: ${functionName}`
    }, { status: 400 });
    
  } catch (error: any) {
    console.error('❌ API Route Error:', error);
    return NextResponse.json({
      success: false,
      message: `API Route Error: ${error.message}`,
      error: error.toString()
    }, { status: 500 });
  }
}