'use client';

import { Suspense, useState, useEffect, useMemo } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { useSearchParams } from 'next/navigation';
import { useFirestore } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { AlertTriangle, Clock, CheckCircle, Calendar, User, RefreshCw, Edit, Bell, Target, CalendarDays, ListTodo, MessageSquare, FileText, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format, isToday, isTomorrow, isYesterday, addDays, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import Link from 'next/link';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getKaiserStatusByName, getNextKaiserStatus } from '@/lib/kaiser-status-progression';

interface MyTask {
  id: string;
  title: string;
  description?: string;
  memberName?: string;
  memberClientId?: string;
  healthPlan?: string;
  taskType: 'note_assignment' | 'follow_up' | 'review' | 'contact' | 'administrative' | 'kaiser_status';
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  status: 'pending' | 'in_progress' | 'completed' | 'overdue';
  dueDate: string;
  assignedBy: string;
  assignedByName: string;
  assignedTo: string;
  assignedToName: string;
  createdAt: string;
  updatedAt: string;
  notes?: string;
  source: 'notes' | 'applications' | 'manual';
  kaiserStatus?: string;
  currentKaiserStatus?: string;
}

interface MemberNote {
  id: string;
  clientId2: string;
  memberName: string;
  noteText: string;
  noteType: 'General' | 'Medical' | 'Social' | 'Administrative' | 'Follow-up' | 'Emergency';
  createdBy: string;
  createdByName: string;
  assignedTo?: string;
  assignedToName?: string;
  createdAt: string;
  updatedAt: string;
  source: 'Caspio' | 'App' | 'Admin';
  isRead: boolean;
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  followUpDate?: string;
  tags?: string[];
}

interface MemberCardData {
  clientId2: string;
  memberName: string;
  healthPlan: string;
  notes: MemberNote[];
  isFirstTimeLoad: boolean;
  lastSyncTime?: string;
}

function MyTasksPageContent() {
  const { user, isAdmin } = useAdmin();
  const searchParams = useSearchParams();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [tasks, setTasks] = useState<MyTask[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCompletingTask, setIsCompletingTask] = useState<Record<string, boolean>>({});
  const [selectedTab, setSelectedTab] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [timeRange, setTimeRange] = useState<'all' | 'daily' | 'weekly' | 'monthly'>('all');
  const [desktopActive, setDesktopActive] = useState(false);
  const [suppressWebWhenDesktopActive, setSuppressWebWhenDesktopActive] = useState(false);
  const [isCreateFollowUpOpen, setIsCreateFollowUpOpen] = useState(false);
  const [isCreatingFollowUp, setIsCreatingFollowUp] = useState(false);
  const [followUpForm, setFollowUpForm] = useState({
    title: '',
    message: '',
    memberName: '',
    memberClientId: '',
    healthPlan: '',
    priority: 'Priority' as 'General' | 'Priority' | 'Urgent',
    followUpDate: ''
  });
  
  // Member card modal state
  const [selectedMember, setSelectedMember] = useState<MemberCardData | null>(null);
  const [isMemberCardOpen, setIsMemberCardOpen] = useState(false);
  const [isLoadingNotes, setIsLoadingNotes] = useState(false);
  const [newNote, setNewNote] = useState({
    noteText: '',
    noteType: 'General' as MemberNote['noteType'],
    priority: 'Medium' as MemberNote['priority'],
    assignedTo: '',
    assignedToName: '',
    followUpDate: ''
  });

  useEffect(() => {
    if (user?.uid) {
      fetchMyTasks();
    }
  }, [user?.uid]);

  useEffect(() => {
    const range = searchParams.get('range');
    if (range === 'daily' || range === 'weekly' || range === 'monthly') {
      setTimeRange(range);
    }
  }, [searchParams]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const readSettings = () => {
      try {
        const raw = localStorage.getItem('notificationSettings');
        if (!raw) return;
        const parsed = JSON.parse(raw) as any;
        const nextValue = parsed?.userControls?.suppressWebWhenDesktopActive;
        setSuppressWebWhenDesktopActive(nextValue === undefined ? true : Boolean(nextValue));
      } catch {
        setSuppressWebWhenDesktopActive(true);
      }
    };
    readSettings();
    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'notificationSettings') {
        readSettings();
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isRealDesktop = Boolean(window.desktopNotifications && !window.desktopNotifications.__shim);
    if (!isRealDesktop) {
      setDesktopActive(false);
      return;
    }
    setDesktopActive(true);
    let unsubscribe: (() => void) | undefined;
    window.desktopNotifications.getState()
      .then(() => setDesktopActive(true))
      .catch(() => setDesktopActive(true));
    unsubscribe = window.desktopNotifications.onChange(() => {
      setDesktopActive(true);
    });
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!desktopActive) return;
    if (suppressWebWhenDesktopActive) return;
    updateSuppressSetting(true);
  }, [desktopActive, suppressWebWhenDesktopActive]);

  const updateSuppressSetting = (nextValue: boolean) => {
    setSuppressWebWhenDesktopActive(nextValue);
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem('notificationSettings');
      const parsed = raw ? JSON.parse(raw) as any : {};
      const updated = {
        ...parsed,
        userControls: {
          ...(parsed?.userControls || {}),
          suppressWebWhenDesktopActive: nextValue
        }
      };
      localStorage.setItem('notificationSettings', JSON.stringify(updated));
    } catch (error) {
      console.warn('Failed to update notification settings:', error);
    }
  };

  const fetchMyTasks = async () => {
    if (!user?.uid) return;
    
    setIsLoading(true);
    try {
      // Fetch tasks from API
      const response = await fetch(`/api/staff/tasks?userId=${user.uid}`);
      const contentType = response.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');
      const data = isJson ? await response.json() : null;
      const errorText = !isJson ? await response.text() : null;

      if (!response.ok) {
        throw new Error(
          data?.error || errorText || `Request failed with status ${response.status}`
        );
      }

      if (data?.success) {
        setTasks(data.tasks || []);
        
        toast({
          title: 'Tasks Loaded',
          description: `Found ${data.tasks?.length || 0} tasks assigned to you`,
          className: 'bg-green-100 text-green-900 border-green-200',
        });
      } else {
        throw new Error(data?.error || 'Failed to load tasks');
      }
      
    } catch (error: any) {
      console.error('Error fetching my tasks:', error);
      
      // Set empty tasks array on error
      setTasks([]);
      
      toast({
        variant: 'destructive',
        title: 'Error Loading Tasks',
        description: error.message || 'Failed to load your tasks',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const filteredTasks = useMemo(() => {
    const now = new Date();
    const range = (() => {
      if (timeRange === 'daily') {
        return { start: startOfDay(now), end: endOfDay(now) };
      }
      if (timeRange === 'weekly') {
        return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
      }
      if (timeRange === 'monthly') {
        return { start: startOfMonth(now), end: endOfMonth(now) };
      }
      return null;
    })();

    return tasks.filter(task => {
      // Tab filter
      if (selectedTab === 'overdue' && task.status !== 'overdue') return false;
      if (selectedTab === 'today') {
        const taskDate = new Date(task.dueDate);
        if (!isToday(taskDate)) return false;
      }
      if (selectedTab === 'upcoming') {
        const taskDate = new Date(task.dueDate);
        const tomorrow = addDays(new Date(), 1);
        if (taskDate <= tomorrow) return false;
      }
      if (selectedTab === 'followup' && task.taskType !== 'follow_up') return false;
      if (selectedTab === 'completed' && task.status !== 'completed') return false;

      // Priority filter
      if (priorityFilter !== 'all' && task.priority !== priorityFilter) return false;

      // Status filter
      if (statusFilter !== 'all' && task.status !== statusFilter) return false;

      // Source filter
      if (sourceFilter !== 'all' && task.source !== sourceFilter) return false;

      // Time range filter
      if (range) {
        const taskDate = new Date(task.dueDate);
        if (Number.isNaN(taskDate.getTime())) return false;
        if (taskDate < range.start || taskDate > range.end) return false;
      }

      return true;
    });
  }, [tasks, selectedTab, priorityFilter, statusFilter, sourceFilter, timeRange]);

  const calendarGroups = useMemo(() => {
    const grouped = new Map<string, MyTask[]>();
    filteredTasks.forEach((task) => {
      const date = new Date(task.dueDate);
      if (Number.isNaN(date.getTime())) return;
      const key = format(date, 'yyyy-MM-dd');
      const current = grouped.get(key) || [];
      current.push(task);
      grouped.set(key, current);
    });
    return Array.from(grouped.entries())
      .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
      .map(([date, items]) => ({
        date,
        label: format(new Date(date), 'EEEE, MMM d'),
        tasks: items
      }));
  }, [filteredTasks]);

  const taskCounts = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    return {
      all: tasks.length,
      overdue: tasks.filter(t => t.status === 'overdue').length,
      today: tasks.filter(t => isToday(new Date(t.dueDate)) && t.status !== 'completed').length,
      upcoming: tasks.filter(t => new Date(t.dueDate) > addDays(now, 1) && t.status !== 'completed').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      followup: tasks.filter(t => t.taskType === 'follow_up' && t.status !== 'completed').length,
      notes: tasks.filter(t => t.source === 'notes' && t.status !== 'completed').length,
      dueThisWeek: tasks.filter(t => {
        const date = new Date(t.dueDate);
        return date >= weekStart && date <= weekEnd && t.status !== 'completed';
      }).length,
      dueThisMonth: tasks.filter(t => {
        const date = new Date(t.dueDate);
        return date >= monthStart && date <= monthEnd && t.status !== 'completed';
      }).length
    };
  }, [tasks]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800 border-green-200';
      case 'in_progress': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'overdue': return 'bg-red-100 text-red-800 border-red-200';
      case 'pending': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getTaskTypeIcon = (taskType: string) => {
    switch (taskType) {
      case 'note_assignment': return <MessageSquare className="h-4 w-4" />;
      case 'follow_up': return <Calendar className="h-4 w-4" />;
      case 'review': return <CheckCircle className="h-4 w-4" />;
      case 'contact': return <Bell className="h-4 w-4" />;
      case 'administrative': return <ListTodo className="h-4 w-4" />;
      case 'kaiser_status': return <Target className="h-4 w-4" />;
      default: return <Target className="h-4 w-4" />;
    }
  };

  const getSourceBadge = (source: MyTask['source']) => {
    switch (source) {
      case 'notes':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'applications':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'manual':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const resetFollowUpForm = () => {
    setFollowUpForm({
      title: '',
      message: '',
      memberName: '',
      memberClientId: '',
      healthPlan: '',
      priority: 'Priority',
      followUpDate: ''
    });
  };

  const handleCreateFollowUpTask = async () => {
    if (!firestore || !user?.uid) return;
    if (!followUpForm.title.trim() || !followUpForm.message.trim() || !followUpForm.followUpDate) {
      toast({
        title: 'Missing details',
        description: 'Title, message, and follow-up date are required.',
        variant: 'destructive'
      });
      return;
    }

    setIsCreatingFollowUp(true);
    try {
      const actionUrl = followUpForm.memberClientId
        ? `/admin/member-notes?clientId2=${encodeURIComponent(followUpForm.memberClientId)}`
        : '/admin/my-notes';

      await addDoc(collection(firestore, 'staff_notifications'), {
        userId: user.uid,
        title: followUpForm.title.trim(),
        message: followUpForm.message.trim(),
        memberName: followUpForm.memberName.trim() || undefined,
        clientId2: followUpForm.memberClientId.trim() || undefined,
        healthPlan: followUpForm.healthPlan.trim() || undefined,
        priority: followUpForm.priority,
        status: 'Open',
        isRead: false,
        followUpRequired: true,
        followUpDate: new Date(followUpForm.followUpDate),
        type: 'follow_up_task',
        createdBy: user.uid,
        createdByName: user.displayName || user.email || 'Staff',
        senderName: user.displayName || user.email || 'Staff',
        timestamp: serverTimestamp(),
        actionUrl
      });

      toast({
        title: 'Follow-up created',
        description: 'Task created and tied to the note system.',
        className: 'bg-green-100 text-green-900 border-green-200'
      });

      resetFollowUpForm();
      setIsCreateFollowUpOpen(false);
      fetchMyTasks();
    } catch (error: any) {
      console.error('Failed to create follow-up task:', error);
      toast({
        variant: 'destructive',
        title: 'Unable to create task',
        description: error.message || 'Failed to create follow-up task.'
      });
    } finally {
      setIsCreatingFollowUp(false);
    }
  };

  const kaiserStatusOptions = [
    'Assessment',
    'Pending Authorization',
    'Authorized',
    'Active',
    'On-Hold',
    'Discharged',
    'Denied',
    'Cancelled',
    'ILS Sent for Contract',
    'ILS Contract Received',
    'ILS Active'
  ];

  const handleKaiserStatusChange = async (taskId: string, newStatus: string) => {
    try {
      // Update the task status
      setTasks(prev => prev.map(task => 
        task.id === taskId 
          ? { ...task, kaiserStatus: newStatus, status: 'completed', updatedAt: new Date().toISOString() }
          : task
      ));

      toast({
        title: 'Kaiser Status Updated',
        description: `Status changed to: ${newStatus}`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });

      // In production, this would also update the member's Kaiser status in Caspio
      console.log(`Updating Kaiser status for task ${taskId} to ${newStatus}`);

    } catch (error: any) {
      console.error('Error updating Kaiser status:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to update Kaiser status',
      });
    }
  };

  const completeNoteTask = async (task: MyTask) => {
    const actorName = user?.displayName || user?.email || 'Staff';
    const actorEmail = user?.email || '';

    if (task.id.startsWith('client-followup-')) {
      if (!task.memberClientId) {
        throw new Error('Client ID missing for follow-up task');
      }
      const noteId = task.id.replace('client-followup-', '');
      const response = await fetch('/api/client-notes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          noteId,
          clientId2: task.memberClientId,
          followUpStatus: 'Closed',
          actorName,
          actorEmail
        })
      });
      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to close client note follow-up');
      }
      return;
    }

    if (task.id.startsWith('member-followup-')) {
      if (!task.memberClientId) {
        throw new Error('Client ID missing for follow-up task');
      }
      const noteId = task.id.replace('member-followup-', '');
      const response = await fetch('/api/member-notes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: noteId,
          clientId2: task.memberClientId,
          status: 'Closed',
          actorName,
          actorEmail
        })
      });
      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to close member note follow-up');
      }
      return;
    }

    if (task.id.startsWith('staff-followup-')) {
      if (!firestore) {
        throw new Error('Firestore not available');
      }
      const noteId = task.id.replace('staff-followup-', '');
      await updateDoc(doc(firestore, 'staff_notifications', noteId), {
        status: 'Closed',
        isRead: true,
        followUpRequired: false,
        resolvedAt: serverTimestamp()
      });
    }
  };

  const handleCompleteTask = async (task: MyTask) => {
    if (task.status === 'completed') return;
    setIsCompletingTask((prev) => ({ ...prev, [task.id]: true }));

    try {
      if (task.source === 'notes') {
        await completeNoteTask(task);
      }

      setTasks((prev) =>
        prev.map((item) =>
          item.id === task.id
            ? { ...item, status: 'completed', updatedAt: new Date().toISOString() }
            : item
        )
      );

      toast({
        title: 'Task Completed',
        description: task.source === 'notes'
          ? 'Follow-up status updated in the note system.'
          : 'Task marked as completed.',
        className: 'bg-green-100 text-green-900 border-green-200'
      });
    } catch (error: any) {
      console.error('Failed to complete task:', error);
      toast({
        variant: 'destructive',
        title: 'Unable to complete task',
        description: error.message || 'Failed to update task status.'
      });
    } finally {
      setIsCompletingTask((prev) => ({ ...prev, [task.id]: false }));
    }
  };

  const handleMemberClick = async (clientId2: string, memberName: string, healthPlan: string) => {
    setIsLoadingNotes(true);
    setIsMemberCardOpen(true);
    
    try {
      // Check if this is the first time loading notes for this member
      const response = await fetch(`/api/member-notes?clientId2=${clientId2}`);
      const data = await response.json();
      
      if (data.success) {
        setSelectedMember({
          clientId2,
          memberName,
          healthPlan,
          notes: data.notes || [],
          isFirstTimeLoad: !data.fromCache,
          lastSyncTime: data.lastSync
        });
        
        toast({
          title: data.fromCache ? "Notes Loaded from Cache" : "Notes Synced from Caspio",
          description: `${data.notes?.length || 0} notes loaded for ${memberName}`,
        });
      } else {
        throw new Error(data.error || 'Failed to load notes');
      }
      
    } catch (error: any) {
      console.error('Error loading member notes:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to load member notes",
        variant: "destructive"
      });
      
      // Still open the modal with empty notes
      setSelectedMember({
        clientId2,
        memberName,
        healthPlan,
        notes: [],
        isFirstTimeLoad: true
      });
    } finally {
      setIsLoadingNotes(false);
    }
  };

  const handleCreateNote = async () => {
    if (!selectedMember || !newNote.noteText.trim()) {
      toast({
        title: "Error",
        description: "Please enter note content",
        variant: "destructive"
      });
      return;
    }

    try {
      const noteData = {
        clientId2: selectedMember.clientId2,
        memberName: selectedMember.memberName,
        noteText: newNote.noteText,
        noteType: newNote.noteType,
        priority: newNote.priority,
        assignedTo: newNote.assignedTo || undefined,
        assignedToName: newNote.assignedToName || undefined,
        followUpDate: newNote.followUpDate || undefined,
        createdBy: user?.uid || 'current-user',
        createdByName: user?.displayName || user?.email || 'Current User'
      };

      const response = await fetch('/api/member-notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(noteData),
      });

      const data = await response.json();

      if (data.success) {
        // Update the selected member's notes
        setSelectedMember(prev => prev ? {
          ...prev,
          notes: [data.note, ...prev.notes]
        } : null);

        // Reset form
        setNewNote({
          noteText: '',
          noteType: 'General',
          priority: 'Medium',
          assignedTo: '',
          assignedToName: '',
          followUpDate: ''
        });

        toast({
          title: "Note Created",
          description: `Note added for ${selectedMember.memberName}${newNote.assignedToName ? ` and assigned to ${newNote.assignedToName}` : ''}`,
        });

        // Show notification if assigned
        if (newNote.assignedTo) {
          toast({
            title: "Notification Sent",
            description: `${newNote.assignedToName} has been notified`,
          });
        }
      } else {
        throw new Error(data.error || 'Failed to create note');
      }

    } catch (error: any) {
      console.error('Error creating note:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create note",
        variant: "destructive"
      });
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'Urgent': return 'bg-red-100 text-red-800 border-red-200';
      case 'High': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'Medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getSourceColor = (source: string) => {
    switch (source) {
      case 'Caspio': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'App': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'Admin': return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatDueDate = (dateString: string) => {
    const date = new Date(dateString);
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    if (isYesterday(date)) return 'Yesterday';
    return format(date, 'MMM d, yyyy');
  };

  if (!isAdmin) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Access Denied</h3>
              <p className="text-muted-foreground">You need admin privileges to view this page.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ListTodo className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Daily Task Tracker</h1>
            <p className="text-muted-foreground">
              Daily tasks, follow-ups, and note assignments tied to your workflow
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Dialog open={isCreateFollowUpOpen} onOpenChange={setIsCreateFollowUpOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetFollowUpForm}>
                <MessageSquare className="mr-2 h-4 w-4" />
                Create Follow-up Task
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create Follow-up Task</DialogTitle>
                <DialogDescription>
                  This creates a follow-up note and appears in the daily task tracker.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="followup-title">Title *</Label>
                    <Input
                      id="followup-title"
                      value={followUpForm.title}
                      onChange={(event) => setFollowUpForm((prev) => ({ ...prev, title: event.target.value }))}
                      placeholder="Follow-up task title"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="followup-date">Follow-up Date *</Label>
                    <Input
                      id="followup-date"
                      type="date"
                      value={followUpForm.followUpDate}
                      onChange={(event) => setFollowUpForm((prev) => ({ ...prev, followUpDate: event.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="followup-message">Message *</Label>
                  <Textarea
                    id="followup-message"
                    value={followUpForm.message}
                    onChange={(event) => setFollowUpForm((prev) => ({ ...prev, message: event.target.value }))}
                    placeholder="Describe the follow-up details"
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="followup-member">Member Name</Label>
                    <Input
                      id="followup-member"
                      value={followUpForm.memberName}
                      onChange={(event) => setFollowUpForm((prev) => ({ ...prev, memberName: event.target.value }))}
                      placeholder="Member name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="followup-client">Client ID</Label>
                    <Input
                      id="followup-client"
                      value={followUpForm.memberClientId}
                      onChange={(event) => setFollowUpForm((prev) => ({ ...prev, memberClientId: event.target.value }))}
                      placeholder="Client ID (clientId2)"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="followup-health">Health Plan</Label>
                    <Select
                      value={followUpForm.healthPlan}
                      onValueChange={(value) => setFollowUpForm((prev) => ({ ...prev, healthPlan: value }))}
                    >
                      <SelectTrigger id="followup-health">
                        <SelectValue placeholder="Select health plan" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Kaiser">Kaiser</SelectItem>
                        <SelectItem value="Health Net">Health Net</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="followup-priority">Priority</Label>
                    <Select
                      value={followUpForm.priority}
                      onValueChange={(value: 'General' | 'Priority' | 'Urgent') =>
                        setFollowUpForm((prev) => ({ ...prev, priority: value }))
                      }
                    >
                      <SelectTrigger id="followup-priority">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="General">General</SelectItem>
                        <SelectItem value="Priority">Priority</SelectItem>
                        <SelectItem value="Urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateFollowUpOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateFollowUpTask} disabled={isCreatingFollowUp}>
                  {isCreatingFollowUp ? 'Creating...' : 'Create Task'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button onClick={fetchMyTasks} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Desktop App Active</CardTitle>
          <CardDescription>
            {desktopActive
              ? 'Suppress in-app task alerts to avoid duplicate notifications while the desktop tray is running.'
              : 'Desktop tray not detected. In-app alerts will display normally.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {desktopActive ? 'Hide in-app alerts when desktop is active' : 'Desktop app not detected (suppression still available)'}
          </div>
          <Switch
            checked={suppressWebWhenDesktopActive}
            onCheckedChange={updateSuppressSetting}
          />
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">All Tasks</p>
                <p className="text-2xl font-bold">{taskCounts.all}</p>
              </div>
              <ListTodo className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Overdue</p>
                <p className="text-2xl font-bold text-red-600">{taskCounts.overdue}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Due Today</p>
                <p className="text-2xl font-bold text-orange-600">{taskCounts.today}</p>
              </div>
              <Clock className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Upcoming</p>
                <p className="text-2xl font-bold text-blue-600">{taskCounts.upcoming}</p>
              </div>
              <CalendarDays className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold text-green-600">{taskCounts.completed}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Note Follow-ups</p>
                <p className="text-2xl font-bold text-purple-600">{taskCounts.notes}</p>
              </div>
              <MessageSquare className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Schedule Snapshot</CardTitle>
          <CardDescription>Quick daily, weekly, and monthly lookup</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button
              variant={timeRange === 'daily' ? 'default' : 'outline'}
              className="h-auto justify-start p-4"
              onClick={() => setTimeRange(timeRange === 'daily' ? 'all' : 'daily')}
            >
              <div className="text-left">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span className="font-medium">Today</span>
                </div>
                <div className="text-sm text-muted-foreground">
                  {taskCounts.today} due today
                </div>
              </div>
            </Button>
            <Button
              variant={timeRange === 'weekly' ? 'default' : 'outline'}
              className="h-auto justify-start p-4"
              onClick={() => setTimeRange(timeRange === 'weekly' ? 'all' : 'weekly')}
            >
              <div className="text-left">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4" />
                  <span className="font-medium">This Week</span>
                </div>
                <div className="text-sm text-muted-foreground">
                  {taskCounts.dueThisWeek} due this week
                </div>
              </div>
            </Button>
            <Button
              variant={timeRange === 'monthly' ? 'default' : 'outline'}
              className="h-auto justify-start p-4"
              onClick={() => setTimeRange(timeRange === 'monthly' ? 'all' : 'monthly')}
            >
              <div className="text-left">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4" />
                  <span className="font-medium">This Month</span>
                </div>
                <div className="text-sm text-muted-foreground">
                  {taskCounts.dueThisMonth} due this month
                </div>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>

      {timeRange !== 'all' && (
        <Card>
          <CardHeader>
            <CardTitle>Calendar View</CardTitle>
            <CardDescription>
              {timeRange === 'daily' ? 'Today' : timeRange === 'weekly' ? 'This week' : 'This month'} grouped by date
            </CardDescription>
          </CardHeader>
          <CardContent>
            {calendarGroups.length === 0 ? (
              <div className="text-sm text-muted-foreground">No tasks in this range.</div>
            ) : (
              <div className="space-y-4">
                {calendarGroups.map((group) => (
                  <div key={group.date} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="font-medium">{group.label}</div>
                      <Badge variant="outline">{group.tasks.length} task{group.tasks.length !== 1 ? 's' : ''}</Badge>
                    </div>
                    <div className="space-y-2">
                      {group.tasks.map((task) => (
                        <div key={task.id} className="flex items-start justify-between gap-4 rounded-md border px-3 py-2">
                          <div>
                            <div className="font-medium text-sm">{task.title}</div>
                            {task.memberName && (
                              <div className="text-xs text-muted-foreground">
                                {task.memberName} {task.memberClientId ? `• ${task.memberClientId}` : ''}
                              </div>
                            )}
                            {task.taskType === 'follow_up' && (
                              <div className="text-xs text-muted-foreground">
                                Follow-up: {format(new Date(task.dueDate), 'MMM d, yyyy')}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={getSourceBadge(task.source)}>
                              {task.source === 'applications' ? 'Applications' : task.source === 'notes' ? 'Notes' : 'Manual'}
                            </Badge>
                            <Badge variant="outline" className={getPriorityColor(task.priority)}>
                              {task.priority}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 flex-wrap">
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priority</SelectItem>
                <SelectItem value="Urgent">Urgent</SelectItem>
                <SelectItem value="High">High</SelectItem>
                <SelectItem value="Medium">Medium</SelectItem>
                <SelectItem value="Low">Low</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="notes">Notes</SelectItem>
                <SelectItem value="applications">Applications</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>

            <Select value={timeRange} onValueChange={(value: 'all' | 'daily' | 'weekly' | 'monthly') => setTimeRange(value)}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Time Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Dates</SelectItem>
                <SelectItem value="daily">Today</SelectItem>
                <SelectItem value="weekly">This Week</SelectItem>
                <SelectItem value="monthly">This Month</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tasks Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="all">All ({taskCounts.all})</TabsTrigger>
          <TabsTrigger value="overdue">Overdue ({taskCounts.overdue})</TabsTrigger>
          <TabsTrigger value="today">Today ({taskCounts.today})</TabsTrigger>
          <TabsTrigger value="upcoming">Upcoming ({taskCounts.upcoming})</TabsTrigger>
          <TabsTrigger value="followup">Follow-ups ({taskCounts.followup})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({taskCounts.completed})</TabsTrigger>
        </TabsList>

        <TabsContent value={selectedTab} className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>
                {selectedTab === 'all' && 'All Tasks'}
                {selectedTab === 'overdue' && 'Overdue Tasks'}
                {selectedTab === 'today' && 'Tasks Due Today'}
                {selectedTab === 'upcoming' && 'Upcoming Tasks'}
                {selectedTab === 'followup' && 'Follow-up Required'}
                {selectedTab === 'completed' && 'Completed Tasks'}
              </CardTitle>
              <CardDescription>
                {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''} found
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8">
                  <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
                  <p className="text-muted-foreground">Loading your tasks...</p>
                </div>
              ) : filteredTasks.length === 0 ? (
                <div className="text-center py-8">
                  <ListTodo className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Tasks Found</h3>
                  <p className="text-muted-foreground">
                    {selectedTab === 'all' ? 'You have no tasks assigned to you at this time.' :
                     selectedTab === 'overdue' ? 'No overdue tasks.' :
                     selectedTab === 'today' ? 'No tasks due today.' :
                     selectedTab === 'upcoming' ? 'No upcoming tasks.' :
                     selectedTab === 'followup' ? 'No follow-ups required right now.' :
                     'No completed tasks.'}
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Task</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Member</TableHead>
                      <TableHead>Assigned To</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Assigned By</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTasks.map((task) => (
                      <TableRow key={task.id}>
                        <TableCell>
                          <div className="flex items-start gap-3">
                            <div className="mt-1">
                              {getTaskTypeIcon(task.taskType)}
                            </div>
                            <div>
                              <p className="font-medium">{task.title}</p>
                              {task.description && (
                                <p className="text-sm text-muted-foreground">{task.description}</p>
                              )}
                              {task.taskType === 'follow_up' && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Follow-up: {format(new Date(task.dueDate), 'MMM d, yyyy')}
                                </p>
                              )}
                              {task.taskType === 'kaiser_status' && (task.currentKaiserStatus || task.kaiserStatus) && (
                                (() => {
                                  const current = getKaiserStatusByName(task.currentKaiserStatus || task.kaiserStatus || '');
                                  const next = current ? getNextKaiserStatus(current.id) : undefined;
                                  return next ? (
                                    <p className="text-xs text-muted-foreground mt-1">
                                      Next step: {next.status}
                                    </p>
                                  ) : null;
                                })()
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getSourceBadge(task.source)}>
                            {task.source === 'applications' ? 'Applications' : task.source === 'notes' ? 'Notes' : 'Manual'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {task.memberName && task.memberClientId ? (
                            <div 
                              className="cursor-pointer hover:bg-blue-50 p-2 rounded-md transition-colors"
                              onClick={() => handleMemberClick(task.memberClientId!, task.memberName!, task.healthPlan || 'Unknown')}
                            >
                              <p className="font-medium text-blue-600 hover:text-blue-800">{task.memberName}</p>
                              <p className="text-sm text-muted-foreground">{task.memberClientId}</p>
                              {task.healthPlan && (
                                <Badge variant="outline" className="text-xs">
                                  {task.healthPlan}
                                </Badge>
                              )}
                              {task.currentKaiserStatus && (
                                <p className="text-xs text-blue-600 mt-1">
                                  Current: {task.currentKaiserStatus}
                                </p>
                              )}
                              <p className="text-xs text-blue-500 mt-1 flex items-center gap-1">
                                <MessageSquare className="h-3 w-3" />
                                Click to view/add notes
                              </p>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{task.assignedToName}</p>
                            <p className="text-xs text-muted-foreground">
                              {task.assignedTo === user?.uid ? 'You' : 'Other Staff'}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getPriorityColor(task.priority)}>
                            {task.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getStatusColor(task.status)}>
                            {task.status.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className={`font-medium ${task.status === 'overdue' ? 'text-red-600' : ''}`}>
                            {formatDueDate(task.dueDate)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm">{task.assignedByName}</p>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {task.taskType === 'kaiser_status' && task.healthPlan === 'Kaiser' && task.status !== 'completed' ? (
                              <div className="flex flex-col gap-2">
                                <Select 
                                  value={task.kaiserStatus || task.currentKaiserStatus || ''} 
                                  onValueChange={(value) => handleKaiserStatusChange(task.id, value)}
                                >
                                  <SelectTrigger className="w-48">
                                    <SelectValue placeholder="Update Kaiser Status..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {kaiserStatusOptions.map((status) => (
                                      <SelectItem key={status} value={status}>
                                        {status}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Button variant="outline" size="sm" asChild>
                                  <Link href={task.memberClientId ? `/admin/kaiser-tracker?clientId2=${encodeURIComponent(task.memberClientId)}` : '/admin/kaiser-tracker'}>
                                    <Target className="h-4 w-4 mr-1" />
                                    Open Kaiser Tracker
                                  </Link>
                                </Button>
                              </div>
                            ) : (
                              <>
                                {task.id.startsWith('staff-followup-') && (
                                  <Button variant="outline" size="sm" asChild>
                                    <Link href={`/admin/my-notes?replyTo=${task.id.replace('staff-followup-', '')}`}>
                                      <MessageSquare className="h-4 w-4" />
                                    </Link>
                                  </Button>
                                )}
                                <Button variant="outline" size="sm">
                                  <Edit className="h-4 w-4" />
                                </Button>
                                {task.status !== 'completed' && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleCompleteTask(task)}
                                    disabled={isCompletingTask[task.id]}
                                  >
                                    <CheckCircle className={`h-4 w-4 ${isCompletingTask[task.id] ? 'animate-spin' : ''}`} />
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Member Notes Modal */}
      <Dialog open={isMemberCardOpen} onOpenChange={setIsMemberCardOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {selectedMember?.memberName} - Member Notes
            </DialogTitle>
            <DialogDescription>
              {selectedMember?.clientId2} • {selectedMember?.healthPlan}
              {selectedMember?.lastSyncTime && (
                <span className="ml-2 text-xs">
                  Last sync: {format(new Date(selectedMember.lastSyncTime), 'MMM d, yyyy h:mm a')}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[70vh]">
            {/* Notes List */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Notes History</h3>
                <Badge variant="outline">
                  {selectedMember?.notes.length || 0} notes
                </Badge>
              </div>

              {isLoadingNotes ? (
                <div className="text-center py-8">
                  <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    {selectedMember?.isFirstTimeLoad ? 'Importing all notes from Caspio...' : 'Loading notes...'}
                  </p>
                </div>
              ) : (
                <ScrollArea className="h-[50vh]">
                  <div className="space-y-3">
                    {selectedMember?.notes.length === 0 ? (
                      <div className="text-center py-8">
                        <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                        <h3 className="text-lg font-medium mb-2">No Notes Found</h3>
                        <p className="text-muted-foreground">
                          No notes have been created for this member yet.
                        </p>
                      </div>
                    ) : (
                      selectedMember?.notes.map((note) => (
                        <div key={note.id} className={`p-4 border rounded-lg ${!note.isRead ? 'border-blue-200 bg-blue-50' : ''}`}>
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex gap-2">
                              <Badge variant="outline" className={getPriorityColor(note.priority)}>
                                {note.priority}
                              </Badge>
                              <Badge variant="outline">
                                {note.noteType}
                              </Badge>
                              <Badge variant="outline" className={getSourceColor(note.source)}>
                                {note.source}
                              </Badge>
                              {!note.isRead && (
                                <Badge className="bg-blue-600">
                                  <Bell className="h-3 w-3 mr-1" />
                                  New
                                </Badge>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {format(new Date(note.createdAt), 'MMM d, yyyy h:mm a')}
                            </div>
                          </div>
                          
                          <p className="text-sm mb-3">{note.noteText}</p>
                          
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <div>
                              <span className="font-medium">By:</span> {note.createdByName}
                              {note.assignedToName && (
                                <>
                                  <span className="mx-2">•</span>
                                  <span className="font-medium">Assigned to:</span> {note.assignedToName}
                                </>
                              )}
                            </div>
                            {note.followUpDate && (
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                Follow-up: {format(new Date(note.followUpDate), 'MMM d, yyyy')}
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              )}
            </div>

            {/* Add New Note */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Add New Note</h3>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="noteType">Note Type</Label>
                    <Select 
                      value={newNote.noteType} 
                      onValueChange={(value: MemberNote['noteType']) => 
                        setNewNote(prev => ({ ...prev, noteType: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="General">General</SelectItem>
                        <SelectItem value="Medical">Medical</SelectItem>
                        <SelectItem value="Social">Social</SelectItem>
                        <SelectItem value="Administrative">Administrative</SelectItem>
                        <SelectItem value="Follow-up">Follow-up</SelectItem>
                        <SelectItem value="Emergency">Emergency</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="priority">Priority</Label>
                    <Select 
                      value={newNote.priority} 
                      onValueChange={(value: MemberNote['priority']) => 
                        setNewNote(prev => ({ ...prev, priority: value }))
                      }
                    >
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

                <div className="space-y-2">
                  <Label htmlFor="noteText">Note Content</Label>
                  <Textarea
                    id="noteText"
                    value={newNote.noteText}
                    onChange={(e) => setNewNote(prev => ({ ...prev, noteText: e.target.value }))}
                    placeholder="Enter note content..."
                    rows={4}
                    className="resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="assignedToName">Assign to Staff (Optional)</Label>
                    <Input
                      id="assignedToName"
                      value={newNote.assignedToName}
                      onChange={(e) => setNewNote(prev => ({ ...prev, assignedToName: e.target.value }))}
                      placeholder="Staff member name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="followUpDate">Follow-up Date (Optional)</Label>
                    <Input
                      id="followUpDate"
                      type="date"
                      value={newNote.followUpDate}
                      onChange={(e) => setNewNote(prev => ({ ...prev, followUpDate: e.target.value }))}
                      min={format(new Date(), 'yyyy-MM-dd')}
                    />
                  </div>
                </div>

                <Button 
                  onClick={handleCreateNote} 
                  disabled={!newNote.noteText.trim()}
                  className="w-full"
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Add Note
                </Button>

                {selectedMember?.isFirstTimeLoad && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-2 text-blue-800 mb-1">
                      <CheckCircle className="h-4 w-4" />
                      <span className="font-medium">Smart Sync Active</span>
                    </div>
                    <p className="text-xs text-blue-700">
                      All existing notes have been imported from Caspio. Future updates will sync automatically.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function MyTasksPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading tasks...</div>}>
      <MyTasksPageContent />
    </Suspense>
  );
}