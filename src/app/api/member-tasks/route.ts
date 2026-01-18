import { NextRequest, NextResponse } from 'next/server';

// In-memory storage for tasks (replace with database in production)
const memberTasks: Record<string, any[]> = {};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const memberId = searchParams.get('memberId');

    if (!memberId) {
      return NextResponse.json(
        { success: false, error: 'Member ID is required' },
        { status: 400 }
      );
    }

    const tasks = memberTasks[memberId] || [];

    return NextResponse.json({
      success: true,
      tasks
    });

  } catch (error: any) {
    console.error('Error fetching member tasks:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch member tasks',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      memberId, 
      memberName, 
      currentStep, 
      nextStep, 
      followUpDate, 
      assignedTo, 
      priority, 
      notes 
    } = body;

    if (!memberId || !currentStep || !nextStep || !assignedTo) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const newTask = {
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      memberId,
      memberName,
      currentStep,
      nextStep,
      followUpDate,
      assignedTo,
      priority: priority || 'Medium',
      status: 'Pending',
      notes: notes || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Initialize tasks array for member if it doesn't exist
    if (!memberTasks[memberId]) {
      memberTasks[memberId] = [];
    }

    memberTasks[memberId].unshift(newTask);

    return NextResponse.json({
      success: true,
      task: newTask
    });

  } catch (error: any) {
    console.error('Error creating member task:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to create member task',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskId, updates } = body;

    if (!taskId || !updates) {
      return NextResponse.json(
        { success: false, error: 'Task ID and updates are required' },
        { status: 400 }
      );
    }

    // Find and update the task
    let taskFound = false;
    for (const memberId in memberTasks) {
      const tasks = memberTasks[memberId];
      const taskIndex = tasks.findIndex(task => task.id === taskId);
      
      if (taskIndex !== -1) {
        memberTasks[memberId][taskIndex] = {
          ...memberTasks[memberId][taskIndex],
          ...updates,
          updatedAt: new Date().toISOString()
        };
        taskFound = true;
        break;
      }
    }

    if (!taskFound) {
      return NextResponse.json(
        { success: false, error: 'Task not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Task updated successfully'
    });

  } catch (error: any) {
    console.error('Error updating member task:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to update member task',
        details: error.message 
      },
      { status: 500 }
    );
  }
}