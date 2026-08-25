import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { caspioWriteBlockedResponse, isCaspioWriteReadOnly } from '@/lib/caspio-write-guard';
import { getCaspioServerAccessToken, getCaspioServerConfig } from '@/lib/caspio-server-auth';
import {
  pushIlsMifPendingMembersToAuthorizedInCaspio,
  type IlsMifCaspioAuthorizePushMemberInput,
} from '@/lib/ils-mif-caspio-authorize-push';

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
  };
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
        { success: false, error: 'No members were provided for Pending → Authorized push.' },
        { status: 400 }
      );
    }

    const config = getCaspioServerConfig();
    const token = await getCaspioServerAccessToken(config);
    const outcome = await pushIlsMifPendingMembersToAuthorizedInCaspio({
      baseUrl: config.restBaseUrl,
      token,
      members,
    });

    return NextResponse.json({
      success: true,
      actor: authz.email,
      pushedCount: outcome.authorized.length,
      skippedCount: outcome.skipped.length,
      failedCount: outcome.failed.length,
      ...outcome,
    });
  } catch (error: any) {
    console.error('ILS MIF Pending → Authorized push failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: String(error?.message || 'Failed to push Pending → Authorized updates to Caspio'),
      },
      { status: 500 }
    );
  }
}
