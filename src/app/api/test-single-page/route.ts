import { NextRequest, NextResponse } from 'next/server';
import { getCaspioServerAccessToken, getCaspioServerConfig } from '@/lib/caspio-server-auth';

export async function GET(request: NextRequest) {
  try {
    const caspioConfig = getCaspioServerConfig();
    const dataBaseUrl = caspioConfig.restBaseUrl;
    const accessToken = await getCaspioServerAccessToken(caspioConfig);

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