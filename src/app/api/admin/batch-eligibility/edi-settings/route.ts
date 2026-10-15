import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { BATCH_ELIGIBILITY_TEMPLATES_COLLECTION } from '@/lib/batch-eligibility';
import { DEFAULT_EDI_270_SETTINGS, EDI_SETTINGS_DOC_ID, type Edi270Settings } from '@/lib/x12-270';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const s = (value: unknown, max = 80) => String(value ?? '').trim().slice(0, max);

/** Saved X12 270 settings for the Kaiser (Smart Data Solutions) batch file. */
export async function GET(req: NextRequest) {
  const adminCheck = await requireAdminApiAuth(req);
  if (!adminCheck.ok) {
    return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
  }
  const snap = await adminCheck.adminDb.collection(BATCH_ELIGIBILITY_TEMPLATES_COLLECTION).doc(EDI_SETTINGS_DOC_ID).get();
  return NextResponse.json({ success: true, settings: { ...DEFAULT_EDI_270_SETTINGS, ...(snap.exists ? snap.data() : {}) } });
}

export async function POST(req: NextRequest) {
  const adminCheck = await requireAdminApiAuth(req);
  if (!adminCheck.ok) {
    return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const settings: Edi270Settings = {
      senderQualifier: s(body?.senderQualifier, 2) || 'ZZ',
      senderId: s(body?.senderId, 15),
      receiverQualifier: s(body?.receiverQualifier, 2) || 'ZZ',
      receiverId: s(body?.receiverId, 15),
      gsSenderId: s(body?.gsSenderId, 15),
      gsReceiverId: s(body?.gsReceiverId, 15),
      usage: body?.usage === 'T' ? 'T' : 'P',
      payerName: s(body?.payerName, 60) || DEFAULT_EDI_270_SETTINGS.payerName,
      payerIdNorth: s(body?.payerIdNorth),
      payerIdSouth: s(body?.payerIdSouth),
      providerName: s(body?.providerName, 60),
      providerNpi: s(body?.providerNpi, 10),
      originatorId: s(body?.originatorId, 10),
      memberIdSource: body?.memberIdSource === 'medicalId' ? 'medicalId' : 'mrn',
      serviceType: s(body?.serviceType, 2) || '30',
      maxPerTransaction: Math.max(1, Math.min(9999, Number(body?.maxPerTransaction) || 99)),
      segmentPerLine: body?.segmentPerLine === true,
      updatedAtIso: new Date().toISOString(),
      updatedByEmail: adminCheck.email || '',
    };
    await adminCheck.adminDb.collection(BATCH_ELIGIBILITY_TEMPLATES_COLLECTION).doc(EDI_SETTINGS_DOC_ID).set(settings);
    return NextResponse.json({ success: true, settings });
  } catch (error: any) {
    console.error('[batch-eligibility/edi-settings] POST failed', error);
    return NextResponse.json({ success: false, error: error?.message || 'Save failed' }, { status: 500 });
  }
}
