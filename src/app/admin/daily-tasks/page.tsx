'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAdmin } from '@/hooks/use-admin';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  Calendar,
  AlertTriangle,
  CheckCircle,
  Clock,
  Plus,
  Edit,
  Trash2,
  Filter,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  CalendarDays,
  Flame,
  TrendingUp,
  Target,
  MessageSquare,
  UserCheck,
  Stethoscope,
} from 'lucide-react';
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  isPast,
  isTomorrow,
  isThisWeek,
  addDays,
} from 'date-fns';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

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
  applicationId?: string;
  applicationLink?: string;
  source?: 'manual' | 'application';
}

const PRIORITY_CONFIG = {
  high: {
    label: 'High',
    badge: 'bg-red-100 text-red-800 border-red-200',
    border: 'border-l-red-500',
    dot: 'bg-red-500',
    icon: Flame,
  },
  medium: {
    label: 'Medium',
    badge: 'bg-amber-100 text-amber-800 border-amber-200',
    border: 'border-l-amber-400',
    dot: 'bg-amber-400',
    icon: TrendingUp,
  },
  low: {
    label: 'Low',
    badge: 'bg-green-100 text-green-800 border-green-200',
    border: 'border-l-green-400',
    dot: 'bg-green-400',
    icon: Target,
  },
} as const;

const STATUS_CONFIG = {
  pending: { label: 'Pending', badge: 'bg-slate-100 text-slate-700 border-slate-200' },
  in_progress: { label: 'In Progress', badge: 'bg-blue-100 text-blue-800 border-blue-200' },
  completed: { label: 'Completed', badge: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  cancelled: { label: 'Cancelled', badge: 'bg-gray-100 text-gray-500 border-gray-200' },
} as const;

const HEALTH_PLAN_CONFIG: Record<string, string> = {
  Kaiser: 'bg-green-50 text-green-700 border-green-200',
  'Health Net': 'bg-orange-50 text-orange-700 border-orange-200',
};

const SOURCE_CONFIG: Record<
  string,
  { label: string; badge: string; icon: React.ElementType }
> = {
  interoffice_note: {
    label: 'Interoffice Note',
    badge: 'bg-purple-50 text-purple-700 border-purple-200',
    icon: MessageSquare,
  },
  caspio_assignment: {
    label: 'Staff Assignment',
    badge: 'bg-blue-50 text-blue-800 border-blue-200',
    icon: UserCheck,
  },
  caspio_kaiser: {
    label: 'Kaiser · Caspio',
    badge: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    icon: Stethoscope,
  },
  caspio_health_net: {
    label: 'Health Net · Caspio',
    badge: 'bg-orange-50 text-orange-800 border-orange-200',
    icon: Stethoscope,
  },
  application: {
    label: 'Scheduled',
    badge: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    icon: CalendarDays,
  },
};

// ─── Mini Calendar Component ─────────────────────────────────────────────────
function MiniCalendar({
  tasks,
  onDayClick,
  selectedDate,
}: {
  tasks: DailyTask[];
  onDayClick: (date: Date) => void;
  selectedDate: Date | null;
}) {
  const [viewMonth, setViewMonth] = useState(new Date());

  const taskDateSet = useMemo(() => {
    const set = new Set<string>();
    tasks
      .filter((t) => t.status !== 'completed' && t.status !== 'cancelled')
      .forEach((t) => set.add(t.dueDate));
    return set;
  }, [tasks]);

  const overdueSet = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const set = new Set<string>();
    tasks
      .filter((t) => t.dueDate < today && t.status !== 'completed' && t.status !== 'cancelled')
      .forEach((t) => set.add(t.dueDate));
    return set;
  }, [tasks]);

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(viewMonth);
    const monthEnd = endOfMonth(viewMonth);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [viewMonth]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3 pt-4 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setViewMonth((m) => subMonths(m, 1))}
            className="p-1 rounded hover:bg-white/20 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="font-semibold text-sm">{format(viewMonth, 'MMMM yyyy')}</span>
          <button
            onClick={() => setViewMonth((m) => addMonths(m, 1))}
            className="p-1 rounded hover:bg-white/20 transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </CardHeader>
      <CardContent className="p-3">
        <div className="grid grid-cols-7 mb-1">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
            <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {calendarDays.map((day) => {
            const dayStr = format(day, 'yyyy-MM-dd');
            const hasTask = taskDateSet.has(dayStr);
            const isOverdue = overdueSet.has(dayStr);
            const isCurrentMonth = isSameMonth(day, viewMonth);
            const isSelected = selectedDate && isSameDay(day, selectedDate);
            const isTodayDay = isToday(day);

            return (
              <button
                key={dayStr}
                onClick={() => onDayClick(day)}
                className={cn(
                  'relative flex flex-col items-center justify-center rounded-md text-xs py-1.5 transition-all hover:bg-muted',
                  !isCurrentMonth && 'opacity-30',
                  isTodayDay && !isSelected && 'bg-blue-50 text-blue-700 font-semibold ring-1 ring-blue-300',
                  isSelected && 'bg-blue-600 text-white font-semibold shadow-sm',
                )}
              >
                <span>{format(day, 'd')}</span>
                {hasTask && (
                  <span
                    className={cn(
                      'absolute bottom-0.5 h-1 w-1 rounded-full',
                      isSelected ? 'bg-white' : isOverdue ? 'bg-red-500' : 'bg-blue-500'
                    )}
                  />
                )}
              </button>
            );
          })}
        </div>
        <div className="mt-2 pt-2 border-t flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-blue-500 inline-block" /> Tasks</span>
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-red-500 inline-block" /> Overdue</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Task Card Component ─────────────────────────────────────────────────────
function TaskCard({
  task,
  today,
  onEdit,
  onToggleComplete,
  onDelete,
}: {
  task: DailyTask;
  today: string;
  onEdit: (task: DailyTask) => void;
  onToggleComplete: (task: DailyTask) => void;
  onDelete: (taskId: string) => void;
}) {
  const priority = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.medium;
  const statusCfg = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.pending;
  const PriorityIcon = priority.icon;
  const isOverdue = task.dueDate < today && task.status !== 'completed' && task.status !== 'cancelled';
  const isDueToday = task.dueDate === today;
  const isCompleted = task.status === 'completed';

  return (
    <div
      className={cn(
        'group relative flex gap-3 rounded-lg border bg-card p-3.5 shadow-sm transition-all hover:shadow-md border-l-4',
        priority.border,
        isCompleted && 'opacity-60',
      )}
    >
      {/* Complete toggle */}
      <button
        onClick={() => onToggleComplete(task)}
        className={cn(
          'mt-0.5 flex-shrink-0 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors',
          isCompleted
            ? 'border-emerald-500 bg-emerald-500 text-white'
            : 'border-muted-foreground/40 hover:border-emerald-400',
        )}
      >
        {isCompleted && <CheckCircle className="h-3 w-3" />}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-start gap-2 mb-1">
          <span className={cn('text-sm font-medium leading-tight', isCompleted && 'line-through text-muted-foreground')}>
            {task.title}
          </span>
          <div className="flex flex-wrap gap-1 ml-auto">
            <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', priority.badge)}>
              <PriorityIcon className="h-2.5 w-2.5 mr-0.5" />
              {priority.label}
            </Badge>
            <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', statusCfg.badge)}>
              {statusCfg.label}
            </Badge>
            {task.source && task.source !== 'manual' && SOURCE_CONFIG[task.source] && (() => {
              const src = SOURCE_CONFIG[task.source!]!;
              const SrcIcon = src.icon;
              return (
                <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', src.badge)}>
                  <SrcIcon className="h-2.5 w-2.5 mr-0.5" />
                  {src.label}
                </Badge>
              );
            })()}
          </div>
        </div>

        {task.description && (
          <p className="text-xs text-muted-foreground mb-1.5 line-clamp-2">{task.description}</p>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {task.memberName && (
            <span className="flex items-center gap-1 font-medium text-foreground/80">
              {task.memberName}
              {task.healthPlan && (
                <Badge variant="outline" className={cn('text-[10px] px-1 py-0 ml-1', HEALTH_PLAN_CONFIG[task.healthPlan] ?? 'bg-gray-50 text-gray-700 border-gray-200')}>
                  {task.healthPlan}
                </Badge>
              )}
            </span>
          )}
          {task.assignedToName && <span>→ {task.assignedToName}</span>}
          <span
            className={cn(
              'flex items-center gap-0.5 font-medium',
              isOverdue ? 'text-red-600' : isDueToday ? 'text-amber-600' : 'text-muted-foreground',
            )}
          >
            <Calendar className="h-3 w-3" />
            {isOverdue ? 'Overdue · ' : isDueToday ? 'Today · ' : ''}
            {format(parseISO(task.dueDate + 'T00:00:00'), 'MMM d')}
          </span>
          {task.source !== 'manual' && task.applicationLink && (
            <Link
              href={task.applicationLink}
              className="flex items-center gap-0.5 text-blue-600 hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              {task.applicationLink.includes('/forms/kaiser-referral/printable')
                ? 'Generate Kaiser Referral Form'
                : 'View application'}
            </Link>
          )}
        </div>

        {task.notes && (
          <p className="mt-1.5 text-[11px] bg-muted/60 rounded px-2 py-1 text-muted-foreground italic line-clamp-2">
            {task.notes}
          </p>
        )}
      </div>

      {/* Actions - visible on hover */}
      <div className="flex-shrink-0 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onEdit(task)}>
          <Edit className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
          onClick={() => onDelete(task.id!)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ─── Task Form Dialog ────────────────────────────────────────────────────────
function TaskFormDialog({
  open,
  onOpenChange,
  editingTask,
  defaultDueDate,
  user,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingTask: DailyTask | null;
  defaultDueDate?: string;
  user: any;
  onSave: () => void;
}) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    memberName: '',
    memberClientId: '',
    healthPlan: '',
    assignedTo: '',
    assignedToName: '',
    priority: 'medium' as 'high' | 'medium' | 'low',
    dueDate: '',
    notes: '',
  });

  useEffect(() => {
    if (editingTask) {
      setFormData({
        title: editingTask.title,
        description: editingTask.description || '',
        memberName: editingTask.memberName || '',
        memberClientId: editingTask.memberClientId || '',
        healthPlan: editingTask.healthPlan || '',
        assignedTo: editingTask.assignedTo,
        assignedToName: editingTask.assignedToName || '',
        priority: editingTask.priority,
        dueDate: editingTask.dueDate,
        notes: editingTask.notes || '',
      });
    } else {
      setFormData({
        title: '',
        description: '',
        memberName: '',
        memberClientId: '',
        healthPlan: '',
        assignedTo: '',
        assignedToName: '',
        priority: 'medium',
        dueDate: defaultDueDate || '',
        notes: '',
      });
    }
  }, [editingTask, defaultDueDate, open]);

  const handleSubmit = async () => {
    if (!formData.title || !formData.dueDate || !user) {
      toast({ title: 'Error', description: 'Please fill in all required fields', variant: 'destructive' });
      return;
    }

    try {
      if (editingTask) {
        await fetch('/api/daily-tasks', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingTask.id, ...formData }),
        });
        toast({ title: 'Task updated' });
      } else {
        await fetch('/api/daily-tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...formData,
            assignedTo: formData.assignedTo || user.uid,
            assignedToName: formData.assignedToName || user.displayName || user.email,
            createdBy: user.uid,
          }),
        });
        toast({ title: 'Task created' });
      }
      onOpenChange(false);
      onSave();
    } catch {
      toast({ title: 'Error', description: 'Could not save task', variant: 'destructive' });
    }
  };

  const set = (k: string, v: any) => setFormData((p) => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editingTask ? 'Edit Task' : 'New Task'}</DialogTitle>
          <DialogDescription>
            {editingTask ? 'Update the task details.' : 'Add a new item to the daily task calendar.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input value={formData.title} onChange={(e) => set('title', e.target.value)} placeholder="Task title" />
            </div>
            <div className="space-y-1.5">
              <Label>Due Date *</Label>
              <Input type="date" value={formData.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={formData.description} onChange={(e) => set('description', e.target.value)} placeholder="Optional details" rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Member Name</Label>
              <Input value={formData.memberName} onChange={(e) => set('memberName', e.target.value)} placeholder="CalAIM member" />
            </div>
            <div className="space-y-1.5">
              <Label>Health Plan</Label>
              <Select value={formData.healthPlan} onValueChange={(v) => set('healthPlan', v)}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Kaiser">Kaiser</SelectItem>
                  <SelectItem value="Health Net">Health Net</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Assigned To</Label>
              <Input value={formData.assignedToName} onChange={(e) => set('assignedToName', e.target.value)} placeholder="Staff name" />
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={formData.priority} onValueChange={(v) => set('priority', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={formData.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Additional notes" rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit}>{editingTask ? 'Update' : 'Create'} Task</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function DailyTasksPage() {
  const { isAdmin, user, isLoading: isAdminLoading } = useAdmin();

  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<DailyTask | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterSource, setFilterSource] = useState<string>('all');
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [defaultDueDate, setDefaultDueDate] = useState<string>('');

  const today = new Date().toISOString().split('T')[0];

  const fetchTasks = useCallback(async () => {
    if (isAdminLoading || !isAdmin) {
      if (!isAdminLoading) setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterStatus !== 'all') params.append('status', filterStatus);
      if (filterPriority !== 'all') params.append('priority', filterPriority);
      const res = await fetch(`/api/daily-tasks?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success) setTasks(data.tasks);
      else throw new Error(data.error || 'Failed to fetch tasks');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [isAdmin, isAdminLoading, filterStatus, filterPriority]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const handleToggleComplete = async (task: DailyTask) => {
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    await fetch('/api/daily-tasks', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: task.id, status: newStatus }),
    });
    fetchTasks();
  };

  const handleDelete = async (taskId: string) => {
    if (!confirm('Delete this task?')) return;
    await fetch(`/api/daily-tasks?id=${taskId}`, { method: 'DELETE' });
    toast({ title: 'Task deleted' });
    fetchTasks();
  };

  const openEdit = (task: DailyTask) => {
    setEditingTask(task);
    setDefaultDueDate('');
    setIsDialogOpen(true);
  };

  const openNew = (date?: Date) => {
    setEditingTask(null);
    setDefaultDueDate(date ? format(date, 'yyyy-MM-dd') : today);
    setIsDialogOpen(true);
  };

  const handleDayClick = (date: Date) => {
    setSelectedDay((prev) => (prev && isSameDay(prev, date) ? null : date));
  };

  // Group tasks for display
  const filteredTasks = useMemo(() => {
    let result = [...tasks];
    if (selectedDay) {
      const dayStr = format(selectedDay, 'yyyy-MM-dd');
      result = result.filter((t) => t.dueDate === dayStr);
    }
    if (filterSource !== 'all') {
      if (filterSource === 'manual') {
        result = result.filter((t) => !t.source || t.source === 'manual');
      } else {
        result = result.filter((t) => t.source === filterSource);
      }
    }
    return result;
  }, [tasks, selectedDay, filterSource]);

  const groupedTasks = useMemo(() => {
    const groups: { label: string; tasks: DailyTask[]; accent: string }[] = [];

    const overdue = filteredTasks.filter((t) => t.dueDate < today && t.status !== 'completed' && t.status !== 'cancelled');
    const dueToday = filteredTasks.filter((t) => t.dueDate === today && t.status !== 'completed' && t.status !== 'cancelled');
    const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
    const dueTomorrow = filteredTasks.filter((t) => t.dueDate === tomorrow && t.status !== 'completed' && t.status !== 'cancelled');
    const upcoming = filteredTasks.filter(
      (t) => t.dueDate > tomorrow && t.status !== 'completed' && t.status !== 'cancelled'
    );
    const completed = filteredTasks.filter((t) => t.status === 'completed' || t.status === 'cancelled');

    if (overdue.length) groups.push({ label: '⚠ Overdue', tasks: overdue, accent: 'text-red-700' });
    if (dueToday.length) groups.push({ label: '📅 Today', tasks: dueToday, accent: 'text-amber-700' });
    if (dueTomorrow.length) groups.push({ label: '🔜 Tomorrow', tasks: dueTomorrow, accent: 'text-blue-700' });
    if (upcoming.length) groups.push({ label: '🗓 Upcoming', tasks: upcoming, accent: 'text-indigo-700' });
    if (completed.length) groups.push({ label: '✓ Completed', tasks: completed, accent: 'text-emerald-700' });

    return groups;
  }, [filteredTasks, today]);

  // Summary stats (against all tasks, not filtered)
  const todayCount = tasks.filter((t) => t.dueDate === today && t.status !== 'completed' && t.status !== 'cancelled').length;
  const overdueCount = tasks.filter((t) => t.dueDate < today && t.status !== 'completed' && t.status !== 'cancelled').length;
  const upcomingCount = tasks.filter((t) => t.dueDate > today && t.status !== 'completed' && t.status !== 'cancelled').length;
  const completedCount = tasks.filter((t) => t.status === 'completed').length;

  if (isAdminLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6">
        <Alert variant="destructive" className="max-w-sm">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>Access denied. Admin privileges required.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/30">
      {/* ── Header ── */}
      <div className="bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 text-white px-6 py-8 shadow-lg">
        <div className="container mx-auto max-w-7xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 bg-white/20 rounded-xl">
                  <CalendarDays className="h-6 w-6" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight">Daily Task Calendar</h1>
              </div>
              <p className="text-blue-100 text-sm">
                {format(new Date(), 'EEEE, MMMM d, yyyy')} · {tasks.filter((t) => t.status !== 'completed').length} active tasks
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => openNew()}
                className="bg-white text-blue-700 hover:bg-blue-50 font-semibold shadow"
              >
                <Plus className="mr-2 h-4 w-4" />
                New Task
              </Button>
              <Button
                variant="outline"
                onClick={fetchTasks}
                className="border-white/30 text-white hover:bg-white/10"
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-7xl px-4 py-6">
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* ── Summary Stats ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Due Today', value: todayCount, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50', ring: 'ring-red-100' },
            { label: 'Overdue', value: overdueCount, icon: Clock, color: 'text-orange-600', bg: 'bg-orange-50', ring: 'ring-orange-100' },
            { label: 'Upcoming', value: upcomingCount, icon: Calendar, color: 'text-blue-600', bg: 'bg-blue-50', ring: 'ring-blue-100' },
            { label: 'Completed', value: completedCount, icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50', ring: 'ring-emerald-100' },
          ].map(({ label, value, icon: Icon, color, bg, ring }) => (
            <Card key={label} className={cn('border-0 shadow-sm ring-1', ring)}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground">{label}</span>
                  <div className={cn('p-1.5 rounded-lg', bg)}>
                    <Icon className={cn('h-4 w-4', color)} />
                  </div>
                </div>
                <div className={cn('text-3xl font-bold', color)}>{value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          {/* ── Sidebar: Mini Calendar + Filters ── */}
          <div className="space-y-4">
            <MiniCalendar tasks={tasks} onDayClick={handleDayClick} selectedDate={selectedDay} />

            {/* Filters */}
            <Card>
              <CardHeader className="pb-3 pt-4 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  Filters
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Status</Label>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Priority</Label>
                  <Select value={filterPriority} onValueChange={setFilterPriority}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All priorities</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Source</Label>
                  <Select value={filterSource} onValueChange={setFilterSource}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All sources</SelectItem>
                      <SelectItem value="interoffice_note">Interoffice Note</SelectItem>
                      <SelectItem value="caspio_assignment">Staff Assignment</SelectItem>
                      <SelectItem value="caspio_kaiser">Kaiser · Caspio</SelectItem>
                      <SelectItem value="caspio_health_net">Health Net · Caspio</SelectItem>
                      <SelectItem value="application">Scheduled</SelectItem>
                      <SelectItem value="manual">Manual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {(selectedDay || filterSource !== 'all' || filterStatus !== 'all' || filterPriority !== 'all') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full h-8 text-xs text-muted-foreground"
                    onClick={() => {
                      setSelectedDay(null);
                      setFilterSource('all');
                      setFilterStatus('all');
                      setFilterPriority('all');
                    }}
                  >
                    Clear all filters
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Quick Add for selected day */}
            {selectedDay && (
              <Card className="border-dashed border-blue-300 bg-blue-50/50">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-blue-700 font-medium mb-2">
                    {format(selectedDay, 'MMMM d')}
                  </p>
                  <Button size="sm" variant="outline" className="border-blue-300 text-blue-700" onClick={() => openNew(selectedDay)}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add task for this day
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          {/* ── Main Task List ── */}
          <div className="space-y-5">
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : groupedTasks.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-16 text-center">
                  <div className="p-4 bg-blue-50 rounded-full w-fit mx-auto mb-4">
                    <CalendarDays className="h-10 w-10 text-blue-400" />
                  </div>
                  <h3 className="text-lg font-semibold mb-1">No tasks found</h3>
                  <p className="text-muted-foreground text-sm mb-4">
                    {selectedDay
                      ? `No tasks for ${format(selectedDay, 'MMMM d, yyyy')}`
                      : 'Start by creating your first daily task.'}
                  </p>
                  <Button onClick={() => openNew(selectedDay ?? undefined)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Task
                  </Button>
                </CardContent>
              </Card>
            ) : (
              groupedTasks.map(({ label, tasks: groupTasks, accent }) => (
                <div key={label}>
                  <h2 className={cn('text-sm font-semibold mb-2.5 flex items-center gap-2', accent)}>
                    {label}
                    <span className="text-xs font-normal text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                      {groupTasks.length}
                    </span>
                  </h2>
                  <div className="space-y-2">
                    {groupTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        today={today}
                        onEdit={openEdit}
                        onToggleComplete={handleToggleComplete}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Task Form Dialog */}
      <TaskFormDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        editingTask={editingTask}
        defaultDueDate={defaultDueDate}
        user={user}
        onSave={fetchTasks}
      />
    </div>
  );
}
