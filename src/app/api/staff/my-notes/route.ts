import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const staffId = searchParams.get('staffId');
    const limit = searchParams.get('limit') || '50';

    if (!staffId) {
      return NextResponse.json(
        { error: 'Staff ID required' },
        { status: 400 }
      );
    }

    // Build the Firebase function URL
    const baseUrl = process.env.NODE_ENV === 'production' 
      ? `https://us-central1-${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.cloudfunctions.net`
      : 'http://localhost:5001/studio-2881432245-f1d94/us-central1';
    
    const params = new URLSearchParams();
    params.append('staffId', staffId);
    params.append('limit', limit);

    const response = await fetch(`${baseUrl}/getStaffMemberNotes?${params.toString()}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error getting staff notes:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}