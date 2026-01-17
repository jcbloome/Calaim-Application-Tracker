import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
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

    // Test both tables with single page requests
    const tests = [
      { name: 'CalAIM_tbl_Members', description: 'Authorization table (fast)' },
      { name: 'CalAIM_tbl_New_RCFE_Registration', description: 'RCFE table (slow)' }
    ];

    const results = [];

    for (const test of tests) {
      const startTime = Date.now();
      const testUrl = `${dataBaseUrl}/tables/${test.name}/records?q.pageSize=100&q.pageNumber=1`;
      
      console.log(`🧪 Testing ${test.description}: ${testUrl}`);

      try {
        const response = await fetch(testUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        });

        const endTime = Date.now();
        const duration = endTime - startTime;

        if (response.ok) {
          const data = await response.json();
          const records = data.Result || [];
          results.push({
            table: test.name,
            description: test.description,
            recordsReturned: records.length,
            duration: `${duration}ms`,
            success: true
          });
          console.log(`✅ ${test.name}: Got ${records.length} records in ${duration}ms`);
        } else {
          const errorText = await response.text();
          results.push({
            table: test.name,
            description: test.description,
            recordsReturned: 0,
            duration: `${duration}ms`,
            success: false,
            error: errorText
          });
          console.log(`❌ ${test.name}: Error ${response.status} in ${duration}ms`);
        }
      } catch (error: any) {
        const endTime = Date.now();
        const duration = endTime - startTime;
        results.push({
          table: test.name,
          description: test.description,
          recordsReturned: 0,
          duration: `${duration}ms`,
          success: false,
          error: error.message
        });
        console.log(`❌ ${test.name}: Exception in ${duration}ms - ${error.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Single page performance test completed',
      results
    });

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}