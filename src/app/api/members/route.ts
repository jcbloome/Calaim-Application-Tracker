import { NextRequest, NextResponse } from 'next/server';
import { getCaspioCredentialsFromEnv, getCaspioToken } from '@/lib/caspio-api-utils';

interface Member {
  clientId2: string;
  firstName: string;
  lastName: string;
  healthPlan: string;
  status: string;
  rcfeName?: string;
  lastNoteDate?: string;
  noteCount: number;
}

// Fetch members from Caspio CalAIM_tbl_Members
async function fetchCaspioMembers(search?: string, healthPlan?: string, status?: string, limit: number = 50, offset: number = 0) {
  try {
    const credentials = getCaspioCredentialsFromEnv();
    const token = await getCaspioToken(credentials);
    
    // Build the query URL for CalAIM_tbl_Members table
    let apiUrl = `${credentials.baseUrl}/rest/v2/tables/CalAIM_tbl_Members/records`;
    
    // Build query parameters
    const queryParams = new URLSearchParams();
    
    // Add search filters
    if (search) {
      // Search in first name, last name, or Client_ID2 - using correct field names
      queryParams.append('q.where', `Senior_First LIKE '%${search}%' OR Senior_Last LIKE '%${search}%' OR Client_ID2 LIKE '%${search}%'`);
    }
    
    // Add health plan filter
    if (healthPlan) {
      const healthPlanFilter = `CalAIM_MCO = '${healthPlan}'`;
      if (queryParams.has('q.where')) {
        queryParams.set('q.where', `(${queryParams.get('q.where')}) AND ${healthPlanFilter}`);
      } else {
        queryParams.append('q.where', healthPlanFilter);
      }
    }
    
    // Add status filter
    if (status) {
      const statusFilter = `CalAIM_Status = '${status}'`;
      if (queryParams.has('q.where')) {
        queryParams.set('q.where', `(${queryParams.get('q.where')}) AND ${statusFilter}`);
      } else {
        queryParams.append('q.where', statusFilter);
      }
    }
    
    // Add pagination
    queryParams.append('q.limit', limit.toString());
    queryParams.append('q.skip', offset.toString());
    
    // Add ordering - using correct field names
    queryParams.append('q.orderBy', 'Senior_Last ASC, Senior_First ASC');
    
    if (queryParams.toString()) {
      apiUrl += `?${queryParams.toString()}`;
    }

    console.log('🔍 Fetching CalAIM members from Caspio:', apiUrl);

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Caspio API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`✅ Retrieved ${data.Result?.length || 0} members from Caspio`);

    return data.Result || [];
  } catch (error) {
    console.error('❌ Error fetching from Caspio:', error);
    throw error;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const healthPlan = searchParams.get('healthPlan') || '';
    const status = searchParams.get('status') || '';
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    console.log('📥 Fetching CalAIM members with filters:', { search, healthPlan, status, limit, offset });

    // Fetch members from Caspio
    const caspioMembers = await fetchCaspioMembers(search, healthPlan, status, limit, offset);

    // Transform Caspio data to our Member interface - using correct field names
    const transformedMembers: Member[] = caspioMembers.map((member: any) => ({
      clientId2: member.Client_ID2 || '',
      firstName: member.Senior_First || '',
      lastName: member.Senior_Last || '',
      healthPlan: member.CalAIM_MCO || 'Unknown',
      status: member.CalAIM_Status || 'Unknown',
      rcfeName: member.RCFE_Name || undefined,
      lastNoteDate: member.lastNoteDate || undefined,
      noteCount: 0 // Will be populated from note counts if needed
    }));

    // Get total count for pagination (this is an approximation since Caspio doesn't return total count easily)
    const totalMembers = transformedMembers.length;
    const hasMore = transformedMembers.length === limit; // If we got exactly the limit, there might be more

    console.log(`✅ Returning ${transformedMembers.length} CalAIM members from Caspio`);

    return NextResponse.json({
      success: true,
      members: transformedMembers,
      totalMembers,
      hasMore,
      pagination: {
        limit,
        offset,
        total: totalMembers
      }
    });

  } catch (error: any) {
    console.error('❌ Error fetching CalAIM members:', error);
    
    // Get the parameters again for error response
    const { searchParams } = new URL(request.url);
    const errorLimit = parseInt(searchParams.get('limit') || '50');
    const errorOffset = parseInt(searchParams.get('offset') || '0');
    
    // Fallback to empty result with error message
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to fetch CalAIM members from Caspio',
      members: [],
      totalMembers: 0,
      hasMore: false,
      pagination: {
        limit: errorLimit,
        offset: errorOffset,
        total: 0
      }
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, clientId2 } = body;

    if (action === 'updateNoteCount' && clientId2) {
      // Update note count for a member (called when notes are added/removed)
      console.log(`📊 Updating note count for member: ${clientId2}`);
      
      // In a real implementation, this would update the note count in Firestore or Caspio
      // For now, we'll just return success since note counts are calculated dynamically
      
      return NextResponse.json({
        success: true,
        message: 'Note count update acknowledged',
        clientId2
      });
    }

    return NextResponse.json(
      { success: false, error: 'Invalid action' },
      { status: 400 }
    );

  } catch (error: any) {
    console.error('Error in members POST:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to process request' },
      { status: 500 }
    );
  }
}