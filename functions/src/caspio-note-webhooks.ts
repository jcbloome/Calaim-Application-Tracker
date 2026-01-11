import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { getFirestore } from 'firebase-admin/firestore';
import { sendResendEmailNotification } from './resend-email-service';

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
  Priority?: 'low' | 'medium' | 'high';
  Created_By?: string;
}

// Interface for connect_tbl_client_notes table
interface ClientNoteData {
  Client_ID?: string;
  Client_Name?: string;
  Note_Date?: string;
  Note_Text?: string;
  Staff_Member?: string;
  Note_Category?: string;
  Priority?: 'low' | 'medium' | 'high';
  Created_By?: string;
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
  let staffToNotify: string[] = [];
  
  if (tableType === 'calaim_members') {
    // For CalAIM notes, always notify the standard list
    staffToNotify = STAFF_EMAIL_MAPPING['All'];
  } else {
    // For client notes, you might want different logic
    staffToNotify = STAFF_EMAIL_MAPPING['All'];
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
        priority: noteData.Priority || 'medium',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        isRead: false,
        applicationId: noteData.Client_ID2 || noteData.Client_ID,
      };

      const notificationRef = await db.collection('staff_notifications').add(notificationData);
      notifications.push(notificationRef.id);

      // Send email notification
      try {
        await sendResendEmailNotification({
          to: [email],
          subject: `New ${tableType === 'calaim_members' ? 'CalAIM Member' : 'Client'} Note - ${noteData.Member_Name || noteData.Client_Name}`,
          htmlContent: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #2563eb;">New Note Notification</h2>
              <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <p><strong>Member/Client:</strong> ${noteData.Member_Name || noteData.Client_Name || 'Unknown'}</p>
                <p><strong>Staff:</strong> ${noteData.Staff_Name || noteData.Staff_Member || 'System'}</p>
                <p><strong>Date:</strong> ${noteData.Note_Date || new Date().toLocaleDateString()}</p>
                <p><strong>Priority:</strong> ${noteData.Priority || 'Medium'}</p>
                <div style="margin-top: 15px;">
                  <strong>Note:</strong>
                  <div style="background: white; padding: 15px; border-radius: 4px; margin-top: 5px;">
                    ${noteData.Note_Content || noteData.Note_Text || 'No content provided'}
                  </div>
                </div>
              </div>
              <p style="color: #64748b; font-size: 14px;">
                This notification was automatically generated from your Caspio database.
              </p>
            </div>
          `,
          textContent: `
New Note Notification

Member/Client: ${noteData.Member_Name || noteData.Client_Name || 'Unknown'}
Staff: ${noteData.Staff_Name || noteData.Staff_Member || 'System'}
Date: ${noteData.Note_Date || new Date().toLocaleDateString()}
Priority: ${noteData.Priority || 'Medium'}

Note: ${noteData.Note_Content || noteData.Note_Text || 'No content provided'}

This notification was automatically generated from your Caspio database.
          `,
          type: 'note_notification',
          memberName: noteData.Member_Name || noteData.Client_Name,
          senderName: noteData.Staff_Name || noteData.Staff_Member || 'System'
        });
      } catch (emailError) {
        console.error('Error sending email notification:', emailError);
      }
    }
  }

  return notifications;
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