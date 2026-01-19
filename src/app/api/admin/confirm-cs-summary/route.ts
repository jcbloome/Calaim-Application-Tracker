import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

// Helper function to get required forms for pathway
function getRequiredFormsForPathway(pathway: string) {
  const baseRequiredForms = [
    { name: 'CS Member Summary', type: 'Form', status: 'Completed', dateCompleted: FieldValue.serverTimestamp() },
    { name: 'Waivers & Authorizations', type: 'Form', status: 'Not Started' },
    { name: "LIC 602A - Physician's Report", type: 'Form', status: 'Not Started' },
    { name: 'Medicine List', type: 'Upload', status: 'Not Started' },
    { name: 'Proof of Income', type: 'Upload', status: 'Not Started' },
    { name: 'Declaration of Eligibility', type: 'Upload', status: 'Not Started' }
  ];

  // Add pathway-specific forms
  if (pathway === 'SNF Diversion') {
    baseRequiredForms.push({ name: 'SNF Facesheet', type: 'Upload', status: 'Not Started' });
  }

  return baseRequiredForms;
}

export async function POST(request: NextRequest) {
  try {
    const { applicationId, userId, confirmedBy } = await request.json();

    if (!applicationId) {
      return NextResponse.json(
        { success: false, error: 'Application ID is required' },
        { status: 400 }
      );
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
    const requiredForms = getRequiredFormsForPathway(appData?.pathway || 'ECF CHOICES');

    // Update the application with confirmation data
    await docRef.update({
      status: 'In Progress',
      forms: requiredForms,
      lastUpdated: FieldValue.serverTimestamp(),
      // Mark CS Summary as completed for dashboard tracking
      csSummaryComplete: true,
      csSummaryCompletedAt: FieldValue.serverTimestamp(),
      csSummaryNotificationSent: false, // Reset notification flag
      // Track who confirmed it
      csSummaryConfirmedBy: confirmedBy || 'Admin',
      csSummaryConfirmedByAdmin: true
    });

    console.log(`✅ CS Summary confirmed for application ${applicationId} by ${confirmedBy || 'Admin'}`);

    return NextResponse.json({
      success: true,
      message: 'CS Summary confirmed successfully',
      applicationId,
      confirmedBy: confirmedBy || 'Admin'
    });

  } catch (error: any) {
    console.error('❌ Error confirming CS Summary:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to confirm CS Summary',
        details: error.message 
      },
      { status: 500 }
    );
  }
}