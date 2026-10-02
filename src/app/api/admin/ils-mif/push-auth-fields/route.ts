import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { caspioWriteBlockedResponse, isCaspioWriteReadOnly } from '@/lib/caspio-write-guard';
import { getCaspioServerAccessToken, getCaspioServerConfig } from '@/lib/caspio-server-auth';
import {
  pushIlsMifAuthFieldsToCaspio,
  type IlsMifCaspioAuthorizePushMemberInput,
} from '@/lib/ils-mif-caspio-authorize-push';
import { writeChangeEvents } from '@/lib/global-change-log-server';

const clean = (value: unknown) => String(value ?? '').trim();

const normalizeMemberInput = (raw: unknown): IlsMifCaspioAuthorizePushMemberInput | null => {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const rowId = clean(row.rowId);
  if (!rowId) return null;
  return {
    rowId,
    memberFirstName: clean(row.memberFirstName),
    memberLastName: clean(row.memberLastName),
    memberMrn: clean(row.memberMrn),
    memberMediCalNum: clean(row.memberMediCalNum),
    clientId2: clean(row.clientId2),
    caspioMatchedClientId2: clean(row.caspioMatchedClientId2),
    caspioMatchedBy: clean(row.caspioMatchedBy) as IlsMifCaspioAuthorizePushMemberInput['caspioMatchedBy'],
    authorizationNumberT2038: clean(row.authorizationNumberT2038),
    authorizationStartT2038: clean(row.authorizationStartT2038),
    authorizationEndT2038: clean(row.authorizationEndT2038),
    caspioCalAIMStatus: clean(row.caspioCalAIMStatus),
    sourceFileName: clean(row.sourceFileName),
  } as IlsMifCaspioAuthorizePushMemberInput;
};

export async function POST(request: NextRequest) {
  try {
    const authz = await requireAdminApiAuth(request, { requireTwoFactor: true });
    if (!authz.ok) {
      return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
    }
    if (isCaspioWriteReadOnly()) {
      return NextResponse.json(caspioWriteBlockedResponse(), { status: 403 });
    }

    const body = await request.json().catch(() => ({} as any));
    const rawMembers = Array.isArray(body?.members) ? body.members : [];
    const members = rawMembers
      .map((entry: unknown) => normalizeMemberInput(entry))
      .filter(Boolean) as IlsMifCaspioAuthorizePushMemberInput[];

    if (!members.length) {
      return NextResponse.json(
        { success: false, error: 'No members were provided for the Caspio auth update.' },
        { status: 400 }
      );
    }

    const config = getCaspioServerConfig();
    const token = await getCaspioServerAccessToken(config);
    const outcome = await pushIlsMifAuthFieldsToCaspio({
      baseUrl: config.restBaseUrl,
      token,
      members,
    });

    const memberById = new Map(members.map((m) => [m.rowId, m]));
    await writeChangeEvents(
      outcome.authorized.map((entry) => {
        const member = memberById.get(entry.rowId);
        return {
          source: 'ils_mif_audit_log',
          category: 'mif_consolidator' as const,
          action: 'mif_auth_fields_pushed',
          summary: `T2038 auth pushed to Caspio: #${entry.authorizationNumberT2038} (${entry.authorizationStartT2038} – ${entry.authorizationEndT2038})`,
          staffEmail: authz.email || '',
          staffName: authz.name || authz.email || '',
          memberName: entry.memberName,
          clientId2: entry.clientId2,
          memberMrn: member?.memberMrn || '',
          href: entry.clientId2 ? `/admin/members/${entry.clientId2}` : '/admin/tools/ils-mif-consolidator',
        };
      }),
      { adminDb: authz.adminDb as any }
    );

    return NextResponse.json({
      success: true,
      actor: authz.email,
      pushedCount: outcome.authorized.length,
      skippedCount: outcome.skipped.length,
      failedCount: outcome.failed.length,
      updated: outcome.authorized,
      skipped: outcome.skipped,
      failed: outcome.failed,
    });
  } catch (error: any) {
    console.error('ILS MIF auth field push failed:', error);
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to push MIF auth to Caspio') },
      { status: 500 }
    );
  }
}
