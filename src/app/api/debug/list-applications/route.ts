import { NextRequest, NextResponse } from 'next/server';
import admin from '@/firebase-admin';

export async function GET(request: NextRequest) {
  try {
    // Only allow this in development mode
    if (process.env.NODE_ENV !== 'development') {
      return NextResponse.json(
        { error: 'This endpoint is only available in development mode' },
        { status: 403 }
      );
    }

    console.log('🔍 Listing all applications in Firestore...');
    
    const results: any = {
      globalApplications: [],
      userApplications: {},
      totalCount: 0
    };

    try {
      // Check global applications collection
      const globalAppsSnapshot = await admin.firestore().collection('applications').get();
      console.log('📄 Global applications found:', globalAppsSnapshot.size);
      
      globalAppsSnapshot.forEach(doc => {
        results.globalApplications.push({
          id: doc.id,
          ...doc.data()
        });
      });
      results.totalCount += globalAppsSnapshot.size;

      // Check for user-specific applications
      const usersSnapshot = await admin.firestore().collection('users').get();
      console.log('👥 Users found:', usersSnapshot.size);

      for (const userDoc of usersSnapshot.docs) {
        const userAppsSnapshot = await admin.firestore()
          .collection(`users/${userDoc.id}/applications`)
          .get();
        
        if (userAppsSnapshot.size > 0) {
          console.log(`📄 User ${userDoc.id} has ${userAppsSnapshot.size} applications`);
          results.userApplications[userDoc.id] = [];
          
          userAppsSnapshot.forEach(appDoc => {
            results.userApplications[userDoc.id].push({
              id: appDoc.id,
              ...appDoc.data()
            });
          });
          results.totalCount += userAppsSnapshot.size;
        }
      }

      return NextResponse.json(results);

    } catch (firestoreError: any) {
      console.error('❌ Firestore error:', firestoreError);
      return NextResponse.json({
        error: 'Firestore access failed - likely credential issues',
        message: firestoreError.message,
        cannotAccessFirestore: true
      });
    }

  } catch (error) {
    console.error('List applications failed:', error);
    return NextResponse.json(
      { error: 'Failed to list applications' },
      { status: 500 }
    );
  }
}