import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const memberId = searchParams.get('memberId');
    const memberName = searchParams.get('memberName');
    const limit = searchParams.get('limit') || '100';
    const offset = searchParams.get('offset') || '0';

    if (!memberId && !memberName) {
      return NextResponse.json(
        { error: 'Member ID or Member Name required' },
        { status: 400 }
      );
    }

    // Build the Firebase function URL
    const baseUrl = process.env.NODE_ENV === 'production' 
      ? `https://us-central1-${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.cloudfunctions.net`
      : 'http://localhost:5001/studio-2881432245-f1d94/us-central1';
    
    const params = new URLSearchParams();
    if (memberId) params.append('memberId', memberId);
    if (memberName) params.append('memberName', memberName);
    params.append('limit', limit);
    params.append('offset', offset);

    const response = await fetch(`${baseUrl}/getMemberNotes?${params.toString()}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error getting member notes:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}