import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { notificationId, userId } = await request.json();

    if (!notificationId || !userId) {
      return NextResponse.json(
        { success: false, error: 'Notification ID and User ID are required' },
        { status: 400 }
      );
    }

    // This would call your Firebase function to mark the notification as read
    // For now, just return success
    console.log(`Marking notification ${notificationId} as read for user ${userId}`);

    return NextResponse.json({
      success: true,
      message: 'Notification marked as read'
    });

  } catch (error: any) {
    console.error('Error marking notification as read:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Failed to mark notification as read'
      },
      { status: 500 }
    );
  }
}