import { NextRequest, NextResponse } from 'next/server';
// DO NOT MOVE THIS IMPORT. It must be early to initialize Firebase Admin.
import '@/ai/firebase';
import * as admin from 'firebase-admin';

type GlobalFollowupNote = {
  source: 'caspio_client_notes_cache';
  noteId: string;
  clientId2: string;
  memberName: string;
  followUpAssignment: string;
  followUpStatus: string;
  followUpDate: string;
  dueDateIso: string;
  isOverdue: boolean;
  comments: string;
  timeStamp: string;
  actionUrl: string;
};

const normalizeString = (v: any) => String(v ?? '').trim();

const parseDateToIso = (raw: string): string => {
  const s = normalizeString(raw);
  if (!s) return '';

  // ISO-ish / Date.parse-friendly.
  const direct = new Date(s);
  if (!Number.isNaN(direct.getTime())) return direct.toISOString();

  // Common Caspio format: M/D/YYYY or MM/DD/YYYY
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?:\s*(AM|PM))?)?$/i);
  if (mdy) {
    const mm = Number(mdy[1]);
    const dd = Number(mdy[2]);
    let yyyy = Number(mdy[3]);
    if (yyyy < 100) yyyy += 2000;
    let hh = mdy[4] ? Number(mdy[4]) : 0;
    const min = mdy[5] ? Number(mdy[5]) : 0;
    const ampm = (mdy[6] || '').toUpperCase();
    if (ampm === 'PM' && hh < 12) hh += 12;
    if (ampm === 'AM' && hh === 12) hh = 0;
    const d = new Date(yyyy, mm - 1, dd, hh, min, 0, 0);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }

  // YYYY-MM-DD
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) {
    const d = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]), 0, 0, 0, 0);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }

  return '';
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limitRaw = Number(searchParams.get('limit') || 5000);
    const limit = Math.max(1, Math.min(20000, Number.isFinite(limitRaw) ? limitRaw : 5000));
    const overdueOnly = searchParams.get('overdue') === 'true';
    const assignmentFilter = normalizeString(searchParams.get('assignment'));
    const q = normalizeString(searchParams.get('q')).toLowerCase();

    const firestore = admin.firestore();
    const now = Date.now();

    // Scan cache by document ID (fast, avoids brittle date ordering).
    const pageSize = 1000;
    const notes: GlobalFollowupNote[] = [];
    let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;

    while (notes.length < limit) {
      let query = firestore.collection('client_notes').orderBy(admin.firestore.FieldPath.documentId()).limit(pageSize);
      if (lastDoc) query = query.startAfter(lastDoc);
      const snap = await query.get();
      if (snap.empty) break;

      for (const docSnap of snap.docs) {
        const data: any = docSnap.data() || {};
        if (Boolean(data.deleted)) continue;

        const followUpAssignment = normalizeString(data.followUpAssignment);
        if (!followUpAssignment) continue; // Only show assigned follow-ups

        const statusRaw = normalizeString(data.followUpStatus) || 'Open';
        const statusLower = statusRaw.toLowerCase();
        if (statusLower === 'closed') continue;

        if (assignmentFilter && followUpAssignment !== assignmentFilter) continue;

        const followUpDate = normalizeString(data.followUpDate);
        const dueIso = parseDateToIso(followUpDate) || parseDateToIso(normalizeString(data.timeStamp));
        if (!dueIso) continue;

        const dueMs = new Date(dueIso).getTime();
        const isOverdue = Number.isFinite(dueMs) ? dueMs < now : false;
        if (overdueOnly && !isOverdue) continue;

        const clientId2 = normalizeString(data.clientId2);
        const memberName =
          normalizeString(data.memberName) ||
          normalizeString(data.seniorFullName) ||
          (clientId2 ? `Client ${clientId2}` : 'Client');

        const comments = normalizeString(data.comments);

        if (q) {
          const hay = `${memberName} ${clientId2} ${followUpAssignment} ${comments}`.toLowerCase();
          if (!hay.includes(q)) continue;
        }

        notes.push({
          source: 'caspio_client_notes_cache',
          noteId: normalizeString(data.noteId) || docSnap.id,
          clientId2,
          memberName,
          followUpAssignment,
          followUpStatus: statusRaw,
          followUpDate,
          dueDateIso: dueIso,
          isOverdue,
          comments,
          timeStamp: normalizeString(data.timeStamp),
          actionUrl: clientId2
            ? `/admin/client-notes?clientId2=${encodeURIComponent(clientId2)}&noteId=${encodeURIComponent(normalizeString(data.noteId) || docSnap.id)}`
            : '/admin/client-notes',
        });

        if (notes.length >= limit) break;
      }

      lastDoc = snap.docs[snap.docs.length - 1] || null;
      if (snap.size < pageSize) break;
      if (!lastDoc) break;
    }

    // Sort by due date (oldest first) for cleanup workflows.
    notes.sort((a, b) => new Date(a.dueDateIso).getTime() - new Date(b.dueDateIso).getTime());

    const assignments = Array.from(new Set(notes.map((n) => n.followUpAssignment).filter(Boolean))).sort();

    return NextResponse.json({
      success: true,
      total: notes.length,
      assignments,
      notes,
    });
  } catch (error: any) {
    console.error('Error loading global follow-ups:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to load global follow-ups', notes: [], assignments: [], total: 0 },
      { status: 500 }
    );
  }
}

