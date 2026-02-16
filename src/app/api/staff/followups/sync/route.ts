import { NextRequest, NextResponse } from 'next/server';
import '@/ai/firebase';
import * as admin from 'firebase-admin';
import { getCaspioCredentialsFromEnv, getCaspioToken, fetchCaspioRecords } from '@/lib/caspio-api-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const asIso = (value: any): string => {
  try {
    const d = value?.toDate?.() || new Date(value);
    const ms = d?.getTime?.();
    return Number.isNaN(ms) ? '' : new Date(ms).toISOString();
  } catch {
    return '';
  }
};

const normalizeString = (value: any) => String(value || '').trim();
const normalizeLower = (value: any) => normalizeString(value).toLowerCase();

const escapeQuotes = (value: string) => value.replace(/'/g, "''");

const safeIso = (value: any) => {
  const iso = asIso(value);
  return iso && iso.length >= 10 ? iso : '';
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const userId = normalizeString(body?.userId);
    const start = normalizeString(body?.start);
    const end = normalizeString(body?.end);
    const modeRaw = normalizeString(body?.mode);
    const mode: 'auto' | 'full' | 'incremental' =
      modeRaw === 'full' || modeRaw === 'incremental' ? (modeRaw as any) : 'auto';

    if (!userId) {
      return NextResponse.json({ success: false, error: 'userId is required' }, { status: 400 });
    }

    const firestore = admin.firestore();
    const syncRef = firestore.collection('staff_followups_sync').doc(userId);
    const syncSnap = await syncRef.get().catch(() => null);
    const syncData = syncSnap?.exists ? syncSnap.data() : null;
    const lastCursorIso = safeIso((syncData as any)?.lastCursorIso);
    const lastSyncAtIso = safeIso((syncData as any)?.lastSyncAt?.toDate?.() || (syncData as any)?.lastSyncAt);

    const userSnap = await firestore.collection('users').doc(userId).get().catch(() => null);
    const userData = userSnap?.exists ? userSnap.data() : null;

    const staffEmail = normalizeLower((userData as any)?.email);
    const staffFirstName = normalizeString((userData as any)?.firstName);
    const staffDisplay = normalizeString((userData as any)?.displayName);
    const staffFullName = normalizeString(
      (userData as any)?.firstName
        ? `${(userData as any)?.firstName || ''} ${(userData as any)?.lastName || ''}`
        : staffDisplay
    );

    const assignmentCandidates = Array.from(
      new Set(
        [userId, staffEmail, staffFirstName, staffFullName, staffDisplay]
          .filter(Boolean)
          .map((v) => normalizeString(v))
          .filter(Boolean)
      )
    );

    if (assignmentCandidates.length === 0) {
      return NextResponse.json({ success: true, synced: 0, message: 'No assignment identifiers found' });
    }

    const startMs = start ? new Date(start).getTime() : null;
    const endMs = end ? new Date(end).getTime() : null;

    const credentials = getCaspioCredentialsFromEnv();
    const accessToken = await getCaspioToken(credentials);

    const shouldIncremental =
      mode === 'incremental' ||
      (mode === 'auto' && Boolean(lastCursorIso || lastSyncAtIso));

    // Use lastCursorIso when available. Add a small lookback window to catch late edits.
    const lookbackMs = 24 * 60 * 60 * 1000;
    const sinceIso = shouldIncremental
      ? (() => {
          const base = lastCursorIso || lastSyncAtIso;
          if (!base) return '';
          try {
            const ms = new Date(base).getTime();
            if (Number.isNaN(ms)) return '';
            return new Date(ms - lookbackMs).toISOString();
          } catch {
            return '';
          }
        })()
      : '';

    // Pull only follow-up notes (Open) that have a follow-up date.
    // Filter by Follow_Up_Assignment == candidate. Date range filtering is applied in-process
    // because Caspio where clause formatting for dates varies by environment.
    const table = 'connect_tbl_clientnotes';
    const limit = 1000;

    const allNotes: any[] = [];
    for (const candidate of assignmentCandidates) {
      const baseWhere = `Follow_Up_Assignment='${escapeQuotes(candidate)}' AND Follow_Up_Status<>'Closed' AND Follow_Up_Date IS NOT NULL`;
      const where = sinceIso
        ? `${baseWhere} AND Time_Stamp >= '${escapeQuotes(sinceIso)}'`
        : baseWhere;
      const rows = await fetchCaspioRecords(credentials, accessToken, table, where, limit);
      allNotes.push(...rows);
    }

    // Build client name lookup for any clientId2 values we saw.
    const clientIds = Array.from(
      new Set(allNotes.map((r) => normalizeString(r.Client_ID2)).filter(Boolean))
    );

    const clientLookup = new Map<string, { seniorFullName: string }>();
    if (clientIds.length > 0) {
      // Caspio doesn't support IN queries well; fetch in chunks of 25 with OR.
      const chunkSize = 25;
      for (let i = 0; i < clientIds.length; i += chunkSize) {
        const chunk = clientIds.slice(i, i + chunkSize);
        const where = chunk.map((id) => `Client_ID2='${escapeQuotes(id)}'`).join(' OR ');
        const url = `${credentials.baseUrl}/rest/v2/tables/connect_tbl_clients/records?q.where=${encodeURIComponent(where)}&q.pageSize=1000&q.pageNumber=1`;
        const resp = await fetch(url, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        });
        if (!resp.ok) continue;
        const data = await resp.json().catch(() => null);
        const rows = data?.Result || [];
        rows.forEach((c: any) => {
          const cid = normalizeString(c.Client_ID2);
          if (!cid) return;
          const name =
            normalizeString(c.Senior_Full_Name) ||
            `${normalizeString(c.Senior_First)} ${normalizeString(c.Senior_Last)}`.trim();
          clientLookup.set(cid, { seniorFullName: name });
        });
      }
    }

    const inRange = (raw: any) => {
      const iso = asIso(raw);
      if (!iso) return false;
      const ms = new Date(iso).getTime();
      if (Number.isNaN(ms)) return false;
      if (startMs && ms < startMs) return false;
      if (endMs && ms > endMs) return false;
      return true;
    };

    // Upsert into Firestore cache (`client_notes/{noteId}`), regardless of whether this client
    // exists in the app. This enables Caspio-only members.
    const notesToWrite = allNotes
      .filter((r) => normalizeString(r.Note_ID))
      .filter((r) => inRange(r.Follow_Up_Date))
      .map((r) => {
        const noteId = normalizeString(r.Note_ID);
        const clientId2 = normalizeString(r.Client_ID2);
        const memberName = clientLookup.get(clientId2)?.seniorFullName || `Client ${clientId2}`.trim();
        return {
          id: noteId,
          noteId,
          clientId2,
          userId: normalizeString(r.User_ID),
          comments: normalizeString(r.Comments),
          timeStamp: normalizeString(r.Time_Stamp),
          followUpDate: normalizeString(r.Follow_Up_Date),
          followUpAssignment: normalizeString(r.Follow_Up_Assignment),
          followUpStatus: normalizeString(r.Follow_Up_Status) || 'Open',
          memberName,
          syncedAt: admin.firestore.FieldValue.serverTimestamp(),
          syncedFrom: 'caspio_on_demand',
        };
      });

    // Deduplicate by noteId.
    const uniqueByNoteId = Array.from(
      new Map(notesToWrite.map((n) => [n.noteId, n])).values()
    );

    const nextCursorIso = (() => {
      // Prefer Caspio Time_Stamp as cursor. If missing, fallback to now.
      const maxIso = uniqueByNoteId
        .map((n) => safeIso(n.timeStamp))
        .filter(Boolean)
        .sort()
        .slice(-1)[0];
      return maxIso || new Date().toISOString();
    })();

    const batchSize = 450;
    let written = 0;
    for (let i = 0; i < uniqueByNoteId.length; i += batchSize) {
      const batch = firestore.batch();
      const slice = uniqueByNoteId.slice(i, i + batchSize);
      slice.forEach((n) => {
        const ref = firestore.doc(`client_notes/${n.noteId}`);
        batch.set(ref, n, { merge: true });
      });
      await batch.commit();
      written += slice.length;
    }

    await syncRef.set(
      {
        userId,
        lastSyncAt: admin.firestore.FieldValue.serverTimestamp(),
        lastCursorIso: nextCursorIso,
        lastMode: sinceIso ? 'incremental' : 'full',
        lastWindowStart: start || null,
        lastWindowEnd: end || null,
        lastSyncedCount: written,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({
      success: true,
      synced: written,
      assignmentsChecked: assignmentCandidates.length,
      mode: sinceIso ? 'incremental' : 'full',
      sinceIso: sinceIso || null,
      nextCursorIso,
      message: `Synced ${written} follow-up notes from Caspio`,
    });
  } catch (error: any) {
    console.error('❌ followups sync error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to sync follow-ups' },
      { status: 500 }
    );
  }
}

