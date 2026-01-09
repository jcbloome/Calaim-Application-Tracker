import { NextRequest, NextResponse } from 'next/server';
import { sendApplicationStatusEmail } from '@/app/actions/send-email';

export async function POST(request: NextRequest) {
  try {
    const emailData = await request.json();
    
    if (!emailData || !emailData.to) {
      return NextResponse.json(
        { success: false, message: 'Email recipient is required' },
        { status: 400 }
      );
    }

    await sendApplicationStatusEmail(emailData);
    
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