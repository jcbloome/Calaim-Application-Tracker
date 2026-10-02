import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { writeKaiserReferralGenerationLog } from '@/lib/kaiser-referral-generation-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (value: unknown) => String(value ?? '').trim();

export async function POST(request: NextRequest) {
  try {
    const authz = await requireAdminApiAuth(request, { requireTwoFactor: false });
    if (!authz.ok) {
      return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
    }

    const body = await request.json().catch(() => ({} as any));
    const eventTypeRaw = clean(body?.eventType).toLowerCase();
    const eventType =
      eventTypeRaw === 'downloaded' ||
      eventTypeRaw === 'previewed' ||
      eventTypeRaw === 'sent' ||
      eventTypeRaw === 'generated'
        ? (eventTypeRaw as 'generated' | 'downloaded' | 'previewed' | 'sent')
        : 'generated';

    const adminModule = await import('@/firebase-admin');
    const result = await writeKaiserReferralGenerationLog(authz.adminDb, adminModule.default, {
      eventType,
      memberName: clean(body?.memberName),
      memberMrn: clean(body?.memberMrn),
      clientId2: clean(body?.clientId2 || body?.memberClientId),
      applicationId: clean(body?.applicationId),
      staffName: clean(body?.staffName) || clean(authz.name),
      staffEmail: clean(body?.staffEmail) || clean(authz.email),
      fileName: clean(body?.fileName),
      referralContext: clean(body?.referralContext),
      region: clean(body?.region),
      source: clean(body?.source) || 'kaiser-referral-log-generation',
      details: body?.details && typeof body.details === 'object' ? body.details : undefined,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('[kaiser-referral/log-generation] failed:', error);
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to log Kaiser referral generation') },
      { status: 500 }
    );
  }
}
