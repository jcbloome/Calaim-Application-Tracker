import { NextRequest, NextResponse } from 'next/server';
// DO NOT MOVE THIS IMPORT. It must be early to initialize Firebase Admin.
import '@/ai/firebase';
import * as admin from 'firebase-admin';

// Types for Client Notes data
interface ClientNote {
  id: string;
  noteId: string;
  clientId2: string;
  userId?: string;
  comments: string;
  timeStamp: string;
  followUpDate?: string;
  followUpAssignment?: string;
  followUpStatus?: string;
  seniorFirst?: string;
  seniorLast?: string;
  seniorFullName?: string;
  userFullName?: string;
  userRole?: string;
  isNew?: boolean;
  deleted?: boolean;
}

interface UserRegistration {
  userId: string;
  userFullName: string;
  role: string;
}

// Helper function to get notes from Firestore
async function getNotesFromFirestore(clientId2: string | null, userId: string | null): Promise<ClientNote[]> {
  const firestore = admin.firestore();
  let notesRef: admin.firestore.Query = firestore.collection('client_notes');
  
  if (clientId2) {
    notesRef = notesRef.where('clientId2', '==', clientId2);
  }
  if (userId) {
    notesRef = notesRef.where('userId', '==', userId);
  }
  
  const snapshot = await notesRef.orderBy('timeStamp', 'desc').get();
  return snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() } as ClientNote))
    .filter(note => !note.deleted);
}

async function getDeletedClientNoteIds(clientId2?: string | null): Promise<Set<string>> {
  if (!clientId2) return new Set();
  const firestore = admin.firestore();
  try {
    const snapshot = await firestore
      .collection('client_notes')
      .where('clientId2', '==', clientId2)
      .where('deleted', '==', true)
      .get();
    return new Set(snapshot.docs.map(doc => doc.id));
  } catch (error) {
    console.warn('Failed to load deleted client note ids:', error);
    return new Set();
  }
}

async function getCaspioAccessToken() {
  const dataBaseUrl = 'https://c7ebl500.caspio.com/rest/v2';
  const clientId = 'b721f0c7af4d4f7542e8a28665bfccb07e93f47deb4bda27bc';
  const clientSecret = 'bad425d4a8714c8b95ec2ea9d256fc649b2164613b7e54099c';

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const tokenUrl = 'https://c7ebl500.caspio.com/oauth/token';

  const tokenResponse = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  if (!tokenResponse.ok) {
    throw new Error('Failed to get Caspio access token');
  }

  const tokenData = await tokenResponse.json();
  return { accessToken: tokenData.access_token, dataBaseUrl };
}

async function logSystemNoteAction(payload: {
  action: string;
  noteId?: string;
  memberName?: string;
  clientId2?: string;
  status?: string;
  actorName?: string;
  actorEmail?: string;
}) {
  try {
    const firestore = admin.firestore();
    const noteRef = firestore.collection('systemNotes').doc();
    await noteRef.set({
      id: noteRef.id,
      senderName: payload.actorName || 'System',
      senderEmail: payload.actorEmail || '',
      recipientName: 'System Log',
      recipientEmail: '',
      memberName: payload.memberName || '',
      applicationId: payload.clientId2 || '',
      noteContent: [
        payload.action,
        payload.noteId ? `Note ID: ${payload.noteId}` : null,
        payload.memberName ? `Member: ${payload.memberName}` : null,
        payload.status ? `Status: ${payload.status}` : null
      ].filter(Boolean).join(' • '),
      noteType: 'system',
      priority: 'General',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      wasNotificationSent: false
    });
  } catch (error) {
    console.warn('Failed to log system note action:', error);
  }
}

// Helper function to get sync metadata from Firestore
async function getSyncMetadata(clientId2: string): Promise<{ lastSync: Date | null; noteCount: number }> {
  const firestore = admin.firestore();
  const syncDoc = await firestore.doc(`client_notes_sync/${clientId2}`).get();
  
  if (syncDoc.exists) {
    const data = syncDoc.data();
    return {
      lastSync: data?.lastSync?.toDate() || null,
      noteCount: data?.noteCount || 0
    };
  }
  
  return { lastSync: null, noteCount: 0 };
}

// Helper function to save notes to Firestore
async function saveNotesToFirestore(notes: ClientNote[], clientId2: string): Promise<void> {
  const firestore = admin.firestore();
  const batchSize = 500; // Firestore batch limit
  
  // Process notes in batches
  for (let i = 0; i < notes.length; i += batchSize) {
    const batch = firestore.batch();
    const batchNotes = notes.slice(i, i + batchSize);
    
    // Save each note in this batch
    for (const note of batchNotes) {
      const noteId = note.noteId || note.id || `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const noteRef = firestore.doc(`client_notes/${noteId}`);
      
      const noteData = {
        ...note,
        id: noteId,
        syncedAt: admin.firestore.FieldValue.serverTimestamp(),
        syncedFrom: 'caspio'
      };
      
      batch.set(noteRef, noteData, { merge: true });
    }
    
    await batch.commit();
    console.log(`✅ Saved batch ${Math.floor(i / batchSize) + 1} (${batchNotes.length} notes) to Firestore`);
  }
  
  // Update sync metadata (separate operation)
  const syncRef = firestore.doc(`client_notes_sync/${clientId2}`);
  await syncRef.set({
    lastSync: admin.firestore.FieldValue.serverTimestamp(),
    noteCount: notes.length,
    clientId2,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  
  console.log(`✅ Saved ${notes.length} total notes to Firestore for client ${clientId2}`);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clientId2 = searchParams.get('clientId2');
    const userId = searchParams.get('userId');
    const since = searchParams.get('since'); // Timestamp for incremental sync
    const includeAll = searchParams.get('includeAll') === 'true'; // Force full sync
    const forceRefresh = searchParams.get('forceRefresh') === 'true'; // Force refresh from Caspio
    
    console.log('📝 Fetching client notes...', { 
      clientId2, 
      userId, 
      since, 
      includeAll,
      forceRefresh,
      syncType: forceRefresh ? 'FORCE_REFRESH' : includeAll ? 'INITIAL_SYNC' : since ? 'INCREMENTAL_SYNC' : 'CACHED_FIRST'
    });
    
    // If we have a clientId2, check Firestore cache first (unless force refresh)
    if (clientId2 && !forceRefresh && !includeAll) {
      try {
        const cachedNotes = await getNotesFromFirestore(clientId2, userId);
        const syncMetadata = await getSyncMetadata(clientId2);
        
        // If we have cached notes and sync was recent (within last hour), return cached
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        if (cachedNotes.length > 0 && syncMetadata.lastSync && syncMetadata.lastSync > oneHourAgo) {
          console.log(`✅ Returning ${cachedNotes.length} cached notes from Firestore (last sync: ${syncMetadata.lastSync})`);
          
          // Still do incremental sync in background if we have a lastSync timestamp
          if (syncMetadata.lastSync) {
            // Fire and forget incremental sync
            fetchFromCaspioAndSave(clientId2, userId, syncMetadata.lastSync.toISOString()).catch(err => {
              console.error('Background sync error:', err);
            });
          }
          
          // Process cached notes same way as Caspio notes
          return formatNotesResponse(cachedNotes, clientId2);
        } else if (cachedNotes.length > 0) {
          // We have cached notes but they're stale, do incremental sync
          console.log(`🔄 Cached notes are stale, doing incremental sync from ${syncMetadata.lastSync || 'beginning'}`);
          const incrementalSince = syncMetadata.lastSync ? syncMetadata.lastSync.toISOString() : undefined;
          const newNotes = await fetchFromCaspioAndSave(clientId2, userId, incrementalSince);
          
          // Combine cached and new notes, remove duplicates
          const allNotes = [...cachedNotes, ...newNotes];
          const uniqueNotes = Array.from(
            new Map(allNotes.map(note => [note.noteId || note.id, note])).values()
          );
          
          return formatNotesResponse(uniqueNotes, clientId2);
        }
      } catch (firestoreError) {
        console.warn('⚠️ Firestore cache check failed, falling back to Caspio:', firestoreError);
        // Continue to Caspio fetch
      }
    }
    
    // Fetch from Caspio (either no cache, force refresh, or initial sync)
    const notes = await fetchFromCaspioAndSave(clientId2 || undefined, userId || undefined, since || undefined, includeAll);
    
    return formatNotesResponse(notes, clientId2 || undefined);
    
  } catch (error: any) {
    console.error('❌ Error fetching client notes:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Failed to fetch client notes',
        data: { 
          notes: [],
          notesByClient: {},
          notesByUser: {},
          totalNotes: 0,
          newNotes: 0,
          clients: 0,
          assignedUsers: 0,
          users: [],
          sourceTable: 'none'
        }
      },
      { status: 500 }
    );
  }
}

// Helper function to fetch from Caspio and save to Firestore
async function fetchFromCaspioAndSave(
  clientId2?: string,
  userId?: string,
  since?: string,
  includeAll: boolean = false
): Promise<ClientNote[]> {
    
    const { accessToken, dataBaseUrl } = await getCaspioAccessToken();

    // Fetch client notes from connect_tbl_clientnotes
    const notesTable = 'connect_tbl_clientnotes';
    let allNotes: any[] = [];
    let pageNumber = 1;
    const pageSize = 100;
    const maxPages = 50;
    let pageRecords: any[] = [];

    console.log('📊 Fetching client notes...');

    do {
      let notesUrl = `${dataBaseUrl}/tables/${notesTable}/records?q.pageSize=${pageSize}&q.pageNumber=${pageNumber}`;
      
      // Add filters based on sync type
      const filters = [];
      
      if (clientId2) {
        filters.push(`Client_ID2='${clientId2}'`);
      }
      if (userId) {
        filters.push(`User_ID='${userId}'`);
      }
      
      // For incremental sync, only get notes after the timestamp
      if (since && !includeAll) {
        filters.push(`Time_Stamp>'${since}'`);
        console.log(`📅 Incremental sync: fetching notes after ${since}`);
      } else if (includeAll) {
        console.log(`📦 Initial sync: fetching ALL notes for member ${clientId2}`);
      }
      
      if (filters.length > 0) {
        notesUrl += `&q.where=${filters.join('%20AND%20')}`;
      }
      
      console.log(`🌐 Fetching page ${pageNumber} from ${notesTable}...`);

      const notesResponse = await fetch(notesUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      console.log(`📡 Response status for ${notesTable} page ${pageNumber}:`, notesResponse.status);
      
      if (!notesResponse.ok) {
        const errorText = await notesResponse.text();
        console.log(`❌ Error response for ${notesTable} page ${pageNumber}:`, errorText);
        break;
      }

      const notesData = await notesResponse.json();
      pageRecords = notesData.Result || [];
      
      console.log(`📄 Retrieved ${pageRecords.length} notes from page ${pageNumber}`);
      
      if (pageRecords.length > 0) {
        allNotes = allNotes.concat(pageRecords);
        pageNumber++;
      }

      if (pageRecords.length < pageSize) {
        console.log(`📋 Reached end of data - got ${pageRecords.length} records`);
        break;
      }

      if (pageNumber > maxPages) {
        console.log(`⚠️ Reached maximum pages limit (${maxPages})`);
        break;
      }
      
    } while (pageRecords.length === pageSize && pageNumber <= maxPages);

    console.log(`✅ Found ${allNotes.length} total client notes from ${pageNumber - 1} pages`);
    
    // Fetch user registration data for staff names and roles
    const userTable = 'connect_tbl_usersregistration';
    let allUsers: any[] = [];
    pageNumber = 1;
    pageRecords = [];

    console.log('👥 Fetching user registration data...');

    do {
      const usersUrl = `${dataBaseUrl}/tables/${userTable}/records?q.pageSize=${pageSize}&q.pageNumber=${pageNumber}`;
      console.log(`🌐 Fetching page ${pageNumber} from ${userTable}...`);

      const usersResponse = await fetch(usersUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!usersResponse.ok) {
        console.log(`❌ Error fetching users page ${pageNumber}`);
        break;
      }

      const usersData = await usersResponse.json();
      pageRecords = usersData.Result || [];
      
      if (pageRecords.length > 0) {
        allUsers = allUsers.concat(pageRecords);
        pageNumber++;
      }

      if (pageRecords.length < pageSize) break;
      if (pageNumber > maxPages) break;
      
    } while (pageRecords.length === pageSize && pageNumber <= maxPages);

    console.log(`✅ Found ${allUsers.length} total users`);

    // Create user lookup map
    const userLookup = allUsers.reduce((acc: any, user) => {
      acc[user.User_ID] = {
        userId: user.User_ID,
        userFullName: user.User_Full_Name || `${user.First_Name || ''} ${user.Last_Name || ''}`.trim(),
        role: user.Role || 'Staff'
      };
      return acc;
    }, {});

    // Fetch client data for member names
    const clientsTable = 'connect_tbl_clients';
    let allClients: any[] = [];
    pageNumber = 1;
    pageRecords = [];

    console.log('👤 Fetching client data for member names...');

    do {
      const clientsUrl = `${dataBaseUrl}/tables/${clientsTable}/records?q.pageSize=${pageSize}&q.pageNumber=${pageNumber}`;
      
      const clientsResponse = await fetch(clientsUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!clientsResponse.ok) {
        console.log(`❌ Error fetching clients page ${pageNumber}`);
        break;
      }

      const clientsData = await clientsResponse.json();
      pageRecords = clientsData.Result || [];
      
      if (pageRecords.length > 0) {
        allClients = allClients.concat(pageRecords);
        pageNumber++;
      }

      if (pageRecords.length < pageSize) break;
      if (pageNumber > maxPages) break;
      
    } while (pageRecords.length === pageSize && pageNumber <= maxPages);

    console.log(`✅ Found ${allClients.length} total clients`);

    // Create client lookup map
    const clientLookup = allClients.reduce((acc: any, client) => {
      acc[client.Client_ID2] = {
        seniorFirst: client.Senior_First,
        seniorLast: client.Senior_Last,
        seniorFullName: client.Senior_Full_Name || `${client.Senior_First || ''} ${client.Senior_Last || ''}`.trim()
      };
      return acc;
    }, {});

    // Map notes with user and client information
    const notes: ClientNote[] = allNotes.map((record: any) => {
      const user = userLookup[record.User_ID] || {};
      const client = clientLookup[record.Client_ID2] || {};
      
      return {
        id: record.Note_ID || record.ID || record.id || Math.random().toString(36),
        noteId: record.Note_ID || '',
        clientId2: record.Client_ID2 || '',
        userId: record.User_ID || '',
        comments: record.Comments || '',
        timeStamp: record.Time_Stamp || '',
        followUpDate: record.Follow_Up_Date || '',
        followUpAssignment: record.Follow_Up_Assignment || '',
        followUpStatus: record.Follow_Up_Status || '',
        seniorFirst: client.seniorFirst || '',
        seniorLast: client.seniorLast || '',
        seniorFullName: client.seniorFullName || '',
        userFullName: user.userFullName || '',
        userRole: user.role || '',
        isNew: since ? new Date(record.Time_Stamp) > new Date(since) : false
      };
    });

    const deletedIds = await getDeletedClientNoteIds(clientId2);
    const filteredNotes = notes.filter(note => !deletedIds.has(note.noteId || note.id));

    // Sort by timestamp (newest first)
    filteredNotes.sort((a, b) => new Date(b.timeStamp).getTime() - new Date(a.timeStamp).getTime());

    console.log(`✅ Processed ${filteredNotes.length} client notes from Caspio`);

    // Save to Firestore if we have a clientId2
    if (clientId2 && filteredNotes.length > 0) {
      try {
        await saveNotesToFirestore(filteredNotes, clientId2);
      } catch (saveError) {
        console.error('⚠️ Failed to save notes to Firestore:', saveError);
        // Don't fail the request if save fails
      }
    }

    return filteredNotes;
}

// Helper function to format notes response
function formatNotesResponse(notes: ClientNote[], clientId2?: string): NextResponse {
  // Group notes by client for easier access
  const notesByClient = notes.reduce((acc: any, note) => {
    if (!acc[note.clientId2]) {
      acc[note.clientId2] = {
        clientId2: note.clientId2,
        seniorFullName: note.seniorFullName,
        notes: [],
        totalNotes: 0,
        newNotes: 0
      };
    }
    
    acc[note.clientId2].notes.push(note);
    acc[note.clientId2].totalNotes++;
    if (note.isNew) {
      acc[note.clientId2].newNotes++;
    }
    
    return acc;
  }, {});

  // Group notes by assigned user for notifications
  const notesByUser = notes
    .filter(note => note.userId)
    .reduce((acc: any, note) => {
      if (!acc[note.userId]) {
        acc[note.userId] = {
          userId: note.userId,
          userFullName: note.userFullName,
          userRole: note.userRole,
          notes: [],
          totalNotes: 0,
          newNotes: 0
        };
      }
      
      acc[note.userId].notes.push(note);
      acc[note.userId].totalNotes++;
      if (note.isNew) {
        acc[note.userId].newNotes++;
      }
      
      return acc;
    }, {});

  // Extract unique users from notes
  const users = Array.from(
    new Map(
      notes
        .filter(note => note.userId && note.userFullName)
        .map(note => [note.userId, { userId: note.userId, userFullName: note.userFullName, role: note.userRole || 'Staff' }])
    ).values()
  );

  const response = {
    success: true,
    data: {
      notes,
      notesByClient,
      notesByUser,
      totalNotes: notes.length,
      newNotes: notes.filter(n => n.isNew).length,
      clients: Object.keys(notesByClient).length,
      assignedUsers: Object.keys(notesByUser).length,
      users,
      sourceTable: 'connect_tbl_clientnotes'
    }
  };

  console.log('📝 Client notes summary:', {
    totalNotes: response.data.totalNotes,
    newNotes: response.data.newNotes,
    clients: response.data.clients,
    assignedUsers: response.data.assignedUsers
  });

  return NextResponse.json(response);
}

export async function POST(request: NextRequest) {
  try {
    const noteData = await request.json();
    
    console.log('📝 Creating new client note:', noteData);
    
    // Validate required fields
    if (!noteData.clientId2 || !noteData.comments) {
      return NextResponse.json(
        { success: false, message: 'Client ID and comments are required' },
        { status: 400 }
      );
    }

    const { accessToken, dataBaseUrl } = await getCaspioAccessToken();

    // Verify client exists in Caspio
    const clientCheckUrl = `${dataBaseUrl}/tables/connect_tbl_clients/records?q.where=Client_ID2='${noteData.clientId2}'&q.limit=1`;
    const clientCheckResponse = await fetch(clientCheckUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    if (!clientCheckResponse.ok) {
      throw new Error('Failed to verify client in Caspio');
    }
    const clientCheck = await clientCheckResponse.json();
    if (!clientCheck?.Result || clientCheck.Result.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Client_ID2 not found in Caspio. Notes can only be created for existing clients.' },
        { status: 404 }
      );
    }

    // Prepare note data for Caspio
    const caspioNoteData = {
      Client_ID2: noteData.clientId2,
      User_ID: noteData.userId || null,
      Comments: noteData.comments,
      Time_Stamp: new Date().toISOString(),
      Follow_Up_Date: noteData.followUpDate || null,
      Follow_Up_Assignment: noteData.followUpAssignment || null,
      Follow_Up_Status: noteData.followUpStatus || 'Open'
    };

    // Insert note into Caspio
    const notesTable = 'connect_tbl_clientnotes';
    const insertUrl = `${dataBaseUrl}/tables/${notesTable}/records`;
    
    const insertResponse = await fetch(insertUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(caspioNoteData)
    });

    if (!insertResponse.ok) {
      const errorText = await insertResponse.text();
      console.error('❌ Error inserting note:', errorText);
      throw new Error('Failed to create note in Caspio');
    }

    const insertResult = await insertResponse.json();
    console.log('✅ Note created successfully:', insertResult);
    const caspioNoteId = insertResult?.Result?.Note_ID || insertResult?.Result?.note_id || insertResult?.Result?.ID;

    let firestoreSaved = false;
    if (caspioNoteId) {
      try {
        const firestore = admin.firestore();
        await firestore.doc(`client_notes/${caspioNoteId}`).set({
          id: caspioNoteId,
          noteId: caspioNoteId,
          clientId2: String(noteData.clientId2),
          userId: noteData.userId || null,
          comments: noteData.comments,
          timeStamp: new Date().toISOString(),
          followUpDate: noteData.followUpDate || '',
          followUpAssignment: noteData.followUpAssignment || '',
          followUpStatus: noteData.followUpStatus || 'Open',
          syncedAt: admin.firestore.FieldValue.serverTimestamp(),
          syncedFrom: 'caspio'
        }, { merge: true });
        firestoreSaved = true;
      } catch (firestoreError) {
        console.warn('⚠️ Failed to save note to Firestore:', firestoreError);
      }
    }

    await logSystemNoteAction({
      action: 'Client note created',
      noteId: String(caspioNoteId || ''),
      clientId2: String(noteData.clientId2),
      status: noteData.followUpStatus || 'Open',
      actorName: noteData.actorName || 'Staff',
      actorEmail: noteData.actorEmail || ''
    });

    // If note is assigned to staff, send push notification
    if (noteData.userId && noteData.followUpAssignment) {
      try {
        console.log('📱 Sending push notification for assigned note...');
        
        // This would call your Firebase function to send the notification
        const notificationResponse = await fetch('/api/firebase-function', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            functionName: 'sendNoteNotification',
            data: {
              noteData: {
                noteId: caspioNoteId || 'new-note',
                clientId2: noteData.clientId2,
                clientName: `Client ${noteData.clientId2}`, // You could look this up from clients table
                assignedUserId: noteData.followUpAssignment,
                assignedUserName: 'Staff Member', // You could look this up from users table
                comments: noteData.comments,
                followUpDate: noteData.followUpDate,
                createdBy: 'Current User', // You could get this from auth
                createdAt: new Date().toISOString()
              },
              notificationType: noteData.followUpDate ? 'followup' : 'assignment'
            }
          }),
        });

        if (notificationResponse.ok) {
          console.log('✅ Push notification sent successfully');
        } else {
          console.warn('⚠️ Push notification failed, but note was created');
        }
      } catch (notificationError) {
        console.error('❌ Error sending push notification:', notificationError);
        // Don't fail the note creation if notification fails
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Note created successfully' + (noteData.followUpAssignment ? ' and notification sent' : ''),
      data: {
        noteId: caspioNoteId,
        ...caspioNoteData,
        caspioSaved: true,
        firestoreSaved
      },
      sync: {
        caspio: true,
        firestore: firestoreSaved
      }
    });

  } catch (error: any) {
    console.error('❌ Error creating client note:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Failed to create client note'
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { noteId, clientId2, followUpStatus, followUpDate, followUpAssignment, actorName, actorEmail } = body || {};

    if (!noteId || !clientId2) {
      return NextResponse.json(
        { success: false, error: 'Note ID and client ID are required' },
        { status: 400 }
      );
    }

    const hasAnyUpdate =
      followUpStatus !== undefined ||
      followUpDate !== undefined ||
      followUpAssignment !== undefined;

    if (!hasAnyUpdate) {
      return NextResponse.json(
        { success: false, error: 'No updates provided' },
        { status: 400 }
      );
    }

    const { accessToken, dataBaseUrl } = await getCaspioAccessToken();
    const updateUrl = `${dataBaseUrl}/tables/connect_tbl_clientnotes/records?q.where=Note_ID='${noteId}'`;

    const updatePayload: Record<string, any> = {};
    if (followUpStatus !== undefined) updatePayload.Follow_Up_Status = followUpStatus;
    if (followUpDate !== undefined) updatePayload.Follow_Up_Date = followUpDate || null;
    if (followUpAssignment !== undefined) updatePayload.Follow_Up_Assignment = followUpAssignment || null;

    const updateResponse = await fetch(updateUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updatePayload)
    });

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      throw new Error(`Failed to update Caspio note: ${updateResponse.status} ${errorText}`);
    }

    const firestore = admin.firestore();
    await firestore.doc(`client_notes/${noteId}`).set({
      ...(followUpStatus !== undefined ? { followUpStatus } : {}),
      ...(followUpDate !== undefined ? { followUpDate } : {}),
      ...(followUpAssignment !== undefined ? { followUpAssignment } : {}),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    await logSystemNoteAction({
      action:
        followUpStatus !== undefined && (followUpDate !== undefined || followUpAssignment !== undefined)
          ? 'Client note updated'
          : followUpDate !== undefined
            ? 'Client note follow-up date updated'
            : followUpAssignment !== undefined
              ? 'Client note follow-up assignment updated'
              : 'Client note status updated',
      noteId,
      clientId2,
      status: followUpStatus,
      actorName,
      actorEmail
    });

    return NextResponse.json({
      success: true,
      message: 'Note updated'
    });
  } catch (error: any) {
    console.error('❌ Error updating client note:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update note status' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { noteId, clientId2, actorName, actorEmail } = body || {};

    if (!noteId || !clientId2) {
      return NextResponse.json(
        { success: false, error: 'Note ID and client ID are required' },
        { status: 400 }
      );
    }

    const { accessToken, dataBaseUrl } = await getCaspioAccessToken();
    const deleteUrl = `${dataBaseUrl}/tables/connect_tbl_clientnotes/records?q.where=Note_ID='${noteId}'`;
    const deleteResponse = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!deleteResponse.ok) {
      const errorText = await deleteResponse.text();
      throw new Error(`Failed to delete Caspio note: ${deleteResponse.status} ${errorText}`);
    }

    const firestore = admin.firestore();
    await firestore.doc(`client_notes/${noteId}`).set({
      deleted: true,
      deletedAt: admin.firestore.FieldValue.serverTimestamp(),
      deletedBy: actorEmail || actorName || 'System'
    }, { merge: true });

    await logSystemNoteAction({
      action: 'Client note deleted',
      noteId,
      clientId2,
      actorName,
      actorEmail
    });

    return NextResponse.json({
      success: true,
      message: 'Note deleted'
    });
  } catch (error: any) {
    console.error('❌ Error deleting client note:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete note' },
      { status: 500 }
    );
  }
}