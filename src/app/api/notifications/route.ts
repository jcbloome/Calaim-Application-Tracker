import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { userId, limit = 50, includeRead = false } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
        { status: 400 }
      );
    }

    // This would call your Firebase function
    // For now, return mock data to demonstrate the structure
    const mockNotifications = [
      {
        id: 'notif-1',
        type: 'client_note',
        subType: 'assignment',
        title: '📝 New Note Assignment - John Doe',
        message: 'Monica Bloome assigned you a note for John Doe: "Please follow up on Kaiser authorization status..."',
        data: {
          noteId: 'note-123',
          clientId2: 'CL001234',
          clientName: 'John Doe'
        },
        recipientUserId: userId,
        recipientUserName: 'Current User',
        createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 minutes ago
        read: false,
        dismissed: false,
        priority: 'normal',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days from now
      },
      {
        id: 'notif-2',
        type: 'client_note',
        subType: 'followup',
        title: '⏰ Follow-up Required - Jane Smith',
        message: 'Follow-up required by 2026-01-20: "Check on RCFE placement status and update member record"',
        data: {
          noteId: 'note-124',
          clientId2: 'CL001235',
          clientName: 'Jane Smith',
          followUpDate: '2026-01-20'
        },
        recipientUserId: userId,
        recipientUserName: 'Current User',
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        read: false,
        dismissed: false,
        priority: 'high',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: 'notif-3',
        type: 'client_note',
        subType: 'mention',
        title: '💬 You were mentioned - Bob Johnson',
        message: 'Leidy Kanjanapitt mentioned you in a note for Bob Johnson: "@currentuser can you help with the T2038 form?"',
        data: {
          noteId: 'note-125',
          clientId2: 'CL001236',
          clientName: 'Bob Johnson'
        },
        recipientUserId: userId,
        recipientUserName: 'Current User',
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
        read: true,
        dismissed: false,
        priority: 'normal',
        expiresAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString()
      }
    ];

    // Filter based on includeRead parameter
    const filteredNotifications = includeRead 
      ? mockNotifications 
      : mockNotifications.filter(n => !n.read);

    return NextResponse.json({
      success: true,
      notifications: filteredNotifications.slice(0, limit),
      count: filteredNotifications.length
    });

  } catch (error: any) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Failed to fetch notifications'
      },
      { status: 500 }
    );
  }
}