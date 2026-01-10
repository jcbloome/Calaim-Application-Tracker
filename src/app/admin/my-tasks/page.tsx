'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { useUser } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, Clock, CheckCircle, Calendar, User, RefreshCw, Edit } from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useToast } from '@/hooks/use-toast';

interface MyKaiserTask {
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

// Next actions for each Kaiser status
const nextActions: Record<string, string> = {
  "Pre-T2038, Compiling Docs": "Gather required documentation and submit T2038 request",
  "T2038 Requested": "Follow up on T2038 request status",
  "T2038 Received": "Review T2038 and initiate first member contact",
  "T2038 received, Need First Contact": "Schedule and complete initial member contact",
  "T2038 received, doc collection": "Collect additional required documents",
  "Needs RN Visit": "Schedule RN assessment visit",
  "RN/MSW Scheduled": "Confirm RN/MSW appointment and prepare materials",
  "RN Visit Complete": "Review RN assessment and prepare for tier level request",
  "Need Tier Level": "Submit tier level determination request",
  "Tier Level Requested": "Follow up on tier level determination",
  "Tier Level Received": "Review tier level and begin RCFE search",
  "Locating RCFEs": "Search and contact appropriate RCFE facilities",
  "Found RCFE": "Initiate R&B process with selected RCFE",
  "R&B Requested": "Follow up on R&B request and documentation",
  "R&B Signed": "Process member for ILS contracting",
  "RCFE/ILS for Invoicing": "Complete invoicing setup and finalize placement",
  "ILS Contracted (Complete)": "Confirm ILS contract completion",
  "Confirm ILS Contracted": "Final verification and case closure",
  "Complete": "Case completed - archive and update records",
  "Tier Level Revision Request": "Submit and follow up on tier level revision",
  "On-Hold": "Review hold status and determine next steps",
  "Tier Level Appeal": "Process tier level appeal documentation",
  "T2038 email but need auth sheet": "Obtain required authorization sheet",
  "Non-active": "Review case status and determine reactivation steps"
};

export default function MyTasksPage() {
  const { isAdmin, user: currentUser } = useAdmin();
  const { user } = useUser();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<MyKaiserTask[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Helper functions
  const getDaysUntilDue = (dateString: string): number => {
    if (!dateString) return 999; // No date set
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

  // Fetch my Kaiser tasks
  const fetchMyTasks = async () => {
    if (!currentUser?.email) return;
    
    setIsLoading(true);
    try {
      const functions = getFunctions();
      const fetchKaiserMembers = httpsCallable(functions, 'fetchKaiserMembersFromCaspio');
      
      const result = await fetchKaiserMembers();
      const data = result.data as any;
      
      if (data.success) {
        const allMembers = data.members || [];
        
        // Filter for members assigned to current user
        const myMembers = allMembers.filter((member: any) => 
          member.kaiser_user_assignment === currentUser.email ||
          member.kaiser_user_assignment === `${currentUser.displayName}` ||
          member.kaiser_user_assignment === `${currentUser.email?.split('@')[0]}`
        );
        
        // Transform to task format
        const myTasks: MyKaiserTask[] = myMembers.map((member: any) => {
          const daysUntilDue = getDaysUntilDue(member.next_steps_date);
          const isOverdue = daysUntilDue < 0;
          
          return {
            id: member.id || member.client_ID2,
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
            isOverdue,
            nextAction: nextActions[member.Kaiser_Status] || 'Review case and determine next steps'
          };
        });
        
        // Sort by urgency (overdue first, then by days until due)
        myTasks.sort((a, b) => {
          if (a.isOverdue && !b.isOverdue) return -1;
          if (!a.isOverdue && b.isOverdue) return 1;
          return a.daysUntilDue - b.daysUntilDue;
        });
        
        setTasks(myTasks);
        
        toast({
          title: 'Tasks Loaded',
          description: `Found ${myTasks.length} Kaiser cases assigned to you`,
          className: 'bg-green-100 text-green-900 border-green-200',
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: data.message || 'Failed to fetch your tasks',
        });
      }
    } catch (error: any) {
      console.error('Error fetching tasks:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to load your tasks',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser?.email) {
      fetchMyTasks();
    }
  }, [currentUser]);

  // Group tasks by urgency
  const taskGroups = useMemo(() => {
    const overdue = tasks.filter(t => t.isOverdue);
    const dueToday = tasks.filter(t => !t.isOverdue && t.daysUntilDue <= 0);
    const dueThisWeek = tasks.filter(t => !t.isOverdue && t.daysUntilDue > 0 && t.daysUntilDue <= 7);
    const future = tasks.filter(t => !t.isOverdue && t.daysUntilDue > 7);
    
    return { overdue, dueToday, dueThisWeek, future };
  }, [tasks]);

  if (!isAdmin) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
          </CardHeader>
          <CardContent>
            <p>You need admin access to view your tasks.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Kaiser Tasks</h1>
          <p className="text-muted-foreground">
            Your assigned Kaiser cases and next steps
          </p>
        </div>
        <Button onClick={fetchMyTasks} disabled={isLoading}>
          {isLoading ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Refresh Tasks
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{taskGroups.overdue.length}</div>
            <p className="text-xs text-muted-foreground">Needs immediate attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Due Today</CardTitle>
            <Clock className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{taskGroups.dueToday.length}</div>
            <p className="text-xs text-muted-foreground">Due today</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Due This Week</CardTitle>
            <Calendar className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{taskGroups.dueThisWeek.length}</div>
            <p className="text-xs text-muted-foreground">Due within 7 days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Cases</CardTitle>
            <User className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{tasks.length}</div>
            <p className="text-xs text-muted-foreground">Assigned to you</p>
          </CardContent>
        </Card>
      </div>

      {/* Tasks Table with Tabs */}
      <Tabs defaultValue="all" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="all">All ({tasks.length})</TabsTrigger>
          <TabsTrigger value="overdue" className="text-red-600">
            Overdue ({taskGroups.overdue.length})
          </TabsTrigger>
          <TabsTrigger value="today" className="text-orange-600">
            Due Today ({taskGroups.dueToday.length})
          </TabsTrigger>
          <TabsTrigger value="week" className="text-yellow-600">
            This Week ({taskGroups.dueThisWeek.length})
          </TabsTrigger>
          <TabsTrigger value="future">
            Future ({taskGroups.future.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <TaskTable tasks={tasks} />
        </TabsContent>
        <TabsContent value="overdue">
          <TaskTable tasks={taskGroups.overdue} />
        </TabsContent>
        <TabsContent value="today">
          <TaskTable tasks={taskGroups.dueToday} />
        </TabsContent>
        <TabsContent value="week">
          <TaskTable tasks={taskGroups.dueThisWeek} />
        </TabsContent>
        <TabsContent value="future">
          <TaskTable tasks={taskGroups.future} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TaskTable({ tasks }: { tasks: MyKaiserTask[] }) {
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
          <p className="text-center text-muted-foreground">No tasks in this category.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>MRN</TableHead>
                <TableHead>County</TableHead>
                <TableHead>Current Status</TableHead>
                <TableHead>Next Action Required</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((task) => (
                <TableRow key={task.id} className={task.isOverdue ? 'bg-red-50' : ''}>
                  <TableCell>
                    <div className="font-medium">
                      {task.memberFirstName} {task.memberLastName}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      ID: {task.client_ID2}
                    </div>
                  </TableCell>
                  <TableCell>{task.memberMrn || 'N/A'}</TableCell>
                  <TableCell>{task.memberCounty || 'N/A'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {task.Kaiser_Status || 'Pending'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs max-w-xs">
                      {task.nextAction}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className={`flex items-center gap-1 text-xs ${
                      task.isOverdue 
                        ? 'text-red-600 font-medium' 
                        : task.next_steps_date 
                          ? 'text-muted-foreground' 
                          : 'text-gray-400'
                    }`}>
                      <Badge className={getUrgencyColor(task.daysUntilDue, task.isOverdue)} variant="outline">
                        <div className="flex items-center gap-1">
                          {getUrgencyIcon(task.daysUntilDue, task.isOverdue)}
                          {task.next_steps_date ? (
                            <>
                              {formatDate(task.next_steps_date)}
                              {task.isOverdue && (
                                <span className="ml-1">
                                  ({Math.abs(task.daysUntilDue)} days overdue)
                                </span>
                              )}
                            </>
                          ) : (
                            'No date set'
                          )}
                        </div>
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" asChild>
                        <a href={`/admin/applications/${task.id}`}>
                          <Edit className="h-3 w-3 mr-1" />
                          Manage
                        </a>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}