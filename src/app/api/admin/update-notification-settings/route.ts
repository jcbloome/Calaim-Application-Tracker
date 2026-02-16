import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

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

export async function POST(request: NextRequest) {
  try {
    const {
      applicationId,
      userId,
      emailRemindersEnabled,
      statusRemindersEnabled,
      reviewNotificationSent,
      documentReminderFrequencyDays,
      statusReminderFrequencyDays
    } = await request.json();

    if (!applicationId) {
      return NextResponse.json(
        { success: false, error: 'Application ID is required' },
        { status: 400 }
      );
    }

    if (!adminDb) {
      return NextResponse.json({
        success: false,
        error: 'Firebase Admin not configured'
      }, { status: 500 });
    }

    const updateData: Record<string, any> = {
      lastUpdated: FieldValue.serverTimestamp()
    };

    if (emailRemindersEnabled !== undefined) {
      updateData.emailRemindersEnabled = Boolean(emailRemindersEnabled);
    }
    if (statusRemindersEnabled !== undefined) {
      updateData.statusRemindersEnabled = Boolean(statusRemindersEnabled);
    }
    if (reviewNotificationSent !== undefined) {
      updateData.reviewNotificationSent = Boolean(reviewNotificationSent);
    }
    if (documentReminderFrequencyDays !== undefined) {
      updateData.documentReminderFrequencyDays = Number(documentReminderFrequencyDays);
    }
    if (statusReminderFrequencyDays !== undefined) {
      updateData.statusReminderFrequencyDays = Number(statusReminderFrequencyDays);
    }

    const isAdminApp = applicationId.startsWith('admin_app_') || !userId;
    const docRef = isAdminApp
      ? adminDb.collection('applications').doc(applicationId)
      : adminDb.collection('users').doc(userId).collection('applications').doc(applicationId);

    await docRef.set(updateData, { merge: true });

    return NextResponse.json({
      success: true,
      applicationId
    });
  } catch (error: any) {
    console.error('❌ Error updating notification settings:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update notification settings' },
      { status: 500 }
    );
  }
}