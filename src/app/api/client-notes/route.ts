import { NextRequest, NextResponse } from 'next/server';

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
}

interface UserRegistration {
  userId: string;
  userFullName: string;
  role: string;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clientId2 = searchParams.get('clientId2');
    const userId = searchParams.get('userId');
    const since = searchParams.get('since'); // Timestamp for incremental sync
    const includeAll = searchParams.get('includeAll') === 'true'; // For initial sync
    
    console.log('📝 Fetching client notes from Caspio...', { 
      clientId2, 
      userId, 
      since, 
      includeAll,
      syncType: includeAll ? 'INITIAL_SYNC' : since ? 'INCREMENTAL_SYNC' : 'STANDARD_FETCH'
    });
    
    // Use same authentication pattern as other APIs
    const dataBaseUrl = 'https://c7ebl500.caspio.com/rest/v2';
    const clientId = 'b721f0c7af4d4f7542e8a28665bfccb07e93f47deb4bda27bc';
    const clientSecret = 'bad425d4a8714c8b95ec2ea9d256fc649b2164613b7e54099c';
    
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenUrl = 'https://c7ebl500.caspio.com/oauth/token';
    
    console.log('🔐 Getting Caspio access token...');
    
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
    const accessToken = tokenData.access_token;

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

    // Sort by timestamp (newest first)
    notes.sort((a, b) => new Date(b.timeStamp).getTime() - new Date(a.timeStamp).getTime());

    console.log(`✅ Processed ${notes.length} client notes`);

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
        users: Object.values(userLookup),
        sourceTable: notesTable
      }
    };

    console.log('📝 Client notes summary:', {
      totalNotes: response.data.totalNotes,
      newNotes: response.data.newNotes,
      clients: response.data.clients,
      assignedUsers: response.data.assignedUsers
    });

    return NextResponse.json(response);

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

    // Use same authentication pattern
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
    const accessToken = tokenData.access_token;

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
                noteId: insertResult.Result?.Note_ID || 'new-note',
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
        noteId: insertResult.Result?.Note_ID,
        ...caspioNoteData
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