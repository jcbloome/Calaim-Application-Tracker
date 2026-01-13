import { NextRequest, NextResponse } from 'next/server';
import { testCaspioConnection } from '@/lib/caspio-single-publisher';

export async function GET() {
  try {
    // Debug: Check if environment variables are available
    console.log('🔍 API Route Debug - Environment Variables:');
    console.log('  - CASPIO_BASE_URL:', process.env.CASPIO_BASE_URL ? 'SET' : 'NOT SET');
    console.log('  - CASPIO_CLIENT_ID:', process.env.CASPIO_CLIENT_ID ? `SET (${process.env.CASPIO_CLIENT_ID.length} chars)` : 'NOT SET');
    console.log('  - CASPIO_CLIENT_SECRET:', process.env.CASPIO_CLIENT_SECRET ? `SET (${process.env.CASPIO_CLIENT_SECRET.length} chars)` : 'NOT SET');
    
    const result = await testCaspioConnection();
    
    return NextResponse.json(result, { 
      status: result.success ? 200 : 400 
    });
    
  } catch (error: any) {
    console.error('[CaspioAPI] Error in test route:', error);
    console.error('[CaspioAPI] Error stack:', error.stack);
    
    return NextResponse.json(
      { 
        success: false, 
        message: `Server error: ${error.message}`,
        error: error.message,
        debug: {
          envVarsAvailable: {
            baseUrl: !!process.env.CASPIO_BASE_URL,
            clientId: !!process.env.CASPIO_CLIENT_ID,
            clientSecret: !!process.env.CASPIO_CLIENT_SECRET
          }
        }
      },
      { status: 500 }
    );
  }
}