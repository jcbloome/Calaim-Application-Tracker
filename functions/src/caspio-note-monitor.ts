import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

/**
 * SAFE READ-ONLY CASPIO NOTE MONITORING SYSTEM
 * 
 * This system ONLY READS from Caspio to monitor for new priority notes
 * and sends notifications to staff via FCM. NO WRITE OPERATIONS to Caspio.
 */

interface CaspioNote {
  noteId: string;
  clientId2: string;
  memberName: string;
  noteContent: string;
  priority: 'General' | 'Priority' | 'Urgent' | string;
  staffAssigned?: string;
  dateCreated: string;
  createdBy: string;
  isPriority: boolean;
}

interface NotificationPayload {
  title: string;
  body: string;
  data: {
    type: 'priority_note';
    noteId: string;
    clientId2: string;
    memberName: string;
    priority: string;
    actionUrl: string;
    message: string;
  };
}

/**
 * Get Caspio access token (READ-ONLY)
 */
async function getCaspioAccessToken(): Promise<string> {
  const baseUrl = 'https://c7ebl500.caspio.com/rest/v2';
  const clientId = 'b721f0c7af4d4f7542e8a28665bfccb07e93f47deb4bda27bc';
  const clientSecret = 'bad425d4a8714c8b95ec2ea9d256fc649b2164613b7e54099c';
  
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const tokenUrl = `https://c7ebl500.caspio.com/oauth/token`;
  
  const tokenResponse = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    },
    body: 'grant_type=client_credentials',
  });
  
  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new HttpsError('internal', `Failed to get Caspio token: ${tokenResponse.status} ${errorText}`);
  }
  
  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

/**
 * Fetch new priority notes from Caspio (READ-ONLY)
 */
async function fetchNewPriorityNotes(sinceTimestamp?: string): Promise<CaspioNote[]> {
  try {
    const accessToken = await getCaspioAccessToken();
    const baseUrl = 'https://c7ebl500.caspio.com/rest/v2';
    
    // Adjust table name and field names based on your actual Caspio structure
    const notesTable = 'CalAIM_tbl_Notes'; // Replace with actual table name
    
    // Build query to get notes since last check
    let queryUrl = `${baseUrl}/tables/${notesTable}/records?q.pageSize=1000`;
    
    // Add timestamp filter if provided
    if (sinceTimestamp) {
      queryUrl += `&q.where=DateCreated>'${sinceTimestamp}'`;
    }
    
    // Add priority filter (priority or urgent)
    const priorityClause = "(Priority='high' OR Priority='urgent' OR Priority='priority')";
    queryUrl += sinceTimestamp ? ` AND ${priorityClause}` : `?q.where=${priorityClause}`;
    
    console.log('📥 Fetching priority notes from Caspio:', queryUrl);
    
    const response = await fetch(queryUrl, {
      method: 'GET', // READ-ONLY operation
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new HttpsError('internal', `Failed to fetch notes: ${response.status} ${errorText}`);
    }
    
    const data = await response.json();
    const notes = data.Result || [];
    
    console.log(`📋 Found ${notes.length} priority notes`);
    
    const normalizePriority = (value: string) => {
      const normalized = String(value || '').toLowerCase();
      if (normalized.includes('urgent')) return 'Urgent';
      if (normalized.includes('priority') || normalized.includes('high')) return 'Priority';
      return 'General';
    };

    // Transform Caspio data to our format
    return notes.map((note: any): CaspioNote => ({
      noteId: note.NoteID || note.noteId || note.id,
      clientId2: note.client_ID2 || note.ClientID2 || note.clientId2,
      memberName: `${note.MemberFirstName || ''} ${note.MemberLastName || ''}`.trim(),
      noteContent: note.NoteContent || note.noteContent || note.content,
      priority: normalizePriority(note.Priority || 'General'),
      staffAssigned: note.StaffAssigned || note.staffAssigned,
      dateCreated: note.DateCreated || note.dateCreated || note.timestamp,
      createdBy: note.CreatedBy || note.createdBy || note.author,
      isPriority: ['Priority', 'Urgent'].includes(normalizePriority(note.Priority || ''))
    }));
    
  } catch (error: any) {
    console.error('❌ Error fetching priority notes:', error);
    throw error;
  }
}

/**
 * Send FCM notification to staff about priority note
 */
async function sendPriorityNoteNotification(note: CaspioNote, staffTokens: string[]): Promise<void> {
  if (staffTokens.length === 0) {
    console.log('⚠️ No staff tokens available for notification');
    return;
  }
  
  const alertPrefix = note.priority === 'Urgent' ? '🚨 Urgent Note' : '⚠️ Priority Note';
  const payload: NotificationPayload = {
    title: `${alertPrefix}: ${note.memberName}`,
    body: note.noteContent.substring(0, 100) + (note.noteContent.length > 100 ? '...' : ''),
    data: {
      type: 'priority_note',
      noteId: note.noteId,
      clientId2: note.clientId2,
      memberName: note.memberName,
      priority: note.priority,
      actionUrl: `/admin/member/${note.clientId2}?tab=notes&highlight=${note.noteId}`,
      message: note.noteContent
    }
  };
  
  try {
    // Send to all staff tokens
    const message = {
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: payload.data,
      webpush: {
        notification: {
          title: payload.title,
          body: payload.body,
          icon: '/calaimlogopdf.png',
          badge: '/calaimlogopdf.png',
          tag: `priority-${note.noteId}`,
          requireInteraction: true,
        },
        fcmOptions: {
          link: payload.data.actionUrl
        }
      },
      tokens: staffTokens,
    };
    
    const response = await admin.messaging().sendEachForMulticast(message);
    
    console.log(`📱 Sent priority note notification to ${response.successCount}/${staffTokens.length} devices`);
    
    if (response.failureCount > 0) {
      console.warn(`⚠️ Failed to send to ${response.failureCount} devices:`, response.responses
        .filter(r => !r.success)
        .map(r => r.error?.message)
      );
    }
    
  } catch (error: any) {
    console.error('❌ Error sending FCM notification:', error);
    throw error;
  }
}

/**
 * Get all staff FCM tokens from Firestore
 */
async function getStaffFCMTokens(): Promise<string[]> {
  try {
    const firestore = admin.firestore();
    
    // Get all admin users (adjust collection name as needed)
    const adminRolesSnapshot = await firestore.collection('roles_admin').get();
    const adminUIDs = adminRolesSnapshot.docs.map(doc => doc.id);
    
    // Also include hardcoded admin
    const allAdminUIDs = [...adminUIDs, 'jason@carehomefinders.com']; // Adjust as needed
    
    const tokens: string[] = [];
    
    // Get FCM tokens for each admin
    for (const uid of allAdminUIDs) {
      try {
        const userDoc = await firestore.collection('users').doc(uid).get();
        const userData = userDoc.data();
        
        if (userData?.fcmToken) {
          tokens.push(userData.fcmToken);
        }
        
        // Also check for multiple tokens if stored as array
        if (userData?.fcmTokens && Array.isArray(userData.fcmTokens)) {
          tokens.push(...userData.fcmTokens);
        }
      } catch (error) {
        console.warn(`⚠️ Could not get FCM token for user ${uid}:`, error);
      }
    }
    
    console.log(`📱 Found ${tokens.length} staff FCM tokens`);
    return tokens.filter(token => token && token.length > 0);
    
  } catch (error: any) {
    console.error('❌ Error getting staff FCM tokens:', error);
    return [];
  }
}

/**
 * Store last check timestamp in Firestore
 */
async function updateLastCheckTimestamp(timestamp: string): Promise<void> {
  try {
    const firestore = admin.firestore();
    await firestore.collection('admin-settings').doc('caspio-note-monitor').set({
      lastCheckTimestamp: timestamp,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    
    console.log('✅ Updated last check timestamp:', timestamp);
  } catch (error: any) {
    console.error('❌ Error updating timestamp:', error);
  }
}

/**
 * Get last check timestamp from Firestore
 */
async function getLastCheckTimestamp(): Promise<string | null> {
  try {
    const firestore = admin.firestore();
    const doc = await firestore.collection('admin-settings').doc('caspio-note-monitor').get();
    
    if (doc.exists) {
      const data = doc.data();
      return data?.lastCheckTimestamp || null;
    }
    
    return null;
  } catch (error: any) {
    console.error('❌ Error getting last check timestamp:', error);
    return null;
  }
}

/**
 * SCHEDULED FUNCTION: Check for new priority notes every 15 minutes
 * This runs automatically and safely monitors Caspio for priority notes
 */
export const monitorCaspioPriorityNotes = onSchedule({
  schedule: "*/15 * * * *", // Every 15 minutes
  timeZone: "America/Los_Angeles", // PST/PDT
  memory: "256MiB",
  timeoutSeconds: 300
}, async (event) => {
  try {
    console.log('🔍 Starting Caspio priority note monitoring...');
    
    // Get last check timestamp
    const lastCheck = await getLastCheckTimestamp();
    const currentTime = new Date().toISOString();
    
    console.log('📅 Last check:', lastCheck || 'Never');
    console.log('📅 Current time:', currentTime);
    
    // Fetch new priority notes since last check
    const newNotes = await fetchNewPriorityNotes(lastCheck || undefined);
    
    if (newNotes.length === 0) {
      console.log('✅ No new priority notes found');
      await updateLastCheckTimestamp(currentTime);
      return;
    }
    
    console.log(`🚨 Found ${newNotes.length} new priority notes!`);
    
    // Get staff FCM tokens
    const staffTokens = await getStaffFCMTokens();
    
    if (staffTokens.length === 0) {
      console.warn('⚠️ No staff FCM tokens found - cannot send notifications');
      await updateLastCheckTimestamp(currentTime);
      return;
    }
    
    // Send notification for each priority note
    for (const note of newNotes) {
      try {
        await sendPriorityNoteNotification(note, staffTokens);
        console.log(`✅ Sent notification for note ${note.noteId}`);
        
        // Small delay between notifications to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`❌ Failed to send notification for note ${note.noteId}:`, error);
      }
    }
    
    // Update last check timestamp
    await updateLastCheckTimestamp(currentTime);
    
    console.log(`🎉 Priority note monitoring complete: ${newNotes.length} notifications sent`);
    
  } catch (error: any) {
    console.error('❌ Error in priority note monitoring:', error);
    throw error;
  }
});

/**
 * MANUAL FUNCTION: Test the priority note monitoring system
 * Call this from admin panel to test the system
 */
export const testPriorityNoteMonitoring = onCall(async (request) => {
  try {
    console.log('🧪 Testing priority note monitoring system...');
    
    // Fetch recent priority notes (last 24 hours)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const testNotes = await fetchNewPriorityNotes(yesterday.toISOString());
    
    console.log(`📋 Found ${testNotes.length} priority notes in last 24 hours`);
    
    // Get staff tokens
    const staffTokens = await getStaffFCMTokens();
    console.log(`📱 Found ${staffTokens.length} staff FCM tokens`);
    
    if (testNotes.length > 0 && staffTokens.length > 0) {
      // Send test notification for first note
      await sendPriorityNoteNotification(testNotes[0], staffTokens);
      console.log('✅ Test notification sent successfully');
    }
    
    return {
      success: true,
      message: `Test complete: ${testNotes.length} notes found, ${staffTokens.length} staff tokens`,
      notesFound: testNotes.length,
      staffTokens: staffTokens.length,
      sampleNote: testNotes[0] || null
    };
    
  } catch (error: any) {
    console.error('❌ Error testing priority note monitoring:', error);
    throw new HttpsError('internal', `Test failed: ${error.message}`);
  }
});

/**
 * MANUAL FUNCTION: Get priority notes for admin dashboard
 * This allows admins to view priority notes in the app
 */
export const getPriorityNotesForDashboard = onCall(async (request) => {
  try {
    console.log('📊 Fetching priority notes for admin dashboard...');
    
    // Get recent priority notes (last 7 days)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    const priorityNotes = await fetchNewPriorityNotes(weekAgo.toISOString());
    
    return {
      success: true,
      notes: priorityNotes,
      count: priorityNotes.length,
      message: `Found ${priorityNotes.length} priority notes in last 7 days`
    };
    
  } catch (error: any) {
    console.error('❌ Error fetching priority notes for dashboard:', error);
    throw new HttpsError('internal', `Failed to fetch priority notes: ${error.message}`);
  }
});