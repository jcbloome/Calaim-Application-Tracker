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
const STAFF_MAPPING: { [key: string]: { name: string; email: string } } = {
  nick: { name: 'Nick', email: 'nick@carehomefinders.com' },
  john: { name: 'John', email: 'john@carehomefinders.com' },
  jessie: { name: 'Jessie', email: 'jessie@carehomefinders.com' },
  jason: { name: 'Jason', email: 'jason@carehomefinders.com' },
  monica: { name: 'Monica', email: 'monica@carehomefinders.com' },
  leidy: { name: 'Leidy', email: 'leidy@carehomefinders.com' },
};

const normalize = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase();

const looksLikeEmail = (value: string) => /\S+@\S+\.\S+/.test(value);

type ResolvedStaff = {
  uid: string;
  name: string;
  email: string;
};

async function resolveAssignedStaff(assignedToRaw: string): Promise<ResolvedStaff | null> {
  const assignedTo = normalize(assignedToRaw);
  if (!assignedTo) return null;

  // 1) Exact UID match.
  try {
    const directUser = await adminDb.collection('users').doc(assignedToRaw.trim()).get();
    if (directUser.exists) {
      const data = directUser.data() as any;
      const email = normalize(data?.email);
      return {
        uid: directUser.id,
        name: String(data?.displayName || data?.firstName || data?.email || directUser.id),
        email: email || '',
      };
    }
  } catch {
    // ignore
  }

  // 2) Direct email from webhook OR mapped nickname to email.
  const mapped = STAFF_MAPPING[assignedTo];
  const candidateEmail = looksLikeEmail(assignedTo) ? assignedTo : normalize(mapped?.email || '');
  if (candidateEmail) {
    const exactEmail = await adminDb
      .collection('users')
      .where('email', '==', candidateEmail)
      .limit(1)
      .get()
      .catch(() => null);
    const hit = exactEmail?.docs?.[0];
    if (hit) {
      const data = hit.data() as any;
      return {
        uid: hit.id,
        name: String(data?.displayName || data?.firstName || data?.email || mapped?.name || hit.id),
        email: normalize(data?.email) || candidateEmail,
      };
    }
  }

  // 3) Case-insensitive fallback by scanning user profiles.
  const usersSnap = await adminDb.collection('users').limit(1000).get().catch(() => null);
  for (const docSnap of usersSnap?.docs || []) {
    const u = docSnap.data() as any;
    const email = normalize(u?.email);
    const displayName = normalize(u?.displayName || '');
    const firstName = normalize(u?.firstName || '');
    const lastName = normalize(u?.lastName || '');
    const fullName = normalize(`${firstName} ${lastName}`);
    const emailLocal = email.includes('@') ? email.split('@')[0] : '';

    const emailMatch = Boolean(candidateEmail) && email === candidateEmail;
    const nameMatch =
      assignedTo === displayName ||
      assignedTo === fullName ||
      assignedTo === firstName ||
      assignedTo === lastName ||
      assignedTo === emailLocal;

    if (emailMatch || nameMatch) {
      return {
        uid: docSnap.id,
        name: String(u?.displayName || `${u?.firstName || ''} ${u?.lastName || ''}`.trim() || u?.email || docSnap.id),
        email,
      };
    }
  }

  return null;
}

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

    // Determine if this note is assigned to a staff member (resolve to real Firebase UID).
    const assignedStaff = Assigned_To ? await resolveAssignedStaff(Assigned_To) : null;

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
        userId: assignedStaff.uid,
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
      console.log(`ℹ️ Note not assigned to any resolved Firebase user (Assigned_To: ${Assigned_To})`);
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