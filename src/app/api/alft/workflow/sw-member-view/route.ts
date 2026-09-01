import { NextRequest, NextResponse } from 'next/server';
import { sendAlftWorkflowStartEmail } from '@/app/actions/send-email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  idToken?: string;
  memberId?: string;
};

const clean = (v: unknown, max = 500) => String(v ?? '').trim().slice(0, max);

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const idToken = clean(body?.idToken, 12000);
    const memberId = clean(body?.memberId, 220);
    if (!idToken || !memberId) {
      return NextResponse.json({ success: false, error: 'Missing idToken or memberId' }, { status: 400 });
    }

    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;
    const adminDb = adminModule.adminDb;

    const decoded = await admin.auth().verifyIdToken(idToken);
    const uid = clean(decoded?.uid, 128);
    const email = clean((decoded as any)?.email, 220).toLowerCase();
    const name = clean((decoded as any)?.name, 160) || email || 'Social Worker';
    if (!uid) return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 });

    const assignmentRef = adminDb.collection('alft_assignments').doc(memberId);
    const assignmentSnap = await assignmentRef.get();
    if (!assignmentSnap.exists) return NextResponse.json({ success: false, error: 'Assignment not found' }, { status: 404 });
    const assignment = assignmentSnap.data() || {};

    const assignedSwUid = clean((assignment as any)?.assignedSwUid, 128);
    const assignedSwEmail = clean((assignment as any)?.assignedSwEmail, 220).toLowerCase();
    const assignedSwName = clean((assignment as any)?.assignedSwName, 160) || name;
    if ((assignedSwUid && assignedSwUid !== uid) || (assignedSwEmail && assignedSwEmail !== email)) {
      return NextResponse.json({ success: false, error: 'Not your ALFT assignment' }, { status: 403 });
    }

    const nowMs = Date.now();
    const reminderCooldownMs = 24 * 60 * 60 * 1000;
    const lastReminderMs =
      ((assignment as any)?.swPortalReminderSentAt?.toMillis?.() as number | undefined) ||
      new Date(String((assignment as any)?.swPortalReminderSentAt || 0)).getTime() ||
      0;
    const shouldSendReminder = !lastReminderMs || nowMs - lastReminderMs >= reminderCooldownMs;

    let reminderEmailSent = false;
    if (shouldSendReminder && assignedSwEmail) {
      try {
        await sendAlftWorkflowStartEmail({
          to: assignedSwEmail,
          socialWorkerName: assignedSwName,
          memberName: clean((assignment as any)?.memberName, 180) || 'Member',
          mrn: clean((assignment as any)?.memberMrn, 80) || undefined,
          portalUrl: '/sw-portal/alft-upload',
          assignedBy: clean((assignment as any)?.assignedByName, 160) || 'ALFT Manager',
          assignedByEmail: clean((assignment as any)?.assignedByEmail, 220) || undefined,
          assignedByPhone: clean((assignment as any)?.assignedByPhone, 80) || undefined,
        });
        reminderEmailSent = true;
      } catch {
        reminderEmailSent = false;
      }
    }

    const alreadyViewed = Boolean(
      (assignment as any)?.swPortalLastViewedAt || (assignment as any)?.swPortalFirstViewedAt
    );

    await assignmentRef.set(
      {
        swPortalLastViewedAt: admin.firestore.FieldValue.serverTimestamp(),
        swPortalLastViewedByUid: uid,
        swPortalLastViewedByEmail: email || null,
        swPortalLastViewedByName: name || null,
        ...(alreadyViewed
          ? {}
          : {
              swPortalFirstViewedAt: admin.firestore.FieldValue.serverTimestamp(),
              ispWorkflowActivityLog: admin.firestore.FieldValue.arrayUnion({
                event: 'sw_viewed',
                atIso: new Date().toISOString(),
                byName: name || null,
                byEmail: email || null,
              }),
            }),
        ...(reminderEmailSent
          ? { swPortalReminderSentAt: admin.firestore.FieldValue.serverTimestamp() }
          : {}),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ success: true, reminderEmailSent });
  } catch (e: any) {
    console.error('[alft/workflow/sw-member-view] error', e);
    return NextResponse.json({ success: false, error: e?.message || 'Failed to process member view event' }, { status: 500 });
  }
}

