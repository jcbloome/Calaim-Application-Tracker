import { NextRequest, NextResponse } from 'next/server';
import { publishCsSummaryToCaspio } from '@/lib/caspio-single-publisher';

export async function POST(request: NextRequest) {
  try {
    const applicationData = await request.json();
    
    if (!applicationData) {
      return NextResponse.json(
        { success: false, message: 'Application data is required' },
        { status: 400 }
      );
    }

    const result = await publishCsSummaryToCaspio(applicationData);
    
    return NextResponse.json(result, { 
      status: result.success ? 200 : 400 
    });
    
  } catch (error: any) {
    console.error('[CaspioAPI] Error in publish route:', error);
    
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