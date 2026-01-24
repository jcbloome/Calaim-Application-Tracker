import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { email, newPassword } = await request.json();
    
    if (!email || !newPassword) {
      return NextResponse.json(
        { error: 'Email and new password are required' },
        { status: 400 }
      );
    }

    // Only allow this in development mode
    if (process.env.NODE_ENV !== 'development') {
      return NextResponse.json(
        { error: 'This endpoint is only available in development mode' },
        { status: 403 }
      );
    }

    // For development, we'll provide instructions to manually update Firebase Auth
    console.log('🔧 Development mode: Manual password update required');
    console.log('📧 Email:', email);
    console.log('🔑 New Password:', newPassword);
    
    return NextResponse.json({
      message: 'Development mode: Use Firebase Console to manually update password',
      instructions: [
        '1. Go to Firebase Console → Authentication → Users',
        '2. Find user: ' + email,
        '3. Click the user and select "Reset password"',
        '4. Or delete the user and recreate with new password'
      ],
      email,
      newPassword
    });

  } catch (error) {
    console.error('Force password update failed:', error);
    return NextResponse.json(
      { error: 'Failed to process password update' },
      { status: 500 }
    );
  }
}