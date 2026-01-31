import { NextRequest, NextResponse } from 'next/server';
import { sendApplicationStatusEmail, sendCsSummaryReminderEmail, sendReminderEmail } from '@/app/actions/send-email';

export async function POST(request: NextRequest) {
  try {
    const emailData = await request.json();
    
    if (!emailData || !emailData.to) {
      return NextResponse.json(
        { success: false, message: 'Email recipient is required' },
        { status: 400 }
      );
    }

    // Route to appropriate email sender based on type
    if (emailData.type === 'cs_summary_reminder') {
      await sendCsSummaryReminderEmail(emailData.data);
    } else if (emailData.type === 'missing_docs') {
      await sendReminderEmail(emailData.data);
    } else {
      // Default to application status email for backward compatibility
      await sendApplicationStatusEmail(emailData);
    }
    
    return NextResponse.json({ 
      success: true, 
      message: 'Email sent successfully' 
    });
    
  } catch (error: any) {
    console.error('[EmailAPI] Error in send route:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        message: `Failed to send email: ${error.message}` 
      },
      { status: 500 }
    );
  }
}