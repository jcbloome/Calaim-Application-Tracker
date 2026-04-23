import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const adminModule = await import('@/firebase-admin');
    const adminDb = adminModule.adminDb;

    const [settingsSnap, latestWebhookEventSnap, latestWebhookLogSnap] = await Promise.all([
      adminDb.collection('admin-settings').doc('caspio-members-sync').get(),
      adminDb
        .collection('caspio-webhook-events')
        .orderBy('receivedAt', 'desc')
        .limit(1)
        .get(),
      adminDb
        .collection('webhook-logs')
        .orderBy('processedAt', 'desc')
        .limit(5)
        .get(),
    ]);

    const settings = settingsSnap.exists ? settingsSnap.data() : null;
    const latestWebhookEvent = latestWebhookEventSnap.empty ? null : latestWebhookEventSnap.docs[0]?.data();
    const latestWebhookLog = latestWebhookLogSnap.docs
      .map((doc: any) => doc.data())
      .find((row: any) => String(row?.source || '').toLowerCase() === 'caspio') || null;

    return NextResponse.json({
      success: true,
      settings: settings || {},
      webhook: {
        latestEventReceivedAt: latestWebhookEvent?.receivedAt || null,
        latestEventStatus: latestWebhookEvent?.status || null,
        latestEventOperation: latestWebhookEvent?.operation || null,
        latestEventClientId: latestWebhookEvent?.clientId || null,
        latestProcessedAt: latestWebhookLog?.processedAt || null,
        latestProcessedClientId: latestWebhookLog?.clientId || null,
        latestProcessedOperation: latestWebhookLog?.operation || null,
        latestProcessedSuccess: latestWebhookLog?.success ?? null,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to load sync status' },
      { status: 500 }
    );
  }
}

