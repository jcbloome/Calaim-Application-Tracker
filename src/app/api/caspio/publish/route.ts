import { NextRequest, NextResponse } from 'next/server';
import { publishCsSummaryToCaspio } from '@/lib/caspio-single-publisher';
import { caspioWriteBlockedResponse, isCaspioWriteReadOnly } from '@/lib/caspio-write-guard';

export async function POST(request: NextRequest) {
  try {
    if (isCaspioWriteReadOnly()) {
      return NextResponse.json(caspioWriteBlockedResponse(), { status: 423 });
    }

    const authHeader = request.headers.get('authorization') || '';
    const expectedSecret = (process.env.CASPIO_PUBLISH_SECRET || process.env.CRON_SECRET || '').trim();
    if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const applicationData = await request.json();
    
    if (!applicationData || typeof applicationData !== 'object') {
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