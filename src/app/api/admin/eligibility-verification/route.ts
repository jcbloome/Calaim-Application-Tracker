import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { getStorage } from 'firebase-admin/storage';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    const {
      id,
      memberName,
      memberMrn,
      healthPlan,
      eligibilityStatus,
      eligibilityMessage,
      screenshotUrl,
      verifiedBy = 'admin'
    } = body;

    if (!memberName || !memberMrn || !healthPlan || !eligibilityStatus || !eligibilityMessage) {
      return NextResponse.json({ 
        success: false, 
        message: 'Missing required fields' 
      }, { status: 400 });
    }

    const firestore = admin.firestore();
    
    const eligibilityData = {
      memberName,
      memberMrn,
      healthPlan,
      eligibilityStatus,
      eligibilityMessage,
      screenshotUrl: screenshotUrl || null,
      verifiedBy,
      verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    let docRef;
    
    if (id) {
      // Update existing verification
      docRef = firestore.collection('eligibilityVerifications').doc(id);
      await docRef.update(eligibilityData);
    } else {
      // Create new verification
      eligibilityData.createdAt = admin.firestore.FieldValue.serverTimestamp();
      docRef = await firestore.collection('eligibilityVerifications').add(eligibilityData);
    }

    return NextResponse.json({ 
      success: true, 
      id: docRef.id,
      message: 'Eligibility verification saved successfully' 
    }, { status: 200 });

  } catch (error: any) {
    console.error('Error saving eligibility verification:', error);
    return NextResponse.json({ 
      success: false, 
      message: 'Internal server error' 
    }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const memberMrn = searchParams.get('memberMrn');
    const memberId = searchParams.get('memberId');

    if (!memberMrn && !memberId) {
      return NextResponse.json({ 
        success: false, 
        message: 'Member MRN or ID is required' 
      }, { status: 400 });
    }

    const firestore = admin.firestore();
    let query = firestore.collection('eligibilityVerifications');

    if (memberMrn) {
      query = query.where('memberMrn', '==', memberMrn);
    } else if (memberId) {
      query = query.where('memberId', '==', memberId);
    }

    const snapshot = await query
      .orderBy('verifiedAt', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) {
      return NextResponse.json({ 
        success: true, 
        verification: null,
        message: 'No eligibility verification found' 
      }, { status: 200 });
    }

    const doc = snapshot.docs[0];
    const verification = {
      id: doc.id,
      ...doc.data()
    };

    return NextResponse.json({ 
      success: true, 
      verification 
    }, { status: 200 });

  } catch (error: any) {
    console.error('Error fetching eligibility verification:', error);
    return NextResponse.json({ 
      success: false, 
      message: 'Internal server error' 
    }, { status: 500 });
  }
}