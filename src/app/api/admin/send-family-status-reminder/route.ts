import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { sendApplicationStatusEmail } from '@/app/actions/send-email';

let adminDb: any;
try {
  if (!getApps().length) {
    const app = initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || 'studio-2881432245-f1d94',
    });
    adminDb = getFirestore(app);
  } else {
    adminDb = getFirestore();
  }
} catch (error) {
  console.error('Firebase Admin initialization error:', error);
}

const toMs = (value: any): number => {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.toDate === 'function') {
    const ms = value.toDate().getTime();
    return Number.isNaN(ms) ? 0 : ms;
  }
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const d = new Date(value);
  const ms = d.getTime();
  return Number.isNaN(ms) ? 0 : ms;
};

export async function POST(request: NextRequest) {
  try {
    const {
      applicationId,
      userId,
      statusValue,
      deniedReason,
      trigger,
      sentByUid,
      sentByName,
      overrideEmail,
      previewOnly,
      testOnly,
    } = await request.json();

    if (!applicationId || !String(statusValue || '').trim()) {
      return NextResponse.json(
        { success: false, error: 'Application ID and status value are required' },
        { status: 400 }
      );
    }
    if (!adminDb) {
      return NextResponse.json({ success: false, error: 'Firebase Admin not configured' }, { status: 500 });
    }

    const mode = String(trigger || 'auto').toLowerCase() === 'manual' ? 'manual' : 'auto';
    const statusText = String(statusValue || '').trim();
    const reason = String(deniedReason || '').trim();
    const deniedSelected = /authorization denied/i.test(statusText);
    if (deniedSelected && !reason) {
      return NextResponse.json(
        { success: false, error: 'Denied reason is required for Authorization Denied status' },
        { status: 400 }
      );
    }

    const isAdminApp = applicationId.startsWith('admin_app_') || !userId;
    const docRef = isAdminApp
      ? adminDb.collection('applications').doc(applicationId)
      : adminDb.collection('users').doc(userId).collection('applications').doc(applicationId);

    const appSnap = await docRef.get();
    if (!appSnap.exists) {
      return NextResponse.json({ success: false, error: 'Application not found' }, { status: 404 });
    }
    const appData = appSnap.data() || {};
    const statusRemindersEnabled = Boolean(appData?.statusRemindersEnabled);
    if (mode === 'auto' && !statusRemindersEnabled) {
      return NextResponse.json({ success: true, skippedDisabled: true });
    }

    const recipientEmail = String(overrideEmail || appData?.referrerEmail || '').trim();
    if (!recipientEmail) {
      return NextResponse.json(
        { success: false, error: 'Referrer email is missing for this application' },
        { status: 400 }
      );
    }

    const nowMs = Date.now();
    const cooldownMs = 10 * 60 * 1000;
    const lastEmail = appData?.familyStatusLastEmail || {};
    const lastStatus = String(lastEmail?.status || '').trim();
    const lastReason = String(lastEmail?.reason || '').trim();
    const lastSentMs = toMs(lastEmail?.sentAtMs || lastEmail?.sentAt || lastEmail?.sentAtIso);
    const samePayload = lastStatus === statusText && lastReason === reason;
    if (mode !== 'manual' && samePayload && lastSentMs > 0 && nowMs - lastSentMs < cooldownMs) {
      return NextResponse.json({
        success: true,
        skippedDueToDedupe: true,
        cooldownMs,
      });
    }

    const memberName = `${String(appData?.memberFirstName || '').trim()} ${String(appData?.memberLastName || '').trim()}`.trim() || 'CalAIM Member';
    const referrerName = String(appData?.referrerName || '').trim() || 'there';
    const senderName = String(sentByName || '').trim() || 'The Connections Team';
    const subject = `Application progress update for ${memberName}`;
    const processingSelected = /cs summary submitted - processing/i.test(statusText);
    const message = deniedSelected
      ? `Application progress update: ${statusText}. Reason: ${reason}`
      : processingSelected
        ? 'We received your CS Summary and are now processing your application. Our team will contact you if we need anything else.'
      : `Application progress update: ${statusText}.`;

    if (Boolean(previewOnly)) {
      return NextResponse.json({
        success: true,
        preview: true,
        recipientEmail,
        referrerName,
        memberName,
        subject,
        statusText,
        deniedReason: reason,
        message,
      });
    }

    await sendApplicationStatusEmail({
      to: recipientEmail,
      includeBcc: false,
      subject,
      memberName: referrerName,
      staffName: senderName,
      message,
      status: 'In Progress',
    });

    if (Boolean(testOnly)) {
      return NextResponse.json({
        success: true,
        sent: true,
        testOnly: true,
        to: recipientEmail,
      });
    }

    const historyEntry = {
      status: statusText,
      reason,
      to: recipientEmail,
      sentAtMs: nowMs,
      sentAtIso: new Date(nowMs).toISOString(),
      sentByUid: String(sentByUid || '').trim(),
      sentByName: senderName,
      trigger: mode,
    };
    const existingHistory = Array.isArray(appData?.familyStatusReminderHistory)
      ? appData.familyStatusReminderHistory
      : [];
    const nextHistory = [historyEntry, ...existingHistory].slice(0, 50);

    await docRef.set(
      {
        familyStatusProgress: statusText,
        familyStatusDeniedReason: deniedSelected ? reason : '',
        familyStatusLastEmail: historyEntry,
        familyStatusReminderHistory: nextHistory,
        lastUpdated: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({
      success: true,
      sent: true,
      lastEmail: historyEntry,
      history: nextHistory.slice(0, 5),
    });
  } catch (error: any) {
    console.error('❌ Error sending family status reminder:', error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Failed to send family status reminder',
      },
      { status: 500 }
    );
  }
}
