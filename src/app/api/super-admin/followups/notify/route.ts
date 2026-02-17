import { NextRequest, NextResponse } from 'next/server';
// DO NOT MOVE THIS IMPORT. It must be early to initialize Firebase Admin.
import '@/ai/firebase';
import * as admin from 'firebase-admin';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';

const normalizeString = (v: any) => String(v ?? '').trim();
const normalizeLower = (v: any) => normalizeString(v).toLowerCase();

async function isSuperAdminUid(uid: string, email?: string | null) {
  try {
    if (email && isHardcodedAdminEmail(email)) return true;
    const firestore = admin.firestore();
    const snap = await firestore.collection('roles_super_admin').doc(uid).get();
    if (snap.exists) return true;
    const e = normalizeLower(email);
    if (e) {
      const snapByEmail = await firestore.collection('roles_super_admin').doc(e).get();
      return snapByEmail.exists;
    }
  } catch {
    // fall through
  }
  return false;
}

async function resolveStaffUidByAssignment(assignmentRaw: string) {
  const assignment = normalizeString(assignmentRaw);
  const assignmentLower = assignment.toLowerCase();
  if (!assignment) return null;

  const firestore = admin.firestore();

  // 1) If assignment is already a UID (users doc id), accept it.
  try {
    const byId = await firestore.collection('users').doc(assignment).get();
    if (byId.exists) return assignment;
  } catch {
    // ignore
  }

  // 2) Email exact match (stored lowercase in admin-session route).
  if (assignmentLower.includes('@')) {
    try {
      const snap = await firestore.collection('users').where('email', '==', assignmentLower).limit(2).get();
      const doc = snap.docs[0];
      if (doc?.id) return doc.id;
    } catch {
      // ignore
    }
  }

  // 3) Small staff scan fallback (case-insensitive).
  try {
    const snap = await firestore.collection('users').where('isStaff', '==', true).limit(2000).get();
    const match = snap.docs.find((d) => {
      const data: any = d.data() || {};
      const email = normalizeLower(data.email);
      const display = normalizeLower(data.displayName);
      const first = normalizeLower(data.firstName);
      const last = normalizeLower(data.lastName);
      const full = normalizeLower(first && last ? `${first} ${last}` : '');
      return (
        assignmentLower === email ||
        assignmentLower === display ||
        assignmentLower === first ||
        assignmentLower === last ||
        (full && assignmentLower === full)
      );
    });
    if (match?.id) return match.id;
  } catch {
    // ignore
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const idToken = normalizeString(body?.idToken);
    const noteId = normalizeString(body?.noteId);
    const clientId2 = normalizeString(body?.clientId2);
    const memberName = normalizeString(body?.memberName);
    const followUpAssignment = normalizeString(body?.followUpAssignment);
    const message = normalizeString(body?.message);
    const priorityRaw = normalizeString(body?.priority) || 'General';
    const dueDateIso = normalizeString(body?.dueDateIso);

    if (!idToken) return NextResponse.json({ success: false, error: 'Missing idToken' }, { status: 400 });
    if (!noteId || !clientId2) return NextResponse.json({ success: false, error: 'Missing noteId/clientId2' }, { status: 400 });
    if (!followUpAssignment) return NextResponse.json({ success: false, error: 'Missing followUpAssignment' }, { status: 400 });
    if (!message) return NextResponse.json({ success: false, error: 'Message is required' }, { status: 400 });

    const decoded = await admin.auth().verifyIdToken(idToken);
    const actorUid = decoded.uid;
    const actorEmail = decoded.email ? String(decoded.email).toLowerCase() : '';
    const actorName = decoded.name || actorEmail || 'Super Admin';

    const allowed = await isSuperAdminUid(actorUid, actorEmail);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Super Admin access required' }, { status: 403 });
    }

    const recipientUid = await resolveStaffUidByAssignment(followUpAssignment);
    if (!recipientUid) {
      return NextResponse.json(
        { success: false, error: `Could not resolve staff user for assignment: ${followUpAssignment}` },
        { status: 404 }
      );
    }

    const normalizePriority = (value: string) => {
      const s = value.toLowerCase();
      if (s.includes('urgent')) return 'Urgent';
      if (s.includes('priority') || s.includes('high') || s.includes('immediate')) return 'Priority';
      return 'General';
    };
    const priority = normalizePriority(priorityRaw);

    const dueTs = (() => {
      if (!dueDateIso) return null;
      const d = new Date(dueDateIso);
      if (Number.isNaN(d.getTime())) return null;
      return admin.firestore.Timestamp.fromDate(d);
    })();

    const notification = {
      userId: recipientUid,
      noteId,
      clientId2,
      title: `Follow-up reminder: ${memberName || clientId2}`,
      message,
      senderName: actorName,
      senderEmail: actorEmail,
      memberName: memberName || `Client ${clientId2}`,
      type: 'follow_up_reminder',
      priority,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      isRead: false,
      source: 'super_admin',
      followUpRequired: true,
      ...(dueTs ? { followUpDate: dueTs } : {}),
    };

    await admin.firestore().collection('staff_notifications').add(notification);

    return NextResponse.json({
      success: true,
      recipientUid,
    });
  } catch (error: any) {
    console.error('Error sending follow-up reminder:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to send reminder' },
      { status: 500 }
    );
  }
}

