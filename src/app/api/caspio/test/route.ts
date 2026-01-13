import { NextRequest, NextResponse } from 'next/server';
import { testCaspioConnection } from '@/lib/caspio-single-publisher';

export async function GET() {
  const logs: string[] = [];
  
  // Capture console logs
  const originalLog = console.log;
  const originalError = console.error;
  
  console.log = (...args) => {
    const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' ');
    logs.push(`[LOG] ${message}`);
    originalLog(...args);
  };
  
  console.error = (...args) => {
    const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' ');
    logs.push(`[ERROR] ${message}`);
    originalError(...args);
  };
  
  try {
    // Debug: Check if environment variables are available
    console.log('🔍 API Route Debug - Environment Variables:');
    console.log('  - CASPIO_BASE_URL:', process.env.CASPIO_BASE_URL ? 'SET' : 'NOT SET');
    console.log('  - CASPIO_CLIENT_ID:', process.env.CASPIO_CLIENT_ID ? `SET (${process.env.CASPIO_CLIENT_ID.length} chars)` : 'NOT SET');
    console.log('  - CASPIO_CLIENT_SECRET:', process.env.CASPIO_CLIENT_SECRET ? `SET (${process.env.CASPIO_CLIENT_SECRET.length} chars)` : 'NOT SET');
    
    const result = await testCaspioConnection();
    
    // Restore original console methods
    console.log = originalLog;
    console.error = originalError;
    
    return NextResponse.json({
      ...result,
      detailedLogs: logs
    }, { 
      status: result.success ? 200 : 400 
    });
    
  } catch (error: any) {
    // Restore original console methods
    console.log = originalLog;
    console.error = originalError;
    
    console.error('[CaspioAPI] Error in test route:', error);
    console.error('[CaspioAPI] Error stack:', error.stack);
    
    return NextResponse.json(
      { 
        success: false, 
        message: `Server error: ${error.message}`,
        error: error.message,
        detailedLogs: logs,
        debug: {
          envVarsAvailable: {
            baseUrl: !!process.env.CASPIO_BASE_URL,
            clientId: !!process.env.CASPIO_CLIENT_ID,
            clientSecret: !!process.env.CASPIO_CLIENT_SECRET
          },
          errorStack: error.stack
        }
      },
      { status: 500 }
    );
  }
}