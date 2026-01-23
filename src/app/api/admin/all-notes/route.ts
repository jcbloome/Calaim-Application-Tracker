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
    const limit = parseInt(searchParams.get('limit') || '100');
    const staff = searchParams.get('staff');
    const type = searchParams.get('type');
    const priority = searchParams.get('priority');

    const db = admin.firestore();
    const notes: any[] = [];
    const staffSet = new Set<string>();

    // Fetch from multiple collections
    const collections = [
      { name: 'client_notes', tableType: 'client_notes' },
      { name: 'calaim_members', tableType: 'calaim_members' },
      { name: 'staff_notes', tableType: 'staff_note' },
      { name: 'systemNotes', tableType: 'system_note' }
    ];

    for (const collection of collections) {
      try {
        let query: any = db.collection(collection.name)
          .orderBy('timestamp', 'desc')
          .limit(limit);

        const snapshot = await query.get();
        
        snapshot.docs.forEach(doc => {
          const data = doc.data();
          
          // Apply filters
          if (staff && data.staffName !== staff && data.senderName !== staff) {
            return;
          }
          if (priority && data.priority !== priority) {
            return;
          }
          if (type && collection.tableType !== type) {
            return;
          }

          if (data.staffName) staffSet.add(data.staffName);
          if (data.senderName) staffSet.add(data.senderName);

          notes.push({
            id: doc.id,
            ...data,
            tableType: collection.tableType,
            timestamp: data.timestamp?.toDate ? data.timestamp.toDate().toISOString() : new Date().toISOString()
          });
        });
      } catch (error: any) {
        console.warn(`Error fetching from ${collection.name}:`, error.message);
        // Continue with other collections
      }
    }

    // Sort by timestamp and limit
    notes.sort((a, b) => {
      const aTime = new Date(a.timestamp).getTime();
      const bTime = new Date(b.timestamp).getTime();
      return bTime - aTime;
    });

    const limitedNotes = notes.slice(0, limit);
    const staffList = Array.from(staffSet).map(name => ({
      id: name,
      name: name,
      email: ''
    }));

    return NextResponse.json({
      success: true,
      notes: limitedNotes,
      staffList,
      total: limitedNotes.length
    });

  } catch (error: any) {
    console.error('Error getting all notes:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Internal server error', 
        message: error.message,
        notes: [],
        staffList: []
      },
      { status: 500 }
    );
  }
}