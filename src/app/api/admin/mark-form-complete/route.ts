import { NextRequest, NextResponse } from 'next/server';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin
if (!getApps().length) {
  try {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  } catch (error) {
    console.error('Firebase Admin initialization error:', error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { applicationId, userId, formName, adminName } = await request.json();

    if (!applicationId || !userId || !formName) {
      return NextResponse.json(
        { error: 'Missing required fields: applicationId, userId, formName' },
        { status: 400 }
      );
    }

    const db = getFirestore();
    const appRef = db.collection('users').doc(userId).collection('applications').doc(applicationId);
    
    // Get the current application
    const appDoc = await appRef.get();
    if (!appDoc.exists) {
      return NextResponse.json(
        { error: 'Application not found' },
        { status: 404 }
      );
    }

    const appData = appDoc.data();
    const forms = appData?.forms || [];
    
    // Find and update the specific form
    const updatedForms = forms.map((form: any) => {
      if (form.name === formName) {
        return {
          ...form,
          status: 'Completed',
          dateCompleted: Timestamp.now(),
          completedBy: adminName || 'Admin',
          fileName: form.fileName || 'Marked complete by admin'
        };
      }
      return form;
    });

    // If form doesn't exist, add it
    if (!forms.some((form: any) => form.name === formName)) {
      updatedForms.push({
        name: formName,
        status: 'Completed',
        dateCompleted: Timestamp.now(),
        completedBy: adminName || 'Admin',
        fileName: 'Marked complete by admin'
      });
    }

    // Update the application
    await appRef.update({
      forms: updatedForms,
      lastUpdated: Timestamp.now()
    });

    return NextResponse.json({
      success: true,
      message: `${formName} marked as completed for application ${applicationId}`
    });

  } catch (error) {
    console.error('Error marking form as complete:', error);
    return NextResponse.json(
      { error: 'Failed to mark form as complete' },
      { status: 500 }
    );
  }
}