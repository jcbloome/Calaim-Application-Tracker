import { NextRequest, NextResponse } from 'next/server';
import { testCaspioConnection } from '@/lib/caspio-single-publisher';

export async function GET() {
  try {
    const result = await testCaspioConnection();
    
    return NextResponse.json(result, { 
      status: result.success ? 200 : 400 
    });
    
  } catch (error: any) {
    console.error('[CaspioAPI] Error in test route:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        message: `Server error: ${error.message}`,
        error: error.message 
      },
      { status: 500 }
    );
  }
}