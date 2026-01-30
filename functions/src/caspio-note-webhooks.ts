import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
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
  Note_ID?: string | number;
  Client_ID2?: string;
  Member_Name?: string;
  Note_Date?: string;
  Note_Content?: string;
  Staff_Name?: string;
  Note_Type?: string;
  Priority?: string;
  Created_By?: string;
  Assigned_Staff?: string;
  Immediate?: string | boolean;
  Immediate_Check?: string | boolean;
}

// Interface for connect_tbl_client_notes table
interface ClientNoteData {
  Note_ID?: string | number;
  Client_ID?: string;
  Client_ID2?: string;
  Client_Name?: string;
  Note_Date?: string;
  Note_Text?: string;
  Staff_Member?: string;
  Note_Category?: string;
  Priority?: string;
  Created_By?: string;
  Follow_Up_Assignment?: string;
  Assigned_First?: string;
  Immediate?: string | boolean;
  Immediate_Check?: string | boolean;
  Confirmed_Immediate_Sent?: string | boolean;
}

const caspioBaseUrl = defineSecret("CASPIO_BASE_URL");
const caspioClientId = defineSecret("CASPIO_CLIENT_ID");
const caspioClientSecret = defineSecret("CASPIO_CLIENT_SECRET");
const caspioWebhookSecret = defineSecret("CASPIO_WEBHOOK_SECRET");

// Staff email mapping
const STAFF_EMAIL_MAPPING: { [key: string]: string[] } = {
  'JHernandez': ['JHernandez@ilshealth.com'],
  'Jason': ['jason@carehomefinders.com'],
  'Jason Bloome': ['jason@carehomefinders.com'],
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
    const trimmedEmail = String(email || '').trim();
    if (!trimmedEmail) {
      return null;
    }

    const usersSnapshot = await db.collection('users')
      .where('email', '==', trimmedEmail)
      .limit(1)
      .get();

    if (!usersSnapshot.empty) {
      return usersSnapshot.docs[0].id;
    }

    // Fallback: case-insensitive lookup across admin users (roles collections)
    let candidateDocs = await getAdminUserDocs();
    if (candidateDocs.length === 0) {
      try {
        const allUsersSnap = await db.collection('users').limit(500).get();
        candidateDocs = allUsersSnap.docs;
      } catch (error) {
        console.warn('⚠️ Failed to scan users for email match:', error);
      }
    }

    const normalizedTarget = trimmedEmail.toLowerCase();
    const matchedDoc = candidateDocs.find((doc) => {
      const data = doc.data();
      const candidateEmail = String(data.email || '').trim().toLowerCase();
      return candidateEmail === normalizedTarget;
    });

    return matchedDoc ? matchedDoc.id : null;
  } catch (error) {
    console.error('Error finding user by email:', error);
    return null;
  }
}

const getAdminUserDocs = async (): Promise<admin.firestore.QueryDocumentSnapshot[]> => {
  const db = getDb();
  try {
    const [adminRolesSnap, superAdminRolesSnap] = await Promise.all([
      db.collection('roles_admin').get(),
      db.collection('roles_super_admin').get(),
    ]);

    const adminIds = new Set<string>([
      ...adminRolesSnap.docs.map((doc) => doc.id),
      ...superAdminRolesSnap.docs.map((doc) => doc.id),
    ]);

    if (adminIds.size === 0) {
      // Fallback to users collection flag if roles collections are empty
      try {
        const isAdminSnap = await db.collection('users')
          .where('isAdmin', '==', true)
          .get();
        if (!isAdminSnap.empty) {
          return isAdminSnap.docs;
        }
      } catch (error) {
        console.warn('⚠️ Failed to query users by isAdmin:', error);
      }

      try {
        const roleSnap = await db.collection('users')
          .where('role', 'in', ['admin', 'super_admin'])
          .get();
        if (!roleSnap.empty) {
          return roleSnap.docs;
        }
      } catch (error) {
        console.warn('⚠️ Failed to query users by role:', error);
      }

      return [];
    }

    const chunks: string[][] = [];
    const ids = Array.from(adminIds);
    for (let i = 0; i < ids.length; i += 10) {
      chunks.push(ids.slice(i, i + 10));
    }

    const snapshots = await Promise.all(
      chunks.map((chunk) =>
        db.collection('users')
          .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
          .get()
      )
    );

    return snapshots.flatMap((snap) => snap.docs);
  } catch (error) {
    console.warn('⚠️ Failed to fetch admin users from roles collections:', error);
    return [];
  }
};

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
  const { isImmediate, isPriorityNote, normalizedPriority } = getImmediateFlags(noteData);
  if (!isPriorityNote && !isImmediate) {
    return [];
  }

  const assignmentKey = noteData.Follow_Up_Assignment
    || noteData.Assigned_Staff
    || noteData.Assigned_First
    || noteData.Staff_Member
    || noteData.Staff_Name;

  const staffToNotify = await resolveStaffEmailsForAssignment(assignmentKey);
  console.log('📬 Resolved staff emails:', { assignmentKey, staffToNotify });
  if (staffToNotify.length === 0) {
    return [];
  }

  const notifications = [];
  const clientId2 = String(noteData.Client_ID2 || noteData.Client_ID || '').trim();
  const memberName = noteData.Member_Name || noteData.Client_Name || 'Unknown';

  const resolveApplicationContext = async (id?: string) => {
    if (!id) return { applicationId: null as string | null, actionUrl: null as string | null };
    try {
      const snapshot = await db.collectionGroup('applications')
        .where('client_ID2', '==', id)
        .limit(1)
        .get();
      if (!snapshot.empty) {
        const appDoc = snapshot.docs[0];
        const applicationId = appDoc.id;
        const userId = appDoc.ref.parent.parent?.id || '';
        return {
          applicationId,
          actionUrl: userId
            ? `/admin/applications/${applicationId}?userId=${userId}`
            : `/admin/applications/${applicationId}`
        };
      }
    } catch (error) {
      console.warn('Failed to resolve application by client_ID2:', error);
    }
    return {
      applicationId: null,
      actionUrl: id ? `/admin/member-notes?clientId2=${encodeURIComponent(id)}` : '/admin/member-notes'
    };
  };

  const appContext = await resolveApplicationContext(clientId2);
  const noteMessageBase = noteData.Note_Content || noteData.Note_Text || 'New note added';
  const noteMessage = noteMessageBase;
  
  for (const email of staffToNotify) {
    const userId = await getStaffUserIdFromEmail(email);
    
    if (userId) {
      // Create in-app notification
      const notificationData = {
        userId,
        noteId,
        title: `New ${tableType === 'calaim_members' ? 'CalAIM Member' : 'Client'} Note`,
        message: noteMessage,
        senderName: noteData.Staff_Name || noteData.Staff_Member || 'System',
        memberName,
        type: 'note',
        priority: normalizedPriority,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        isRead: false,
        status: 'Open',
        applicationId: appContext.applicationId ?? null,
        clientId2: clientId2 || null,
        actionUrl: appContext.actionUrl ?? null
      };

      const notificationRef = await db.collection('staff_notifications').add(notificationData);
      notifications.push(notificationRef.id);

    } else {
      console.warn(`⚠️ No user found for email "${email}" - notification skipped`);
    }
  }

  return notifications;
}

const normalizeYesValue = (value: string) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'y' || normalized === 'yes' || normalized === 'true' || normalized === '1';
};

const getImmediateFlags = (noteData: any) => {
  const priorityValue = String(noteData.Priority || '').toLowerCase();
  const immediateValue = String(noteData.Immediate_Check ?? noteData.Immediate ?? '').toLowerCase();
  const isImmediate =
    normalizeYesValue(immediateValue) ||
    immediateValue.includes('immediate') ||
    immediateValue.includes('urgent');
  const isPriorityNote =
    priorityValue.includes('priority') ||
    priorityValue.includes('high') ||
    priorityValue.includes('urgent') ||
    priorityValue.includes('🔴') ||
    priorityValue.includes('immediate');
  const normalizedPriority = isImmediate || priorityValue.includes('urgent') || priorityValue.includes('immediate')
    ? 'Urgent'
    : isPriorityNote
      ? 'Priority'
      : 'General';
  return { priorityValue, immediateValue, isImmediate, isPriorityNote, normalizedPriority };
};

const resolveCaspioConfig = () => {
  let baseUrl = '';
  let clientId = '';
  let clientSecret = '';

  try {
    baseUrl = caspioBaseUrl.value() || process.env.CASPIO_BASE_URL || '';
    clientId = caspioClientId.value() || process.env.CASPIO_CLIENT_ID || '';
    clientSecret = caspioClientSecret.value() || process.env.CASPIO_CLIENT_SECRET || '';
  } catch {
    baseUrl = process.env.CASPIO_BASE_URL || '';
    clientId = process.env.CASPIO_CLIENT_ID || '';
    clientSecret = process.env.CASPIO_CLIENT_SECRET || '';
  }

  const normalizedBaseUrl = baseUrl
    ? baseUrl.replace(/\/$/, '').endsWith('/rest/v2')
      ? baseUrl.replace(/\/$/, '')
      : `${baseUrl.replace(/\/$/, '')}/rest/v2`
    : 'https://c7ebl500.caspio.com/rest/v2';

  return { baseUrl: normalizedBaseUrl, clientId, clientSecret };
};

const getCaspioAccessToken = async () => {
  const { baseUrl, clientId, clientSecret } = resolveCaspioConfig();
  if (!clientId || !clientSecret) {
    throw new Error('Caspio credentials not configured');
  }

  const tokenBaseUrl = baseUrl.replace(/\/rest\/v2$/, '');
  const tokenUrl = `${tokenBaseUrl}/oauth/token`;
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const tokenResponse = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: 'grant_type=client_credentials',
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(`Failed to get Caspio token: ${tokenResponse.status} ${errorText}`);
  }

  const tokenData = await tokenResponse.json();
  return { accessToken: tokenData.access_token as string, dataBaseUrl: baseUrl };
};

const updateConfirmedImmediateSent = async (noteData: ClientNoteData, tableType: 'calaim_members' | 'client_notes') => {
  if (tableType !== 'client_notes') return;
  const rawNoteId =
    noteData.Note_ID ??
    (noteData as any).NoteID ??
    (noteData as any).noteId ??
    (noteData as any).id;
  const noteId = String(rawNoteId || '').trim();
  if (!noteId) {
    console.warn('⚠️ Confirmed_Immediate_Sent update skipped: missing Note_ID');
    return;
  }

  try {
    const { accessToken, dataBaseUrl } = await getCaspioAccessToken();
    const updateUrl = `${dataBaseUrl}/tables/connect_tbl_clientnotes/records?q.where=Note_ID='${encodeURIComponent(noteId)}'`;
    const updateResponse = await fetch(updateUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        Confirmed_Immediate_Sent: 'Y',
      }),
    });

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.warn(`⚠️ Failed to update Confirmed_Immediate_Sent for Note_ID=${noteId}: ${updateResponse.status} ${errorText}`);
      return;
    }

    console.log(`✅ Confirmed_Immediate_Sent updated for Note_ID=${noteId}`);
  } catch (error) {
    console.warn('⚠️ Confirmed_Immediate_Sent update failed:', error);
  }
};

const verifyWebhookSecret = (payload: any) => {
  let expectedSecret = '';
  try {
    expectedSecret = caspioWebhookSecret.value();
  } catch {
    expectedSecret = process.env.CASPIO_WEBHOOK_SECRET || '';
  }

  if (!expectedSecret) {
    return { ok: true, reason: 'secret_not_configured' };
  }

  const receivedSecret = String(payload?.secret || payload?.Secret || '').trim();
  if (!receivedSecret) {
    return { ok: false, reason: 'missing_secret' };
  }

  if (receivedSecret !== expectedSecret) {
    return { ok: false, reason: 'invalid_secret' };
  }

  return { ok: true, reason: 'secret_valid' };
};


const normalizeAssignmentValue = (value: string) => {
  return String(value || '').trim().toLowerCase();
};

const splitAssignmentTokens = (assignment: string) => {
  return assignment
    .split(/[,;/]+/g)
    .map((token) => token.trim())
    .filter(Boolean);
};

const findMappedEmails = (assignment: string) => {
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
};

async function resolveStaffEmailsForAssignment(assignment?: string): Promise<string[]> {
  if (!assignment) return [];
  const trimmed = String(assignment).trim();
  if (!trimmed) return [];

  const directMatches = splitAssignmentTokens(trimmed)
    .flatMap((token) => findMappedEmails(token));
  if (directMatches.length > 0) {
    return Array.from(new Set(directMatches));
  }

  try {
    const normalizedAssignment = normalizeAssignmentValue(trimmed);
    const adminDocs = await getAdminUserDocs();
    const candidates = adminDocs.map((doc) => {
      const data = doc.data();
      const email = String(data.email || '').trim();
      const displayName = String(data.displayName || '').trim();
      return {
        email,
        normalizedEmail: normalizeAssignmentValue(email),
        normalizedName: normalizeAssignmentValue(displayName),
        emailLocal: normalizeAssignmentValue(email.split('@')[0] || '')
      };
    });

    const matched = candidates.filter((candidate) => {
      if (!candidate.email) return false;
      return (
        candidate.normalizedEmail === normalizedAssignment ||
        candidate.normalizedName === normalizedAssignment ||
        candidate.emailLocal === normalizedAssignment
      );
    }).map((candidate) => candidate.email);

    if (matched.length > 0) {
      return Array.from(new Set(matched));
    }
  } catch (error) {
    console.warn('⚠️ Failed to resolve staff emails from users collection:', error);
  }

  console.warn(`⚠️ Unknown staff assignment "${assignment}" - no email mapping found`);
  return [];
}

// Webhook endpoint for CalAIM_Members_Notes_ILS table
export const caspioCalAIMNotesWebhook = onRequest(
  { 
    cors: true,
    secrets: [caspioWebhookSecret]
  },
  async (request, response) => {
    try {
      console.log('📝 CalAIM Notes Webhook received:', request.body);

      if (request.method !== 'POST') {
        response.status(405).json({ error: 'Method not allowed' });
        return;
      }

      const noteData: CalAIMNoteData & { secret?: string } = request.body;
      const secretCheck = verifyWebhookSecret(noteData);
      if (!secretCheck.ok) {
        console.warn(`❌ CalAIM webhook secret check failed: ${secretCheck.reason}`);
        response.status(401).json({ error: 'Unauthorized webhook' });
        return;
      }

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
    secrets: [caspioBaseUrl, caspioClientId, caspioClientSecret, caspioWebhookSecret]
  },
  async (request, response) => {
    try {
      console.log('📝 Client Notes Webhook received:', request.body);

      if (request.method !== 'POST') {
        response.status(405).json({ error: 'Method not allowed' });
        return;
      }

      const noteData: ClientNoteData & { secret?: string } = request.body;
      const secretCheck = verifyWebhookSecret(noteData);
      if (!secretCheck.ok) {
        console.warn(`❌ Client webhook secret check failed: ${secretCheck.reason}`);
        response.status(401).json({ error: 'Unauthorized webhook' });
        return;
      }

      // Validate required fields
      if (!noteData.Note_Text && !noteData.Client_Name) {
        response.status(400).json({ error: 'Missing required note data' });
        return;
      }

      // Store note in Firestore
      const noteId = await storeNoteInFirestore(noteData, 'client_notes');

      const { isImmediate, normalizedPriority } = getImmediateFlags(noteData);

      // Send notifications to staff
      const notifications = await sendStaffNotifications(noteData, noteId, 'client_notes');

      if (isImmediate && notifications.length > 0) {
        await updateConfirmedImmediateSent(noteData, 'client_notes');
      }

      console.log(`✅ Client note processed: ${noteId}, notifications sent: ${notifications.length}`);

      response.status(200).json({
        success: true,
        noteId,
        notificationsSent: notifications.length,
        immediateDetected: isImmediate,
        normalizedPriority,
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