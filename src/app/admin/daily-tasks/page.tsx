'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFunctions } from '@/firebase';
import { useAdmin } from '@/hooks/use-admin';
import { httpsCallable } from 'firebase/functions';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Loader2, Calendar, AlertTriangle, CheckCircle, Clock, ArrowLeft, User } from 'lucide-react';
import { format, isToday, isBefore, startOfDay } from 'date-fns';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface DailyTask {
  id: string;
  memberName: string;
  memberMrn: string;
  currentStatus: string;
  nextStep: string;
  nextStepDate: string;
  assignedStaff: string;
  priority: 'high' | 'medium' | 'low';
  daysOverdue?: number;
}

export default function DailyTasksPage() {
  const functions = useFunctions();
  const { isAdmin, user, isLoading: isAdminLoading } = useAdmin();

  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDailyTasks = useCallback(async () => {
    if (isAdminLoading || !functions || !isAdmin) {
      if (!isAdminLoading) setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      console.log('📥 Fetching Kaiser members for daily tasks...');
      const fetchKaiserMembersFunction = httpsCallable(functions, 'fetchKaiserMembersFromCaspio');
      const result = await fetchKaiserMembersFunction({});
      
      const data = result.data as any;
      
      if (data.success && data.members) {
        console.log(`✅ Successfully fetched ${data.members.length} Kaiser members`);
        
        // Transform members into daily tasks
        const dailyTasks: DailyTask[] = data.members
          .filter((member: any) => {
            // Only include members assigned to current user or show all for super admin
            return member.kaiser_user_assignment && 
                   member.next_step && 
                   member.next_steps_date &&
                   (member.kaiser_user_assignment === user?.displayName || 
                    member.kaiser_user_assignment === user?.email);
          })
          .map((member: any) => {
            const nextStepDate = new Date(member.next_steps_date);
            const today = startOfDay(new Date());
            const taskDate = startOfDay(nextStepDate);
            
            let priority: 'high' | 'medium' | 'low' = 'medium';
            let daysOverdue = 0;
            
            if (isBefore(taskDate, today)) {
              const diffTime = today.getTime() - taskDate.getTime();
              daysOverdue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              priority = daysOverdue > 7 ? 'high' : daysOverdue > 3 ? 'medium' : 'low';
            } else if (isToday(taskDate)) {
              priority = 'high';
            }
            
            return {
              id: member.id,
              memberName: `${member.memberFirstName} ${member.memberLastName}`,
              memberMrn: member.memberMrn || 'N/A',
              currentStatus: member.Kaiser_Status || 'Unknown',
              nextStep: member.next_step || 'No Next Step',
              nextStepDate: member.next_steps_date,
              assignedStaff: member.kaiser_user_assignment,
              priority,
              daysOverdue: daysOverdue > 0 ? daysOverdue : undefined
            };
          })
          .sort((a, b) => {
            // Sort by priority (high first), then by date
            const priorityOrder = { high: 0, medium: 1, low: 2 };
            if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
              return priorityOrder[a.priority] - priorityOrder[b.priority];
            }
            return new Date(a.nextStepDate).getTime() - new Date(b.nextStepDate).getTime();
          });
        
        setTasks(dailyTasks);
      } else {
        console.error('❌ Failed to fetch Kaiser members:', data);
        setError('Failed to fetch daily tasks from Caspio');
      }
    } catch (error) {
      console.error('❌ Error fetching daily tasks:', error);
      setError('Error connecting to Caspio database');
    } finally {
      setIsLoading(false);
    }
  }, [functions, isAdmin, isAdminLoading, user]);

  useEffect(() => {
    fetchDailyTasks();
  }, [fetchDailyTasks]);

  const getPriorityColor = (priority: 'high' | 'medium' | 'low') => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
    }
  };

  const getPriorityIcon = (priority: 'high' | 'medium' | 'low') => {
    switch (priority) {
      case 'high': return <AlertTriangle className="h-3 w-3" />;
      case 'medium': return <Clock className="h-3 w-3" />;
      case 'low': return <CheckCircle className="h-3 w-3" />;
    }
  };

  if (isLoading || isAdminLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-4">Loading your daily tasks...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-full">
        <Alert className="max-w-md">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            You need admin access to view daily tasks.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const todayTasks = tasks.filter(task => isToday(new Date(task.nextStepDate)));
  const overdueTasks = tasks.filter(task => task.daysOverdue && task.daysOverdue > 0);
  const upcomingTasks = tasks.filter(task => 
    !isToday(new Date(task.nextStepDate)) && 
    (!task.daysOverdue || task.daysOverdue === 0)
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Calendar className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Daily Task Board</h1>
            <p className="text-muted-foreground">
              Your assigned Kaiser member tasks for {format(new Date(), 'PPPP')}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchDailyTasks}>
            <Loader2 className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button variant="outline" asChild>
            <Link href="/admin/kaiser-tracker">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Kaiser Tracker
            </Link>
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Due Today</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{todayTasks.length}</div>
            <p className="text-xs text-muted-foreground">Immediate attention needed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue</CardTitle>
            <Clock className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{overdueTasks.length}</div>
            <p className="text-xs text-muted-foreground">Past due date</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Upcoming</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{upcomingTasks.length}</div>
            <p className="text-xs text-muted-foreground">Future tasks</p>
          </CardContent>
        </Card>
      </div>

      {/* Tasks Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            My Assigned Tasks ({tasks.length})
          </CardTitle>
          <CardDescription>
            Kaiser member tasks assigned to you, sorted by priority and due date
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tasks.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Priority</TableHead>
                  <TableHead>Member Name</TableHead>
                  <TableHead>MRN</TableHead>
                  <TableHead>Current Status</TableHead>
                  <TableHead>Next Step</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell>
                      <Badge variant="outline" className={getPriorityColor(task.priority)}>
                        {getPriorityIcon(task.priority)}
                        <span className="ml-1 capitalize">{task.priority}</span>
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{task.memberName}</TableCell>
                    <TableCell>{task.memberMrn}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                        {task.currentStatus}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                        {task.nextStep}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className={`text-sm ${
                        task.daysOverdue ? 'text-red-600 font-medium' : 
                        isToday(new Date(task.nextStepDate)) ? 'text-orange-600 font-medium' : 
                        'text-gray-600'
                      }`}>
                        {format(new Date(task.nextStepDate), 'MMM d, yyyy')}
                      </div>
                    </TableCell>
                    <TableCell>
                      {task.daysOverdue ? (
                        <Badge variant="destructive">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          {task.daysOverdue}d overdue
                        </Badge>
                      ) : isToday(new Date(task.nextStepDate)) ? (
                        <Badge className="bg-orange-100 text-orange-800 border-orange-200">
                          <Clock className="h-3 w-3 mr-1" />
                          Due today
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          On track
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center text-muted-foreground py-10">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2">No Tasks Assigned</p>
              <p>You don't have any Kaiser member tasks assigned to you at the moment.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}