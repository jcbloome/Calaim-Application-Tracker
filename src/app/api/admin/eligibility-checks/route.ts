import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

export async function GET(request: Request) {
  try {
    const firestore = admin.firestore();
    
    // Fetch all eligibility checks, ordered by timestamp (newest first)
    const snapshot = await firestore
      .collection('eligibilityChecks')
      .orderBy('timestamp', 'desc')
      .get();

    const checks = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return NextResponse.json({ 
      success: true, 
      checks 
    }, { status: 200 });

  } catch (error: any) {
    console.error('Error fetching eligibility checks:', error);
    return NextResponse.json({ 
      success: false, 
      message: 'Internal server error' 
    }, { status: 500 });
  }
}