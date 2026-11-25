import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import {
  fetchCaspioRecords,
  getCaspioCredentialsFromEnv,
  getCaspioToken,
} from '@/lib/caspio-api-utils';
import {
  mapCaspioRawToAnyMcoCompareMember,
  type KaiserMifCompareMember,
} from '@/lib/kaiser-mif-compare';
import { identityTokenLookupKeys } from '@/lib/member-identity';
import { isKaiserPlan } from '@/lib/t2038-claims';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MEMBERS_TABLE = 'CalAIM_tbl_Members';
const CACHE_COLLECTION = 'caspio_members_cache';

function cleanCin(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function escapeCaspioLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function cinLookupVariants(cin: string): string[] {
  const keys = new Set<string>();
  for (const key of identityTokenLookupKeys(cin)) {
    const upper = String(key || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    if (upper) keys.add(upper);
  }
  const raw = cleanCin(cin);
  if (raw) keys.add(raw);
  return Array.from(keys);
}

function pushMember(
  byClient: Map<string, KaiserMifCompareMember>,
  byCin: Map<string, KaiserMifCompareMember>,
  raw: Record<string, unknown>,
  index: number
) {
  const member = mapCaspioRawToAnyMcoCompareMember(raw, index);
  if (!member) return;
  if (isKaiserPlan(member.calaimMco)) return;
  const clientKey = cleanCin(member.clientId2) || `row_${index}`;
  if (!byClient.has(clientKey)) byClient.set(clientKey, member);
  for (const token of [
    member.cin,
    ...(member.altIds || []),
    raw.MCP_CIN,
    raw.MediCal_Number,
    raw.Medical_Number,
    raw.CIN,
  ]) {
    for (const key of cinLookupVariants(String(token || ''))) {
      if (key && !byCin.has(key)) byCin.set(key, member);
    }
  }
}

/**
 * Resolve portal CINs against Caspio MCP_CIN / Medi-Cal fields and the members cache.
 * Used when the bulk other-MCO roster miss (e.g. Health Net still listed for Kaiser-authorized members).
 */
export async function POST(request: NextRequest) {
  const authz = await requireAdminApiAuth(request, { requireTwoFactor: false });
  if (!authz.ok) {
    return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { cins?: unknown };
    const inputCins = Array.isArray(body?.cins) ? body.cins : [];
    const uniqueCins = Array.from(
      new Set(inputCins.map((value) => cleanCin(value)).filter((value) => value.length >= 4))
    ).slice(0, 400);

    if (!uniqueCins.length) {
      return NextResponse.json({
        success: true,
        matches: [] as KaiserMifCompareMember[],
        matchedCins: [] as string[],
        summary: { requested: 0, matched: 0, cacheHits: 0, caspioHits: 0 },
      });
    }

    const byClient = new Map<string, KaiserMifCompareMember>();
    const byCin = new Map<string, KaiserMifCompareMember>();
    let cacheHits = 0;
    let caspioHits = 0;

    // 1) Firestore cache — MCP_CIN / MediCal_Number equality (and common variants).
    const cache = authz.adminDb.collection(CACHE_COLLECTION);
    const cacheFields = ['MCP_CIN', 'MediCal_Number', 'Medical_Number', 'CIN', 'memberMediCalNum'];
    for (const cin of uniqueCins) {
      const variants = cinLookupVariants(cin);
      for (const field of cacheFields) {
        for (const variant of variants.slice(0, 3)) {
          try {
            const snap = await cache.where(field, '==', variant).limit(5).get();
            if (snap.empty) continue;
            snap.docs.forEach((doc: { id: string; data: () => Record<string, unknown> }, idx: number) => {
              const data = doc.data() as Record<string, unknown>;
              if (data?.deletedFromCaspio === true) return;
              cacheHits += 1;
              pushMember(
                byClient,
                byCin,
                {
                  ...data,
                  Client_ID2: data.Client_ID2 || data.client_ID2 || doc.id,
                },
                idx
              );
            });
          } catch {
            // Field may be unindexed or missing — ignore and continue.
          }
        }
      }
    }

    // 2) Live Caspio — MCP_CIN first (Health Net source of truth), then Medi-Cal aliases.
    const stillMissing = uniqueCins.filter((cin) => !cinLookupVariants(cin).some((key) => byCin.has(key)));
    if (stillMissing.length) {
      const credentials = getCaspioCredentialsFromEnv();
      const token = await getCaspioToken(credentials);
      const chunkSize = 8;
      for (let i = 0; i < stillMissing.length; i += chunkSize) {
        const chunk = stillMissing.slice(i, i + chunkSize);
        // Prefer MCP_CIN (Health Net source of truth); fall back to MediCal aliases in a 2nd pass.
        const mcpParts: string[] = [];
        const mediCalParts: string[] = [];
        for (const cin of chunk) {
          for (const variant of cinLookupVariants(cin).slice(0, 2)) {
            const lit = escapeCaspioLiteral(variant);
            mcpParts.push(`MCP_CIN='${lit}'`);
            mediCalParts.push(`MediCal_Number='${lit}'`);
            mediCalParts.push(`Medical_Number='${lit}'`);
          }
        }
        for (const where of [mcpParts.join(' OR '), mediCalParts.join(' OR ')]) {
          if (!where) continue;
          try {
            const rows = await fetchCaspioRecords(credentials, token, MEMBERS_TABLE, where, 200);
            rows.forEach((row, idx) => {
              caspioHits += 1;
              pushMember(byClient, byCin, (row || {}) as Record<string, unknown>, idx);
            });
          } catch (error) {
            console.warn('[kaiser-mif-compare/resolve-cin] Caspio chunk failed', error);
          }
        }
      }
    }

    const matchedCins: string[] = [];
    const matches: KaiserMifCompareMember[] = [];
    const seenClients = new Set<string>();
    for (const cin of uniqueCins) {
      let hit: KaiserMifCompareMember | undefined;
      for (const key of cinLookupVariants(cin)) {
        hit = byCin.get(key);
        if (hit) break;
      }
      if (!hit) continue;
      matchedCins.push(cin);
      const clientKey = cleanCin(hit.clientId2) || hit.cin || cin;
      if (seenClients.has(clientKey)) continue;
      seenClients.add(clientKey);
      matches.push(hit);
    }

    return NextResponse.json({
      success: true,
      matches,
      matchedCins,
      summary: {
        requested: uniqueCins.length,
        matched: matchedCins.length,
        cacheHits,
        caspioHits,
        members: matches.length,
      },
    });
  } catch (error: unknown) {
    console.error('[kaiser-mif-compare/resolve-cin]', error);
    return NextResponse.json(
      {
        success: false,
        error: String((error as { message?: string })?.message || 'Failed to resolve CINs.'),
      },
      { status: 500 }
    );
  }
}
