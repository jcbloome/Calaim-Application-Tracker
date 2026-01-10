'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { 
  Calendar,
  Clock, 
  CheckCircle2, 
  AlertTriangle,
  User,
  ArrowRight,
  RefreshCw,
  Filter,
  Bell,
  TrendingUp,
  Target,
  Loader2,
  CalendarDays,
  ListTodo
} from 'lucide-react';
import { format, isToday, isTomorrow, isYesterday, addDays, startOfDay, endOfDay } from 'date-fns';
import { getFunctions, httpsCallable } from 'firebase/functions';
import Link from 'next/link';

interface DailyTask {
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
  daysOverdue?: number;
  memberCounty?: string;
  kaiserStatus?: string;
}

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

export default function DailyTasksPage() {
  const { user, isAdmin, isUserLoading } = useAdmin();
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<string>('today');
  const [staffMembers, setStaffMembers] = useState<Array<{ id: string; name: string; role: string }>>([]);
  const { toast } = useToast();

  // Load daily tasks
  const loadDailyTasks = async () => {
    setIsLoading(true);
    try {
      const functions = getFunctions();
      const getTasks = httpsCallable(functions, 'getDailyTasks');
      
      let dateFilter = new Date();
      if (selectedDate === 'tomorrow') {
        dateFilter = addDays(new Date(), 1);
      } else if (selectedDate === 'yesterday') {
        dateFilter = addDays(new Date(), -1);
      } else if (selectedDate === 'week') {
        dateFilter = addDays(new Date(), 7);
      }
      
      const result = await getTasks({ 
        staffFilter: selectedStaff === 'all' ? null : selectedStaff,
        dateFilter: selectedDate,
        startDate: startOfDay(dateFilter).toISOString(),
        endDate: endOfDay(dateFilter).toISOString()
      });
      
      const data = result.data as any;
      
      if (data.success && data.tasks) {
        const loadedTasks = data.tasks.map((task: any) => ({
          ...task,
          followUpDate: new Date(task.followUpDate),
          daysOverdue: task.daysOverdue || 0
        }));
        setTasks(loadedTasks);
      }
    } catch (error: any) {
      console.error('Error loading daily tasks:', error);
      toast({
        variant: 'destructive',
        title: 'Load Failed',
        description: 'Could not load daily tasks',
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

  // Update task status
  const updateTaskStatus = async (taskId: string, status: DailyTask['status']) => {
    try {
      const functions = getFunctions();
      const updateTask = httpsCallable(functions, 'updateMemberTask');
      
      const result = await updateTask({ taskId, updates: { status } });
      const data = result.data as any;
      
      if (data.success) {
        setTasks(prev => prev.map(task => 
          task.id === taskId 
            ? { ...task, status }
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

  // Task statistics
  const taskStats = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'Completed').length;
    const overdue = tasks.filter(t => t.status === 'Overdue').length;
    const urgent = tasks.filter(t => t.priority === 'Urgent').length;
    const dueToday = tasks.filter(t => isToday(t.followUpDate)).length;
    
    const byStaff = tasks.reduce((acc, task) => {
      acc[task.assignedTo] = (acc[task.assignedTo] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const byPriority = tasks.reduce((acc, task) => {
      acc[task.priority] = (acc[task.priority] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return { total, completed, overdue, urgent, dueToday, byStaff, byPriority };
  }, [tasks]);

  // Filtered tasks by category
  const tasksByCategory = useMemo(() => {
    const overdue = tasks.filter(t => t.status === 'Overdue');
    const dueToday = tasks.filter(t => isToday(t.followUpDate) && t.status !== 'Completed');
    const dueTomorrow = tasks.filter(t => isTomorrow(t.followUpDate) && t.status !== 'Completed');
    const upcoming = tasks.filter(t => 
      t.followUpDate > addDays(new Date(), 1) && 
      t.followUpDate <= addDays(new Date(), 7) && 
      t.status !== 'Completed'
    );
    
    return { overdue, dueToday, dueTomorrow, upcoming };
  }, [tasks]);

  useEffect(() => {
    if (isAdmin && !isUserLoading) {
      loadDailyTasks();
      loadStaffMembers();
    }
  }, [isAdmin, isUserLoading, selectedStaff, selectedDate]);

  if (isUserLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Access Denied
            </CardTitle>
            <CardDescription>
              You need administrator privileges to access daily tasks.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Daily Task Dashboard</h1>
          <p className="text-muted-foreground">
            Manage and track daily workflow tasks for all staff members
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {format(new Date(), 'EEEE, MMMM dd, yyyy')}
          </span>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filters:</span>
            </div>
            
            <Select value={selectedStaff} onValueChange={setSelectedStaff}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All Staff" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Staff Members</SelectItem>
                {staffMembers.map((staff) => (
                  <SelectItem key={staff.id} value={staff.name}>
                    {staff.name}
                    {staff.role === 'Super Admin' && (
                      <Badge variant="outline" className="ml-2 text-xs">SA</Badge>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={selectedDate} onValueChange={setSelectedDate}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="tomorrow">Tomorrow</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
              </SelectContent>
            </Select>
            
            <Button onClick={loadDailyTasks} variant="outline" disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{taskStats.total}</p>
                <p className="text-xs text-muted-foreground">Total Tasks</p>
              </div>
              <ListTodo className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-red-600">{taskStats.overdue}</p>
                <p className="text-xs text-muted-foreground">Overdue</p>
              </div>
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-blue-600">{taskStats.dueToday}</p>
                <p className="text-xs text-muted-foreground">Due Today</p>
              </div>
              <Clock className="h-4 w-4 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-orange-600">{taskStats.urgent}</p>
                <p className="text-xs text-muted-foreground">Urgent</p>
              </div>
              <Bell className="h-4 w-4 text-orange-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-green-600">{taskStats.completed}</p>
                <p className="text-xs text-muted-foreground">Completed</p>
              </div>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Task Categories */}
      <Tabs defaultValue="overdue" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overdue" className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Overdue ({tasksByCategory.overdue.length})
          </TabsTrigger>
          <TabsTrigger value="today" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Due Today ({tasksByCategory.dueToday.length})
          </TabsTrigger>
          <TabsTrigger value="tomorrow" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Tomorrow ({tasksByCategory.dueTomorrow.length})
          </TabsTrigger>
          <TabsTrigger value="upcoming" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Upcoming ({tasksByCategory.upcoming.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overdue" className="space-y-4">
          <TaskList 
            tasks={tasksByCategory.overdue} 
            title="Overdue Tasks" 
            emptyMessage="No overdue tasks"
            onStatusUpdate={updateTaskStatus}
          />
        </TabsContent>

        <TabsContent value="today" className="space-y-4">
          <TaskList 
            tasks={tasksByCategory.dueToday} 
            title="Due Today" 
            emptyMessage="No tasks due today"
            onStatusUpdate={updateTaskStatus}
          />
        </TabsContent>

        <TabsContent value="tomorrow" className="space-y-4">
          <TaskList 
            tasks={tasksByCategory.dueTomorrow} 
            title="Due Tomorrow" 
            emptyMessage="No tasks due tomorrow"
            onStatusUpdate={updateTaskStatus}
          />
        </TabsContent>

        <TabsContent value="upcoming" className="space-y-4">
          <TaskList 
            tasks={tasksByCategory.upcoming} 
            title="Upcoming Tasks" 
            emptyMessage="No upcoming tasks"
            onStatusUpdate={updateTaskStatus}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Task List Component
interface TaskListProps {
  tasks: DailyTask[];
  title: string;
  emptyMessage: string;
  onStatusUpdate: (taskId: string, status: DailyTask['status']) => void;
}

function TaskList({ tasks, title, emptyMessage, onStatusUpdate }: TaskListProps) {
  if (tasks.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8 text-muted-foreground">
            <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>{emptyMessage}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {tasks.map((task) => (
        <TaskCard key={task.id} task={task} onStatusUpdate={onStatusUpdate} />
      ))}
    </div>
  );
}

// Task Card Component
interface TaskCardProps {
  task: DailyTask;
  onStatusUpdate: (taskId: string, status: DailyTask['status']) => void;
}

function TaskCard({ task, onStatusUpdate }: TaskCardProps) {
  const isOverdue = task.status === 'Overdue';
  const isDueToday = isToday(task.followUpDate);

  return (
    <Card className={`${isOverdue ? 'border-red-200 bg-red-50' : isDueToday ? 'border-blue-200 bg-blue-50' : ''}`}>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1">
            {/* Member and Task Info */}
            <div className="flex items-center gap-3">
              <Link href={`/admin/applications/${task.memberId}`}>
                <Button variant="link" className="p-0 h-auto font-medium text-blue-600 hover:text-blue-800">
                  {task.memberName}
                </Button>
              </Link>
              {task.memberCounty && (
                <Badge variant="outline" className="text-xs">
                  {task.memberCounty} County
                </Badge>
              )}
              {task.kaiserStatus && (
                <Badge variant="outline" className="text-xs">
                  {task.kaiserStatus}
                </Badge>
              )}
            </div>

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
                <Calendar className="h-3 w-3" />
                <span>{format(task.followUpDate, 'MMM dd, yyyy')}</span>
                {task.daysOverdue && task.daysOverdue > 0 && (
                  <Badge className="ml-1 text-xs bg-red-100 text-red-800">
                    {task.daysOverdue} days overdue
                  </Badge>
                )}
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