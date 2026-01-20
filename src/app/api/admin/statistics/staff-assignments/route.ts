import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Get staff assignments from Kaiser members API
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const kaiserResponse = await fetch(`${baseUrl}/api/kaiser-members`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!kaiserResponse.ok) {
      console.error('Kaiser API response not ok:', kaiserResponse.status, kaiserResponse.statusText);
      throw new Error(`Failed to fetch Kaiser members data: ${kaiserResponse.status} ${kaiserResponse.statusText}`);
    }

    const kaiserData = await kaiserResponse.json();
    const members = kaiserData.members || [];

    // Calculate staff assignment statistics
    const staffStats: Record<string, { name: string; count: number; members: any[] }> = {};

    members.forEach((member: any) => {
      const staffName = member.Staff_Assignment || 'Unassigned';
      
      if (!staffStats[staffName]) {
        staffStats[staffName] = {
          name: staffName,
          count: 0,
          members: []
        };
      }
      
      staffStats[staffName].count++;
      staffStats[staffName].members.push({
        id: member.Client_ID2,
        name: `${member.Senior_First || ''} ${member.Senior_Last || ''}`.trim(),
        kaiserStatus: member.Kaiser_Status,
        calaimStatus: member.CalAIM_Status,
        county: member.County,
        nextStep: member.Next_Step,
        nextStepDate: member.Next_Step_Date
      });
    });

    // Convert to array and sort by member count (descending)
    const staffAssignments = Object.values(staffStats)
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({
      success: true,
      staffAssignments,
      totalMembers: members.length,
      totalStaff: Object.keys(staffStats).length
    });

  } catch (error) {
    console.error('Error fetching staff assignment statistics:', error);
    
    // Return mock data if API is unavailable
    const mockStaffAssignments = [
      { name: 'Unassigned', count: 0, members: [] },
      { name: 'Loading...', count: 0, members: [] }
    ];
    
    return NextResponse.json({
      success: false,
      staffAssignments: mockStaffAssignments,
      totalMembers: 0,
      totalStaff: 0,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
}