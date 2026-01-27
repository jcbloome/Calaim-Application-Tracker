import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { getFirestore } from 'firebase-admin/firestore';

// Lazy initialization of Firestore
let _db: admin.firestore.Firestore | null = null;
const getDb = () => {
  if (!_db) {
    if (admin.apps.length === 0) {
      admin.initializeApp();
    }
    _db = getFirestore();
  }
  return _db;
};

// Interface for CalAIM_Members_Notes_ILS table
interface CalAIMNoteData {
  Client_ID2?: string;
  Member_Name?: string;
  Note_Date?: string;
  Note_Content?: string;
  Staff_Name?: string;
  Note_Type?: string;
  Priority?: string;
  Created_By?: string;
  Assigned_Staff?: string;
}

// Interface for connect_tbl_client_notes table
interface ClientNoteData {
  Client_ID?: string;
  Client_Name?: string;
  Note_Date?: string;
  Note_Text?: string;
  Staff_Member?: string;
  Note_Category?: string;
  Priority?: string;
  Created_By?: string;
  Follow_Up_Assignment?: string;
  Assigned_First?: string;
}

// Staff email mapping
const STAFF_EMAIL_MAPPING: { [key: string]: string[] } = {
  'JHernandez': ['JHernandez@ilshealth.com'],
  'Jason': ['jason@carehomefinders.com'],
  'Tang': ['tang@carehomefinders.com'],
  'Monica': ['monica@carehomefinders.com'],
  'All': [
    'JHernandez@ilshealth.com',
    'jason@carehomefinders.com', 
    'tang@carehomefinders.com',
    'monica@carehomefinders.com'
  ]
};

// Function to get staff user ID from email
async function getStaffUserIdFromEmail(email: string): Promise<string | null> {
  try {
    const db = getDb();
    const usersSnapshot = await db.collection('users')
      .where('email', '==', email)
      .limit(1)
      .get();
    
    if (!usersSnapshot.empty) {
      return usersSnapshot.docs[0].id;
    }
    return null;
  } catch (error) {
    console.error('Error finding user by email:', error);
    return null;
  }
}

// Function to store note in Firestore
async function storeNoteInFirestore(noteData: any, tableType: 'calaim_members' | 'client_notes') {
  const db = getDb();
  const noteDoc = {
    ...noteData,
    tableType,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    isRead: false,
    notificationsSent: [],
  };

  const docRef = await db.collection('caspio_notes').add(noteDoc);
  return docRef.id;
}

// Function to send notifications to staff
async function sendStaffNotifications(noteData: any, noteId: string, tableType: string) {
  const db = getDb();
  
  // Determine which staff to notify based on table type and note content
  const priorityValue = String(noteData.Priority || '').toLowerCase();
  const isPriorityNote = priorityValue.includes('high') || priorityValue.includes('urgent') || priorityValue.includes('🔴');
  if (!isPriorityNote) {
    return [];
  }

  const assignmentKey = noteData.Follow_Up_Assignment
    || noteData.Assigned_Staff
    || noteData.Assigned_First
    || noteData.Staff_Member
    || noteData.Staff_Name;

  const staffToNotify = getStaffEmailsForAssignment(assignmentKey);
  if (staffToNotify.length === 0) {
    return [];
  }

  const notifications = [];
  
  for (const email of staffToNotify) {
    const userId = await getStaffUserIdFromEmail(email);
    
    if (userId) {
      // Create in-app notification
      const notificationData = {
        userId,
        noteId,
        title: `New ${tableType === 'calaim_members' ? 'CalAIM Member' : 'Client'} Note`,
        message: noteData.Note_Content || noteData.Note_Text || 'New note added',
        senderName: noteData.Staff_Name || noteData.Staff_Member || 'System',
        memberName: noteData.Member_Name || noteData.Client_Name || 'Unknown',
        type: 'note',
        priority: noteData.Priority || 'high',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        isRead: false,
        status: 'Open',
        applicationId: noteData.Client_ID2 || noteData.Client_ID,
      };

      const notificationRef = await db.collection('staff_notifications').add(notificationData);
      notifications.push(notificationRef.id);

    }
  }

  return notifications;
}

function getStaffEmailsForAssignment(assignment?: string): string[] {
  if (!assignment) return [];
  const trimmed = String(assignment).trim();
  if (!trimmed) return [];

  if (trimmed.includes('@')) {
    return [trimmed];
  }

  const match = Object.keys(STAFF_EMAIL_MAPPING).find((key) => key.toLowerCase() === trimmed.toLowerCase());
  if (match) {
    return STAFF_EMAIL_MAPPING[match];
  }

  return [];
}

// Webhook endpoint for CalAIM_Members_Notes_ILS table
export const caspioCalAIMNotesWebhook = onRequest(
  { 
    cors: true,
    secrets: []
  },
  async (request, response) => {
    try {
      console.log('📝 CalAIM Notes Webhook received:', request.body);

      if (request.method !== 'POST') {
        response.status(405).json({ error: 'Method not allowed' });
        return;
      }

      const noteData: CalAIMNoteData = request.body;

      // Validate required fields
      if (!noteData.Note_Content && !noteData.Member_Name) {
        response.status(400).json({ error: 'Missing required note data' });
        return;
      }

      // Store note in Firestore
      const noteId = await storeNoteInFirestore(noteData, 'calaim_members');

      // Send notifications to staff
      const notifications = await sendStaffNotifications(noteData, noteId, 'calaim_members');

      console.log(`✅ CalAIM note processed: ${noteId}, notifications sent: ${notifications.length}`);

      response.status(200).json({
        success: true,
        noteId,
        notificationsSent: notifications.length,
        message: 'CalAIM note processed and notifications sent'
      });

    } catch (error: any) {
      console.error('❌ Error processing CalAIM notes webhook:', error);
      response.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }
);

// Webhook endpoint for connect_tbl_client_notes table
export const caspioClientNotesWebhook = onRequest(
  { 
    cors: true,
    secrets: []
  },
  async (request, response) => {
    try {
      console.log('📝 Client Notes Webhook received:', request.body);

      if (request.method !== 'POST') {
        response.status(405).json({ error: 'Method not allowed' });
        return;
      }

      const noteData: ClientNoteData = request.body;

      // Validate required fields
      if (!noteData.Note_Text && !noteData.Client_Name) {
        response.status(400).json({ error: 'Missing required note data' });
        return;
      }

      // Store note in Firestore
      const noteId = await storeNoteInFirestore(noteData, 'client_notes');

      // Send notifications to staff
      const notifications = await sendStaffNotifications(noteData, noteId, 'client_notes');

      console.log(`✅ Client note processed: ${noteId}, notifications sent: ${notifications.length}`);

      response.status(200).json({
        success: true,
        noteId,
        notificationsSent: notifications.length,
        message: 'Client note processed and notifications sent'
      });

    } catch (error: any) {
      console.error('❌ Error processing client notes webhook:', error);
      response.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }
);

// Function to get notes for a specific staff member
export const getStaffNotes = onRequest(
  { cors: true },
  async (request, response) => {
    try {
      const { userId, limit = 50, offset = 0 } = request.query;

      if (!userId) {
        response.status(400).json({ error: 'User ID required' });
        return;
      }

      const db = getDb();
      
      // Get notifications for this user
      const notificationsQuery = db.collection('staff_notifications')
        .where('userId', '==', userId)
        .orderBy('timestamp', 'desc')
        .limit(Number(limit))
        .offset(Number(offset));

      const notificationsSnapshot = await notificationsQuery.get();
      const notifications = notificationsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      response.status(200).json({
        success: true,
        notifications,
        total: notificationsSnapshot.size
      });

    } catch (error: any) {
      console.error('❌ Error getting staff notes:', error);
      response.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }
);

// Function to mark notifications as read
export const markNotificationsRead = onRequest(
  { cors: true },
  async (request, response) => {
    try {
      const { notificationIds } = request.body;

      if (!notificationIds || !Array.isArray(notificationIds)) {
        response.status(400).json({ error: 'Notification IDs array required' });
        return;
      }

      const db = getDb();
      const batch = db.batch();

      for (const notificationId of notificationIds) {
        const notificationRef = db.collection('staff_notifications').doc(notificationId);
        batch.update(notificationRef, { 
          isRead: true, 
          readAt: admin.firestore.FieldValue.serverTimestamp() 
        });
      }

      await batch.commit();

      response.status(200).json({
        success: true,
        message: `${notificationIds.length} notifications marked as read`
      });

    } catch (error: any) {
      console.error('❌ Error marking notifications as read:', error);
      response.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }
);

// Function to add a new note
export const addStaffNote = onRequest(
  { cors: true },
  async (request, response) => {
    try {
      if (request.method !== 'POST') {
        response.status(405).json({ error: 'Method not allowed' });
        return;
      }

      const { 
        memberId, 
        memberName, 
        noteContent, 
        noteType, 
        priority, 
        staffId, 
        staffName,
        tableType = 'staff_note'
      } = request.body;

      if (!noteContent || !staffId || !staffName) {
        response.status(400).json({ error: 'Note content, staff ID, and staff name are required' });
        return;
      }

      const db = getDb();
      
      // Create note document
      const noteData = {
        memberId: memberId || null,
        memberName: memberName || null,
        noteContent,
        noteType: noteType || 'general',
        priority: priority || 'medium',
        staffId,
        staffName,
        tableType,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      // Store in caspio_notes collection for consistency
      const noteRef = await db.collection('caspio_notes').add(noteData);

      // Also create a staff notification for other staff if this is about a specific member
      if (memberId && memberName) {
        // Get all admin users to notify
        const usersSnapshot = await db.collection('users')
          .where('role', 'in', ['admin', 'super_admin'])
          .where('uid', '!=', staffId) // Don't notify the creator
          .get();

        const notifications = [];
        for (const userDoc of usersSnapshot.docs) {
          const notificationData = {
            userId: userDoc.id,
            noteId: noteRef.id,
            title: `New Staff Note - ${memberName}`,
            message: noteContent.length > 100 ? noteContent.substring(0, 100) + '...' : noteContent,
            senderName: staffName,
            memberName,
            type: 'staff_note',
            priority: priority || 'medium',
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            isRead: false,
            applicationId: memberId,
          };

          const notificationRef = await db.collection('staff_notifications').add(notificationData);
          notifications.push(notificationRef.id);
        }

        console.log(`📝 Staff note created: ${noteRef.id}, notifications sent: ${notifications.length}`);
      }

      response.status(200).json({
        success: true,
        noteId: noteRef.id,
        message: 'Note added successfully'
      });

    } catch (error: any) {
      console.error('❌ Error adding staff note:', error);
      response.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }
);

// Function to get all notes (for super admin)
export const getAllNotes = onRequest(
  { cors: true },
  async (request, response) => {
    try {
      const { searchParams } = new URL(request.url);
      const limit = parseInt(searchParams.get('limit') || '100');
      const offset = parseInt(searchParams.get('offset') || '0');
      const staffFilter = searchParams.get('staff');
      const typeFilter = searchParams.get('type');
      const priorityFilter = searchParams.get('priority');

      const db = getDb();
      
      // Build query for caspio_notes
      let notesQuery: admin.firestore.Query = db.collection('caspio_notes');
      
      if (staffFilter) {
        notesQuery = notesQuery.where('staffName', '==', staffFilter);
      }
      
      if (typeFilter) {
        notesQuery = notesQuery.where('tableType', '==', typeFilter);
      }
      
      if (priorityFilter) {
        notesQuery = notesQuery.where('priority', '==', priorityFilter);
      }

      const notesSnapshot = await notesQuery
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .offset(offset)
        .get();

      const notes = notesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate?.() || new Date(doc.data().timestamp)
      }));

      // Also get staff notifications
      let notificationsQuery: admin.firestore.Query = db.collection('staff_notifications');
      
      const notificationsSnapshot = await notificationsQuery
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .get();

      const notifications = notificationsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate?.() || new Date(doc.data().timestamp),
        source: 'notification'
      }));

      // Combine and sort all notes
      const allNotes = [...notes, ...notifications].sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      // Get staff list for filtering
      const usersSnapshot = await db.collection('users')
        .where('role', 'in', ['admin', 'super_admin'])
        .get();
      
      const staffList = usersSnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().displayName || doc.data().email,
        email: doc.data().email
      }));

      response.status(200).json({
        success: true,
        notes: allNotes.slice(0, limit),
        staffList,
        total: allNotes.length,
        hasMore: allNotes.length > limit
      });

    } catch (error: any) {
      console.error('❌ Error getting all notes:', error);
      response.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }
);

// Function to get notes for a specific staff member
export const getStaffMemberNotes = onRequest(
  { cors: true },
  async (request, response) => {
    try {
      const { searchParams } = new URL(request.url);
      const staffId = searchParams.get('staffId');
      const limit = parseInt(searchParams.get('limit') || '50');
      const offset = parseInt(searchParams.get('offset') || '0');

      if (!staffId) {
        response.status(400).json({ error: 'Staff ID required' });
        return;
      }

      const db = getDb();
      
      // Get notes created by this staff member
      const notesSnapshot = await db.collection('caspio_notes')
        .where('staffId', '==', staffId)
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .offset(offset)
        .get();

      const notes = notesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate?.() || new Date(doc.data().timestamp)
      }));

      // Get notifications for this staff member
      const notificationsSnapshot = await db.collection('staff_notifications')
        .where('userId', '==', staffId)
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .get();

      const notifications = notificationsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate?.() || new Date(doc.data().timestamp),
        source: 'notification'
      }));

      // Combine and sort
      const allNotes = [...notes, ...notifications].sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      response.status(200).json({
        success: true,
        notes: allNotes,
        total: allNotes.length
      });

    } catch (error: any) {
      console.error('❌ Error getting staff member notes:', error);
      response.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }
);

// Function to get all notes for a specific member
export const getMemberNotes = onRequest(
  { cors: true },
  async (request, response) => {
    try {
      const { searchParams } = new URL(request.url);
      const memberId = searchParams.get('memberId');
      const memberName = searchParams.get('memberName');
      const limit = parseInt(searchParams.get('limit') || '100');
      const offset = parseInt(searchParams.get('offset') || '0');

      if (!memberId && !memberName) {
        response.status(400).json({ error: 'Member ID or Member Name required' });
        return;
      }

      const db = getDb();
      
      // Query both caspio_notes and staff_notifications for this member
      let notesQuery: admin.firestore.Query = db.collection('caspio_notes');
      
      if (memberId) {
        // Search by Client_ID2 or Client_ID
        notesQuery = notesQuery.where('Client_ID2', '==', memberId);
      } else if (memberName) {
        // Search by member name
        notesQuery = notesQuery.where('Member_Name', '==', memberName)
          .limit(limit);
      }

      const notesSnapshot = await notesQuery
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .offset(offset)
        .get();

      const notes = notesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate?.() || new Date(doc.data().timestamp)
      }));

      // Also get staff notifications for this member
      let notificationsQuery: admin.firestore.Query = db.collection('staff_notifications');
      
      if (memberId) {
        notificationsQuery = notificationsQuery.where('applicationId', '==', memberId);
      } else if (memberName) {
        notificationsQuery = notificationsQuery.where('memberName', '==', memberName);
      }

      const notificationsSnapshot = await notificationsQuery
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .get();

      const notifications = notificationsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate?.() || new Date(doc.data().timestamp),
        source: 'notification'
      }));

      // Combine and sort all notes by timestamp
      const allNotes = [...notes, ...notifications].sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      // Get member info from the first note
      const firstNote = notes.length > 0 ? notes[0] : null;
      const memberInfo = firstNote ? {
        memberId: (firstNote as any).Client_ID2 || (firstNote as any).Client_ID || memberId,
        memberName: (firstNote as any).Member_Name || (firstNote as any).Client_Name || memberName,
        tableType: (firstNote as any).tableType
      } : {
        memberId,
        memberName,
        tableType: 'unknown'
      };

      response.status(200).json({
        success: true,
        memberInfo,
        notes: allNotes,
        total: allNotes.length,
        hasMore: allNotes.length === limit
      });

    } catch (error: any) {
      console.error('❌ Error getting member notes:', error);
      response.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }
);