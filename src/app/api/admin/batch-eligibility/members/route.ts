import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import type { BatchEligibilityMember } from '@/lib/batch-eligibility';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PLAN_MCO: Record<string, { cacheMco: string; matches: (value: string) => boolean }> = {
  healthnet: {
    cacheMco: 'Health Net',
    matches: (v) => v.includes('health net') || v.includes('healthnet'),
  },
  kaiser: {
    cacheMco: 'Kaiser',
    matches: (v) => v.includes('kaiser'),
  },
};

const s = (value: unknown) => String(value ?? '').trim();
const first = (...values: unknown[]) => values.map(s).find(Boolean) || '';

/** Members of one plan from the synced Caspio cache, for batch eligibility files. */
export async function GET(req: NextRequest) {
  const adminCheck = await requireAdminApiAuth(req);
  if (!adminCheck.ok) {
    return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
  }
  const planKey = s(req.nextUrl.searchParams.get('plan')).toLowerCase() || 'healthnet';
  const plan = PLAN_MCO[planKey];
  if (!plan) return NextResponse.json({ success: false, error: 'Unknown plan' }, { status: 400 });

  try {
    const snap = await adminCheck.adminDb
      .collection('caspio_members_cache')
      .where('CalAIM_MCO', '==', plan.cacheMco)
      .limit(10000)
      .get();
    let latestSyncMs = 0;
    const members: BatchEligibilityMember[] = [];
    for (const doc of snap.docs as Array<{ id: string; data: () => Record<string, any> }>) {
      const d = doc.data();
      if (d.deletedFromCaspio === true) continue;
      if (!plan.matches(s(d.CalAIM_MCO).toLowerCase())) continue;
      const syncedMs = Number(d.lastSyncedFromCaspio?._seconds || d.lastSyncedFromCaspio?.seconds || 0) * 1000;
      if (syncedMs > latestSyncMs) latestSyncMs = syncedMs;
      members.push({
        clientId2: first(d.Client_ID2, d.client_ID2, doc.id),
        firstName: first(d.Senior_First, d.memberFirstName),
        lastName: first(d.Senior_Last, d.memberLastName),
        birthDate: first(d.Birth_Date, d.memberDob),
        sex: first(d.Sex, d.Gender).toUpperCase().slice(0, 1),
        medicalId: first(d.MCP_CIN, d.MediCal_Number, d.Medical_Number),
        mrn: first(d.memberMrn, d.MRN, d.MCP_CIN),
        calaimStatus: first(d.CalAIM_Status, d.caspioCalAIMStatus) || '(no status)',
        authStartT2038: first(d.Authorization_Start_Date_T2038),
        authEndT2038: first(d.Authorization_End_Date_T2038),
        authStartH2022: first(d.Authorization_Start_Date_H2022),
        authEndH2022: first(d.Authorization_End_Date_H2022),
        county: first(d.Member_County, d.memberCounty),
      });
    }
    members.sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`));
    return NextResponse.json({
      success: true,
      members,
      lastSyncedIso: latestSyncMs ? new Date(latestSyncMs).toISOString() : null,
    });
  } catch (error: any) {
    console.error('[batch-eligibility/members] failed', error);
    return NextResponse.json({ success: false, error: error?.message || 'Failed to load members' }, { status: 500 });
  }
}
