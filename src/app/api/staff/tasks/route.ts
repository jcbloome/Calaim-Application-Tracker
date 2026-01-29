import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/firebase-admin';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID required' },
        { status: 400 }
      );
    }

    // Get user's staff name from user ID (this would typically come from auth context)
    // For now, we'll map some common staff names
    const staffNameMap: Record<string, string> = {
      'john-user-id': 'John',
      'nick-user-id': 'Nick', 
      'jesse-user-id': 'Jesse'
    };
    
    const staffName = staffNameMap[userId] || 'John'; // Default to John for demo

    try {
      // Fetch Kaiser members assigned to this staff member
      const kaiserResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/kaiser-members`);
      
      if (!kaiserResponse.ok) {
        console.warn('Failed to fetch Kaiser members, returning empty tasks');
        return NextResponse.json({
          success: true,
          tasks: [],
          message: 'No Kaiser members data available'
        });
      }

      const kaiserData = await kaiserResponse.json();
      const allMembers = kaiserData.members || [];

      // Filter members assigned to this staff member
      const assignedMembers = allMembers.filter((member: any) => {
        const assignedStaff = member.Staff_Assignment || 
                             member.Staff_Assigned || 
                             member.kaiser_user_assignment || 
                             member.SW_ID || 
                             member.Assigned_Staff;
        return assignedStaff === staffName;
      });

      // Create tasks from assigned members
      const tasks = assignedMembers.map((member: any) => {
        const isOverdue = member.Next_Step_Due_Date && new Date(member.Next_Step_Due_Date) < new Date();
        const isUrgent = member.Next_Step_Due_Date && 
          new Date(member.Next_Step_Due_Date) <= new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // 2 days

        return {
          id: `kaiser-${member.id}`,
          title: `Kaiser Status Update: ${member.memberFirstName} ${member.memberLastName}`,
          description: member.workflow_step || 'Update Kaiser status and next steps',
          memberName: `${member.memberFirstName} ${member.memberLastName}`,
          memberClientId: member.client_ID2,
          healthPlan: 'Kaiser',
          taskType: 'kaiser_status',
          priority: isOverdue ? 'Urgent' : isUrgent ? 'High' : 'Medium',
          status: isOverdue ? 'overdue' : 'pending',
          dueDate: member.Next_Step_Due_Date || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          assignedBy: 'system',
          assignedByName: 'System',
          assignedTo: userId,
          assignedToName: staffName,
          createdAt: member.created_at || new Date().toISOString(),
          updatedAt: member.last_updated || new Date().toISOString(),
          notes: member.workflow_notes,
          source: 'applications',
          kaiserStatus: member.Kaiser_Status,
          currentKaiserStatus: member.Kaiser_Status
        };
      });

      const normalizePriority = (value: any) => {
        const normalized = String(value || '').toLowerCase();
        if (normalized.includes('urgent')) return 'Urgent';
        if (normalized.includes('high')) return 'High';
        if (normalized.includes('low')) return 'Low';
        return 'Medium';
      };

      const followUpTasks: any[] = [];
      const now = new Date();

      try {
        const staffSnap = await adminDb
          .collection('staff_notifications')
          .where('userId', '==', userId)
          .limit(200)
          .get();
        staffSnap.docs.forEach((docSnap) => {
          const data = docSnap.data();
          const followUpRequired = Boolean(data.followUpRequired) || Boolean(data.followUpDate);
          if (!followUpRequired) return;
          if (String(data.status || '').toLowerCase() === 'closed') return;
          const followUpDate = data.followUpDate?.toDate?.()?.toISOString?.()
            || data.followUpDate
            || data.timestamp?.toDate?.()?.toISOString?.()
            || new Date().toISOString();
          const isOverdue = followUpDate ? new Date(followUpDate) < now : false;
          followUpTasks.push({
            id: `staff-followup-${docSnap.id}`,
            title: data.title ? `Follow-up: ${data.title}` : 'Follow-up required',
            description: data.message || data.content || '',
            memberName: data.memberName,
            memberClientId: data.clientId2,
            healthPlan: data.healthPlan,
            taskType: 'follow_up',
            priority: normalizePriority(data.priority),
            status: isOverdue ? 'overdue' : 'pending',
            dueDate: followUpDate,
            assignedBy: data.createdBy || 'system',
            assignedByName: data.senderName || data.createdByName || 'Staff',
            assignedTo: userId,
            assignedToName: staffName,
            createdAt: data.timestamp?.toDate?.()?.toISOString?.() || data.createdAt || new Date().toISOString(),
            updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() || data.timestamp?.toDate?.()?.toISOString?.() || new Date().toISOString(),
            notes: data.message || data.content || '',
            source: 'notes'
          });
        });
      } catch (followupError) {
        console.warn('Failed to load staff follow-up notes:', followupError);
      }

      try {
        const clientSnap = await adminDb
          .collection('client_notes')
          .where('followUpAssignment', '==', userId)
          .limit(200)
          .get();
        clientSnap.docs.forEach((docSnap) => {
          const data = docSnap.data();
          if (String(data.followUpStatus || '').toLowerCase() === 'closed') return;
          const followUpDate = data.followUpDate || data.timeStamp || data.createdAt;
          if (!followUpDate) return;
          const dueDate = followUpDate?.toDate?.()?.toISOString?.() || followUpDate;
          const isOverdue = dueDate ? new Date(dueDate) < now : false;
          followUpTasks.push({
            id: `client-followup-${docSnap.id}`,
            title: `Client follow-up: ${data.clientId2 || 'Client'}`,
            description: data.comments || '',
            memberName: data.memberName || `Client ${data.clientId2 || ''}`.trim(),
            memberClientId: data.clientId2,
            healthPlan: data.healthPlan,
            taskType: 'follow_up',
            priority: normalizePriority(data.priority),
            status: isOverdue ? 'overdue' : 'pending',
            dueDate: dueDate,
            assignedBy: data.createdBy || 'system',
            assignedByName: data.createdByName || 'Staff',
            assignedTo: userId,
            assignedToName: staffName,
            createdAt: data.timeStamp || data.createdAt || new Date().toISOString(),
            updatedAt: data.syncedAt?.toDate?.()?.toISOString?.() || data.timeStamp || new Date().toISOString(),
            notes: data.comments || '',
            source: 'notes'
          });
        });
      } catch (clientError) {
        console.warn('Failed to load client follow-up notes:', clientError);
      }

      try {
        const memberSnap = await adminDb
          .collection('member-notes')
          .where('assignedTo', '==', userId)
          .limit(200)
          .get();
        memberSnap.docs.forEach((docSnap) => {
          const data = docSnap.data();
          const followUpDate = data.followUpDate;
          if (!followUpDate) return;
          const dueDate = followUpDate?.toDate?.()?.toISOString?.() || followUpDate;
          const isOverdue = dueDate ? new Date(dueDate) < now : false;
          followUpTasks.push({
            id: `member-followup-${docSnap.id}`,
            title: `Member follow-up: ${data.memberName || data.clientId2 || 'Member'}`,
            description: data.noteText || '',
            memberName: data.memberName,
            memberClientId: data.clientId2,
            healthPlan: data.healthPlan,
            taskType: 'follow_up',
            priority: normalizePriority(data.priority),
            status: isOverdue ? 'overdue' : 'pending',
            dueDate: dueDate,
            assignedBy: data.createdBy || 'system',
            assignedByName: data.createdByName || 'Staff',
            assignedTo: userId,
            assignedToName: staffName,
            createdAt: data.createdAt || new Date().toISOString(),
            updatedAt: data.updatedAt || data.createdAt || new Date().toISOString(),
            notes: data.noteText || '',
            source: 'notes'
          });
        });
      } catch (memberError) {
        console.warn('Failed to load member follow-up notes:', memberError);
      }

      return NextResponse.json({
        success: true,
        tasks: [...followUpTasks, ...tasks],
        message: `Found ${tasks.length + followUpTasks.length} tasks for ${staffName}`
      });

    } catch (fetchError) {
      console.error('Error fetching Kaiser data:', fetchError);
      return NextResponse.json({
        success: true,
        tasks: [],
        message: 'Unable to load Kaiser member tasks at this time'
      });
    }
    
  } catch (error: any) {
    console.error('Error getting staff tasks:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, taskData } = body;

    if (!userId || !taskData) {
      return NextResponse.json(
        { error: 'User ID and task data required' },
        { status: 400 }
      );
    }

    // For now, return success without actually creating the task
    // In production, this would create a task in Firestore or task management system
    return NextResponse.json({
      success: true,
      task: {
        id: `task_${Date.now()}`,
        ...taskData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      message: 'Task created successfully'
    });
  } catch (error: any) {
    console.error('Error creating staff task:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}