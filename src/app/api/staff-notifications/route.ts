import { NextRequest, NextResponse } from 'next/server';

interface NotificationData {
  staffEmail: string;
  staffName: string;
  memberName: string;
  applicationId: string;
  healthPlan: string;
  pathway: string;
  assignmentNumber: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      staffEmail, 
      staffName, 
      memberName, 
      applicationId, 
      healthPlan, 
      pathway, 
      assignmentNumber 
    }: NotificationData = body;

    if (!staffEmail || !staffName || !memberName || !applicationId) {
      return NextResponse.json(
        { success: false, error: 'Missing required notification data' },
        { status: 400 }
      );
    }

    // Check if notifications are enabled (from localStorage/database)
    // For now, we'll assume they're enabled

    console.log(`📧 Sending notification to ${staffName} (${staffEmail}):
    - New Application Assignment #${assignmentNumber}
    - Member: ${memberName}
    - Application ID: ${applicationId}
    - Health Plan: ${healthPlan}
    - Pathway: ${pathway}
    - Timestamp: ${new Date().toISOString()}`);

    // Here you would implement actual notification sending:
    // 1. Email notification
    // 2. Push notification to browser
    // 3. System tray notification
    // 4. Bell notification in app

    // For now, we'll simulate successful notification sending
    const notificationResult = {
      emailSent: true,
      pushNotificationSent: true,
      systemTraySent: true,
      bellNotificationSent: true,
      timestamp: new Date().toISOString()
    };

    return NextResponse.json({
      success: true,
      message: `Notifications sent to ${staffName}`,
      notificationResult,
      recipient: {
        name: staffName,
        email: staffEmail
      },
      assignment: {
        memberName,
        applicationId,
        healthPlan,
        pathway,
        assignmentNumber
      }
    });

  } catch (error: any) {
    console.error('Error sending staff notification:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to send notification',
        details: error.message 
      },
      { status: 500 }
    );
  }
}