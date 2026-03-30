import { NextRequest, NextResponse } from 'next/server';
import { POST as runMembersCacheSync } from '@/app/api/caspio/members-cache/sync/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SyncMode = 'incremental' | 'full';

function getRequestedMode(request: NextRequest): SyncMode {
  const mode = String(new URL(request.url).searchParams.get('mode') || 'incremental')
    .trim()
    .toLowerCase();
  return mode === 'full' ? 'full' : 'incremental';
}

/**
 * Secure cron endpoint for scheduled Caspio -> Firestore member cache sync.
 *
 * Auth:
 *  Authorization: Bearer ${CRON_SECRET}
 *
 * Query params:
 *  - mode=incremental (default)
 *  - mode=full
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const mode = getRequestedMode(request);
    const proxyRequest = new NextRequest(
      new Request(new URL('/api/caspio/members-cache/sync', request.url), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: authHeader || '',
        },
        body: JSON.stringify({ mode }),
      })
    );

    const syncResponse = await runMembersCacheSync(proxyRequest);
    const payload = await syncResponse.json().catch(() => ({}));
    return NextResponse.json(
      {
        ...payload,
        triggeredBy: 'cron-caspio-members-sync',
        requestedMode: mode,
      },
      { status: syncResponse.status }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Failed to run scheduled members cache sync.',
      },
      { status: 500 }
    );
  }
}
