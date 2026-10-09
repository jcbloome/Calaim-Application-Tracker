import { NextRequest, NextResponse } from 'next/server';
import { requireSignedInApiAuth } from '@/lib/admin-api-auth';

export async function POST(request: NextRequest) {
  const authz = await requireSignedInApiAuth(request);
  if (!authz.ok) {
    return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
  }
  try {
    const { userId, token, deviceInfo } = await request.json();

    if (!userId || !token) {
      return NextResponse.json(
        { success: false, error: 'User ID and FCM token are required' },
        { status: 400 }
      );
    }

    console.log('📱 Registering FCM token for user:', userId);

    // This would call your Firebase function to register the token
    // For now, we'll simulate the registration
    const response = await fetch('/api/firebase-function', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        functionName: 'registerFCMToken',
        data: {
          userId,
          token,
          deviceInfo
        }
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to register FCM token with Firebase');
    }

    console.log('✅ FCM token registered successfully');

    return NextResponse.json({
      success: true,
      message: 'FCM token registered successfully'
    });

  } catch (error: any) {
    console.error('❌ Error registering FCM token:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Failed to register FCM token'
      },
      { status: 500 }
    );
  }
}