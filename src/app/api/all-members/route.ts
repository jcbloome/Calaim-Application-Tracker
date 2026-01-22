import { NextRequest, NextResponse } from 'next/server';
import { fetchAllCalAIMMembers, type CaspioCredentials } from '@/lib/caspio-api-utils';

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 Fetching ALL members from Caspio using partition strategy...');

    // Get Caspio credentials from environment
    const caspioBaseUrl = process.env.CASPIO_BASE_URL;
    const caspioClientId = process.env.CASPIO_CLIENT_ID;
    const caspioClientSecret = process.env.CASPIO_CLIENT_SECRET;

    if (!caspioBaseUrl || !caspioClientId || !caspioClientSecret) {
      console.error('❌ Missing Caspio credentials');
      return NextResponse.json({ 
        success: false, 
        error: 'Caspio credentials not configured'
      }, { status: 500 });
    }

    const credentials: CaspioCredentials = {
      baseUrl: caspioBaseUrl,
      clientId: caspioClientId,
      clientSecret: caspioClientSecret
    };

    // Use the new utility module to fetch all members
    const result = await fetchAllCalAIMMembers(credentials);

    return NextResponse.json({
      success: true,
      members: result.members,
      count: result.count,
      mcoStats: result.mcoStats,
      timestamp: new Date().toISOString(),
      pagination: {
        currentPage: 1,
        totalPages: 1,
        pageSize: result.count,
        totalRecords: result.count
      }
    });

  } catch (error: any) {
    console.error('❌ Error fetching all members:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to fetch all members',
      details: error.message 
    }, { status: 500 });
  }
}