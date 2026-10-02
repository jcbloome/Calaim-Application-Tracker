import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { GLOBAL_CHANGE_LOG_COLLECTION, toGlobalChangeIso } from '@/lib/global-change-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (value: unknown) => String(value ?? '').trim();

/** Every Caspio write made from the MIF consolidator, current and historical. */
const CURRENT_ACTIONS = ['mif_auth_fields_pushed', 'mif_auth_fields_push_skipped', 'mif_auth_fields_push_failed'];
const LEGACY_ACTIONS = ['mif_pending_to_authorized_push', 'mif_t2038_requested_to_received_push'];
const ALL_ACTIONS = [...CURRENT_ACTIONS, ...LEGACY_ACTIONS];

export type IlsMifCaspioUpdateLogEntry = {
  id: string;
  atIso: string;
  action: string;
  outcome: 'updated' | 'skipped' | 'failed';
  summary: string;
  memberName: string;
  memberMrn: string;
  clientId2: string;
  staff: string;
  details: Record<string, unknown>;
};

const outcomeForAction = (
  action: string,
  details: Record<string, unknown>,
  summary = ''
): IlsMifCaspioUpdateLogEntry['outcome'] => {
  const fromDetails = clean(details.outcome);
  if (fromDetails === 'skipped' || fromDetails === 'failed' || fromDetails === 'updated') return fromDetails;
  if (action.endsWith('_skipped')) return 'skipped';
  if (action.endsWith('_failed')) return 'failed';
  // Old-tool batch summaries, e.g. "Pushed 0 member(s) Pending → Authorized in Caspio - 1 failed".
  const pushedCount = summary.match(/Pushed\s+(\d+)\s+member/i);
  if (pushedCount && Number(pushedCount[1]) === 0) return /failed/i.test(summary) ? 'failed' : 'skipped';
  return 'updated';
};

const legacyMemberName = (data: Record<string, any>) =>
  clean(data.memberLastName) && clean(data.memberFirstName)
    ? `${clean(data.memberLastName)}, ${clean(data.memberFirstName)}`
    : clean(data.memberName) ||
      clean(data.summary).match(/^Authorized\s+(.+?)\s+in Caspio/i)?.[1] ||
      clean(data.summary).match(/^Updated Kaiser_Status for\s+(.+?)\s+to\s/i)?.[1] ||
      '';

const legacyDetails = (data: Record<string, any>): Record<string, unknown> => ({
  newAuthorizationNumberT2038: clean(data.authorizationNumberT2038),
  newAuthorizationStartT2038: clean(data.authorizationStartT2038),
  newAuthorizationEndT2038: clean(data.authorizationEndT2038),
  previousKaiserStatus: clean(data.previousKaiserStatus),
  kaiserStatus: clean(data.kaiserStatus),
});

export async function GET(request: NextRequest) {
  try {
    const authz = await requireAdminApiAuth(request, { requireTwoFactor: false });
    if (!authz.ok) {
      return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
    }
    const adminDb = authz.adminDb as any;
    const limitRaw = Number(request.nextUrl.searchParams.get('limit') || 500);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 25), 1000) : 500;

    // Single `in` filter, no orderBy: needs no composite index; sorted below.
    const [unifiedSnap, legacySnap] = await Promise.all([
      adminDb.collection(GLOBAL_CHANGE_LOG_COLLECTION).where('action', 'in', ALL_ACTIONS).limit(limit * 2).get(),
      adminDb
        .collection('ils_mif_audit_log')
        .where('action', 'in', LEGACY_ACTIONS)
        .limit(limit)
        .get()
        .catch(() => ({ docs: [] })),
    ]);

    const mirroredRefs = new Set<string>();
    const entries: IlsMifCaspioUpdateLogEntry[] = unifiedSnap.docs.map((doc: any) => {
      const data = doc.data() || {};
      const details = data.details && typeof data.details === 'object' ? data.details : {};
      const action = clean(data.action);
      if (clean(data.sourceRef)) mirroredRefs.add(clean(data.sourceRef));
      const isLegacy = LEGACY_ACTIONS.includes(action);
      return {
        id: `unified-${doc.id}`,
        atIso: toGlobalChangeIso(data.atIso) || toGlobalChangeIso(data.createdAt),
        action,
        outcome: outcomeForAction(action, details, clean(data.summary)),
        summary: clean(data.summary),
        memberName: clean(data.memberName) || (isLegacy ? legacyMemberName(data) : ''),
        memberMrn: clean(data.memberMrn),
        clientId2: clean(data.clientId2),
        staff: clean(data.staffName) || clean(data.staffEmail),
        details: isLegacy ? legacyDetails(details) : details,
      };
    });

    for (const doc of legacySnap.docs as any[]) {
      if (mirroredRefs.has(`ils_mif_audit_log/${doc.id}`)) continue;
      const data = doc.data() || {};
      const action = clean(data.action);
      entries.push({
        id: `legacy-${doc.id}`,
        atIso: toGlobalChangeIso(data.atIso) || toGlobalChangeIso(data.atServer),
        action,
        outcome: outcomeForAction(action, {}, clean(data.summary)),
        summary: clean(data.summary),
        memberName: legacyMemberName(data),
        memberMrn: clean(data.memberMrn),
        clientId2: clean(data.clientId2),
        staff: clean(data.actor),
        details: legacyDetails(data),
      });
    }

    const sorted = entries
      .filter((entry) => entry.atIso)
      .sort((a, b) => Date.parse(b.atIso) - Date.parse(a.atIso))
      .slice(0, limit);

    return NextResponse.json({ success: true, count: sorted.length, entries: sorted });
  } catch (error: any) {
    console.error('ILS MIF Caspio update log failed:', error);
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to load Caspio update log') },
      { status: 500 }
    );
  }
}
