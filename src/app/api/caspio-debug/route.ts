import { NextRequest, NextResponse } from 'next/server';
import { getCaspioServerAccessToken, getCaspioServerConfig } from '@/lib/caspio-server-auth';

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 Starting Caspio table discovery...');
    
    const caspioConfig = getCaspioServerConfig();
    const oauthUrl = `${caspioConfig.oauthBaseUrl}/oauth/token`;
    const dataBaseUrl = caspioConfig.restBaseUrl;
    console.log('🔐 OAuth URL:', oauthUrl);
    console.log('🔐 Data API Base URL:', dataBaseUrl);
    
    const accessToken = await getCaspioServerAccessToken(caspioConfig);
    console.log('🔐 Token response status:', 200);
    console.log('✅ Got access token');

    // Try to list all tables using the Caspio REST API
    const tablesUrl = `${dataBaseUrl}/tables`;
    console.log('📋 Listing tables from:', tablesUrl);
    
    const tablesResponse = await fetch(tablesUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('📋 Tables response status:', tablesResponse.status);
    
    if (tablesResponse.ok) {
      const tablesData = await tablesResponse.json();
      console.log('✅ Available tables:', tablesData);
      
      return NextResponse.json({
        success: true,
        message: 'Successfully retrieved table list',
        tables: tablesData,
        baseUrl: dataBaseUrl,
        tokenStatus: 'valid'
      });
    } else {
      const errorText = await tablesResponse.text();
      console.log('❌ Tables error:', errorText);
      
      // If listing tables fails, try a different approach
      // Test a few common table patterns
      const testTables = [
        'CalAIM_tbl_New_RCFE_Registration',
        'connect_tbl_usersregistration',
        'connect_tbl_clients',
        'CalAIM_tbl_Members'
      ];
      
      const tableTests = [];
      
      for (const tableName of testTables) {
        try {
          const testUrl = `${dataBaseUrl}/tables/${tableName}/records?q_limit=1`;
          console.log(`🧪 Testing table: ${tableName} at ${testUrl}`);
          
          const testResponse = await fetch(testUrl, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          });
          
          tableTests.push({
            tableName,
            status: testResponse.status,
            exists: testResponse.ok,
            url: testUrl
          });
          
          if (testResponse.ok) {
            const data = await testResponse.json();
            console.log(`✅ Table ${tableName} exists! Sample:`, data.Result?.[0] || data);
          } else {
            const errorText = await testResponse.text();
            console.log(`❌ Table ${tableName} failed:`, testResponse.status, errorText.substring(0, 200));
          }
        } catch (error) {
          console.log(`❌ Error testing table ${tableName}:`, error);
          tableTests.push({
            tableName,
            status: 'error',
            exists: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
      
      return NextResponse.json({
        success: false,
        message: 'Could not list tables, but tested individual tables',
        tableTests,
        baseUrl: dataBaseUrl,
        tokenStatus: 'valid',
        tablesListError: errorText
      });
    }

  } catch (error: any) {
    console.error('❌ Caspio debug error:', error);
    const dataBaseUrl = process.env.CASPIO_BASE_URL?.includes('/rest/v2')
      ? process.env.CASPIO_BASE_URL
      : `${process.env.CASPIO_BASE_URL}/rest/v2`;
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Failed to debug Caspio connection',
        baseUrl: dataBaseUrl,
        hasCredentials: {
          baseUrl: !!process.env.CASPIO_BASE_URL,
          clientId: !!process.env.CASPIO_CLIENT_ID,
          clientSecret: !!process.env.CASPIO_CLIENT_SECRET
        }
      },
      { status: 500 }
    );
  }
}