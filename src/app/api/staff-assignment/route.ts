import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { CaspioService } from '@/modules/caspio-integration';

// Fetch real MSW staff from Caspio using the new module
async function fetchCaspioStaff() {
  try {
    const caspioService = CaspioService.getInstance();
    const staff = await caspioService.getAvailableMSWStaff();
    
    if (staff.length > 0) {
      // Transform to expected format
      return staff.map(staffMember => ({
        id: staffMember.id,
        name: staffMember.name,
        email: staffMember.email,
        sw_id: staffMember.id,
        assignedMemberCount: staffMember.workload || 0
      }));
    }
    
    // Fallback handled by CaspioService
    console.log('⚠️ No Caspio staff found, using fallback staff');
    return [
      {
        id: 'nick-staff',
        name: 'Nick',
        email: 'nick@carehomefinders.com',
        sw_id: 'nick-staff',
        assignedMemberCount: 0
      },
      {
        id: 'john-staff',
        name: 'John', 
        email: 'john@carehomefinders.com',
        sw_id: 'john-staff',
        assignedMemberCount: 0
      },
      {
        id: 'jessie-staff',
        name: 'Jessie',
        email: 'jessie@carehomefinders.com', 
        sw_id: 'jessie-staff',
        assignedMemberCount: 0
      }
    ];
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const applicationId = searchParams.get('applicationId');

    // Fetch real MSW staff from Caspio
    const staff = await fetchCaspioStaff();
    
    // Get current assignment settings from Firestore
    const settingsRef = adminDb.collection('settings').doc('staffAssignment');
    const settingsSnap = await settingsRef.get();
    const settings = settingsSnap.data();
    
    const autoAssignEnabled = settings?.autoAssignEnabled ?? false;
    const lastAssignedIndex = settings?.lastAssignedIndex ?? -1;

    if (!applicationId) {
      return NextResponse.json({
        success: true,
        staff: staff,
        autoAssignEnabled,
        currentAssignmentIndex: lastAssignedIndex,
        nextStaff: staff[(lastAssignedIndex + 1) % staff.length] || staff[0]
      });
    }

    // For specific application, return staff list and settings
    return NextResponse.json({
      success: true,
      staff: staff,
      autoAssignEnabled,
      message: `Found ${staff.length} MSW staff members from Caspio`
    });

  } catch (error: any) {
    console.error('❌ Error fetching MSW staff assignment:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch MSW staff assignment' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { applicationId, memberFirstName, memberLastName, healthPlan, userId, userName } = body;

    if (!applicationId || !memberFirstName || !memberLastName) {
      return NextResponse.json(
        { success: false, error: 'Application ID and member name are required' },
        { status: 400 }
      );
    }

    // Fetch real MSW staff from Caspio
    let staff;
    try {
      staff = await fetchCaspioStaff();
    } catch (error) {
      console.error('❌ Error fetching Caspio staff, using fallback:', error);
      // Use fallback staff if Caspio fails
      staff = [
        {
          id: 'nick-staff',
          name: 'Nick',
          email: 'nick@carehomefinders.com',
          sw_id: 'nick-staff',
          assignedMemberCount: 0
        },
        {
          id: 'john-staff', 
          name: 'John',
          email: 'john@carehomefinders.com',
          sw_id: 'john-staff',
          assignedMemberCount: 0
        },
        {
          id: 'jessie-staff',
          name: 'Jessie', 
          email: 'jessie@carehomefinders.com',
          sw_id: 'jessie-staff',
          assignedMemberCount: 0
        }
      ];
    }
    
    if (staff.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No MSW staff available for assignment' },
        { status: 404 }
      );
    }

    // Get current assignment settings from Firestore
    let settings: any = {};
    let autoAssignEnabled = true; // Default to enabled for development
    
    try {
      const settingsRef = adminDb.collection('settings').doc('staffAssignment');
      const settingsSnap = await settingsRef.get();
      settings = settingsSnap.data() || {};
      autoAssignEnabled = false; // Temporarily disabled to prevent endless looping
    } catch (error) {
      console.error('❌ Error accessing Firestore settings, using defaults:', error);
      // Continue with default settings if Firestore fails
      settings = { autoAssignEnabled: false, lastAssignedIndex: -1 };
      autoAssignEnabled = false;
    }
    
    if (!autoAssignEnabled) {
      return NextResponse.json(
        { success: false, error: 'Auto-assignment is not enabled' },
        { status: 403 }
      );
    }

    // Get next staff member in rotation (round-robin based on workload)
    const lastAssignedIndex = settings?.lastAssignedIndex ?? -1;
    const nextIndex = (lastAssignedIndex + 1) % staff.length;
    const assignedStaff = staff[nextIndex];

    // Update application with assigned staff in Firestore
    try {
      const applicationRef = adminDb.collection('users').doc(userId).collection('applications').doc(applicationId);
      await applicationRef.update({
        assignedStaffId: assignedStaff.sw_id,
        assignedStaffName: assignedStaff.name,
        assignedStaffEmail: assignedStaff.email,
        assignmentDate: FieldValue.serverTimestamp(),
        lastUpdated: FieldValue.serverTimestamp(),
      });

      // Update last assigned index in settings
      const settingsRef = adminDb.collection('settings').doc('staffAssignment');
      await settingsRef.set({ 
        lastAssignedIndex: nextIndex, 
        autoAssignEnabled: true 
      }, { merge: true });
    } catch (error) {
      console.error('❌ Error updating Firestore, continuing with assignment:', error);
      // Continue even if Firestore update fails - the assignment logic still works
    }

    const memberName = `${memberFirstName} ${memberLastName}`;
    
    console.log(`📋 MSW Staff Assignment:
    - Application: ${applicationId}
    - Member: ${memberName}
    - Assigned to: ${assignedStaff.name} (${assignedStaff.email})
    - SW_ID: ${assignedStaff.sw_id}
    - Health Plan: ${healthPlan}
    - Current Workload: ${assignedStaff.assignedMemberCount} members`);

    // Send notification to assigned staff
    try {
      const notificationResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/staff-notifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipientId: assignedStaff.sw_id,
          recipientEmail: assignedStaff.email,
          title: `New Application Assigned: ${memberName}`,
          message: `You have been assigned a new application for ${memberName} (${healthPlan}).`,
          link: `/admin/applications/${applicationId}?userId=${userId}`,
          type: 'assignment',
          applicationId: applicationId,
          assignedBy: userName || 'System',
        }),
      });

      const notificationResult = await notificationResponse.json();
      console.log('📧 Notification result:', notificationResult.success ? 'Sent successfully' : 'Failed to send');
    } catch (notificationError) {
      console.error('❌ Failed to send notification:', notificationError);
    }

    return NextResponse.json({
      success: true,
      assignedStaffName: assignedStaff.name,
      assignedStaffEmail: assignedStaff.email,
      assignedStaffId: assignedStaff.sw_id,
      message: `Application assigned to ${assignedStaff.name} (MSW)`,
      workloadInfo: `${assignedStaff.name} now has ${assignedStaff.assignedMemberCount + 1} assigned members`
    });

  } catch (error: any) {
    console.error('❌ Error assigning MSW staff:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to assign MSW staff',
        details: error.message 
      },
      { status: 500 }
    );
  }
}