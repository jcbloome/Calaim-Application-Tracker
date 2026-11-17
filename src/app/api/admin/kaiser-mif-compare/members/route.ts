import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { fetchAllCalAIMMembers, getCaspioCredentialsFromEnv } from '@/lib/caspio-api-utils';
import {
  collectAuthorizedKaiserMembers,
  preferKaiserMrnIdentifier,
} from '@/lib/kaiser-mif-compare';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

const MRN_MERGE_FIELDS = [
  'Member_MRN',
  'Kaiser_MRN',
  'MRN',
  'Medical_Record_Number',
  'Medical_Record_Number_MRN',
  'MCP_CIN',
  'memberMrn',
  'MediCal_Number',
  'Medical_Number',
  'Medi_Cal_Number',
  'memberMediCalNum',
  'CIN',
];

function mergeMemberRecords(
  primary: Array<Record<string, unknown>>,
  secondary: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  const byClient = new Map<string, Record<string, unknown>>();
  const keyOf = (row: Record<string, unknown>) =>
    String(row.Client_ID2 || row.client_ID2 || row.clientId2 || '')
      .trim()
      .toUpperCase();

  const upsert = (row: Record<string, unknown>) => {
    const key = keyOf(row);
    if (!key) {
      byClient.set(`__row_${byClient.size}_${Math.random().toString(36).slice(2)}`, row);
      return;
    }
    const existing = byClient.get(key);
    if (!existing) {
      byClient.set(key, { ...row });
      return;
    }
    // Fill blank fields; for MRN/CIN prefer the zero-padded / longer form.
    const merged: Record<string, unknown> = { ...existing };
    for (const [field, value] of Object.entries(row)) {
      const next = String(value ?? '').trim();
      if (!next) continue;
      const prev = String(merged[field] ?? '').trim();
      if (!prev) {
        merged[field] = value;
        continue;
      }
      if (MRN_MERGE_FIELDS.includes(field)) {
        const preferred = preferKaiserMrnIdentifier(prev, next);
        if (preferred && preferred !== prev) merged[field] = preferred;
      }
    }
    byClient.set(key, merged);
  };

  primary.forEach(upsert);
  secondary.forEach(upsert);
  return Array.from(byClient.values());
}

export async function GET(request: NextRequest) {
  const authz = await requireAdminApiAuth(request, { requireTwoFactor: false });
  if (!authz.ok) {
    return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
  }

  try {
    const forceRefresh = String(request.nextUrl.searchParams.get('refresh') || '').trim() === 'true';
    const credentials = getCaspioCredentialsFromEnv();
    const [result, cacheSnap] = await Promise.all([
      fetchAllCalAIMMembers(credentials, {
        includeRawData: true,
        forceRefresh,
      }),
      authz.adminDb
        .collection('caspio_members_cache')
        .where('CalAIM_MCO', '==', 'Kaiser')
        .limit(10000)
        .get()
        .catch(() => null),
    ]);

    const rawMembers = Array.isArray(result.rawMembers)
      ? (result.rawMembers as Array<Record<string, unknown>>)
      : ((result.members || []) as Array<Record<string, unknown>>);

    const cacheMembers: Array<Record<string, unknown>> = [];
    if (cacheSnap?.docs) {
      for (const doc of cacheSnap.docs) {
        const data = doc.data() as Record<string, unknown>;
        if (data?.deletedFromCaspio === true) continue;
        cacheMembers.push({
          ...data,
          Client_ID2: data.Client_ID2 || data.client_ID2 || doc.id,
        });
      }
    }

    const merged = mergeMemberRecords(rawMembers, cacheMembers);
    const { authorized, allKaiser } = collectAuthorizedKaiserMembers(merged);

    return NextResponse.json({
      success: true,
      authorized,
      allKaiser,
      summary: {
        authorized: authorized.length,
        allKaiser: allKaiser.length,
        liveCaspio: rawMembers.length,
        cacheKaiser: cacheMembers.length,
        merged: merged.length,
      },
      fetchedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    console.error('[kaiser-mif-compare/members]', error);
    return NextResponse.json(
      {
        success: false,
        error: String(
          (error as { message?: string })?.message || 'Failed to load Kaiser authorized members.'
        ),
      },
      { status: 500 }
    );
  }
}
