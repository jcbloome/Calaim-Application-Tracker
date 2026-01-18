'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAdmin } from '@/hooks/use-admin';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Loader2, Calendar, AlertTriangle, CheckCircle, Clock, ArrowLeft, User, Plus, Edit, Trash2, Filter } from 'lucide-react';
import { format, isToday, isBefore, startOfDay } from 'date-fns';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';

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

export default function DailyTasksPage() {
  const { isAdmin, user, isLoading: isAdminLoading } = useAdmin();

  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<DailyTask | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  
  // Form state for creating/editing tasks
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
    tags: [] as string[]
  });

  const fetchDailyTasks = useCallback(async () => {
    if (isAdminLoading || !isAdmin) {
      if (!isAdminLoading) setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      console.log('📥 Fetching daily tasks...');
      const params = new URLSearchParams();
      
      // Add filters if set
      if (filterStatus !== 'all') {
        params.append('status', filterStatus);
      }
      if (filterPriority !== 'all') {
        params.append('priority', filterPriority);
      }
      
      const response = await fetch(`/api/daily-tasks?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.tasks) {
        console.log(`✅ Successfully fetched ${data.tasks.length} daily tasks`);
        console.log(`📊 Task summary:`, data.summary);
        
        setTasks(data.tasks);
      } else {
        console.error('❌ Failed to fetch daily tasks:', data);
        setError('Failed to fetch daily tasks');
      }
    } catch (error) {
      console.error('❌ Error fetching daily tasks:', error);
      setError('Error connecting to database');
    } finally {
      setIsLoading(false);
    }
  }, [isAdmin, isAdminLoading, filterStatus, filterPriority]);

  useEffect(() => {
    fetchDailyTasks();
  }, [fetchDailyTasks]);

  const handleCreateTask = async () => {
    if (!formData.title || !formData.dueDate || !user) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    try {
      const response = await fetch('/api/daily-tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          assignedTo: formData.assignedTo || user.uid,
          assignedToName: formData.assignedToName || user.displayName || user.email,
          createdBy: user.uid
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Success",
          description: "Task created successfully"
        });
        setIsCreateDialogOpen(false);
        resetForm();
        fetchDailyTasks();
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create task",
        variant: "destructive"
      });
    }
  };

  const handleUpdateTask = async (taskId: string, updates: Partial<DailyTask>) => {
    try {
      const response = await fetch('/api/daily-tasks', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: taskId,
          ...updates
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Success",
          description: "Task updated successfully"
        });
        fetchDailyTasks();
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update task",
        variant: "destructive"
      });
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) {
      return;
    }

    try {
      const response = await fetch(`/api/daily-tasks?id=${taskId}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Success",
          description: "Task deleted successfully"
        });
        fetchDailyTasks();
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete task",
        variant: "destructive"
      });
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      memberName: '',
      memberClientId: '',
      healthPlan: '',
      assignedTo: '',
      assignedToName: '',
      priority: 'medium',
      dueDate: '',
      notes: '',
      tags: []
    });
    setEditingTask(null);
  };

  const openEditDialog = (task: DailyTask) => {
    setFormData({
      title: task.title,
      description: task.description || '',
      memberName: task.memberName || '',
      memberClientId: task.memberClientId || '',
      healthPlan: task.healthPlan || '',
      assignedTo: task.assignedTo,
      assignedToName: task.assignedToName || '',
      priority: task.priority,
      dueDate: task.dueDate,
      notes: task.notes || '',
      tags: task.tags || []
    });
    setEditingTask(task);
    setIsCreateDialogOpen(true);
  };

  const handleEditTask = async () => {
    if (!editingTask || !formData.title || !formData.dueDate) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    await handleUpdateTask(editingTask.id!, formData);
    setIsCreateDialogOpen(false);
    resetForm();
  };

  // Calculate summary statistics
  const today = new Date().toISOString().split('T')[0];
  const todayTasks = tasks.filter(task => task.dueDate === today && task.status !== 'completed');
  const overdueTasks = tasks.filter(task => task.dueDate < today && task.status !== 'completed');
  const upcomingTasks = tasks.filter(task => task.dueDate > today && task.status !== 'completed');

  const getPriorityColor = (priority: 'high' | 'medium' | 'low') => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'in_progress': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'completed': return 'bg-green-100 text-green-800 border-green-200';
      case 'cancelled': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
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
              CalAIM member tasks for all health plans - {format(new Date(), 'PPPP')}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="mr-2 h-4 w-4" />
                New Task
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editingTask ? 'Edit Task' : 'Create New Task'}</DialogTitle>
                <DialogDescription>
                  {editingTask ? 'Update the task details below.' : 'Create a new daily task for staff members.'}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Task Title *</Label>
                    <Input
                      id="title"
                      value={formData.title}
                      onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="Enter task title"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dueDate">Due Date *</Label>
                    <Input
                      id="dueDate"
                      type="date"
                      value={formData.dueDate}
                      onChange={(e) => setFormData(prev => ({ ...prev, dueDate: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Enter task description"
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="memberName">Member Name</Label>
                    <Input
                      id="memberName"
                      value={formData.memberName}
                      onChange={(e) => setFormData(prev => ({ ...prev, memberName: e.target.value }))}
                      placeholder="CalAIM member name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="healthPlan">Health Plan</Label>
                    <Select value={formData.healthPlan} onValueChange={(value) => setFormData(prev => ({ ...prev, healthPlan: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select health plan" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Kaiser">Kaiser</SelectItem>
                        <SelectItem value="Health Net">Health Net</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="assignedToName">Assigned To</Label>
                    <Input
                      id="assignedToName"
                      value={formData.assignedToName}
                      onChange={(e) => setFormData(prev => ({ ...prev, assignedToName: e.target.value }))}
                      placeholder="Staff member name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="priority">Priority</Label>
                    <Select value={formData.priority} onValueChange={(value: 'high' | 'medium' | 'low') => setFormData(prev => ({ ...prev, priority: value }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Additional notes"
                    rows={2}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setIsCreateDialogOpen(false); resetForm(); }}>
                  Cancel
                </Button>
                <Button onClick={editingTask ? handleEditTask : handleCreateTask}>
                  {editingTask ? 'Update Task' : 'Create Task'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          
          <Button variant="outline" onClick={fetchDailyTasks}>
            <Loader2 className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="space-y-2">
              <Label htmlFor="statusFilter">Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="priorityFilter">Priority</Label>
              <Select value={filterPriority} onValueChange={setFilterPriority}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priority</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

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
            <Calendar className="h-5 w-5" />
            Daily Task Board ({tasks.length})
          </CardTitle>
          <CardDescription>
            Daily tasks and upcoming deadlines for all CalAIM members (Kaiser, Health Net, and other health plans)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tasks.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Priority</TableHead>
                  <TableHead>Task</TableHead>
                  <TableHead>Member</TableHead>
                  <TableHead>Health Plan</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Actions</TableHead>
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
                    <TableCell>
                      <Badge variant="outline" className={
                        task.healthPlan === 'Kaiser' ? 'bg-green-50 text-green-700 border-green-200' :
                        task.healthPlan === 'Health Net' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                        'bg-gray-50 text-gray-700 border-gray-200'
                      }>
                        {task.healthPlan}
                      </Badge>
                    </TableCell>
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