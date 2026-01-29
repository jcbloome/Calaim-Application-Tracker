import { NextRequest, NextResponse } from 'next/server';
import admin, { adminDb } from '@/firebase-admin';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '100');
    const staff = searchParams.get('staff');
    const type = searchParams.get('type');
    const priority = searchParams.get('priority');

    const notes: any[] = [];
    const staffSet = new Set<string>();

    // Fetch from multiple collections
    const collections = [
      { name: 'staff_notifications', tableType: 'notification', source: 'notification' },
      { name: 'client_notes', tableType: 'client_notes', source: 'caspio' },
      { name: 'calaim_members', tableType: 'calaim_members', source: 'caspio' },
      { name: 'staff_notes', tableType: 'staff_note', source: 'staff' },
      { name: 'systemNotes', tableType: 'system_note', source: 'system' }
    ];

    for (const collection of collections) {
      try {
        let query: any = adminDb.collection(collection.name)
          .orderBy('timestamp', 'desc')
          .limit(limit);
        let snapshot: admin.firestore.QuerySnapshot;
        try {
          snapshot = await query.get();
        } catch (orderError) {
          // Fallback for collections without timestamp
          snapshot = await adminDb.collection(collection.name).limit(limit).get();
        }
        
        snapshot.docs.forEach(doc => {
          const data = doc.data();
          const rawPriority = String(data.priority || '').toLowerCase();
          const normalizedPriority = rawPriority.includes('urgent')
            ? 'Urgent'
            : rawPriority.includes('priority') || rawPriority.includes('high')
              ? 'Priority'
              : rawPriority.includes('medium') || rawPriority.includes('low')
                ? 'General'
                : undefined;
          const staffName = data.staffName || data.senderName || data.createdByName;
          
          // Apply filters
          if (staff && staffName !== staff) {
            return;
          }
          if (priority && normalizedPriority !== priority) {
            return;
          }
          if (type && collection.tableType !== type) {
            return;
          }

          if (staffName) staffSet.add(staffName);

          notes.push({
            id: doc.id,
            ...data,
            tableType: collection.tableType,
            source: collection.source,
            staffName,
            priority: normalizedPriority || data.priority,
            timestamp: data.timestamp?.toDate
              ? data.timestamp.toDate().toISOString()
              : data.createdAt?.toDate
                ? data.createdAt.toDate().toISOString()
                : data.createdAt || data.created_at || new Date().toISOString()
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