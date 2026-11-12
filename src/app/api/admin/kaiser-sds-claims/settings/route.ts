import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { BATCH_ELIGIBILITY_TEMPLATES_COLLECTION } from '@/lib/batch-eligibility';
import { missingKaiserSdsClaimSettings } from '@/lib/kaiser-sds-t2038-claims';
import {
  DEFAULT_T2038_CLAIM_SETTINGS,
  sanitizeT2038ClaimSettings,
  T2038_CLAIMS_SETTINGS_DOC,
} from '@/lib/t2038-claims';
import { DEFAULT_EDI_270_SETTINGS, EDI_SETTINGS_DOC_ID, type Edi270Settings } from '@/lib/x12-270';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Combined SDS EDI envelope + T2038 billing defaults for Kaiser 837P. */
export async function GET(request: NextRequest) {
  const authz = await requireAdminApiAuth(request, { requireTwoFactor: false });
  if (!authz.ok) {
    return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
  }

  try {
    const { adminDb } = await import('@/firebase-admin');
    const [ediSnap, billingSnap] = await Promise.all([
      adminDb.collection(BATCH_ELIGIBILITY_TEMPLATES_COLLECTION).doc(EDI_SETTINGS_DOC_ID).get(),
      adminDb.doc(T2038_CLAIMS_SETTINGS_DOC).get(),
    ]);
    const edi = {
      ...DEFAULT_EDI_270_SETTINGS,
      ...(ediSnap.exists ? (ediSnap.data() as Partial<Edi270Settings>) : {}),
    } as Edi270Settings;
    const settings = billingSnap.exists
      ? sanitizeT2038ClaimSettings(billingSnap.data())
      : DEFAULT_T2038_CLAIM_SETTINGS;
    return NextResponse.json({
      success: true,
      edi,
      settings,
      missing: missingKaiserSdsClaimSettings(edi, settings),
      ediSettingsPath: '/admin/tools/batch-eligibility-checker',
    });
  } catch (error: any) {
    console.error('[kaiser-sds-claims/settings GET]', error);
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to load SDS claim settings.') },
      { status: 500 }
    );
  }
}

/** Update T2038 billing fields used by SDS 837P (does not overwrite EDI envelope). */
export async function POST(request: NextRequest) {
  const authz = await requireAdminApiAuth(request, { requireTwoFactor: false });
  if (!authz.ok) {
    return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const settings = sanitizeT2038ClaimSettings(body.settings || body);
    const { adminDb } = await import('@/firebase-admin');
    await adminDb.doc(T2038_CLAIMS_SETTINGS_DOC).set(
      {
        ...settings,
        updatedAtIso: new Date().toISOString(),
        updatedByEmail: authz.email || '',
      },
      { merge: true }
    );
    const ediSnap = await adminDb
      .collection(BATCH_ELIGIBILITY_TEMPLATES_COLLECTION)
      .doc(EDI_SETTINGS_DOC_ID)
      .get();
    const edi = {
      ...DEFAULT_EDI_270_SETTINGS,
      ...(ediSnap.exists ? (ediSnap.data() as Partial<Edi270Settings>) : {}),
    } as Edi270Settings;
    return NextResponse.json({
      success: true,
      settings,
      edi,
      missing: missingKaiserSdsClaimSettings(edi, settings),
    });
  } catch (error: any) {
    console.error('[kaiser-sds-claims/settings POST]', error);
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to save claim settings.') },
      { status: 500 }
    );
  }
}
