import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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
}

export async function POST(request: NextRequest) {
  try {
    const { memberName, keepApplicationId } = await request.json();

    if (!memberName) {
      return NextResponse.json(
        { error: 'Member name is required' },
        { status: 400 }
      );
    }

    if (!adminDb) {
      return NextResponse.json(
        { error: 'Firebase Admin not configured' },
        { status: 500 }
      );
    }

    // Find all applications for this member
    const [userAppsSnapshot, adminAppsSnapshot] = await Promise.all([
      adminDb.collectionGroup('applications').get(),
      adminDb.collection('applications').get()
    ]);

    const duplicateApps = [];
    
    // Check user applications
    userAppsSnapshot.docs.forEach((doc: any) => {
      const data = doc.data();
      const fullName = `${data.memberFirstName || ''} ${data.memberLastName || ''}`.trim();
      if (fullName.toLowerCase() === memberName.toLowerCase()) {
        duplicateApps.push({
          id: doc.id,
          path: doc.ref.path,
          source: 'user',
          data: data
        });
      }
    });

    // Check admin applications
    adminAppsSnapshot.docs.forEach((doc: any) => {
      const data = doc.data();
      const fullName = `${data.memberFirstName || ''} ${data.memberLastName || ''}`.trim();
      if (fullName.toLowerCase() === memberName.toLowerCase()) {
        duplicateApps.push({
          id: doc.id,
          path: doc.ref.path,
          source: 'admin',
          data: data
        });
      }
    });

    console.log(`Found ${duplicateApps.length} applications for ${memberName}:`, duplicateApps.map(app => ({
      id: app.id,
      source: app.source,
      path: app.path
    })));

    // If keepApplicationId is specified, remove all others
    if (keepApplicationId && duplicateApps.length > 1) {
      const appsToDelete = duplicateApps.filter(app => app.id !== keepApplicationId);
      
      for (const app of appsToDelete) {
        try {
          await adminDb.doc(app.path).delete();
          console.log(`Deleted duplicate application: ${app.id} (${app.source})`);
        } catch (error) {
          console.error(`Failed to delete application ${app.id}:`, error);
        }
      }

      return NextResponse.json({
        success: true,
        message: `Removed ${appsToDelete.length} duplicate applications for ${memberName}`,
        kept: keepApplicationId,
        removed: appsToDelete.map(app => app.id)
      });
    }

    // Otherwise, just return the list of duplicates
    return NextResponse.json({
      success: true,
      duplicates: duplicateApps.map(app => ({
        id: app.id,
        source: app.source,
        memberName: `${app.data.memberFirstName || ''} ${app.data.memberLastName || ''}`.trim(),
        status: app.data.status,
        lastUpdated: app.data.lastUpdated,
        pathway: app.data.pathway,
        healthPlan: app.data.healthPlan
      }))
    });

  } catch (error: any) {
    console.error('Error handling duplicate applications:', error);
    return NextResponse.json(
      { error: 'Failed to process duplicate applications', details: error.message },
      { status: 500 }
    );
  }
}