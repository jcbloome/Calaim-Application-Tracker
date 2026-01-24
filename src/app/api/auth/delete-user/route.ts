import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();
    
    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
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

    console.log('🗑️ Development mode: Manual user deletion required');
    console.log('📧 Email to delete:', email);
    
    return NextResponse.json({
      message: 'Development mode: Use Firebase Console to manually delete user',
      instructions: [
        '1. Go to Firebase Console → Authentication → Users',
        '2. Find user: ' + email,
        '3. Click the user and select "Delete user"',
        '4. Confirm the deletion',
        '5. Then go to /signup to create a new account'
      ],
      email,
      manualSteps: true
    });

  } catch (error) {
    console.error('Delete user failed:', error);
    return NextResponse.json(
      { error: 'Failed to process user deletion' },
      { status: 500 }
    );
  }
}