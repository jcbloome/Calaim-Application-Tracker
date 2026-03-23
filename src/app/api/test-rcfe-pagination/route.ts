import { NextRequest, NextResponse } from 'next/server';
import { getCaspioServerAccessToken, getCaspioServerConfig } from '@/lib/caspio-server-auth';

export async function GET(request: NextRequest) {
  try {
    // Use exact same authentication pattern as working Kaiser tracker
    const caspioConfig = getCaspioServerConfig();
    const dataBaseUrl = caspioConfig.restBaseUrl;
    const accessToken = await getCaspioServerAccessToken(caspioConfig);

    // Test just first 2 pages to confirm pagination works
    const tableName = 'CalAIM_tbl_New_RCFE_Registration';
    const results = [];
    let totalRecords = 0;

    for (let page = 1; page <= 2; page++) {
      const testUrl = `${dataBaseUrl}/tables/${tableName}/records?q.pageSize=1000&q.pageNumber=${page}`;
      console.log(`🧪 Testing page ${page}: ${testUrl}`);

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
        totalRecords += records.length;
        results.push({
          page: page,
          recordsReturned: records.length,
          success: true
        });
        console.log(`✅ Page ${page}: Got ${records.length} records`);
        
        // If we got fewer than 1000, we've reached the end
        if (records.length < 1000) {
          console.log(`📋 Reached end at page ${page}`);
          break;
        }
      } else {
        const errorText = await response.text();
        results.push({
          page: page,
          recordsReturned: 0,
          success: false,
          error: errorText
        });
        console.log(`❌ Page ${page}: Error ${response.status}`);
        break;
      }
    }

    return NextResponse.json({
      success: true,
      message: 'RCFE pagination test completed',
      results,
      totalRecords,
      tableName
    });

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}