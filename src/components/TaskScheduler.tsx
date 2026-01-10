'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { 
  Calendar as CalendarIcon, 
  Clock, 
  Plus, 
  CheckCircle2, 
  AlertCircle,
  User,
  ArrowRight,
  Save,
  Loader2,
  Bell
} from 'lucide-react';
import { format, addDays, isAfter, isBefore, isToday } from 'date-fns';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface Task {
  id: string;
  memberId: string;
  memberName: string;
  currentStep: string;
  nextStep: string;
  followUpDate: Date;
  assignedTo: string;
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  status: 'Pending' | 'In Progress' | 'Completed' | 'Overdue';
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface TaskSchedulerProps {
  memberId: string;
  memberName: string;
  currentAssignee?: string;
  onTaskUpdate?: (task: Task) => void;
}

const KAISER_STEPS = [
  'Initial Assessment',
  'T2038 Request',
  'T2038 Review',
  'Tier Level Request',
  'Tier Level Review',
  'RCFE/ILS Contracting',
  'Authorization Complete',
  'Discharge Planning',
  'Community Placement'
];

const PRIORITY_COLORS = {
  'Low': 'bg-gray-100 text-gray-800 border-gray-200',
  'Medium': 'bg-blue-100 text-blue-800 border-blue-200',
  'High': 'bg-orange-100 text-orange-800 border-orange-200',
  'Urgent': 'bg-red-100 text-red-800 border-red-200'
};

const STATUS_COLORS = {
  'Pending': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'In Progress': 'bg-blue-100 text-blue-800 border-blue-200',
  'Completed': 'bg-green-100 text-green-800 border-green-200',
  'Overdue': 'bg-red-100 text-red-800 border-red-200'
};

export default function TaskScheduler({ memberId, memberName, currentAssignee, onTaskUpdate }: TaskSchedulerProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showNewTaskForm, setShowNewTaskForm] = useState(false);
  const [staffMembers, setStaffMembers] = useState<Array<{ id: string; name: string; role: string }>>([]);
  const { toast } = useToast();

  // New task form state
  const [newTask, setNewTask] = useState({
    currentStep: '',
    nextStep: '',
    followUpDate: new Date(),
    assignedTo: currentAssignee || '',
    priority: 'Medium' as Task['priority'],
    notes: ''
  });

  // Load existing tasks
  const loadTasks = async () => {
    setIsLoading(true);
    try {
      const functions = getFunctions();
      const getTasks = httpsCallable(functions, 'getMemberTasks');
      
      const result = await getTasks({ memberId });
      const data = result.data as any;
      
      if (data.success && data.tasks) {
        const loadedTasks = data.tasks.map((task: any) => ({
          ...task,
          followUpDate: new Date(task.followUpDate),
          createdAt: new Date(task.createdAt),
          updatedAt: new Date(task.updatedAt),
          status: getTaskStatus(new Date(task.followUpDate), task.status)
        }));
        setTasks(loadedTasks);
      }
    } catch (error: any) {
      console.error('Error loading tasks:', error);
      toast({
        variant: 'destructive',
        title: 'Load Failed',
        description: 'Could not load member tasks',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Load staff members
  const loadStaffMembers = async () => {
    try {
      const functions = getFunctions();
      const getStaff = httpsCallable(functions, 'getStaffMembers');
      
      const result = await getStaff({});
      const data = result.data as any;
      
      if (data.success && data.staff) {
        // Sort with Super Admins first
        const sortedStaff = data.staff.sort((a: any, b: any) => {
          if (a.role === 'Super Admin' && b.role !== 'Super Admin') return -1;
          if (b.role === 'Super Admin' && a.role !== 'Super Admin') return 1;
          if (a.role === 'Admin' && b.role !== 'Admin' && b.role !== 'Super Admin') return -1;
          if (b.role === 'Admin' && a.role !== 'Admin' && a.role !== 'Super Admin') return 1;
          return a.name.localeCompare(b.name);
        });
        setStaffMembers(sortedStaff);
      }
    } catch (error: any) {
      console.error('Error loading staff:', error);
    }
  };

  // Determine task status based on date and current status
  const getTaskStatus = (followUpDate: Date, currentStatus: string): Task['status'] => {
    if (currentStatus === 'Completed') return 'Completed';
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    followUpDate.setHours(0, 0, 0, 0);
    
    if (isBefore(followUpDate, today)) return 'Overdue';
    if (isToday(followUpDate)) return 'In Progress';
    return 'Pending';
  };

  // Save new task
  const saveTask = async () => {
    if (!newTask.currentStep || !newTask.nextStep || !newTask.assignedTo) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: 'Please fill in all required fields',
      });
      return;
    }

    setIsSaving(true);
    try {
      const functions = getFunctions();
      const createTask = httpsCallable(functions, 'createMemberTask');
      
      const taskData = {
        memberId,
        memberName,
        currentStep: newTask.currentStep,
        nextStep: newTask.nextStep,
        followUpDate: newTask.followUpDate.toISOString(),
        assignedTo: newTask.assignedTo,
        priority: newTask.priority,
        notes: newTask.notes
      };
      
      const result = await createTask(taskData);
      const data = result.data as any;
      
      if (data.success) {
        const createdTask: Task = {
          ...data.task,
          followUpDate: new Date(data.task.followUpDate),
          createdAt: new Date(data.task.createdAt),
          updatedAt: new Date(data.task.updatedAt),
          status: getTaskStatus(new Date(data.task.followUpDate), 'Pending')
        };
        
        setTasks(prev => [createdTask, ...prev]);
        setShowNewTaskForm(false);
        setNewTask({
          currentStep: '',
          nextStep: '',
          followUpDate: addDays(new Date(), 1),
          assignedTo: currentAssignee || '',
          priority: 'Medium',
          notes: ''
        });
        
        toast({
          title: 'Task Created',
          description: `Task assigned to ${newTask.assignedTo}`,
          className: 'bg-green-100 text-green-900 border-green-200',
        });

        if (onTaskUpdate) {
          onTaskUpdate(createdTask);
        }
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Save Failed',
        description: error.message || 'Could not create task',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Update task status
  const updateTaskStatus = async (taskId: string, status: Task['status']) => {
    try {
      const functions = getFunctions();
      const updateTask = httpsCallable(functions, 'updateMemberTask');
      
      const result = await updateTask({ taskId, updates: { status } });
      const data = result.data as any;
      
      if (data.success) {
        setTasks(prev => prev.map(task => 
          task.id === taskId 
            ? { ...task, status, updatedAt: new Date() }
            : task
        ));
        
        toast({
          title: 'Task Updated',
          description: `Task marked as ${status.toLowerCase()}`,
          className: 'bg-green-100 text-green-900 border-green-200',
        });
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: 'Could not update task status',
      });
    }
  };

  useEffect(() => {
    loadTasks();
    loadStaffMembers();
  }, [memberId]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Task Scheduler</h3>
          <p className="text-sm text-muted-foreground">
            Manage workflow steps and follow-up dates for {memberName}
          </p>
        </div>
        <Button
          onClick={() => setShowNewTaskForm(!showNewTaskForm)}
          className="bg-blue-600 hover:bg-blue-700"
        >
          <Plus className="mr-2 h-4 w-4" />
          New Task
        </Button>
      </div>

      {/* New Task Form */}
      {showNewTaskForm && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Create New Task
            </CardTitle>
            <CardDescription>
              Schedule the next step in the Kaiser process workflow
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Current Step */}
              <div className="space-y-2">
                <Label htmlFor="current-step">Current Step *</Label>
                <Select value={newTask.currentStep} onValueChange={(value) => setNewTask(prev => ({ ...prev, currentStep: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select current step" />
                  </SelectTrigger>
                  <SelectContent>
                    {KAISER_STEPS.map((step) => (
                      <SelectItem key={step} value={step}>{step}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Next Step */}
              <div className="space-y-2">
                <Label htmlFor="next-step">Next Step *</Label>
                <Select value={newTask.nextStep} onValueChange={(value) => setNewTask(prev => ({ ...prev, nextStep: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select next step" />
                  </SelectTrigger>
                  <SelectContent>
                    {KAISER_STEPS.map((step) => (
                      <SelectItem key={step} value={step}>{step}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Assigned To */}
              <div className="space-y-2">
                <Label htmlFor="assigned-to">Assign To *</Label>
                <Select value={newTask.assignedTo} onValueChange={(value) => setNewTask(prev => ({ ...prev, assignedTo: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select staff member" />
                  </SelectTrigger>
                  <SelectContent>
                    {staffMembers.map((staff) => (
                      <SelectItem key={staff.id} value={staff.name}>
                        <div className="flex items-center gap-2">
                          <span>{staff.name}</span>
                          {staff.role === 'Super Admin' && (
                            <Badge variant="outline" className="text-xs">Super Admin</Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Priority */}
              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <Select value={newTask.priority} onValueChange={(value: Task['priority']) => setNewTask(prev => ({ ...prev, priority: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Low">Low</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="High">High</SelectItem>
                    <SelectItem value="Urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Follow-up Date */}
            <div className="space-y-2">
              <Label>Follow-up Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(newTask.followUpDate, 'PPP')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={newTask.followUpDate}
                    onSelect={(date) => date && setNewTask(prev => ({ ...prev, followUpDate: date }))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Add any additional notes or instructions..."
                value={newTask.notes}
                onChange={(e) => setNewTask(prev => ({ ...prev, notes: e.target.value }))}
                rows={3}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button onClick={saveTask} disabled={isSaving}>
                {isSaving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Create Task
              </Button>
              <Button variant="outline" onClick={() => setShowNewTaskForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tasks List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            <span>Loading tasks...</span>
          </div>
        ) : tasks.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No tasks scheduled for this member</p>
                <Button 
                  onClick={() => setShowNewTaskForm(true)} 
                  variant="outline" 
                  className="mt-4"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create First Task
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onStatusUpdate={updateTaskStatus}
            />
          ))
        )}
      </div>
    </div>
  );
}

// Task Card Component
interface TaskCardProps {
  task: Task;
  onStatusUpdate: (taskId: string, status: Task['status']) => void;
}

function TaskCard({ task, onStatusUpdate }: TaskCardProps) {
  const isOverdue = task.status === 'Overdue';
  const isDueToday = isToday(task.followUpDate);

  return (
    <Card className={`${isOverdue ? 'border-red-200 bg-red-50' : isDueToday ? 'border-orange-200 bg-orange-50' : ''}`}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="space-y-3 flex-1">
            {/* Task Flow */}
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="text-xs">
                {task.currentStep}
              </Badge>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <Badge variant="outline" className="text-xs font-medium">
                {task.nextStep}
              </Badge>
            </div>

            {/* Task Details */}
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <User className="h-3 w-3" />
                <span>{task.assignedTo}</span>
              </div>
              <div className="flex items-center gap-1">
                <CalendarIcon className="h-3 w-3" />
                <span>{format(task.followUpDate, 'MMM dd, yyyy')}</span>
                {isDueToday && <Badge className="ml-1 text-xs bg-orange-100 text-orange-800">Due Today</Badge>}
                {isOverdue && <Badge className="ml-1 text-xs bg-red-100 text-red-800">Overdue</Badge>}
              </div>
            </div>

            {/* Notes */}
            {task.notes && (
              <p className="text-sm text-muted-foreground bg-gray-50 p-2 rounded">
                {task.notes}
              </p>
            )}
          </div>

          {/* Status and Actions */}
          <div className="flex items-center gap-2">
            <Badge className={PRIORITY_COLORS[task.priority]}>
              {task.priority}
            </Badge>
            <Badge className={STATUS_COLORS[task.status]}>
              {task.status}
            </Badge>
            
            {task.status !== 'Completed' && (
              <Button
                size="sm"
                onClick={() => onStatusUpdate(task.id, 'Completed')}
                className="bg-green-600 hover:bg-green-700"
              >
                <CheckCircle2 className="mr-1 h-3 w-3" />
                Complete
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}