import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { sendReminderEmail } from '@/app/actions/send-email';

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

const getMissingItemsFromForms = (application: any): string[] => {
  const forms = Array.isArray(application?.forms) ? application.forms : [];
  if (forms.length === 0) return [];
  
  return forms
    .filter((form: any) => {
      const name = String(form?.name || '').trim();
      if (!name) return false;
      if (name === 'CS Member Summary' || name === 'CS Summary') return false;
      if (form?.type === 'Info') return false;
      return form?.status !== 'Completed';
    })
    .map((form: any) => String(form?.name || '').trim())
    .filter(Boolean);
};

export async function POST(request: NextRequest) {
  try {
    const { applicationId, userId } = await request.json();
    
    if (!applicationId) {
      return NextResponse.json(
        { success: false, error: 'Application ID is required' },
        { status: 400 }
      );
    }
    
    if (!adminDb) {
      console.log('Firebase Admin not available, simulating document reminder');
      return NextResponse.json({
        success: true,
        message: 'Document reminder sent successfully (simulated)',
        applicationId,
        note: 'Firebase Admin not configured - reminder simulated'
      });
    }
    
    let docRef;
    if (applicationId.startsWith('admin_app_')) {
      docRef = adminDb.collection('applications').doc(applicationId);
    } else if (userId) {
      docRef = adminDb.collection('users').doc(userId).collection('applications').doc(applicationId);
    } else {
      return NextResponse.json(
        { success: false, error: 'User ID is required for user applications' },
        { status: 400 }
      );
    }
    
    const appDoc = await docRef.get();
    if (!appDoc.exists) {
      return NextResponse.json(
        { success: false, error: 'Application not found' },
        { status: 404 }
      );
    }
    
    const appData = appDoc.data();
    const missingItems = getMissingItemsFromForms(appData);
    
    if (missingItems.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No missing documents found for this application' },
        { status: 400 }
      );
    }
    
    const referrerName = `${appData?.referrerFirstName || ''} ${appData?.referrerLastName || ''}`.trim() || 'there';
    const memberName = `${appData?.memberFirstName || ''} ${appData?.memberLastName || ''}`.trim();
    
    if (!appData?.referrerEmail) {
      return NextResponse.json(
        { success: false, error: 'Referrer email is missing for this application' },
        { status: 400 }
      );
    }
    
    await sendReminderEmail({
      to: appData.referrerEmail,
      subject: `Missing Documents Reminder: ${memberName || 'CalAIM Application'}`,
      referrerName,
      memberName: memberName || 'CalAIM Member',
      applicationId,
      incompleteItems: missingItems
    });
    
    await docRef.update({
      lastDocumentReminder: FieldValue.serverTimestamp(),
      documentReminderCount: FieldValue.increment(1)
    });
    
    return NextResponse.json({
      success: true,
      message: 'Document reminder sent successfully',
      applicationId,
      missingItems
    });
    
  } catch (error: any) {
    console.error('❌ Error sending document reminder:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to send document reminder',
        details: error.message
      },
      { status: 500 }
    );
  }
}
