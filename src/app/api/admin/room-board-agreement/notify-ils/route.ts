import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuthFromIdToken } from '@/lib/admin-api-auth';
import { dispatchRoomBoardIlsIfReady } from '@/lib/room-board-ils-dispatch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  idToken?: string;
  applicationId?: string;
  userId?: string | null;
};

const clean = (value: unknown, max = 400) => String(value || '').trim().slice(0, max);

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const idToken = clean(body?.idToken, 8000);
    const applicationId = clean(body?.applicationId, 200);
    const applicationUserId = clean(body?.userId, 200);
    if (!idToken || !applicationId) {
      return NextResponse.json({ success: false, error: 'Missing required fields.' }, { status: 400 });
    }

    const authz = await requireAdminApiAuthFromIdToken(idToken, { requireTwoFactor: true });
    if (!authz.ok) {
      return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
    }

    const result = await dispatchRoomBoardIlsIfReady({
      applicationId,
      applicationUserId: applicationUserId || null,
      triggeredByUid: authz.uid,
      triggeredByEmail: authz.email || null,
    });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error: any) {
    console.error('[admin/room-board-agreement/notify-ils] error', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to notify ILS.' },
      { status: 500 }
    );
  }
}
