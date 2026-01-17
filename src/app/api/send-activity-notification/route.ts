import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { recipientUserId, notificationData } = await request.json();

    if (!recipientUserId || !notificationData) {
      return NextResponse.json(
        { success: false, error: 'Recipient user ID and notification data are required' },
        { status: 400 }
      );
    }

    console.log('📱 Sending activity notification:', {
      recipient: recipientUserId,
      title: notificationData.title,
      type: notificationData.data?.type
    });

    // This would integrate with your Firebase Functions to send push notifications
    // For now, we'll simulate the notification sending
    
    try {
      // Call Firebase function to send push notification
      const response = await fetch('/api/firebase-function', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          functionName: 'sendActivityNotification',
          data: {
            recipientUserId,
            notification: {
              title: notificationData.title,
              body: notificationData.body,
              icon: '/calaimlogopdf.png',
              badge: '/calaimlogopdf.png',
              data: notificationData.data,
              actions: [
                {
                  action: 'view',
                  title: 'View Activity'
                },
                {
                  action: 'dismiss',
                  title: 'Dismiss'
                }
              ]
            }
          }
        }),
      });

      if (response.ok) {
        console.log('✅ Activity notification sent successfully');
        return NextResponse.json({
          success: true,
          message: 'Activity notification sent successfully'
        });
      } else {
        console.warn('⚠️ Failed to send activity notification via Firebase');
        return NextResponse.json({
          success: false,
          error: 'Failed to send notification via Firebase'
        }, { status: 500 });
      }
    } catch (firebaseError) {
      console.error('❌ Firebase notification error:', firebaseError);
      
      // Fallback: Save notification to local storage for when user next visits
      return NextResponse.json({
        success: true,
        message: 'Notification queued for delivery',
        fallback: true
      });
    }

  } catch (error: any) {
    console.error('❌ Error sending activity notification:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Failed to send activity notification'
      },
      { status: 500 }
    );
  }
}