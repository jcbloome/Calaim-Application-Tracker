import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { memberId, memberName, noteContent, noteType, priority, staffId, staffName } = body;

    if (!noteContent || !staffId || !staffName) {
      return NextResponse.json(
        { error: 'Note content, staff ID, and staff name are required' },
        { status: 400 }
      );
    }

    // Build the Firebase function URL
    const baseUrl = process.env.NODE_ENV === 'production' 
      ? `https://us-central1-${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.cloudfunctions.net`
      : 'http://localhost:5001/studio-2881432245-f1d94/us-central1';

    const response = await fetch(`${baseUrl}/addStaffNote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        memberId,
        memberName,
        noteContent,
        noteType,
        priority,
        staffId,
        staffName,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error adding staff note:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}