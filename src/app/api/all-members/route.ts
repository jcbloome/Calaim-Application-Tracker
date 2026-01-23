import { NextRequest, NextResponse } from 'next/server';
import { fetchAllCalAIMMembers, getCaspioCredentialsFromEnv } from '@/lib/caspio-api-utils';

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 Fetching ALL members from Caspio using partition strategy...');

    const credentials = getCaspioCredentialsFromEnv();

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