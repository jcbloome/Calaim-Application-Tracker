import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/firebase-admin';
import { FieldPath } from 'firebase-admin/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (v: unknown, max = 300) => String(v ?? '').trim().slice(0, max);

function toIso(value: any): string {
  try {
    const d = value?.toDate?.() || new Date(value);
    const ms = d?.getTime?.();
    if (!ms || Number.isNaN(ms)) return '';
    return new Date(ms).toISOString();
  } catch {
    return '';
  }
}

async function fetchAllDocs(
  baseQuery: FirebaseFirestore.Query,
  opts?: { pageSize?: number; maxItems?: number }
): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  const pageSize = Math.max(1, Math.min(1000, Number(opts?.pageSize || 500)));
  const maxItems = Math.max(1, Number(opts?.maxItems || 5000));

  const docs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  let last: FirebaseFirestore.QueryDocumentSnapshot | null = null;

  while (docs.length < maxItems) {
    let q = baseQuery.limit(pageSize);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    docs.push(...snap.docs);
    if (snap.size < pageSize) break;
    last = snap.docs[snap.docs.length - 1] || null;
    if (!last) break;
  }

  return docs.slice(0, maxItems);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = clean(searchParams.get('userId'));
    const includeClosed = clean(searchParams.get('includeClosed')).toLowerCase() === 'true';
    const onlyDated = clean(searchParams.get('onlyDated')).toLowerCase() === 'true'; // default false
    const kaiserOnly = clean(searchParams.get('kaiserOnly')).toLowerCase() === 'true';
    const maxItems = Math.max(1, Math.min(5000, Number(searchParams.get('max') || 2000)));

    if (!userId) {
      return NextResponse.json({ success: false, error: 'userId is required' }, { status: 400 });
    }

    const userSnap = await adminDb.collection('users').doc(userId).get().catch(() => null);
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

    const byId = new Map<string, any>();
    const seen = new Set<string>();
    for (const candidate of assignmentCandidates) {
      const docs = await fetchAllDocs(
        adminDb
          .collection('client_notes')
          .where('followUpAssignment', '==', candidate)
          .orderBy(FieldPath.documentId()),
        { pageSize: 500, maxItems }
      ).catch(() => []);

      docs.forEach((docSnap) => {
        if (seen.has(docSnap.id)) return;
        seen.add(docSnap.id);
        const data = docSnap.data() || {};
        if (Boolean((data as any)?.deleted)) return;

        const followUpStatus = clean((data as any)?.followUpStatus, 80);
        const isClosed = followUpStatus.toLowerCase() === 'closed';
        if (!includeClosed && isClosed) return;

        const followUpDate = (data as any)?.followUpDate;
        if (onlyDated && !followUpDate) return;

        const timeStampRaw = (data as any)?.timeStamp;
        const timeStampIso = toIso(timeStampRaw) || clean(timeStampRaw, 40);

        const noteId = clean((data as any)?.noteId || docSnap.id, 100) || docSnap.id;
        const senderName = clean(
          (data as any)?.senderName ||
            (data as any)?.userFullName ||
            (data as any)?.createdByName ||
            (data as any)?.createdBy ||
            '',
          200
        );
        byId.set(noteId, {
          id: noteId,
          noteId,
          clientId2: clean((data as any)?.clientId2, 60),
          memberName: clean((data as any)?.memberName, 200),
          comments: clean((data as any)?.comments, 4000),
          timeStamp: timeStampIso,
          followUpDate: toIso(followUpDate) || clean(followUpDate, 40),
          followUpAssignment: clean((data as any)?.followUpAssignment, 200),
          followUpStatus: followUpStatus || 'Open',
          senderName,
          syncedAt: toIso((data as any)?.syncedAt) || '',
        });
      });
    }

    const toMs = (iso: string) => {
      try {
        const ms = new Date(String(iso || '')).getTime();
        return Number.isNaN(ms) ? 0 : ms;
      } catch {
        return 0;
      }
    };

    // Sort newest note first (created/Time_Stamp), regardless of follow-up date.
    const baseNotes = Array.from(byId.values()).sort((a, b) => toMs(b.timeStamp) - toMs(a.timeStamp));

    // Join Kaiser status/MCO from Caspio members cache to support Kaiser-only follow-up triage.
    const clientIds = Array.from(
      new Set(baseNotes.map((n) => clean((n as any)?.clientId2, 60)).filter(Boolean))
    );
    const memberByClientId2 = new Map<string, any>();
    if (clientIds.length > 0) {
      const chunkSize = 200;
      for (let i = 0; i < clientIds.length; i += chunkSize) {
        const chunk = clientIds.slice(i, i + chunkSize);
        const refs = chunk.map((id) => adminDb.collection('caspio_members_cache').doc(id));
        const snaps = await (adminDb as any).getAll(...refs).catch(() => []);
        (snaps || []).forEach((snap: any) => {
          if (!snap?.exists) return;
          memberByClientId2.set(String(snap.id), snap.data() || {});
        });
      }
    }

    const joinedNotes = baseNotes.map((n: any) => {
      const clientId2 = clean(n?.clientId2, 60);
      const member = clientId2 ? memberByClientId2.get(clientId2) : null;
      const calaimMco = clean(member?.CalAIM_MCO, 80);
      const kaiserStatus = clean(member?.Kaiser_Status || member?.Kaiser_ID_Status || '', 140);
      return {
        ...n,
        calaimMco: calaimMco || undefined,
        isKaiser: calaimMco.toLowerCase() === 'kaiser',
        kaiserStatus: kaiserStatus || undefined,
      };
    });

    const notes = kaiserOnly ? joinedNotes.filter((n: any) => Boolean(n?.isKaiser)) : joinedNotes;

    return NextResponse.json({
      success: true,
      notes,
      assignmentsChecked: assignmentCandidates.length,
      count: notes.length,
      kaiserOnly,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to load follow-up notes' }, { status: 500 });
  }
}

