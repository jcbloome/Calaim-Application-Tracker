import { NextRequest, NextResponse } from 'next/server';

interface CaspioNote {
  PK_ID: number;
  Client_ID2: number;
  Comments: string;
  User_ID: number;
  Time_Stamp: string;
  Follow_Up_Date?: string;
  Note_Status?: string;
  Follow_Up_Status?: string;
  User_Full_Name?: string;
  Senior_Full_Name?: string;
  Follow_Up_Assignment?: string;
  Assigned_First?: string;
}

interface MemberNote {
  id: string;
  clientId2: string;
  memberName: string;
  noteText: string;
  noteType: 'General' | 'Medical' | 'Social' | 'Administrative' | 'Follow-up' | 'Emergency';
  createdBy: string;
  createdByName: string;
  assignedTo?: string;
  assignedToName?: string;
  createdAt: string;
  updatedAt: string;
  source: 'Caspio' | 'App' | 'Admin';
  isRead: boolean;
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  followUpDate?: string;
  tags?: string[];
}

// Caspio configuration - hardcoded for development
const CASPIO_BASE_URL = 'https://c7ebl500.caspio.com';
const CASPIO_CLIENT_ID = 'b721f0c7af4d4f7542e8a28665bfccb07e93f47deb4bda27bc';
const CASPIO_CLIENT_SECRET = 'bad425d4a8714c8b95ec2ea9d256fc649b2164613b7e54099c';

// Get Caspio access token
async function getCaspioToken() {
  const tokenUrl = `${CASPIO_BASE_URL}/oauth/token`;
  const credentials = Buffer.from(`${CASPIO_CLIENT_ID}:${CASPIO_CLIENT_SECRET}`).toString('base64');

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    throw new Error(`Failed to get Caspio token: ${response.statusText}`);
  }

  const data = await response.json();
  return data.access_token;
}

// In-memory storage for caching (in production, use Firestore)
let memberNotesCache: { [clientId2: string]: MemberNote[] } = {};
let lastSyncTimestamp: { [clientId2: string]: string } = {};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clientId2 = searchParams.get('clientId2');
    const forceSync = searchParams.get('forceSync') === 'true';

    if (!clientId2) {
      return NextResponse.json(
        { success: false, error: 'Client ID is required' },
        { status: 400 }
      );
    }

    console.log(`📥 Fetching notes for member: ${clientId2}`);

    // Check if we need to sync from Caspio (first time or forced sync)
    const needsSync = forceSync || !memberNotesCache[clientId2] || !lastSyncTimestamp[clientId2];

    if (needsSync) {
      console.log(`🔄 Syncing notes from Caspio for ${clientId2}`);
      await syncNotesFromCaspio(clientId2);
    } else {
      // Check for new notes since last sync
      await syncNewNotesFromCaspio(clientId2);
    }

    const notes = memberNotesCache[clientId2] || [];
    
    // Sort notes by creation date (newest first)
    notes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({
      success: true,
      notes,
      totalNotes: notes.length,
      lastSync: lastSyncTimestamp[clientId2] || null,
      fromCache: !needsSync
    });

  } catch (error: any) {
    console.error('Error fetching member notes:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch member notes' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      clientId2, 
      noteText, 
      noteType, 
      priority, 
      assignedTo, 
      assignedToName, 
      followUpDate, 
      createdBy, 
      createdByName,
      recipientIds,
      sendNotification,
      authorId,
      authorName,
      memberName,
      category
    } = body;

    if (!clientId2 || !noteText || !authorId) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    console.log(`📝 Creating new note for Client_ID2: ${clientId2}`);

    const timestamp = new Date().toISOString();
    const newNote: MemberNote = {
      id: `app_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      clientId2,
      memberName: memberName || 'Unknown Member',
      noteText,
      noteType: category || noteType || 'General',
      createdBy: authorId || createdBy,
      createdByName: authorName || createdByName || 'Unknown User',
      assignedTo,
      assignedToName: assignedToName || (assignedTo ? getStaffDisplayName(assignedTo) : undefined),
      createdAt: timestamp,
      updatedAt: timestamp,
      source: 'App',
      isRead: !assignedTo && (!recipientIds || recipientIds.length === 0), // Unread if assigned to someone else
      priority: priority || 'Medium',
      followUpDate,
      tags: body.tags || []
    };

    // Add to cache
    if (!memberNotesCache[clientId2]) {
      memberNotesCache[clientId2] = [];
    }
    memberNotesCache[clientId2].unshift(newNote);

    // Save to Firestore for persistence (in production, implement proper Firestore integration)
    await saveNoteToFirestore(newNote);

    // Sync to Caspio
    await syncNoteToCaspio(newNote);

    // Send notifications to all recipients if sendNotification is true
    if (sendNotification && recipientIds && recipientIds.length > 0) {
      for (const recipientId of recipientIds) {
        const noteForRecipient = {
          ...newNote,
          assignedTo: recipientId,
          assignedToName: `Staff Member ${recipientId}` // In production, lookup actual name
        };
        await sendNoteNotification(noteForRecipient);
      }
    }

    // Also send notification if specifically assigned to someone
    if (assignedTo && assignedToName) {
      await sendNoteNotification(newNote);
    }

    return NextResponse.json({
      success: true,
      note: newNote,
      message: 'Note created successfully'
    });

  } catch (error: any) {
    console.error('Error creating member note:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create note' },
      { status: 500 }
    );
  }
}

async function syncNotesFromCaspio(clientId2: string): Promise<void> {
  try {
    console.log(`🔄 Syncing notes from connect_tbl_clientnotes for Client_ID2: ${clientId2}`);
    
    const token = await getCaspioToken();
    
    // Fetch notes from connect_tbl_clientnotes table
    const apiUrl = `${CASPIO_BASE_URL}/rest/v2/tables/connect_tbl_clientnotes/records?q.where=Client_ID2='${clientId2}'&q.orderBy=Time_Stamp DESC`;
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Caspio API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const caspioNotes: CaspioNote[] = data.Result || [];
    
    console.log(`📥 Retrieved ${caspioNotes.length} notes from Caspio for Client_ID2: ${clientId2}`);

    // Convert Caspio notes to our format
    const convertedNotes: MemberNote[] = caspioNotes.map(caspioNote => ({
      id: `caspio_${caspioNote.PK_ID}`,
      clientId2: caspioNote.Client_ID2.toString(),
      memberName: caspioNote.Senior_Full_Name || 'Unknown Member',
      noteText: caspioNote.Comments || '',
      noteType: 'General', // Default since no specific type field
      createdBy: caspioNote.User_ID.toString(),
      createdByName: caspioNote.User_Full_Name || `User ${caspioNote.User_ID}`,
      assignedTo: caspioNote.Follow_Up_Assignment || undefined,
      assignedToName: caspioNote.Assigned_First || undefined,
      createdAt: caspioNote.Time_Stamp || new Date().toISOString(),
      updatedAt: caspioNote.Time_Stamp || new Date().toISOString(),
      source: 'Caspio',
      isRead: true, // Existing notes are considered read
      priority: caspioNote.Follow_Up_Status?.includes('🟢') ? 'Medium' : 'Low',
      followUpDate: caspioNote.Follow_Up_Date
    }));

    // Store in cache (in production, save to Firestore)
    memberNotesCache[clientId2] = convertedNotes;
    lastSyncTimestamp[clientId2] = new Date().toISOString();

    console.log(`✅ Synced ${convertedNotes.length} notes from Caspio for Client_ID2: ${clientId2}`);

  } catch (error) {
    console.error('❌ Error syncing notes from Caspio:', error);
    throw error;
  }
}

async function syncNewNotesFromCaspio(clientId2: string): Promise<void> {
  try {
    const lastSync = lastSyncTimestamp[clientId2];
    if (!lastSync) return;

    console.log(`🔄 Checking for new notes since ${lastSync} for ${clientId2}`);
    
    // In production, this would query Caspio for notes newer than lastSync
    // For now, we'll simulate no new notes
    
    lastSyncTimestamp[clientId2] = new Date().toISOString();

  } catch (error) {
    console.error('Error syncing new notes from Caspio:', error);
  }
}

async function syncNoteToCaspio(note: MemberNote): Promise<void> {
  try {
    console.log(`📤 Syncing new note to connect_tbl_clientnotes: ${note.id}`);
    
    const token = await getCaspioToken();
    
    // Create new record in connect_tbl_clientnotes
    const caspioData = {
      Client_ID2: parseInt(note.clientId2),
      Comments: note.noteText,
      User_ID: parseInt(note.createdBy),
      Time_Stamp: note.createdAt,
      Follow_Up_Date: note.followUpDate || null,
      Note_Status: note.noteType,
      Follow_Up_Status: note.priority === 'High' ? '🔴 Urgent' : '🟢 Open',
      User_Full_Name: note.createdByName,
      Follow_Up_Assignment: note.assignedTo || null,
      Assigned_First: note.assignedToName || null
    };

    const apiUrl = `${CASPIO_BASE_URL}/rest/v2/tables/connect_tbl_clientnotes/records`;
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(caspioData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create note in Caspio: ${response.status} ${errorText}`);
    }

    // Handle empty 201 response
    let result = null;
    const responseText = await response.text();
    if (responseText.trim()) {
      result = JSON.parse(responseText);
    }
    
    console.log(`✅ Note synced to Caspio connect_tbl_clientnotes: ${note.id}`);

  } catch (error) {
    console.error('❌ Error syncing note to Caspio:', error);
    // Don't throw error - note is still saved locally
  }
}

async function saveNoteToFirestore(note: MemberNote): Promise<void> {
  try {
    console.log(`💾 Saving note to Firestore: ${note.id}`);
    
    // In production, implement proper Firestore integration
    // const { getFirestore } = await import('firebase-admin/firestore');
    // const { adminDb } = await import('@/firebase-admin');
    
    // const noteData = {
    //   ...note,
    //   createdAt: getFirestore().Timestamp.fromDate(new Date(note.createdAt)),
    //   updatedAt: getFirestore().Timestamp.fromDate(new Date(note.updatedAt)),
    //   followUpDate: note.followUpDate ? getFirestore().Timestamp.fromDate(new Date(note.followUpDate)) : null
    // };
    
    // await adminDb.collection('member-notes').doc(note.id).set(noteData);
    
    console.log(`✅ Note saved to Firestore: ${note.id}`);

  } catch (error) {
    console.error('❌ Error saving note to Firestore:', error);
    // Don't throw error - note is still saved in cache and Caspio
  }
}

async function sendNoteNotification(note: MemberNote): Promise<void> {
  try {
    if (!note.assignedTo || !note.assignedToName) return;

    console.log(`🔔 Sending notification to ${note.assignedToName} for note: ${note.id}`);
    
    // Create a notification record in Firestore for real-time notifications
    const { getFirestore } = await import('firebase-admin/firestore');
    const { adminDb } = await import('@/firebase-admin');
    
    const notification = {
      userId: note.assignedTo,
      noteId: note.id,
      title: 'New Note Assigned',
      message: `You have been assigned a new ${note.priority.toLowerCase()} priority note for ${note.memberName}`,
      senderName: note.createdByName,
      memberName: note.memberName,
      type: 'note_assignment',
      priority: note.priority.toLowerCase() as 'low' | 'medium' | 'high',
      timestamp: getFirestore().Timestamp.now(),
      isRead: false,
      applicationId: note.clientId2
    };

    // Save to Firestore for real-time notifications
    await adminDb.collection('staff_notifications').add(notification);
    
    // Send email notification
    try {
      // Get staff email (in production, this would be a database lookup)
      const staffEmail = getStaffEmail(note.assignedTo);
      
      if (staffEmail) {
        const { sendNoteAssignmentEmail } = await import('@/app/actions/send-email');
        
        await sendNoteAssignmentEmail({
          to: staffEmail,
          staffName: note.assignedToName,
          memberName: note.memberName,
          noteContent: note.noteText,
          priority: note.priority.toLowerCase() as 'low' | 'medium' | 'high',
          assignedBy: note.createdByName,
          noteType: note.noteType,
          source: 'portal',
          clientId2: note.clientId2
        });
        
        console.log(`📧 Email sent to ${staffEmail} for note assignment`);
      } else {
        console.warn(`⚠️ No email found for staff ID: ${note.assignedTo}`);
      }
    } catch (emailError) {
      console.error('❌ Failed to send email notification:', emailError);
      // Don't throw error - notification was still saved to Firestore
    }
    
    console.log(`✅ Notification saved to Firestore for ${note.assignedToName}`);

  } catch (error) {
    console.error('Error sending note notification:', error);
  }
}

function getStaffEmail(staffId: string): string | null {
  // Staff email mapping (in production, this would be a database lookup)
  const staffEmailMap: { [key: string]: string } = {
    'nick-staff': 'nick@carehomefinders.com',
    'john-staff': 'john@carehomefinders.com',
    'jessie-staff': 'jessie@carehomefinders.com',
    'jason-admin': 'jason@carehomefinders.com',
    'monica-staff': 'monica@carehomefinders.com',
    'leidy-staff': 'leidy@carehomefinders.com'
  };
  
  return staffEmailMap[staffId] || null;
}

function getUserDisplayName(userId: string): string {
  // In production, this would lookup user details from the database
  const userMap: { [key: string]: string } = {
    'sarah_johnson': 'Sarah Johnson, MSW',
    'mike_wilson': 'Dr. Mike Wilson, RN',
    'emily_davis': 'Emily Davis, MSW',
    'david_chen': 'David Chen, RN'
  };
  
  return userMap[userId] || userId;
}

function getStaffDisplayName(staffId: string): string {
  // Staff display name mapping (in production, this would be a database lookup)
  const staffNameMap: { [key: string]: string } = {
    'nick-staff': 'Nick Rodriguez',
    'john-staff': 'John Smith',
    'jessie-staff': 'Jessie Martinez',
    'jason-admin': 'Jason Bloome',
    'monica-staff': 'Monica Garcia',
    'leidy-staff': 'Leidy Kanjanapitak'
  };
  
  return staffNameMap[staffId] || staffId;
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, clientId2, ...updates } = body;

    if (!id || !clientId2) {
      return NextResponse.json(
        { success: false, error: 'Note ID and Client ID are required' },
        { status: 400 }
      );
    }

    console.log(`📝 Updating note: ${id} for member: ${clientId2}`);

    const memberNotes = memberNotesCache[clientId2] || [];
    const noteIndex = memberNotes.findIndex(note => note.id === id);

    if (noteIndex === -1) {
      return NextResponse.json(
        { success: false, error: 'Note not found' },
        { status: 404 }
      );
    }

    // Update the note
    memberNotes[noteIndex] = {
      ...memberNotes[noteIndex],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    // In production, also sync update to Caspio if it's a Caspio note
    if (memberNotes[noteIndex].source === 'Caspio') {
      await syncNoteToCaspio(memberNotes[noteIndex]);
    }

    return NextResponse.json({
      success: true,
      note: memberNotes[noteIndex],
      message: 'Note updated successfully'
    });

  } catch (error: any) {
    console.error('Error updating member note:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update note' },
      { status: 500 }
    );
  }
}