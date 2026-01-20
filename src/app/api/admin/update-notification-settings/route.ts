import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase/app';

const firebaseConfig = {
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  // Add other config as needed
};

// Initialize Firebase if not already initialized
if (!getApps().length) {
  initializeApp(firebaseConfig);
}

export async function POST(request: NextRequest) {
  try {
    const { applicationId, emailRemindersEnabled, reviewNotificationSent } = await request.json();

    if (!applicationId) {
      return NextResponse.json(
        { error: 'Application ID is required' },
        { status: 400 }
      );
    }

    const db = getFirestore();
    const applicationRef = doc(db, 'applications', applicationId);

    const updateData: any = {};

    if (typeof emailRemindersEnabled === 'boolean') {
      updateData.emailRemindersEnabled = emailRemindersEnabled;
      if (emailRemindersEnabled) {
        updateData.emailRemindersEnabledAt = serverTimestamp();
      }
    }

    if (typeof reviewNotificationSent === 'boolean') {
      updateData.reviewNotificationSent = reviewNotificationSent;
      if (reviewNotificationSent) {
        updateData.reviewNotificationSentAt = serverTimestamp();
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No valid notification settings provided' },
        { status: 400 }
      );
    }

    await updateDoc(applicationRef, updateData);

    return NextResponse.json({
      success: true,
      message: 'Notification settings updated successfully',
      updatedFields: Object.keys(updateData)
    });

  } catch (error) {
    console.error('Error updating notification settings:', error);
    return NextResponse.json(
      { error: 'Failed to update notification settings' },
      { status: 500 }
    );
  }
}