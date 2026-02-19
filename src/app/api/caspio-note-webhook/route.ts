import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

interface CaspioNoteWebhookData {
  Client_ID2?: string;
  Member_Name?: string;
  Note_Date?: string;
  Note_Content?: string;
  Staff_Name?: string;
  Note_Type?: string;
  Priority?: 'General' | 'Priority' | 'Urgent' | string;
  Created_By?: string;
  Assigned_To?: string; // Staff ID or email
  Record_ID?: string;
}

// Staff mapping for notifications
const STAFF_MAPPING: { [key: string]: { id: string; name: string; email: string } } = {
  'nick': { id: 'nick-staff', name: 'Nick', email: 'nick@carehomefinders.com' },
  'john': { id: 'john-staff', name: 'John', email: 'john@carehomefinders.com' },
  'jessie': { id: 'jessie-staff', name: 'Jessie', email: 'jessie@carehomefinders.com' },
  'jason': { id: 'jason-admin', name: 'Jason', email: 'jason@carehomefinders.com' },
  'monica': { id: 'monica-staff', name: 'Monica', email: 'monica@carehomefinders.com' },
  'leidy': { id: 'leidy-staff', name: 'Leidy', email: 'leidy@carehomefinders.com' }
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('📥 Received Caspio note webhook:', body);

    // Handle both single record and array of records
    const records = Array.isArray(body) ? body : [body];

    for (const record of records) {
      await processNoteWebhook(record);
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${records.length} note webhook(s)`,
      processedCount: records.length
    });

  } catch (error: any) {
    console.error('❌ Error processing Caspio note webhook:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to process webhook',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

async function processNoteWebhook(data: CaspioNoteWebhookData) {
  try {
    const {
      Client_ID2,
      Member_Name,
      Note_Content,
      Staff_Name,
      Note_Type,
      Priority,
      Created_By,
      Assigned_To,
      Record_ID
    } = data;

    if (!Client_ID2 || !Note_Content) {
      console.log('⚠️ Skipping webhook - missing required fields');
      return;
    }

    console.log(`📝 Processing note for member: ${Member_Name} (${Client_ID2})`);

    // Determine if this note is assigned to a staff member
    let assignedStaff = null;
    if (Assigned_To) {
      const staffKey = Assigned_To.toLowerCase();
      assignedStaff = STAFF_MAPPING[staffKey];
      
      if (!assignedStaff) {
        // Try to find by email
        const staffByEmail = Object.values(STAFF_MAPPING).find(
          staff => staff.email.toLowerCase() === Assigned_To.toLowerCase()
        );
        if (staffByEmail) {
          assignedStaff = staffByEmail;
        }
      }
    }

    const normalizePriority = (value?: string) => {
      const normalized = String(value || '').toLowerCase();
      if (normalized.includes('urgent')) return 'Urgent';
      if (normalized.includes('priority') || normalized.includes('immediate') || normalized.includes('high')) return 'Priority';
      return 'General';
    };
    const normalizedPriority = normalizePriority(Priority);

    // If note is assigned to a staff member, create a notification
    if (assignedStaff) {
      console.log(`🔔 Creating notification for ${assignedStaff.name} (${assignedStaff.email})`);

      const notification = {
        userId: assignedStaff.id,
        noteId: Record_ID || `caspio_${Date.now()}`,
        title: 'New Note from Caspio',
        message: `A new ${normalizedPriority} note has been assigned to you for ${Member_Name || 'Unknown Member'}`,
        senderName: Created_By || Staff_Name || 'Caspio System',
        memberName: Member_Name || 'Unknown Member',
        type: 'note_assignment',
        priority: normalizedPriority,
        timestamp: getFirestore().Timestamp.now(),
        isRead: false,
        // Preserve Client_ID2 as explicit metadata for Electron replies.
        clientId2: Client_ID2,
        source: 'caspio',
        noteContent: Note_Content.substring(0, 200) + (Note_Content.length > 200 ? '...' : ''), // Truncate for notification
        noteType: Note_Type || 'General'
      };

      // Save to Firestore for real-time notifications
      await adminDb.collection('staff_notifications').add(notification);
      
      // Send email notification
      try {
        const { sendNoteAssignmentEmail } = await import('@/app/actions/send-email');
        
        await sendNoteAssignmentEmail({
          to: assignedStaff.email,
          staffName: assignedStaff.name,
          memberName: Member_Name || 'Unknown Member',
          noteContent: Note_Content,
          priority: normalizedPriority,
          assignedBy: Created_By || Staff_Name || 'Caspio System',
          noteType: Note_Type || 'General',
          source: 'caspio',
          clientId2: Client_ID2
        });
        
        console.log(`📧 Email sent to ${assignedStaff.email} for Caspio note assignment`);
      } catch (emailError) {
        console.error('❌ Failed to send email notification:', emailError);
        // Don't throw error - notification was still saved to Firestore
      }
      
      console.log(`✅ Notification created for ${assignedStaff.name} - Note from Caspio`);
    } else {
      console.log(`ℹ️ Note not assigned to any tracked staff member (Assigned_To: ${Assigned_To})`);
    }

    // Also log the note processing for audit purposes
    await adminDb.collection('caspio_note_logs').add({
      clientId2: Client_ID2,
      memberName: Member_Name,
      noteContent: Note_Content,
      staffName: Staff_Name,
      noteType: Note_Type,
      priority: Priority,
      createdBy: Created_By,
      assignedTo: Assigned_To,
      recordId: Record_ID,
      processedAt: getFirestore().Timestamp.now(),
      notificationSent: !!assignedStaff
    });

  } catch (error) {
    console.error('❌ Error processing individual note webhook:', error);
    throw error;
  }
}

// GET endpoint for webhook verification (some webhook services require this)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const challenge = searchParams.get('challenge');
  
  if (challenge) {
    return NextResponse.json({ challenge });
  }
  
  return NextResponse.json({
    status: 'Caspio Note Webhook Endpoint',
    timestamp: new Date().toISOString(),
    description: 'POST to this endpoint to receive note assignment notifications from Caspio'
  });
}