import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Use exact same authentication pattern as working Kaiser tracker
    const dataBaseUrl = 'https://c7ebl500.caspio.com/rest/v2';
    const clientId = 'b721f0c7af4d4f7542e8a28665bfccb07e93f47deb4bda27bc';
    const clientSecret = 'bad425d4a8714c8b95ec2ea9d256fc649b2164613b7e54099c';
    
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenUrl = 'https://c7ebl500.caspio.com/oauth/token';
    
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to get Caspio access token');
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Test different pagination parameters
    const tableName = 'CalAIM_tbl_New_RCFE_Registration';
    const tests = [
      { skip: 0, limit: 100 },
      { skip: 100, limit: 100 },
      { skip: 200, limit: 100 },
      { skip: 0, limit: 1000 }
    ];

    const results = [];

    for (const test of tests) {
      const testUrl = `${dataBaseUrl}/tables/${tableName}/records?q_limit=${test.limit}&q_skip=${test.skip}`;
      console.log(`🧪 Testing pagination: ${testUrl}`);

      const response = await fetch(testUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        const records = data.Result || [];
        results.push({
          skip: test.skip,
          limit: test.limit,
          recordsReturned: records.length,
          url: testUrl,
          success: true
        });
        console.log(`✅ Skip ${test.skip}, Limit ${test.limit}: Got ${records.length} records`);
      } else {
        const errorText = await response.text();
        results.push({
          skip: test.skip,
          limit: test.limit,
          recordsReturned: 0,
          url: testUrl,
          success: false,
          error: errorText
        });
        console.log(`❌ Skip ${test.skip}, Limit ${test.limit}: Error ${response.status}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Caspio pagination test completed',
      results,
      tableName
    });

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}