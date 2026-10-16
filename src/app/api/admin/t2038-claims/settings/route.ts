import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import {
  DEFAULT_T2038_CLAIM_SETTINGS,
  missingBillingSettings,
  sanitizeT2038ClaimSettings,
  T2038_CLAIMS_SETTINGS_DOC,
} from '@/lib/t2038-claims';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authz = await requireAdminApiAuth(request, { requireTwoFactor: false });
  if (!authz.ok) {
    return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
  }

  try {
    const { adminDb } = await import('@/firebase-admin');
    const snap = await adminDb.doc(T2038_CLAIMS_SETTINGS_DOC).get();
    const settings = snap.exists ? sanitizeT2038ClaimSettings(snap.data()) : DEFAULT_T2038_CLAIM_SETTINGS;
    return NextResponse.json({
      success: true,
      settings,
      missing: missingBillingSettings(settings),
      claimMdConfigured: Boolean(String(process.env.CLAIMMD_ACCOUNT_KEY || '').trim()),
    });
  } catch (error: any) {
    console.error('[t2038-claims/settings GET]', error);
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to load claim settings.') },
      { status: 500 }
    );
  }
}

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
    return NextResponse.json({
      success: true,
      settings,
      missing: missingBillingSettings(settings),
    });
  } catch (error: any) {
    console.error('[t2038-claims/settings POST]', error);
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to save claim settings.') },
      { status: 500 }
    );
  }
}
