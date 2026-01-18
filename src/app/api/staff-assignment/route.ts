import { NextRequest, NextResponse } from 'next/server';

// Staff rotation order
const STAFF_ROTATION = [
  {
    name: 'Nick',
    email: 'nick@carehomefinders.com',
    id: 'nick-staff'
  },
  {
    name: 'John',
    email: 'john@carehomefinders.com',
    id: 'john-staff'
  },
  {
    name: 'Jessie',
    email: 'jessie@carehomefinders.com',
    id: 'jessie-staff'
  }
];

// In-memory storage for assignment tracking (replace with database in production)
let assignmentCounter = 0;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const applicationId = searchParams.get('applicationId');

    if (!applicationId) {
      return NextResponse.json(
        { success: false, error: 'Application ID is required' },
        { status: 400 }
      );
    }

    // Get next staff member in rotation
    const staffIndex = assignmentCounter % STAFF_ROTATION.length;
    const assignedStaff = STAFF_ROTATION[staffIndex];
    
    // Increment counter for next assignment
    assignmentCounter++;

    return NextResponse.json({
      success: true,
      assignedStaff,
      assignmentNumber: assignmentCounter
    });

  } catch (error: any) {
    console.error('Error getting staff assignment:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to get staff assignment',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { applicationId, memberName, memberEmail, healthPlan, pathway } = body;

    if (!applicationId || !memberName) {
      return NextResponse.json(
        { success: false, error: 'Application ID and member name are required' },
        { status: 400 }
      );
    }

    // Get next staff member in rotation
    const staffIndex = assignmentCounter % STAFF_ROTATION.length;
    const assignedStaff = STAFF_ROTATION[staffIndex];
    
    // Increment counter for next assignment
    assignmentCounter++;

    // Here you would typically:
    // 1. Save the assignment to database
    // 2. Send notification to assigned staff
    // 3. Log the assignment

    console.log(`📋 New Application Assignment:
    - Application: ${applicationId}
    - Member: ${memberName}
    - Assigned to: ${assignedStaff.name} (${assignedStaff.email})
    - Health Plan: ${healthPlan}
    - Pathway: ${pathway}
    - Assignment #: ${assignmentCounter}`);

    // Send notification to assigned staff
    try {
      const notificationResponse = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/staff-notifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          staffEmail: assignedStaff.email,
          staffName: assignedStaff.name,
          memberName,
          applicationId,
          healthPlan: healthPlan || 'Unknown',
          pathway: pathway || 'Unknown',
          assignmentNumber: assignmentCounter
        }),
      });

      const notificationResult = await notificationResponse.json();
      console.log('📧 Notification result:', notificationResult.success ? 'Sent successfully' : 'Failed to send');
    } catch (notificationError) {
      console.error('❌ Failed to send notification:', notificationError);
    }

    return NextResponse.json({
      success: true,
      assignedStaff,
      assignmentNumber: assignmentCounter,
      message: `Application assigned to ${assignedStaff.name}`,
      notificationSent: true
    });

  } catch (error: any) {
    console.error('Error assigning staff:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to assign staff',
        details: error.message 
      },
      { status: 500 }
    );
  }
}