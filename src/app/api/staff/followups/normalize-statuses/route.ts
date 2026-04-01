import { NextRequest, NextResponse } from 'next/server';
import '@/ai/firebase';
import * as admin from 'firebase-admin';
import { getCaspioCredentialsFromEnv, getCaspioToken } from '@/lib/caspio-api-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max);

type CaspioFollowUpRow = {
  PK_ID?: number;
  Note_ID?: string | number;
  Follow_Up_Status?: string;
  Note_Status?: string;
};

const fetchPagedRows = async (
  baseUrl: string,
  accessToken: string,
  whereClause: string,
  pageSize = 500,
  maxPages = 50
): Promise<CaspioFollowUpRow[]> => {
  const rows: CaspioFollowUpRow[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const url =
      `${baseUrl}/rest/v2/tables/connect_tbl_clientnotes/records` +
      `?q.where=${encodeURIComponent(whereClause)}` +
      `&q.orderBy=${encodeURIComponent('PK_ID ASC')}` +
      `&q.pageSize=${pageSize}` +
      `&q.pageNumber=${page}`;

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Failed to read Caspio rows (${res.status}): ${txt || res.statusText}`);
    }

    const data = await res.json().catch(() => ({}));
    const pageRows = Array.isArray(data?.Result) ? (data.Result as CaspioFollowUpRow[]) : [];
    if (pageRows.length === 0) break;
    rows.push(...pageRows);
    if (pageRows.length < pageSize) break;
  }
  return rows;
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({} as any));
    const actorName = clean(body?.actorName, 120) || 'Admin';
    const actorEmail = clean(body?.actorEmail, 200);

    const credentials = getCaspioCredentialsFromEnv();
    const accessToken = await getCaspioToken(credentials);
    const baseUrl = credentials.baseUrl;

    const isClosedLike = (value: unknown) => {
      const normalized = String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
      return normalized === 'close' || normalized === 'closed' || normalized.includes('closed');
    };
    const isCanonicalFollowUpClosed = (value: unknown) => {
      const normalized = String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
      return normalized === '🔴 closed';
    };

    // One-time migration target: legacy close/closed variants.
    const candidateRows = await fetchPagedRows(
      baseUrl,
      accessToken,
      `Follow_Up_Status='Close' OR Follow_Up_Status='Closed' OR Follow_Up_Status='🔴Closed' OR Note_Status='Close'`,
      500,
      50
    );
    const legacyRows = candidateRows.filter((row) => {
      const noteStatus = String(row?.Note_Status || '').trim();
      const followUpStatus = String(row?.Follow_Up_Status || '').trim();
      const noteNeedsFix = isClosedLike(noteStatus) && String(noteStatus).toLowerCase() !== 'closed';
      const followUpNeedsFix = isClosedLike(followUpStatus) && !isCanonicalFollowUpClosed(followUpStatus);
      return noteNeedsFix || followUpNeedsFix;
    });

    let updated = 0;
    const firestore = admin.firestore();
    const batchSize = 100;

    for (let i = 0; i < legacyRows.length; i += batchSize) {
      const slice = legacyRows.slice(i, i + batchSize);
      // Update Caspio one-by-one by PK_ID for safest targeting.
      for (const row of slice) {
        const pkId = Number(row?.PK_ID || 0);
        if (!Number.isFinite(pkId) || pkId <= 0) continue;
        const updateUrl =
          `${baseUrl}/rest/v2/tables/connect_tbl_clientnotes/records` +
          `?q.where=${encodeURIComponent(`PK_ID=${pkId}`)}`;
        const res = await fetch(updateUrl, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            Follow_Up_Status: '🔴 Closed',
            Note_Status: 'Closed',
          }),
        });
        if (!res.ok) continue;
        updated += 1;
      }

      // Best-effort Firestore cache refresh for changed note docs.
      const writeBatch = firestore.batch();
      slice.forEach((row) => {
        const noteId = clean(row?.Note_ID, 80);
        if (!noteId) return;
        const ref = firestore.doc(`client_notes/${noteId}`);
        writeBatch.set(
          ref,
          {
            followUpStatus: '🔴 Closed',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            normalizedBy: actorName,
            normalizedByEmail: actorEmail || null,
          },
          { merge: true }
        );
      });
      await writeBatch.commit();
    }

    return NextResponse.json({
      success: true,
      scanned: candidateRows.length,
      updated,
      message: `Normalized ${updated} legacy close/closed status value(s) to 🔴 Closed.`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to normalize legacy follow-up statuses' },
      { status: 500 }
    );
  }
}

