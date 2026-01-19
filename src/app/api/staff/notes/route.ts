import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID required' },
        { status: 400 }
      );
    }

    // For now, return empty notes array since the Firebase Function doesn't exist
    // In production, this would fetch notes from Firestore or Caspio
    return NextResponse.json({
      success: true,
      notes: [],
      notifications: [],
      message: 'No notes found for this user'
    });
  } catch (error: any) {
    console.error('Error getting staff notes:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}