import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface DailyTask {
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
  dueDate: string; // ISO date YYYY-MM-DD
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  completedAt?: string;
  notes?: string;
  tags?: string[];
  // Application linkage
  applicationId?: string;
  applicationLink?: string;
  /** Where the task originated — used to show a source badge in the calendar */
  source?: 'manual' | 'application' | 'interoffice_note' | 'caspio_assignment' | 'caspio_kaiser' | 'caspio_health_net';
}

function normalizePriority(raw: unknown): 'high' | 'medium' | 'low' {
  const s = String(raw || '').toLowerCase().trim();
  if (s === 'high' || s === 'urgent' || s === 'priority') return 'high';
  if (s === 'medium' || s === 'general') return 'medium';
  if (s === 'low') return 'low';
  return 'medium';
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const assignedTo = searchParams.get('assignedTo');
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const applicationId = searchParams.get('applicationId');

    let query: FirebaseFirestore.Query = adminDb.collection('adminDailyTasks');

    if (assignedTo && assignedTo !== 'all') {
      query = query.where('assignedTo', '==', assignedTo);
    }
    if (status && status !== 'all') {
      query = query.where('status', '==', status);
    }
    if (applicationId) {
      query = query.where('applicationId', '==', applicationId);
    }

    const snapshot = await query.orderBy('dueDate', 'asc').get();

    let tasks: DailyTask[] = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...(docSnap.data() as Omit<DailyTask, 'id'>),
    }));

    // Priority filter done client-side since compound indexes may not exist
    if (priority && priority !== 'all') {
      const normalizedFilter = normalizePriority(priority);
      tasks = tasks.filter((t) => t.priority === normalizedFilter);
    }

    const today = new Date().toISOString().split('T')[0];
    const summary = {
      total: tasks.length,
      pending: tasks.filter((t) => t.status === 'pending').length,
      inProgress: tasks.filter((t) => t.status === 'in_progress').length,
      completed: tasks.filter((t) => t.status === 'completed').length,
      overdue: tasks.filter((t) => t.dueDate < today && t.status !== 'completed').length,
      dueToday: tasks.filter((t) => t.dueDate === today && t.status !== 'completed').length,
    };

    return NextResponse.json({ success: true, tasks, summary });
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

    if (!body.title || !body.dueDate) {
      return NextResponse.json(
        { success: false, error: 'title and dueDate are required' },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const newTask: Omit<DailyTask, 'id'> = {
      title: String(body.title).trim(),
      description: String(body.description || '').trim(),
      memberName: String(body.memberName || '').trim(),
      memberClientId: String(body.memberClientId || '').trim(),
      healthPlan: String(body.healthPlan || '').trim(),
      assignedTo: String(body.assignedTo || '').trim(),
      assignedToName: String(body.assignedToName || '').trim(),
      priority: normalizePriority(body.priority),
      status: 'pending',
      dueDate: String(body.dueDate).trim(),
      createdAt: now,
      updatedAt: now,
      createdBy: String(body.createdBy || '').trim(),
      notes: String(body.notes || '').trim(),
      tags: Array.isArray(body.tags) ? body.tags : [],
      applicationId: body.applicationId ? String(body.applicationId).trim() : undefined,
      applicationLink: body.applicationLink ? String(body.applicationLink).trim() : undefined,
      source: body.source || 'manual',
    };

    const docRef = await adminDb.collection('adminDailyTasks').add(newTask);

    return NextResponse.json({ success: true, taskId: docRef.id, task: { id: docRef.id, ...newTask } });
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
    const action = String(body?.action || '').trim().toLowerCase();

    if (action === 'clear_member_followups') {
      const memberClientId = String(body?.memberClientId || '').trim();
      if (!memberClientId) {
        return NextResponse.json({ success: false, error: 'memberClientId is required' }, { status: 400 });
      }
      const snap = await adminDb
        .collection('adminDailyTasks')
        .where('memberClientId', '==', memberClientId)
        .get();
      const batch = adminDb.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      return NextResponse.json({ success: true, action: 'clear_member_followups', memberClientId, removedCount: snap.size });
    }

    const { id, ...updates } = body;
    if (!id) {
      return NextResponse.json({ success: false, error: 'Task ID is required' }, { status: 400 });
    }

    const docRef = adminDb.collection('adminDailyTasks').doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 });
    }

    const now = new Date().toISOString();
    const updateData: Record<string, any> = {
      ...updates,
      updatedAt: now,
    };
    if (updates?.priority) {
      updateData.priority = normalizePriority(updates.priority);
    }
    if (updates.status === 'completed' && !updates.completedAt) {
      updateData.completedAt = now;
    }

    await docRef.update(updateData);
    const updated = (await docRef.get()).data() as DailyTask;

    return NextResponse.json({ success: true, taskId: id, task: { id, ...updated } });
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
      return NextResponse.json({ success: false, error: 'Task ID is required' }, { status: 400 });
    }

    const docRef = adminDb.collection('adminDailyTasks').doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 });
    }

    await docRef.delete();
    return NextResponse.json({ success: true, taskId: id });
  } catch (error: any) {
    console.error('Error deleting daily task:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete daily task' },
      { status: 500 }
    );
  }
}
