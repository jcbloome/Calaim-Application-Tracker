import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const notificationData = await request.json();
    
    const {
      type,
      title,
      message,
      noteId,
      clientId2,
      memberName,
      priority,
      assignedTo,
      createdBy,
      createdByName
    } = notificationData;

    if (!type || !title || !message || !assignedTo) {
      return NextResponse.json(
        { success: false, error: 'Missing required notification fields' },
        { status: 400 }
      );
    }

    // In production, this would:
    // 1. Store the notification in Firestore
    // 2. Send push notification to the assigned staff member
    // 3. Update the staff notification bell count
    // 4. Optionally send email notification

    console.log('Staff notification created:', {
      type,
      title,
      message,
      assignedTo,
      createdBy,
      createdByName,
      memberName,
      priority,
      timestamp: new Date().toISOString()
    });

    // Simulate system tray notification (in production, this would be handled by push notifications)
    if (typeof window !== 'undefined' && 'Notification' in window) {
      // Request permission for browser notifications
      if (Notification.permission === 'granted') {
        new Notification(title, {
          body: message,
          icon: '/favicon.ico',
          tag: `staff-notification-${Date.now()}`
        });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            new Notification(title, {
              body: message,
              icon: '/favicon.ico',
              tag: `staff-notification-${Date.now()}`
            });
          }
        });
      }
    }

    return NextResponse.json({
      success: true,
      notification: {
        id: `notification_${Date.now()}`,
        type,
        title,
        message,
        noteId,
        clientId2,
        memberName,
        priority,
        assignedTo,
        createdBy,
        createdByName,
        createdAt: new Date().toISOString(),
        isRead: false
      },
      message: 'Staff notification sent successfully'
    });

  } catch (error: any) {
    console.error('Error creating staff notification:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create staff notification' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
        { status: 400 }
      );
    }

    // In production, this would fetch notifications from Firestore for the specific user
    // For now, return sample notifications
    const sampleNotifications = [
      {
        id: '1',
        type: 'note_assignment',
        title: 'New Note Assigned',
        message: 'You have been assigned a high priority note for John Doe',
        noteId: 'note_123',
        clientId2: 'KAI-12345',
        memberName: 'John Doe',
        priority: 'High',
        createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 minutes ago
        isRead: false,
        createdBy: 'sarah_johnson',
        createdByName: 'Sarah Johnson, MSW'
      }
    ];

    return NextResponse.json({
      success: true,
      notifications: sampleNotifications,
      unreadCount: sampleNotifications.filter(n => !n.isRead).length
    });

  } catch (error: any) {
    console.error('Error fetching staff notifications:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch staff notifications' },
      { status: 500 }
    );
  }
}