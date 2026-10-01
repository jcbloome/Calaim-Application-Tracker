import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { caspioWriteBlockedResponse, isCaspioWriteReadOnly } from '@/lib/caspio-write-guard';
import { getCaspioServerAccessToken, getCaspioServerConfig } from '@/lib/caspio-server-auth';
import {
  pushIlsMifT2038RequestedToReceivedInCaspio,
  type IlsMifCaspioT2038StatusPushMemberInput,
} from '@/lib/ils-mif-caspio-authorize-push';

const clean = (value: unknown) => String(value ?? '').trim();

const normalizeMemberInput = (raw: unknown): IlsMifCaspioT2038StatusPushMemberInput | null => {
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
    caspioMatchedBy: clean(row.caspioMatchedBy) as IlsMifCaspioT2038StatusPushMemberInput['caspioMatchedBy'],
    caspioKaiserStatus: clean(row.caspioKaiserStatus),
    sourceFileName: clean(row.sourceFileName),
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
      .filter(Boolean) as IlsMifCaspioT2038StatusPushMemberInput[];

    if (!members.length) {
      return NextResponse.json(
        {
          success: false,
          error: 'No members were provided for T2038 Requested → Received push.',
        },
        { status: 400 }
      );
    }

    const config = getCaspioServerConfig();
    const token = await getCaspioServerAccessToken(config);
    const outcome = await pushIlsMifT2038RequestedToReceivedInCaspio({
      baseUrl: config.restBaseUrl,
      token,
      members,
    });

    return NextResponse.json({
      success: true,
      actor: authz.email,
      pushedCount: outcome.updated.length,
      skippedCount: outcome.skipped.length,
      failedCount: outcome.failed.length,
      ...outcome,
    });
  } catch (error: any) {
    console.error('ILS MIF T2038 Requested → Received push failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: String(
          error?.message || 'Failed to push T2038 Requested → Received updates to Caspio'
        ),
      },
      { status: 500 }
    );
  }
}
