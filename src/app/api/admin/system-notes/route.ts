import { NextRequest, NextResponse } from 'next/server';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  try {
    admin.initializeApp();
  } catch (error) {
    console.warn('Firebase Admin already initialized or initialization failed:', error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '1000');
    const startAfter = searchParams.get('startAfter');

    const db = admin.firestore();

    // Query system notes
    let query: admin.firestore.Query = db.collection('systemNotes')
      .orderBy('timestamp', 'desc')
      .limit(limit);

    if (startAfter) {
      const startAfterDoc = await db.collection('systemNotes').doc(startAfter).get();
      if (startAfterDoc.exists) {
        query = query.startAfter(startAfterDoc);
      }
    }

    const snapshot = await query.get();
    const notes = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        timestamp: data.timestamp?.toDate ? data.timestamp.toDate().toISOString() : new Date().toISOString(),
        readAt: data.readAt?.toDate ? data.readAt.toDate().toISOString() : undefined
      };
    });

    console.log(`📊 Retrieved ${notes.length} system notes`);

    return NextResponse.json({
      success: true,
      notes,
      total: notes.length,
      message: `Retrieved ${notes.length} system notes`
    });

  } catch (error: any) {
    console.error('❌ Error getting system note log:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: error.message,
        notes: [],
        total: 0
      },
      { status: 500 }
    );
  }
}
