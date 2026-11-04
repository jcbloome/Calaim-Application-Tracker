import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { isKaiserPlan } from '@/lib/t2038-claims';
import {
  mapMemberToH2022ReauthVisitRow,
  summarizeH2022ReauthRows,
  type H2022ReauthVisitRow,
} from '@/lib/h2022-reauth-visits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Kaiser RCFE members only — T2038 / H2022 windows for unpaid H2022 reauth-visit review. */
export async function GET(req: NextRequest) {
  const authz = await requireAdminApiAuth(req);
  if (!authz.ok) {
    return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
  }

  try {
    let snap: { docs: Array<{ id: string; data: () => Record<string, unknown> }> };
    try {
      snap = await authz.adminDb
        .collection('caspio_members_cache')
        .where('CalAIM_MCO', '==', 'Kaiser')
        .limit(10000)
        .get();
    } catch {
      snap = await authz.adminDb.collection('caspio_members_cache').limit(15000).get();
    }
    let latestSyncMs = 0;
    const rows: H2022ReauthVisitRow[] = [];

    for (const doc of snap.docs) {
      const data = doc.data() as Record<string, unknown>;
      if (data.deletedFromCaspio === true) continue;
      const mco = String(data.CalAIM_MCO || data.memberHealthPlan || data.Health_Plan || '');
      if (!isKaiserPlan(mco)) continue;

      const syncedMs =
        Number(
          (data.lastSyncedFromCaspio as { _seconds?: number; seconds?: number } | undefined)?._seconds ||
            (data.lastSyncedFromCaspio as { _seconds?: number; seconds?: number } | undefined)?.seconds ||
            0
        ) * 1000;
      if (syncedMs > latestSyncMs) latestSyncMs = syncedMs;

      const row = mapMemberToH2022ReauthVisitRow(data, doc.id);
      if (row) rows.push(row);
    }

    rows.sort((a, b) => {
      if (a.chargeCandidate !== b.chargeCandidate) return a.chargeCandidate ? -1 : 1;
      if (a.likelyReauthDone !== b.likelyReauthDone) return a.likelyReauthDone ? -1 : 1;
      return a.memberName.localeCompare(b.memberName);
    });

    return NextResponse.json({
      success: true,
      rows,
      summary: summarizeH2022ReauthRows(rows),
      lastSyncedIso: latestSyncMs ? new Date(latestSyncMs).toISOString() : null,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[h2022-reauth-visits]', error);
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to load H2022 reauth visit list.') },
      { status: 500 }
    );
  }
}
