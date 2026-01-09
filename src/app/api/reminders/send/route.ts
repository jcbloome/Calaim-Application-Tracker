import { NextRequest, NextResponse } from 'next/server';
import { sendReminderEmails } from '@/ai/flows/manage-reminders';

export async function POST(request: NextRequest) {
  try {
    const applications = await request.json();
    
    if (!applications || !Array.isArray(applications)) {
      return NextResponse.json(
        { success: false, message: 'Applications array is required' },
        { status: 400 }
      );
    }

    const result = await sendReminderEmails(applications);
    
    return NextResponse.json(result, { 
      status: result.success ? 200 : 400 
    });
    
  } catch (error: any) {
    console.error('[RemindersAPI] Error in send route:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        sentCount: 0,
        message: `Server error: ${error.message}` 
      },
      { status: 500 }
    );
  }
}