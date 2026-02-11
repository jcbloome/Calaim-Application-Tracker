import { NextRequest, NextResponse } from 'next/server';
import { fetchAllCalAIMMembers, getCaspioCredentialsFromEnv } from '@/lib/caspio-api-utils';
import { KAISER_STATUS_PROGRESSION } from '@/lib/kaiser-status-progression';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const calaimStatusOptions = [
      'Authorized',
      'Pending',
      'Non_Active',
      'Member Died',
      'Authorized on hold',
      'H2022',
      'Authorization Ended',
      'Denied',
      'Not interested',
      'Pending to switch'
    ];
    const normalizeCalaimStatus = (value: string) =>
      value.trim().toLowerCase().replace(/\s+/g, ' ');
    const calaimStatusMap = calaimStatusOptions.reduce((acc, status) => {
      acc[normalizeCalaimStatus(status)] = status;
      return acc;
    }, {} as Record<string, string>);
    const kaiserStatusOrder = KAISER_STATUS_PROGRESSION.map((item) => item.status);

    const credentials = getCaspioCredentialsFromEnv();
    const result = await fetchAllCalAIMMembers(credentials, { includeRawData: true });
    const members = result.rawMembers || [];

    // Calculate status statistics
    const kaiserStatusStats: Record<string, number> = {};
    const calaimStatusStats: Record<string, number> = {};
    const healthPlanStats: Record<string, number> = {};

    members.forEach((member: any) => {
      // Kaiser Status
      const kaiserStatus = member.Kaiser_Status || member.kaiser_status || 'No Status';
      if (kaiserStatusOrder.includes(kaiserStatus)) {
        kaiserStatusStats[kaiserStatus] = (kaiserStatusStats[kaiserStatus] || 0) + 1;
      }

      // CalAIM Status
      const calaimStatusRaw = member.CalAIM_Status || member.calaim_status || 'No Status';
      const normalized = normalizeCalaimStatus(calaimStatusRaw);
      const mapped = calaimStatusMap[normalized];
      if (mapped) {
        calaimStatusStats[mapped] = (calaimStatusStats[mapped] || 0) + 1;
      }

      // Health Plan
      const healthPlan = member.CalAIM_MCO || member.Health_Plan || member.HealthPlan || 'Unknown';
      healthPlanStats[healthPlan] = (healthPlanStats[healthPlan] || 0) + 1;
    });

    // Convert to arrays and sort by count (descending)
    const kaiserStatuses = kaiserStatusOrder.map((status) => ({
      status,
      count: kaiserStatusStats[status] || 0
    }));

    const calaimStatuses = calaimStatusOptions.map((status) => ({
      status,
      count: calaimStatusStats[status] || 0
    }));

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
    
    // Return mock data if API is unavailable
    return NextResponse.json({
      success: false,
      kaiserStatuses: [{ status: 'No Data Available', count: 0 }],
      calaimStatuses: [{ status: 'No Data Available', count: 0 }],
      healthPlans: [{ plan: 'No Data Available', count: 0 }],
      totalMembers: 0,
      summary: {
        totalKaiserStatuses: 0,
        totalCalaimStatuses: 0,
        totalHealthPlans: 0
      },
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
}