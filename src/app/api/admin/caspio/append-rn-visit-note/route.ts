import { NextRequest, NextResponse } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';
import {
  appendCaspioClientNote,
  isRnVisitScheduledStatus,
  isRnVisitSubmittedOrCompleteStatus,
} from '@/lib/caspio-client-notes';
import { adminAuth, adminDb } from '@/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (value: unknown, max = 400) => String(value ?? '').trim().slice(0, max);

async function assertStaff(idToken: string) {
  const decoded = await adminAuth.verifyIdToken(idToken);
  const uid = clean(decoded?.uid, 128);
  const email = clean(decoded?.email, 220).toLowerCase();
  if (!uid || !email) throw Object.assign(new Error('Invalid token'), { status: 401 });

  const [uidAdmin, emailAdmin, uidSuper, emailSuper, userDoc] = await Promise.all([
    adminDb.collection('roles_admin').doc(uid).get().catch(() => null),
    adminDb.collection('roles_admin').doc(email).get().catch(() => null),
    adminDb.collection('roles_super_admin').doc(uid).get().catch(() => null),
    adminDb.collection('roles_super_admin').doc(email).get().catch(() => null),
    adminDb.collection('users').doc(uid).get().catch(() => null),
  ]);
  const userData = userDoc?.exists ? (userDoc.data() as any) : null;
  const roleLabel = clean(userData?.role).toLowerCase();
  const isAdmin =
    isHardcodedAdminEmail(email) ||
    Boolean(uidAdmin?.exists || emailAdmin?.exists || uidSuper?.exists || emailSuper?.exists) ||
    Boolean(userData?.isKaiserStaff || userData?.isKaiserManager || userData?.isKaiserAssignmentManager) ||
    roleLabel.includes('kaiser') ||
    roleLabel.includes('admin');
  if (!isAdmin) throw Object.assign(new Error('Unauthorized'), { status: 403 });
  return {
    uid,
    email,
    displayName: clean(decoded.name, 160) || clean(userData?.displayName, 160) || email,
  };
}

/**
 * Append a Caspio client note for RN visit scheduled / submitted (pathway + ISP events).
 * Body: { idToken, clientId2?, applicationId?, comments?, event?: 'rn_visit_scheduled' | 'rn_visit_submitted', statusLabel? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      idToken?: string;
      clientId2?: string;
      applicationId?: string;
      comments?: string;
      event?: string;
      statusLabel?: string;
      assignedStaffId?: string;
      assignedStaffName?: string;
    };
    const idToken = clean(body.idToken, 4000);
    if (!idToken) {
      return NextResponse.json({ ok: false, error: 'idToken required' }, { status: 401 });
    }
    const actor = await assertStaff(idToken);

    let clientId2 = clean(body.clientId2, 80);
    let assignedStaffId = clean(body.assignedStaffId, 80);
    let assignedStaffName = clean(body.assignedStaffName, 160) || actor.displayName;
    const applicationId = clean(body.applicationId, 120);

    if (applicationId && !clientId2) {
      const appSnap = await adminDb.collection('applications').doc(applicationId).get().catch(() => null);
      const app = appSnap?.exists ? (appSnap.data() as any) : null;
      clientId2 = clean(
        app?.clientId2 || app?.client_ID2 || app?.caspioClientId2 || app?.memberClientId,
        80
      );
      assignedStaffId = assignedStaffId || clean(app?.assignedStaffId, 80);
      assignedStaffName =
        assignedStaffName || clean(app?.assignedStaffName, 160) || actor.displayName;
    }

    const event = clean(body.event, 60).toLowerCase();
    const statusLabel = clean(body.statusLabel, 120);
    let comments = clean(body.comments, 1800);

    if (!comments) {
      if (event === 'rn_visit_scheduled' || isRnVisitScheduledStatus(statusLabel)) {
        comments = [
          'RN/MSW visit scheduled.',
          statusLabel ? `Status: ${statusLabel}.` : '',
          `Recorded by: ${actor.displayName}.`,
          applicationId ? `Application ID: ${applicationId}.` : '',
        ]
          .filter(Boolean)
          .join(' ');
      } else if (event === 'rn_visit_submitted' || isRnVisitSubmittedOrCompleteStatus(statusLabel)) {
        comments = [
          'RN/MSW visit submitted / complete.',
          statusLabel ? `Status: ${statusLabel}.` : '',
          `Recorded by: ${actor.displayName}.`,
          applicationId ? `Application ID: ${applicationId}.` : '',
        ]
          .filter(Boolean)
          .join(' ');
      }
    }

    if (!comments) {
      return NextResponse.json({ ok: false, error: 'comments or known event/status required' }, { status: 400 });
    }

    const noteSync = await appendCaspioClientNote({
      clientId2,
      comments,
      preferredUserId: assignedStaffId || undefined,
      assignedStaffName: assignedStaffName || undefined,
      sourceTag: 'pathway-rn-visit',
    });

    if (applicationId) {
      await adminDb
        .collection('applications')
        .doc(applicationId)
        .set(
          {
            caspioRnVisitNoteLastAt: new Date().toISOString(),
            caspioRnVisitNoteLastEvent: event || statusLabel || 'note',
            caspioRnVisitNoteLastOk: Boolean(noteSync.success),
            lastUpdated: new Date(),
          },
          { merge: true }
        )
        .catch(() => null);
    }

    return NextResponse.json({ ok: noteSync.success, noteSync });
  } catch (error: any) {
    const status = Number(error?.status) || 500;
    return NextResponse.json({ ok: false, error: error?.message || 'Unknown error' }, { status });
  }
}
