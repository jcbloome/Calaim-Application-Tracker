import { NextRequest, NextResponse } from 'next/server';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '@/firebase';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const limit = searchParams.get('limit') || '50';
    const offset = searchParams.get('offset') || '0';

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID required' },
        { status: 400 }
      );
    }

    const functions = getFunctions(app);
    const getStaffNotes = httpsCallable(functions, 'getStaffNotes');
    
    const result = await getStaffNotes({ 
      userId, 
      limit: parseInt(limit), 
      offset: parseInt(offset) 
    });
    
    return NextResponse.json(result.data);
  } catch (error: any) {
    console.error('Error getting staff notes:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}