import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// Initialize Firebase Admin
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
  // For development, we'll skip Firebase Admin and return a simpler response
}

export async function POST(request: NextRequest) {
  try {
    const { applicationId, userId, reminderType = 'email' } = await request.json();

    if (!applicationId) {
      return NextResponse.json(
        { success: false, error: 'Application ID is required' },
        { status: 400 }
      );
    }

    // For now, return a simple success response since Firebase Admin is not properly configured
    if (!adminDb) {
      console.log('Firebase Admin not available, simulating CS Summary reminder');
      return NextResponse.json({
        success: true,
        message: 'CS Summary reminder sent successfully (simulated)',
        applicationId,
        reminderType,
        note: 'Firebase Admin not configured - reminder simulated'
      });
    }

    // Determine the document reference path
    let docRef;
    if (applicationId.startsWith('admin_app_')) {
      // Admin-created application
      docRef = adminDb.collection('applications').doc(applicationId);
    } else if (userId) {
      // User application
      docRef = adminDb.collection('users').doc(userId).collection('applications').doc(applicationId);
    } else {
      return NextResponse.json(
        { success: false, error: 'User ID is required for user applications' },
        { status: 400 }
      );
    }

    // Get the current application data
    const appDoc = await docRef.get();
    if (!appDoc.exists) {
      return NextResponse.json(
        { success: false, error: 'Application not found' },
        { status: 404 }
      );
    }

    const appData = appDoc.data();
    
    // Check if CS Summary is already confirmed
    if (appData?.csSummaryComplete) {
      return NextResponse.json(
        { success: false, error: 'CS Summary is already confirmed' },
        { status: 400 }
      );
    }

    // Check if application is in the right status
    if (appData?.status !== 'In Progress') {
      return NextResponse.json(
        { success: false, error: 'Application must be in "In Progress" status to send reminder' },
        { status: 400 }
      );
    }

    // Get user information for email
    let userDoc;
    if (userId) {
      userDoc = await adminDb.collection('users').doc(userId).get();
    }

    const userData = userDoc?.data();
    const userEmail = userData?.email;
    const userName = userData?.firstName && userData?.lastName 
      ? `${userData.firstName} ${userData.lastName}` 
      : userData?.displayName || userEmail || 'User';

    // Create reminder notification
    const reminderData = {
      type: 'cs_summary_reminder',
      applicationId,
      userId: userId || null,
      memberName: `${appData?.memberFirstName || ''} ${appData?.memberLastName || ''}`.trim(),
      userEmail,
      userName,
      reminderType,
      sentAt: FieldValue.serverTimestamp(),
      status: 'pending'
    };

    // Store the reminder in Firestore
    const reminderRef = await adminDb.collection('notifications').add(reminderData);

    // If email reminder, send the email
    if (reminderType === 'email' && userEmail) {
      try {
        const emailResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001'}/api/email/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: userEmail,
            subject: 'Action Required: Complete Your CalAIM Application',
            type: 'cs_summary_reminder',
            data: {
              userName,
              memberName: reminderData.memberName,
              applicationId,
              confirmationUrl: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001'}/forms/cs-summary-form/review?applicationId=${applicationId}${userId ? `&userId=${userId}` : ''}`,
              supportEmail: 'support@connectionscare.com'
            }
          })
        });

        const emailResult = await emailResponse.json();
        
        if (emailResult.success) {
          // Update reminder status to sent
          await reminderRef.update({
            status: 'sent',
            emailSentAt: FieldValue.serverTimestamp()
          });
        } else {
          console.error('Failed to send email:', emailResult.error);
          await reminderRef.update({
            status: 'failed',
            error: emailResult.error
          });
        }
      } catch (emailError: any) {
        console.error('Error sending email:', emailError);
        await reminderRef.update({
          status: 'failed',
          error: emailError.message
        });
      }
    }

    // Update application with reminder sent flag
    await docRef.update({
      csSummaryReminderSent: true,
      csSummaryReminderSentAt: FieldValue.serverTimestamp(),
      lastReminderType: reminderType
    });

    console.log(`✅ CS Summary reminder sent for application ${applicationId} (${reminderType})`);

    return NextResponse.json({
      success: true,
      message: `CS Summary reminder sent successfully (${reminderType})`,
      applicationId,
      reminderType,
      reminderId: reminderRef.id,
      userEmail: reminderType === 'email' ? userEmail : undefined
    });

  } catch (error: any) {
    console.error('❌ Error sending CS Summary reminder:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to send CS Summary reminder',
        details: error.message 
      },
      { status: 500 }
    );
  }
}