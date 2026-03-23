import { NextRequest, NextResponse } from 'next/server';
import { getCaspioServerAccessToken, getCaspioServerConfig } from '@/lib/caspio-server-auth';

export async function POST() {
  try {
    console.log('🧪 SIMPLE Caspio test - clients table only...');
    
    const caspioConfig = getCaspioServerConfig();
    const baseUrl = caspioConfig.restBaseUrl;
    
    // Get access token
    console.log('🔑 Getting access token...');
    const accessToken = await getCaspioServerAccessToken(caspioConfig);
    console.log('✅ Got access token');
    
    // Create unique test data
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const testData = {
      Senior_First: 'TestUser',
      Senior_Last: `Simple-${timestamp}`
    };
    
    console.log('📝 Test data:', testData);
    
    // Insert into clients table
    const clientTableUrl = `${baseUrl}/tables/connect_tbl_clients/records`;
    
    const response = await fetch(clientTableUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(testData)
    });
    
    console.log(`📡 Response status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Insert failed:', errorText);
      throw new Error(`Insert failed: ${response.status} ${errorText}`);
    }
    
    // Handle the response - Caspio sometimes returns empty body on successful insert
    const insertResponseText = await response.text();
    console.log('📄 Raw insert response:', insertResponseText);
    
    let result;
    if (insertResponseText && insertResponseText.trim() !== '') {
      try {
        result = JSON.parse(insertResponseText);
      } catch (parseError) {
        console.log('⚠️ Response is not JSON, treating as success');
        result = { message: 'Insert successful but no JSON response' };
      }
    } else {
      console.log('✅ Empty response - Caspio insert successful');
      result = { message: 'Insert successful (empty response)' };
    }
    
    console.log('✅ Success! Response:', JSON.stringify(result, null, 2));
    
    return NextResponse.json({
      success: true,
      message: 'Successfully added to connect_tbl_clients table',
      testData: testData,
      response: result,
      availableFields: Object.keys(result || {})
    });
    
  } catch (error: any) {
    console.error('❌ Test failed:', error);
    return NextResponse.json({
      success: false,
      message: `Test failed: ${error.message}`,
      error: error.toString()
    }, { status: 500 });
  }
}