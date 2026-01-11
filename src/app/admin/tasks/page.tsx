'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Clock, CheckCircle, Calendar, User, RefreshCw, Edit, Bell, Target, CalendarDays, ListTodo } from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useToast } from '@/hooks/use-toast';
import { format, isToday, isTomorrow, isYesterday, addDays, startOfDay, endOfDay } from 'date-fns';
import Link from 'next/link';

interface KaiserTask {
  id: string;
  memberFirstName: string;
  memberLastName: string;
  memberMrn: string;
  memberCounty: string;
  client_ID2: string;
  Kaiser_Status: string;
  CalAIM_Status: string;
  next_steps_date: string;
  kaiser_user_assignment: string;
  pathway: string;
  daysUntilDue: number;
  isOverdue: boolean;
  nextAction: string;
}

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

// Next actions for each Kaiser status
const nextActions: Record<string, string> = {
  "Pre-T2038, Compiling Docs": "Compile required documentation and submit T2038 request",
  "T2038 Requested": "Follow up on T2038 approval status with Kaiser",
  "T2038 Received": "Schedule RN/MSW visit for member assessment",
  "RN Visit Scheduled": "Conduct RN/MSW visit and complete assessment",
  "RN Visit Complete": "Review assessment and determine tier level requirements",
  "Need Tier Level": "Submit tier level request to Kaiser",
  "Tier Level Requested": "Follow up on tier level determination",
  "Tier Level Received": "Begin RCFE location process",
  "Locating RCFEs": "Continue searching for suitable RCFE placement",
  "Found RCFE": "Submit room and board request",
  "R&B Requested": "Follow up on room and board approval",
  "R&B Signed": "Initiate RCFE/ILS contracting process",
  "RCFE/ILS for Invoicing": "Complete ILS contracting and setup",
  "ILS Contracted (Complete)": "Confirm services are in place",
  "Confirm ILS Contracted": "Finalize case completion",
  "Complete": "Case completed - no further action needed",
  "T2038 email but need auth sheet": "Obtain authorization sheet and resubmit T2038",
  "Tier Level Revision Request": "Submit revised tier level request",
  "Tier Level Appeal": "Process tier level appeal",
  "On-Hold": "Review hold status and determine next steps",
  "Non-active": "Review case status and determine reactivation steps"
};

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

export default function TasksPage() {
  const { isAdmin, user: currentUser } = useAdmin();
  const { toast } = useToast();
  const [kaiserTasks, setKaiserTasks] = useState<KaiserTask[]>([]);
  const [dailyTasks, setDailyTasks] = useState<DailyTask[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<string>('today');
  const [staffMembers, setStaffMembers] = useState<Array<{ id: string; name: string; role: string }>>([]);

  // Helper functions
  const getDaysUntilDue = (dateString: string): number => {
    if (!dateString) return 999;
    const dueDate = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = dueDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const formatDate = (dateString: string | Date): string => {
    if (!dateString) return 'No date set';
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const getUrgencyColor = (daysUntilDue: number, isOverdue: boolean): string => {
    if (isOverdue) return 'bg-red-100 text-red-800 border-red-200';
    if (daysUntilDue <= 0) return 'bg-red-100 text-red-800 border-red-200';
    if (daysUntilDue <= 1) return 'bg-orange-100 text-orange-800 border-orange-200';
    if (daysUntilDue <= 3) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    return 'bg-green-100 text-green-800 border-green-200';
  };

  const getUrgencyIcon = (daysUntilDue: number, isOverdue: boolean) => {
    if (isOverdue || daysUntilDue <= 0) return <AlertTriangle className="h-3 w-3" />;
    if (daysUntilDue <= 3) return <Clock className="h-3 w-3" />;
    return <CheckCircle className="h-3 w-3" />;
  };

  // Fetch Kaiser tasks assigned to current user
  const fetchMyKaiserTasks = async () => {
    if (!currentUser?.email) return;
    
    setIsLoading(true);
    try {
      const functions = getFunctions();
      const fetchMembers = httpsCallable(functions, 'fetchKaiserMembersFromCaspio');
      
      const result = await fetchMembers({});
      const data = result.data as any;
      
      if (data.success && data.members) {
        const myTasks: KaiserTask[] = data.members
          .filter((member: any) => 
            member.kaiser_user_assignment === currentUser.email ||
            member.kaiser_user_assignment === currentUser.displayName
          )
          .map((member: any) => {
            const daysUntilDue = getDaysUntilDue(member.next_steps_date);
            return {
              id: member.id,
              memberFirstName: member.memberFirstName,
              memberLastName: member.memberLastName,
              memberMrn: member.memberMrn,
              memberCounty: member.memberCounty,
              client_ID2: member.client_ID2,
              Kaiser_Status: member.Kaiser_Status,
              CalAIM_Status: member.CalAIM_Status,
              next_steps_date: member.next_steps_date,
              kaiser_user_assignment: member.kaiser_user_assignment,
              pathway: member.pathway,
              daysUntilDue,
              isOverdue: daysUntilDue < 0,
              nextAction: nextActions[member.Kaiser_Status] || 'Review case and determine next steps'
            };
          });
        
        // Sort by urgency (overdue first, then by days until due)
        myTasks.sort((a, b) => {
          if (a.isOverdue && !b.isOverdue) return -1;
          if (!a.isOverdue && b.isOverdue) return 1;
          return a.daysUntilDue - b.daysUntilDue;
        });
        
        setKaiserTasks(myTasks);
        
        toast({
          title: 'Kaiser Tasks Loaded',
          description: `Found ${myTasks.length} Kaiser cases assigned to you`,
          className: 'bg-green-100 text-green-900 border-green-200',
        });
      }
    } catch (error: any) {
      console.error('Error fetching Kaiser tasks:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to load Kaiser tasks',
      });
    } finally {
      setIsLoading(false);
    }
  };

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
        
        setDailyTasks(loadedTasks);
        
        if (data.staffMembers) {
          setStaffMembers(data.staffMembers);
        }
        
        toast({
          title: 'Daily Tasks Loaded',
          description: `Found ${loadedTasks.length} tasks for ${selectedDate}`,
          className: 'bg-green-100 text-green-900 border-green-200',
        });
      }
    } catch (error: any) {
      console.error('Error loading daily tasks:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to load daily tasks',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser?.email) {
      fetchMyKaiserTasks();
    }
  }, [currentUser]);

  useEffect(() => {
    loadDailyTasks();
  }, [selectedStaff, selectedDate]);

  // Group Kaiser tasks by urgency
  const kaiserTaskGroups = useMemo(() => {
    const overdue = kaiserTasks.filter(t => t.isOverdue);
    const dueToday = kaiserTasks.filter(t => !t.isOverdue && t.daysUntilDue <= 0);
    const dueThisWeek = kaiserTasks.filter(t => !t.isOverdue && t.daysUntilDue > 0 && t.daysUntilDue <= 7);
    const future = kaiserTasks.filter(t => !t.isOverdue && t.daysUntilDue > 7);
    
    return { overdue, dueToday, dueThisWeek, future };
  }, [kaiserTasks]);

  // Group daily tasks by status
  const dailyTaskGroups = useMemo(() => {
    const pending = dailyTasks.filter(t => t.status === 'Pending');
    const inProgress = dailyTasks.filter(t => t.status === 'In Progress');
    const completed = dailyTasks.filter(t => t.status === 'Completed');
    const overdue = dailyTasks.filter(t => t.status === 'Overdue');
    
    return { pending, inProgress, completed, overdue };
  }, [dailyTasks]);

  if (!isAdmin) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
          </CardHeader>
          <CardContent>
            <p>You need admin access to view tasks.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Task Management</h1>
          <p className="text-muted-foreground">
            Manage your Kaiser assignments and daily tasks
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={fetchMyKaiserTasks} disabled={isLoading} variant="outline">
            {isLoading ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      {/* Task Type Tabs */}
      <Tabs defaultValue="kaiser" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="kaiser" className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            My Kaiser Tasks ({kaiserTasks.length})
          </TabsTrigger>
          <TabsTrigger value="daily" className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Daily Tasks ({dailyTasks.length})
          </TabsTrigger>
        </TabsList>

        {/* Kaiser Tasks Tab */}
        <TabsContent value="kaiser" className="space-y-6">
          {/* Kaiser Task Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold text-red-600">{kaiserTaskGroups.overdue.length}</p>
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
                    <p className="text-2xl font-bold text-orange-600">{kaiserTaskGroups.dueToday.length}</p>
                    <p className="text-xs text-muted-foreground">Due Today</p>
                  </div>
                  <Clock className="h-4 w-4 text-orange-600" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold text-yellow-600">{kaiserTaskGroups.dueThisWeek.length}</p>
                    <p className="text-xs text-muted-foreground">This Week</p>
                  </div>
                  <Calendar className="h-4 w-4 text-yellow-600" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold text-green-600">{kaiserTaskGroups.future.length}</p>
                    <p className="text-xs text-muted-foreground">Future</p>
                  </div>
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Kaiser Tasks Table with Tabs */}
          <Tabs defaultValue="all" className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="all">All ({kaiserTasks.length})</TabsTrigger>
              <TabsTrigger value="overdue" className="text-red-600">
                Overdue ({kaiserTaskGroups.overdue.length})
              </TabsTrigger>
              <TabsTrigger value="today" className="text-orange-600">
                Due Today ({kaiserTaskGroups.dueToday.length})
              </TabsTrigger>
              <TabsTrigger value="week" className="text-yellow-600">
                This Week ({kaiserTaskGroups.dueThisWeek.length})
              </TabsTrigger>
              <TabsTrigger value="future">
                Future ({kaiserTaskGroups.future.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all">
              <KaiserTaskTable tasks={kaiserTasks} />
            </TabsContent>
            <TabsContent value="overdue">
              <KaiserTaskTable tasks={kaiserTaskGroups.overdue} />
            </TabsContent>
            <TabsContent value="today">
              <KaiserTaskTable tasks={kaiserTaskGroups.dueToday} />
            </TabsContent>
            <TabsContent value="week">
              <KaiserTaskTable tasks={kaiserTaskGroups.dueThisWeek} />
            </TabsContent>
            <TabsContent value="future">
              <KaiserTaskTable tasks={kaiserTaskGroups.future} />
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* Daily Tasks Tab */}
        <TabsContent value="daily" className="space-y-6">
          {/* Daily Task Controls */}
          <div className="flex items-center gap-4">
            <Select value={selectedStaff} onValueChange={setSelectedStaff}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by staff" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Staff</SelectItem>
                {staffMembers.map((staff) => (
                  <SelectItem key={staff.id} value={staff.id}>
                    {staff.name} ({staff.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedDate} onValueChange={setSelectedDate}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select date range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="tomorrow">Tomorrow</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
              </SelectContent>
            </Select>

            <Button onClick={loadDailyTasks} disabled={isLoading} variant="outline">
              {isLoading ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Refresh
            </Button>
          </div>

          {/* Daily Task Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold text-yellow-600">{dailyTaskGroups.pending.length}</p>
                    <p className="text-xs text-muted-foreground">Pending</p>
                  </div>
                  <Clock className="h-4 w-4 text-yellow-600" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold text-blue-600">{dailyTaskGroups.inProgress.length}</p>
                    <p className="text-xs text-muted-foreground">In Progress</p>
                  </div>
                  <ListTodo className="h-4 w-4 text-blue-600" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold text-green-600">{dailyTaskGroups.completed.length}</p>
                    <p className="text-xs text-muted-foreground">Completed</p>
                  </div>
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold text-red-600">{dailyTaskGroups.overdue.length}</p>
                    <p className="text-xs text-muted-foreground">Overdue</p>
                  </div>
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Daily Tasks Table */}
          <DailyTaskTable tasks={dailyTasks} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Kaiser Task Table Component
function KaiserTaskTable({ tasks }: { tasks: KaiserTask[] }) {
  const getDaysUntilDue = (dateString: string): number => {
    if (!dateString) return 999;
    const dueDate = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = dueDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const formatDate = (dateString: string): string => {
    if (!dateString) return 'No date set';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const getUrgencyColor = (daysUntilDue: number, isOverdue: boolean): string => {
    if (isOverdue) return 'bg-red-100 text-red-800 border-red-200';
    if (daysUntilDue <= 0) return 'bg-red-100 text-red-800 border-red-200';
    if (daysUntilDue <= 1) return 'bg-orange-100 text-orange-800 border-orange-200';
    if (daysUntilDue <= 3) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    return 'bg-green-100 text-green-800 border-green-200';
  };

  const getUrgencyIcon = (daysUntilDue: number, isOverdue: boolean) => {
    if (isOverdue || daysUntilDue <= 0) return <AlertTriangle className="h-3 w-3" />;
    if (daysUntilDue <= 3) return <Clock className="h-3 w-3" />;
    return <CheckCircle className="h-3 w-3" />;
  };

  if (tasks.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-muted-foreground">No Kaiser tasks in this category.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>MRN</TableHead>
              <TableHead>County</TableHead>
              <TableHead>Kaiser Status</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Urgency</TableHead>
              <TableHead>Next Action</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.map((task) => (
              <TableRow key={task.id}>
                <TableCell className="font-medium">
                  {task.memberFirstName} {task.memberLastName}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">
                    {task.memberMrn}
                  </Badge>
                </TableCell>
                <TableCell>{task.memberCounty}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">
                    {task.Kaiser_Status}
                  </Badge>
                </TableCell>
                <TableCell>{formatDate(task.next_steps_date)}</TableCell>
                <TableCell>
                  <Badge className={getUrgencyColor(task.daysUntilDue, task.isOverdue)}>
                    {getUrgencyIcon(task.daysUntilDue, task.isOverdue)}
                    <span className="ml-1">
                      {task.isOverdue 
                        ? `${Math.abs(task.daysUntilDue)} days overdue`
                        : task.daysUntilDue === 0 
                        ? 'Due today'
                        : `${task.daysUntilDue} days`
                      }
                    </span>
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-xs">
                  {task.nextAction}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Link href={`/admin/applications/${task.id}`}>
                      <Button size="sm" variant="outline">
                        <Edit className="mr-2 h-3 w-3" />
                        View
                      </Button>
                    </Link>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// Daily Task Table Component
function DailyTaskTable({ tasks }: { tasks: DailyTask[] }) {
  if (tasks.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-muted-foreground">No daily tasks found for the selected criteria.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily Tasks</CardTitle>
        <CardDescription>
          Tasks scheduled for the selected time period
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Current Step</TableHead>
              <TableHead>Next Step</TableHead>
              <TableHead>Follow-up Date</TableHead>
              <TableHead>Assigned To</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.map((task) => (
              <TableRow key={task.id}>
                <TableCell className="font-medium">{task.memberName}</TableCell>
                <TableCell>{task.currentStep}</TableCell>
                <TableCell>{task.nextStep}</TableCell>
                <TableCell>{format(task.followUpDate, 'MMM dd, yyyy')}</TableCell>
                <TableCell>{task.assignedTo}</TableCell>
                <TableCell>
                  <Badge className={PRIORITY_COLORS[task.priority]}>
                    {task.priority}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge className={STATUS_COLORS[task.status]}>
                    {task.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                  {task.notes || '-'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}