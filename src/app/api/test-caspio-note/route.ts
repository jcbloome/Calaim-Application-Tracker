import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { staffMember, memberName, noteContent, priority } = body;

    // Simulate a Caspio webhook call
    const webhookData = {
      Client_ID2: 'TEST_CLIENT_123',
      Member_Name: memberName || 'Test Member',
      Note_Content: noteContent || 'This is a test note assigned from Caspio to verify system tray notifications are working.',
      Staff_Name: 'Caspio System',
      Note_Type: 'General',
      Priority: priority || 'General',
      Created_By: 'caspio_system',
      Assigned_To: staffMember || 'nick', // Default to nick for testing
      Record_ID: `test_${Date.now()}`
    };

    console.log('🧪 Sending test webhook to Caspio note endpoint:', webhookData);

    // Call our webhook endpoint
    const webhookResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/caspio-note-webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(webhookData)
    });

    const webhookResult = await webhookResponse.json();

    return NextResponse.json({
      success: true,
      message: 'Test Caspio note webhook sent successfully',
      webhookData,
      webhookResult
    });

  } catch (error: any) {
    console.error('❌ Error sending test Caspio note webhook:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to send test webhook',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'Test Caspio Note Webhook Endpoint',
    description: 'POST to this endpoint to simulate a Caspio note assignment webhook',
    parameters: {
      staffMember: 'nick | john | jessie | jason | monica | leidy',
      memberName: 'string (optional)',
      noteContent: 'string (optional)',
      priority: 'General | Priority | Urgent (optional)'
    },
    example: {
      staffMember: 'staff_member_name',
      memberName: 'Member Name',
      noteContent: 'Follow up needed for discharge planning',
      priority: 'Urgent'
    }
  });
}