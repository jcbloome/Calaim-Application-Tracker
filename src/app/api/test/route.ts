import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    console.log('Test API route called');
    
    return NextResponse.json({ 
      message: 'API route is working',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error in test API:', error);
    return NextResponse.json(
      { error: 'Test API failed' },
      { status: 500 }
    );
  }
}