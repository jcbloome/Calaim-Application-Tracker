import { NextRequest, NextResponse } from 'next/server';

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

// Sample member data - in production this would come from Caspio CalAIM_tbl_Members
const sampleMembers: Member[] = [
  {
    clientId2: 'KAI-12345',
    firstName: 'John',
    lastName: 'Doe',
    healthPlan: 'Kaiser',
    status: 'Authorized',
    rcfeName: 'Sunshine Care Home',
    lastNoteDate: '2026-01-15',
    noteCount: 8
  },
  {
    clientId2: 'HN-67890',
    firstName: 'Jane',
    lastName: 'Smith',
    healthPlan: 'Health Net',
    status: 'Authorized',
    rcfeName: 'Golden Years RCFE',
    lastNoteDate: '2026-01-16',
    noteCount: 12
  },
  {
    clientId2: 'KAI-11111',
    firstName: 'Robert',
    lastName: 'Johnson',
    healthPlan: 'Kaiser',
    status: 'Pending',
    lastNoteDate: '2026-01-10',
    noteCount: 3
  },
  {
    clientId2: 'HN-22222',
    firstName: 'Maria',
    lastName: 'Garcia',
    healthPlan: 'Health Net',
    status: 'Authorized',
    rcfeName: 'Peaceful Gardens RCFE',
    lastNoteDate: '2026-01-14',
    noteCount: 15
  },
  {
    clientId2: 'KAI-33333',
    firstName: 'David',
    lastName: 'Wilson',
    healthPlan: 'Kaiser',
    status: 'Authorized',
    rcfeName: 'Harmony House',
    lastNoteDate: '2026-01-12',
    noteCount: 6
  },
  {
    clientId2: 'HN-44444',
    firstName: 'Linda',
    lastName: 'Brown',
    healthPlan: 'Health Net',
    status: 'Authorized',
    rcfeName: 'Serenity Care Home',
    lastNoteDate: '2026-01-17',
    noteCount: 9
  },
  {
    clientId2: 'KAI-55555',
    firstName: 'Michael',
    lastName: 'Davis',
    healthPlan: 'Kaiser',
    status: 'Pending',
    lastNoteDate: '2026-01-08',
    noteCount: 2
  },
  {
    clientId2: 'HN-66666',
    firstName: 'Patricia',
    lastName: 'Miller',
    healthPlan: 'Health Net',
    status: 'Authorized',
    rcfeName: 'Comfort Care RCFE',
    lastNoteDate: '2026-01-16',
    noteCount: 11
  }
];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.toLowerCase() || '';
    const healthPlan = searchParams.get('healthPlan') || '';
    const status = searchParams.get('status') || '';
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    console.log('📥 Fetching members with filters:', { search, healthPlan, status, limit, offset });

    // Filter members based on search criteria
    let filteredMembers = sampleMembers.filter(member => {
      // Search filter
      if (search) {
        const searchMatch = 
          member.firstName.toLowerCase().includes(search) ||
          member.lastName.toLowerCase().includes(search) ||
          member.clientId2.toLowerCase().includes(search) ||
          (member.rcfeName && member.rcfeName.toLowerCase().includes(search));
        
        if (!searchMatch) return false;
      }

      // Health plan filter
      if (healthPlan && member.healthPlan !== healthPlan) return false;

      // Status filter
      if (status && member.status !== status) return false;

      return true;
    });

    // Sort by last name, then first name
    filteredMembers.sort((a, b) => {
      const lastNameCompare = a.lastName.localeCompare(b.lastName);
      if (lastNameCompare !== 0) return lastNameCompare;
      return a.firstName.localeCompare(b.firstName);
    });

    // Apply pagination
    const totalMembers = filteredMembers.length;
    const paginatedMembers = filteredMembers.slice(offset, offset + limit);

    // In production, this would also fetch note counts from the database
    // For now, we're using the sample data which already includes note counts

    console.log(`✅ Returning ${paginatedMembers.length} of ${totalMembers} members`);

    return NextResponse.json({
      success: true,
      members: paginatedMembers,
      totalMembers,
      hasMore: offset + limit < totalMembers,
      pagination: {
        limit,
        offset,
        total: totalMembers
      }
    });

  } catch (error: any) {
    console.error('Error fetching members:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch members' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, clientId2 } = body;

    if (action === 'updateNoteCount' && clientId2) {
      // Update note count for a member (called when notes are added/removed)
      console.log(`📊 Updating note count for member: ${clientId2}`);
      
      const memberIndex = sampleMembers.findIndex(m => m.clientId2 === clientId2);
      if (memberIndex !== -1) {
        // In production, this would query the actual note count from the database
        sampleMembers[memberIndex].noteCount += 1;
        sampleMembers[memberIndex].lastNoteDate = new Date().toISOString().split('T')[0];
        
        return NextResponse.json({
          success: true,
          member: sampleMembers[memberIndex],
          message: 'Note count updated'
        });
      } else {
        return NextResponse.json(
          { success: false, error: 'Member not found' },
          { status: 404 }
        );
      }
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