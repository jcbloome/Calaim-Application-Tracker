import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import {
  buildT2038ClaimMdCsv,
  CLAIMMD_UPLOAD_URL,
  missingBillingSettings,
  parseDateOnly,
  sanitizeT2038ClaimSettings,
  type T2038ClaimMemberRow,
} from '@/lib/t2038-claims';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const authz = await requireAdminApiAuth(request, { requireTwoFactor: false });
  if (!authz.ok) {
    return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
  }

  const accountKey = String(process.env.CLAIMMD_ACCOUNT_KEY || '').trim();
  if (!accountKey) {
    return NextResponse.json(
      {
        success: false,
        error: 'Claim.MD account key is not configured. Set CLAIMMD_ACCOUNT_KEY on the server.',
      },
      { status: 503 }
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const settings = sanitizeT2038ClaimSettings(body.settings);
    const missing = missingBillingSettings(settings);
    if (missing.length) {
      return NextResponse.json(
        { success: false, error: `Fill billing settings before upload: ${missing.join(', ')}.` },
        { status: 400 }
      );
    }

    const serviceDate = parseDateOnly(body.serviceDate) || new Date();
    const rows = (Array.isArray(body.rows) ? body.rows : []) as T2038ClaimMemberRow[];
    if (!rows.length) {
      return NextResponse.json({ success: false, error: 'Select at least one member to upload.' }, { status: 400 });
    }

    const built = buildT2038ClaimMdCsv(rows, settings, serviceDate);
    if (built.included === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No claims were ready to upload.',
          skipped: built.skipped,
        },
        { status: 400 }
      );
    }

    const y = serviceDate.getFullYear();
    const m = String(serviceDate.getMonth() + 1).padStart(2, '0');
    const d = String(serviceDate.getDate()).padStart(2, '0');
    const filename = `Connections-T2038-${y}${m}${d}-${built.included}.csv`;
    const form = new FormData();
    form.set('AccountKey', accountKey);
    form.set('Filename', filename);
    form.set('File', new Blob([built.csv], { type: 'text/csv' }), filename);

    const response = await fetch(CLAIMMD_UPLOAD_URL, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: form,
    });
    const text = await response.text();
    let payload: unknown = text;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text.slice(0, 4000) };
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: `Claim.MD upload failed (HTTP ${response.status}).`,
          included: built.included,
          skipped: built.skipped,
          claimMd: payload,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      filename,
      included: built.included,
      skipped: built.skipped,
      claimMd: payload,
    });
  } catch (error: any) {
    console.error('[t2038-claims/upload]', error);
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to upload the T2038 batch.') },
      { status: 500 }
    );
  }
}
