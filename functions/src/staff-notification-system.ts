import { onCall, HttpsError } from "firebase-functions/v2/https";
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

interface NotificationSettings {
  noteNotifications: boolean;
  taskNotifications: boolean;
  soundEnabled: boolean;
  testMode: boolean;
}

interface SystemNote {
  id: string;
  senderName: string;
  senderEmail: string;
  recipientName: string;
  recipientEmail: string;
  memberName?: string;
  applicationId?: string;
  noteContent: string;
  noteType: 'internal' | 'task' | 'alert' | 'system';
  priority: 'General' | 'Priority' | 'Urgent';
  timestamp: Date;
  wasNotificationSent: boolean;
  notificationMethod?: 'popup' | 'email' | 'both';
  readAt?: Date;
  readBy?: string;
}

// Get staff notification settings
export const getStaffNotificationSettings = onCall({
  cors: [
    /localhost/,
    /\.vercel\.app$/,
    /\.netlify\.app$/,
    /\.firebaseapp\.com$/,
    /connectcalaim\.com$/
  ]
}, async (request) => {
  try {
    const { uid } = request.auth || {};
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const db = getDb();
    const settingsRef = db.collection('notificationSettings').doc(uid);
    const settingsDoc = await settingsRef.get();

    const defaultSettings: NotificationSettings = {
      noteNotifications: true,
      taskNotifications: true,
      soundEnabled: true,
      testMode: false
    };

    const settings = settingsDoc.exists ? 
      { ...defaultSettings, ...settingsDoc.data() } : 
      defaultSettings;

    return {
      success: true,
      settings,
      message: 'Notification settings retrieved successfully'
    };

  } catch (error: any) {
    console.error('❌ Error getting notification settings:', error);
    throw new HttpsError('internal', `Failed to get notification settings: ${error.message}`);
  }
});

// Update staff notification settings
export const updateStaffNotificationSettings = onCall(async (request) => {
  try {
    const { uid } = request.auth || {};
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { settings } = request.data;
    if (!settings) {
      throw new HttpsError('invalid-argument', 'Settings are required');
    }

    const db = getDb();
    const settingsRef = db.collection('notificationSettings').doc(uid);
    
    await settingsRef.set({
      ...settings,
      updatedAt: new Date(),
      updatedBy: uid
    }, { merge: true });

    console.log(`✅ Updated notification settings for user ${uid}`);

    return {
      success: true,
      message: 'Notification settings updated successfully'
    };

  } catch (error: any) {
    console.error('❌ Error updating notification settings:', error);
    throw new HttpsError('internal', `Failed to update notification settings: ${error.message}`);
  }
});

// Send test notification
export const sendTestStaffNotification = onCall(async (request) => {
  try {
    const { uid } = request.auth || {};
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const db = getDb();
    
    // Get user info
    const userRecord = await admin.auth().getUser(uid);
    const displayName = userRecord.displayName || userRecord.email || 'Unknown User';

    // Log the test notification
    const testNote: Omit<SystemNote, 'id'> = {
      senderName: 'System Test',
      senderEmail: 'system@test.com',
      recipientName: displayName,
      recipientEmail: userRecord.email || '',
      memberName: 'Test Member',
      noteContent: 'This is a test notification to verify your notification settings are working correctly.',
      noteType: 'system',
      priority: 'General',
      timestamp: new Date(),
      wasNotificationSent: true,
      notificationMethod: 'popup'
    };

    // Save to system log
    const noteRef = db.collection('systemNotes').doc();
    await noteRef.set({
      ...testNote,
      id: noteRef.id,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`✅ Test notification sent to user ${uid}`);

    return {
      success: true,
      message: 'Test notification sent successfully'
    };

  } catch (error: any) {
    console.error('❌ Error sending test notification:', error);
    throw new HttpsError('internal', `Failed to send test notification: ${error.message}`);
  }
});

// Log a staff note to the system
export const logStaffNote = onCall(async (request) => {
  try {
    const { uid } = request.auth || {};
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { 
      recipientEmail, 
      memberName, 
      applicationId, 
      noteContent, 
      noteType = 'internal', 
      priority = 'General',
      sendNotification = true 
    } = request.data;

    if (!recipientEmail || !noteContent) {
      throw new HttpsError('invalid-argument', 'Recipient email and note content are required');
    }

    const db = getDb();
    const normalizePriority = (value: string) => {
      const normalized = String(value || '').toLowerCase();
      if (normalized.includes('urgent')) return 'Urgent';
      if (normalized.includes('priority') || normalized.includes('immediate') || normalized.includes('high')) return 'Priority';
      return 'General';
    };
    const normalizedPriority = normalizePriority(priority);
    
    // Get sender info
    const senderRecord = await admin.auth().getUser(uid);
    const senderName = senderRecord.displayName || senderRecord.email || 'Unknown User';

    // Get recipient info
    let recipientRecord;
    try {
      recipientRecord = await admin.auth().getUserByEmail(recipientEmail);
    } catch (error) {
      throw new HttpsError('not-found', 'Recipient user not found');
    }
    
    const recipientName = recipientRecord.displayName || recipientRecord.email || 'Unknown User';

    // Check if recipient has notifications enabled
    let shouldSendNotification = sendNotification;
    if (sendNotification) {
      const recipientSettingsRef = db.collection('notificationSettings').doc(recipientRecord.uid);
      const recipientSettingsDoc = await recipientSettingsRef.get();
      const recipientSettings = recipientSettingsDoc.data();
      
      if (recipientSettings && !recipientSettings.noteNotifications) {
        shouldSendNotification = false;
      }
    }

    // Create the note record
    const noteRecord: Omit<SystemNote, 'id'> = {
      senderName,
      senderEmail: senderRecord.email || '',
      recipientName,
      recipientEmail,
      memberName,
      applicationId,
      noteContent,
      noteType,
      priority: normalizedPriority,
      timestamp: new Date(),
      wasNotificationSent: shouldSendNotification,
      notificationMethod: shouldSendNotification ? 'popup' : undefined
    };

    // Save to system log
    const noteRef = db.collection('systemNotes').doc();
    await noteRef.set({
      ...noteRecord,
      id: noteRef.id,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`✅ Staff note logged: ${senderName} → ${recipientName}`);

    return {
      success: true,
      noteId: noteRef.id,
      notificationSent: shouldSendNotification,
      message: 'Staff note logged successfully'
    };

  } catch (error: any) {
    console.error('❌ Error logging staff note:', error);
    throw new HttpsError('internal', `Failed to log staff note: ${error.message}`);
  }
});

// Get system note log (Super Admin only)
export const getSystemNoteLog = onCall(async (request) => {
  try {
    const { uid } = request.auth || {};
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Check if user is super admin
    const db = getDb();
    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();
    const userData = userDoc.data();
    
    if (!userData || userData.role !== 'super_admin') {
      throw new HttpsError('permission-denied', 'Super admin access required');
    }

    const { limit = 1000, startAfter } = request.data;

    // Query system notes
    let query = db.collection('systemNotes')
      .orderBy('timestamp', 'desc')
      .limit(limit);

    if (startAfter) {
      query = query.startAfter(startAfter);
    }

    const snapshot = await query.get();
    const notes = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        timestamp: data.timestamp?.toDate() || new Date(),
        readAt: data.readAt?.toDate() || undefined
      };
    });

    console.log(`📊 Retrieved ${notes.length} system notes for super admin`);

    return {
      success: true,
      notes,
      total: notes.length,
      message: `Retrieved ${notes.length} system notes`
    };

  } catch (error: any) {
    console.error('❌ Error getting system note log:', error);
    throw new HttpsError('internal', `Failed to get system note log: ${error.message}`);
  }
});

// Mark note as read
export const markNoteAsRead = onCall(async (request) => {
  try {
    const { uid } = request.auth || {};
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { noteId } = request.data;
    if (!noteId) {
      throw new HttpsError('invalid-argument', 'Note ID is required');
    }

    const db = getDb();
    const noteRef = db.collection('systemNotes').doc(noteId);
    
    // Get user info
    const userRecord = await admin.auth().getUser(uid);
    const userName = userRecord.displayName || userRecord.email || 'Unknown User';

    await noteRef.update({
      readAt: admin.firestore.FieldValue.serverTimestamp(),
      readBy: userName
    });

    console.log(`✅ Note ${noteId} marked as read by ${userName}`);

    return {
      success: true,
      message: 'Note marked as read'
    };

  } catch (error: any) {
    console.error('❌ Error marking note as read:', error);
    throw new HttpsError('internal', `Failed to mark note as read: ${error.message}`);
  }
});