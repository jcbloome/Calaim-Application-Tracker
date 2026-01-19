import { NextRequest, NextResponse } from 'next/server';
import { collection, collectionGroup, getDocs, query, where } from 'firebase/firestore';
import { getFirestore } from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase/app';

// Initialize Firebase if not already initialized
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const firestore = getFirestore(app);

export async function GET() {
  try {
    // Search for Jacqueline's applications
    const userAppsQuery = collectionGroup(firestore, 'applications');
    const adminAppsQuery = collection(firestore, 'applications');

    const [userAppsSnap, adminAppsSnap] = await Promise.all([
      getDocs(userAppsQuery),
      getDocs(adminAppsQuery)
    ]);

    const allApps = [
      ...userAppsSnap.docs.map(doc => ({ id: doc.id, path: doc.ref.path, ...doc.data() })),
      ...adminAppsSnap.docs.map(doc => ({ id: doc.id, path: doc.ref.path, ...doc.data() }))
    ];

    // Filter for Jacqueline
    const jackieApps = allApps.filter(app => 
      app.memberFirstName?.toLowerCase().includes('jacqueline') ||
      app.memberFirstName?.toLowerCase().includes('jackie')
    );

    return NextResponse.json({
      success: true,
      totalApplications: allApps.length,
      jackieApplications: jackieApps.length,
      jackieData: jackieApps.map(app => ({
        id: app.id,
        path: app.path,
        memberFirstName: app.memberFirstName,
        memberLastName: app.memberLastName,
        status: app.status,
        csSummaryComplete: app.csSummaryComplete,
        csSummaryCompletedAt: app.csSummaryCompletedAt,
        csSummaryNotificationSent: app.csSummaryNotificationSent,
        lastUpdated: app.lastUpdated,
        createdAt: app.createdAt,
        hasNewDocuments: app.hasNewDocuments,
        newDocumentCount: app.newDocumentCount
      }))
    });

  } catch (error: any) {
    console.error('Debug API error:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}