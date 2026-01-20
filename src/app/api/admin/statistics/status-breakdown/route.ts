import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Get members data from Kaiser members API
    const kaiserResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001'}/api/kaiser-members`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!kaiserResponse.ok) {
      throw new Error('Failed to fetch Kaiser members data');
    }

    const kaiserData = await kaiserResponse.json();
    const members = kaiserData.members || [];

    // Calculate status statistics
    const kaiserStatusStats: Record<string, number> = {};
    const calaimStatusStats: Record<string, number> = {};
    const healthPlanStats: Record<string, number> = {};

    members.forEach((member: any) => {
      // Kaiser Status
      const kaiserStatus = member.Kaiser_Status || 'No Status';
      kaiserStatusStats[kaiserStatus] = (kaiserStatusStats[kaiserStatus] || 0) + 1;

      // CalAIM Status
      const calaimStatus = member.CalAIM_Status || 'No Status';
      calaimStatusStats[calaimStatus] = (calaimStatusStats[calaimStatus] || 0) + 1;

      // Health Plan (assuming Kaiser for now, but could be expanded)
      const healthPlan = member.Health_Plan || 'Kaiser';
      healthPlanStats[healthPlan] = (healthPlanStats[healthPlan] || 0) + 1;
    });

    // Convert to arrays and sort by count (descending)
    const kaiserStatuses = Object.entries(kaiserStatusStats)
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);

    const calaimStatuses = Object.entries(calaimStatusStats)
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);

    const healthPlans = Object.entries(healthPlanStats)
      .map(([plan, count]) => ({ plan, count }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({
      success: true,
      kaiserStatuses,
      calaimStatuses,
      healthPlans,
      totalMembers: members.length,
      summary: {
        totalKaiserStatuses: Object.keys(kaiserStatusStats).length,
        totalCalaimStatuses: Object.keys(calaimStatusStats).length,
        totalHealthPlans: Object.keys(healthPlanStats).length
      }
    });

  } catch (error) {
    console.error('Error fetching status breakdown statistics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch status breakdown statistics' },
      { status: 500 }
    );
  }
}