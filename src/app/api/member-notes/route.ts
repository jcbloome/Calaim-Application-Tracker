import { NextRequest, NextResponse } from 'next/server';

interface CaspioNote {
  Record_ID: string;
  Client_ID2: string;
  Note_Text: string;
  User_ID: string;
  Time_Stamp: string;
  Follow_Up_Date?: string;
  Note_Type?: string;
  Priority?: string;
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

// In-memory storage for demonstration (in production, use Firestore)
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

    console.log(`📝 Creating new note for member: ${clientId2}`);

    const newNote: MemberNote = {
      id: `app_${Date.now()}`,
      clientId2,
      memberName: memberName || 'Unknown Member',
      noteText,
      noteType: category || noteType || 'General',
      createdBy: authorId || createdBy,
      createdByName: authorName || createdByName || 'Unknown User',
      assignedTo,
      assignedToName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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

    // In production, also sync to Caspio
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
    // Simulate Caspio API call
    console.log(`🔄 Syncing all notes from Caspio for ${clientId2}`);
    
    // In production, this would be a real Caspio API call
    const mockCaspioNotes: CaspioNote[] = [
      {
        Record_ID: 'caspio_1',
        Client_ID2: clientId2,
        Note_Text: 'Initial assessment completed. Member is adjusting well to RCFE placement.',
        User_ID: 'sarah_johnson',
        Time_Stamp: '2026-01-15T10:30:00Z',
        Note_Type: 'General',
        Priority: 'Medium'
      },
      {
        Record_ID: 'caspio_2',
        Client_ID2: clientId2,
        Note_Text: 'Monthly visit completed. Member reports satisfaction with care.',
        User_ID: 'mike_wilson',
        Time_Stamp: '2026-01-10T09:00:00Z',
        Note_Type: 'Follow-up',
        Priority: 'Low'
      }
    ];

    // Convert Caspio notes to our format
    const convertedNotes: MemberNote[] = mockCaspioNotes.map(caspioNote => ({
      id: caspioNote.Record_ID,
      clientId2: caspioNote.Client_ID2,
      memberName: 'Member Name', // Would be fetched from member data
      noteText: caspioNote.Note_Text,
      noteType: (caspioNote.Note_Type as MemberNote['noteType']) || 'General',
      createdBy: caspioNote.User_ID,
      createdByName: getUserDisplayName(caspioNote.User_ID),
      createdAt: caspioNote.Time_Stamp,
      updatedAt: caspioNote.Time_Stamp,
      source: 'Caspio',
      isRead: true, // Existing notes are considered read
      priority: (caspioNote.Priority as MemberNote['priority']) || 'Medium',
      followUpDate: caspioNote.Follow_Up_Date
    }));

    // Store in cache
    memberNotesCache[clientId2] = convertedNotes;
    lastSyncTimestamp[clientId2] = new Date().toISOString();

    console.log(`✅ Synced ${convertedNotes.length} notes from Caspio for ${clientId2}`);

  } catch (error) {
    console.error('Error syncing notes from Caspio:', error);
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
    console.log(`📤 Syncing note to Caspio: ${note.id}`);
    
    // In production, this would create a new record in connect_tbl_clientnote
    const caspioData = {
      Client_ID2: note.clientId2,
      Note_Text: note.noteText,
      User_ID: note.createdBy,
      Time_Stamp: note.createdAt,
      Follow_Up_Date: note.followUpDate,
      Note_Type: note.noteType,
      Priority: note.priority
    };

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log(`✅ Note synced to Caspio: ${note.id}`);

  } catch (error) {
    console.error('Error syncing note to Caspio:', error);
    // Don't throw error - note is still saved locally
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