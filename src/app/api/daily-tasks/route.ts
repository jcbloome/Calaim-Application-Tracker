import { NextRequest, NextResponse } from 'next/server';

interface DailyTask {
  id?: string;
  title: string;
  description?: string;
  memberName?: string;
  memberClientId?: string;
  healthPlan?: string;
  assignedTo: string;
  assignedToName?: string;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  dueDate: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  completedAt?: string;
  notes?: string;
  tags?: string[];
}

// In-memory storage for tasks (in production, this would be a database)
let tasks: DailyTask[] = [
  {
    id: '1',
    title: 'Follow up with Sample Member Kaiser authorization',
    description: 'Check status of pending Kaiser authorization for member',
    memberName: 'Sample Member A',
    memberClientId: 'KAI-12345',
    healthPlan: 'Kaiser',
    assignedTo: 'user1',
    assignedToName: 'Sarah Johnson',
    priority: 'high',
    status: 'pending',
    dueDate: new Date().toISOString().split('T')[0], // Today
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: 'admin',
    notes: 'Member has been waiting for 2 weeks'
  },
  {
    id: '2',
    title: 'Schedule Health Net member visit',
    description: 'Coordinate home visit for Health Net member assessment',
    memberName: 'Sample Member B',
    memberClientId: 'HN-67890',
    healthPlan: 'Health Net',
    assignedTo: 'user2',
    assignedToName: 'Mike Wilson',
    priority: 'medium',
    status: 'in_progress',
    dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0], // Tomorrow
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: 'admin',
    notes: 'Member prefers morning appointments'
  },
  {
    id: '3',
    title: 'Complete monthly report for CalAIM program',
    description: 'Compile statistics and member progress for monthly reporting',
    assignedTo: 'user1',
    assignedToName: 'Sarah Johnson',
    priority: 'low',
    status: 'pending',
    dueDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0], // Next week
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: 'admin',
    notes: 'Due by end of month'
  }
];

let nextId = 4;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const assignedTo = searchParams.get('assignedTo');
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    
    console.log('📥 Fetching daily tasks...');
    
    let filteredTasks = [...tasks];
    
    // Apply filters if provided
    if (assignedTo && assignedTo !== 'all') {
      filteredTasks = filteredTasks.filter(task => task.assignedTo === assignedTo);
    }
    
    if (status && status !== 'all') {
      filteredTasks = filteredTasks.filter(task => task.status === status);
    }
    
    if (priority && priority !== 'all') {
      filteredTasks = filteredTasks.filter(task => task.priority === priority);
    }
    
    // Calculate summary statistics
    const today = new Date().toISOString().split('T')[0];
    const summary = {
      total: filteredTasks.length,
      high: filteredTasks.filter(t => t.priority === 'high').length,
      medium: filteredTasks.filter(t => t.priority === 'medium').length,
      low: filteredTasks.filter(t => t.priority === 'low').length,
      pending: filteredTasks.filter(t => t.status === 'pending').length,
      inProgress: filteredTasks.filter(t => t.status === 'in_progress').length,
      completed: filteredTasks.filter(t => t.status === 'completed').length,
      overdue: filteredTasks.filter(t => t.dueDate < today && t.status !== 'completed').length,
      dueToday: filteredTasks.filter(t => t.dueDate === today && t.status !== 'completed').length
    };
    
    console.log(`✅ Loaded ${filteredTasks.length} daily tasks`);
    console.log(`📊 Task summary:`, summary);
    
    return NextResponse.json({
      success: true,
      tasks: filteredTasks,
      summary
    });
    
  } catch (error: any) {
    console.error('Error fetching daily tasks:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch daily tasks' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('📝 Creating new daily task:', body);
    
    const now = new Date().toISOString();
    const newTask: DailyTask = {
      id: nextId.toString(),
      title: body.title,
      description: body.description || '',
      memberName: body.memberName || '',
      memberClientId: body.memberClientId || '',
      healthPlan: body.healthPlan || '',
      assignedTo: body.assignedTo,
      assignedToName: body.assignedToName || '',
      priority: body.priority || 'medium',
      status: 'pending',
      dueDate: body.dueDate,
      createdAt: now,
      updatedAt: now,
      createdBy: body.createdBy,
      notes: body.notes || '',
      tags: body.tags || []
    };
    
    tasks.push(newTask);
    nextId++;
    
    console.log(`✅ Created daily task with ID: ${newTask.id}`);
    
    return NextResponse.json({
      success: true,
      taskId: newTask.id,
      task: newTask
    });
    
  } catch (error: any) {
    console.error('Error creating daily task:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create daily task' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;
    
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Task ID is required' },
        { status: 400 }
      );
    }
    
    console.log(`📝 Updating daily task ${id}:`, updates);
    
    const taskIndex = tasks.findIndex(task => task.id === id);
    if (taskIndex === -1) {
      return NextResponse.json(
        { success: false, error: 'Task not found' },
        { status: 404 }
      );
    }
    
    const now = new Date().toISOString();
    const updateData = {
      ...updates,
      updatedAt: now
    };
    
    // Add completedAt timestamp if status is being set to completed
    if (updates.status === 'completed' && !updates.completedAt) {
      updateData.completedAt = now;
    }
    
    tasks[taskIndex] = { ...tasks[taskIndex], ...updateData };
    
    console.log(`✅ Updated daily task ${id}`);
    
    return NextResponse.json({
      success: true,
      taskId: id,
      task: tasks[taskIndex]
    });
    
  } catch (error: any) {
    console.error('Error updating daily task:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update daily task' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Task ID is required' },
        { status: 400 }
      );
    }
    
    console.log(`🗑️ Deleting daily task ${id}`);
    
    const taskIndex = tasks.findIndex(task => task.id === id);
    if (taskIndex === -1) {
      return NextResponse.json(
        { success: false, error: 'Task not found' },
        { status: 404 }
      );
    }
    
    tasks.splice(taskIndex, 1);
    
    console.log(`✅ Deleted daily task ${id}`);
    
    return NextResponse.json({
      success: true,
      taskId: id
    });
    
  } catch (error: any) {
    console.error('Error deleting daily task:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete daily task' },
      { status: 500 }
    );
  }
}