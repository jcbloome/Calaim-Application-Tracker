import { NextRequest, NextResponse } from 'next/server';
import '@/ai/firebase';
import * as admin from 'firebase-admin';
import { getCaspioCredentialsFromEnv, getCaspioToken, fetchCaspioRecords } from '@/lib/caspio-api-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (v: unknown, max = 240) => String(v ?? '').trim().slice(0, max);
const escapeQuotes = (value: string) => value.replace(/'/g, "''");

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const userId = clean(body?.userId);
    const dryRun = Boolean(body?.dryRun);
    const maxScan = Math.max(1, Math.min(20_000, Number(body?.maxScan || 5000)));

    if (!userId) {
      return NextResponse.json({ success: false, error: 'userId is required' }, { status: 400 });
    }

    const firestore = admin.firestore();
    const userSnap = await firestore.collection('users').doc(userId).get().catch(() => null);
    const userData = userSnap?.exists ? userSnap.data() : null;

    const staffEmail = clean((userData as any)?.email, 200).toLowerCase();
    const staffFirstName = clean((userData as any)?.firstName, 80);
    const staffDisplay = clean((userData as any)?.displayName, 140);
    const staffFullName = clean(
      (userData as any)?.firstName
        ? `${clean((userData as any)?.firstName, 80)} ${clean((userData as any)?.lastName, 80)}`.trim()
        : staffDisplay,
      180
    );

    const assignmentCandidates = Array.from(
      new Set([userId, staffEmail, staffFirstName, staffFullName, staffDisplay].filter(Boolean).map((v) => clean(v, 200)).filter(Boolean))
    );

    if (assignmentCandidates.length === 0) {
      return NextResponse.json({ success: true, scanned: 0, closed: 0, message: 'No assignment identifiers found' });
    }

    const credentials = getCaspioCredentialsFromEnv();
    const accessToken = await getCaspioToken(credentials);

    const table = 'connect_tbl_clientnotes';
    const limit = Math.max(1, Math.min(1000, Number(body?.pageLimit || 1000)));

    const openNoDateNoteIds: string[] = [];
    for (const candidate of assignmentCandidates) {
      if (openNoDateNoteIds.length >= maxScan) break;
      // Open notes assigned to staff with NO follow-up date.
      const where =
        `Follow_Up_Assignment='${escapeQuotes(candidate)}'` +
        ` AND Follow_Up_Status<>'Closed'` +
        ` AND (Follow_Up_Date IS NULL OR Follow_Up_Date='')`;
      const rows = await fetchCaspioRecords(credentials, accessToken, table, where, limit).catch(() => []);
      rows.forEach((r: any) => {
        const id = clean(r?.Note_ID, 60);
        if (!id) return;
        if (openNoDateNoteIds.length >= maxScan) return;
        openNoDateNoteIds.push(id);
      });
    }

    const unique = Array.from(new Set(openNoDateNoteIds));
    if (dryRun) {
      return NextResponse.json({
        success: true,
        scanned: unique.length,
        closed: 0,
        dryRun: true,
        assignmentsChecked: assignmentCandidates.length,
        message: `Found ${unique.length} open notes without follow-up date`,
      });
    }

    // Bulk update in Caspio by OR chunks.
    const baseUrl = credentials.baseUrl;
    const chunkSize = 25;
    let closed = 0;
    for (let i = 0; i < unique.length; i += chunkSize) {
      const chunk = unique.slice(i, i + chunkSize);
      const where = chunk.map((id) => `Note_ID='${escapeQuotes(id)}'`).join(' OR ');
      const url = `${baseUrl}/rest/v2/tables/${table}/records?q.where=${encodeURIComponent(where)}`;

      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ Follow_Up_Status: 'Closed' }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Failed to close notes in Caspio (${res.status}): ${txt || res.statusText}`);
      }

      closed += chunk.length;

      // Mirror to Firestore cache so tasks stop showing them.
      const batch = firestore.batch();
      chunk.forEach((id) => {
        const ref = firestore.doc(`client_notes/${id}`);
        batch.set(
          ref,
          {
            followUpStatus: 'Closed',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      });
      await batch.commit();
    }

    return NextResponse.json({
      success: true,
      scanned: unique.length,
      closed,
      assignmentsChecked: assignmentCandidates.length,
      message: `Closed ${closed} open notes without follow-up date`,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Cleanup failed' }, { status: 500 });
  }
}

