import { NextRequest, NextResponse } from 'next/server';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '@/firebase';

export async function POST(request: NextRequest) {
  try {
    const { notificationIds } = await request.json();

    if (!notificationIds || !Array.isArray(notificationIds)) {
      return NextResponse.json(
        { error: 'Notification IDs array required' },
        { status: 400 }
      );
    }

    const functions = getFunctions(app);
    const markNotificationsRead = httpsCallable(functions, 'markNotificationsRead');
    
    const result = await markNotificationsRead({ notificationIds });
    
    return NextResponse.json(result.data);
  } catch (error: any) {
    console.error('Error marking notifications as read:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}