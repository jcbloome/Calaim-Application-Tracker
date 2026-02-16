'use client';

import { Suspense, useState, useEffect, useMemo, useRef } from 'react';
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
import { Calendar as DateCalendar } from '@/components/ui/calendar';
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getKaiserStatusByName, getNextKaiserStatus } from '@/lib/kaiser-status-progression';

interface MyTask {
  id: string;
  title: string;
  description?: string;
  memberName?: string;
  memberClientId?: string;
  healthPlan?: string;
  reviewKind?: 'docs' | 'cs';
  taskType: 'note_assignment' | 'follow_up' | 'review' | 'contact' | 'administrative' | 'kaiser_status' | 'next_step';
  priority: 'General' | 'Priority' | 'Low' | 'Medium' | 'High' | 'Urgent';
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
  actionUrl?: string;
  applicationId?: string;
  noteId?: string;
  clientId2?: string;
  followUpStatus?: string;
  followUpAssignment?: string;
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
  const tabsAnchorRef = useRef<HTMLDivElement | null>(null);
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
  const [isSyncingMemberNotes, setIsSyncingMemberNotes] = useState(false);
  const [showClosedMemberNotes, setShowClosedMemberNotes] = useState(false);
  const [newNote, setNewNote] = useState({
    noteText: '',
    urgency: 'General' as 'General' | 'Immediate',
    assignedTo: '',
    assignedToName: '',
    followUpDate: ''
  });

  // Follow-up calendar state (month + day agenda)
  const [followUpMonth, setFollowUpMonth] = useState<Date>(() => new Date());
  const [followUpDay, setFollowUpDay] = useState<Date | undefined>(() => new Date());
  const [followUpCalendarTasks, setFollowUpCalendarTasks] = useState<MyTask[]>([]);
  const [isLoadingFollowUpCalendar, setIsLoadingFollowUpCalendar] = useState(false);
  const [selectedFollowUpTask, setSelectedFollowUpTask] = useState<MyTask | null>(null);
  const [isFollowUpTaskModalOpen, setIsFollowUpTaskModalOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [isUpdatingFollowUpTask, setIsUpdatingFollowUpTask] = useState(false);
  const [isSyncingFollowUps, setIsSyncingFollowUps] = useState(false);
  const [isImportingAllFollowUps, setIsImportingAllFollowUps] = useState(false);

  // NOTE: Intentionally do NOT auto-fetch tasks on page load.
  // Staff should explicitly click Refresh / Sync buttons to pull data.

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

  const actionItemCounts = useMemo(() => {
    const isDocs = (task: MyTask) => {
      if (task.reviewKind === 'docs') return true;
      const title = String(task.title || '').toLowerCase();
      return title.includes('document');
    };
    const isCs = (task: MyTask) => {
      if (task.reviewKind === 'cs') return true;
      const title = String(task.title || '').toLowerCase();
      return title.includes('cs summary') || title.includes('cs') || title.includes('summary');
    };
    const isKaiser = (task: MyTask) => String(task.healthPlan || '').toLowerCase().includes('kaiser');
    const isHealthNet = (task: MyTask) => {
      const plan = String(task.healthPlan || '').toLowerCase();
      return plan.includes('health net') || plan.includes('healthnet');
    };

    const review = tasks.filter((t) => t.taskType === 'review' && t.status !== 'completed');
    const kDocs = review.filter((t) => isKaiser(t) && isDocs(t)).length;
    const kCs = review.filter((t) => isKaiser(t) && isCs(t)).length;
    const hDocs = review.filter((t) => isHealthNet(t) && isDocs(t)).length;
    const hCs = review.filter((t) => isHealthNet(t) && isCs(t)).length;
    return { kDocs, kCs, hDocs, hCs };
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
      case 'next_step': return <CalendarDays className="h-4 w-4" />;
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

  const fetchMemberNotes = async (
    clientId2: string,
    memberName: string,
    healthPlan: string,
    forceSync: boolean
  ): Promise<boolean> => {
    setIsLoadingNotes(true);
    setIsMemberCardOpen(true);
    
    try {
      const params = new URLSearchParams();
      params.set('clientId2', clientId2);
      if (forceSync) {
        params.set('forceRefresh', 'true');
        params.set('includeAll', 'true');
      }
      const response = await fetch(`/api/client-notes?${params.toString()}`);
      const data = await response.json().catch(() => null);
      
      const rawNotes = data?.data?.notes;
      if (response.ok && data?.success && Array.isArray(rawNotes)) {
        const mappedNotes: MemberNote[] = rawNotes.map((n: any) => {
          const followUpStatus = String(n?.followUpStatus || '').trim();
          const statusLower = followUpStatus.toLowerCase();
          const isClosed = statusLower.includes('closed') || statusLower.includes('resolved');
          const isImmediate =
            statusLower.includes('immediate') ||
            statusLower.includes('urgent') ||
            statusLower.includes('priority') ||
            statusLower.includes('🔴') ||
            statusLower.includes('🟡');
          const createdAt = String(n?.timeStamp || '').trim() || new Date().toISOString();
          return {
            id: String(n?.noteId || n?.id || '').trim() || String(Math.random()),
            clientId2: String(n?.clientId2 || clientId2),
            memberName: String(n?.seniorFullName || memberName || '').trim() || memberName,
            noteText: String(n?.comments || '').trim(),
            noteType: 'General',
            createdBy: String(n?.userId || 'system'),
            createdByName: String(n?.userFullName || 'System'),
            assignedToName: String(n?.followUpAssignment || '').trim() || undefined,
            createdAt,
            updatedAt: createdAt,
            source: 'Caspio',
            isRead: true,
            priority: isImmediate ? 'Priority' : 'General',
            status: isClosed ? 'Closed' : 'Open',
            followUpDate: String(n?.followUpDate || '').trim() || undefined,
          };
        });

        setSelectedMember({
          clientId2,
          memberName,
          healthPlan,
          notes: mappedNotes,
          isFirstTimeLoad: false,
          lastSyncTime: new Date().toISOString()
        });
        
        toast({
          title: forceSync ? 'Notes synced from Caspio' : 'Notes loaded',
          description: `${mappedNotes.length} notes loaded for ${memberName}`,
        });
        return true;
      } else {
        const msg =
          data?.error ||
          (response.ok ? 'Failed to load notes' : `Request failed (${response.status})`);
        console.warn('Member notes request failed:', msg);
        toast({
          title: "Error",
          description: msg || "Failed to load member notes",
          variant: "destructive"
        });
        setSelectedMember({
          clientId2,
          memberName,
          healthPlan,
          notes: [],
          isFirstTimeLoad: true
        });
        return false;
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
      return false;
    } finally {
      setIsLoadingNotes(false);
    }
  };

  const handleMemberClick = async (clientId2: string, memberName: string, healthPlan: string) => {
    try {
      await fetchMemberNotes(clientId2, memberName, healthPlan, false);
    } catch (error) {
      console.warn('Member click handler swallowed error:', error);
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
      const actorName = user?.displayName || user?.email || 'Staff';
      const actorEmail = user?.email || '';
      const followUpStatus = newNote.urgency === 'Immediate' ? 'Immediate' : 'Open';

      const noteData = {
        clientId2: selectedMember.clientId2,
        comments: newNote.noteText,
        followUpDate: newNote.followUpDate || null,
        followUpAssignment: newNote.assignedToName || null,
        followUpStatus,
        userId: user?.uid || null,
        actorName,
        actorEmail,
      };

      const response = await fetch('/api/client-notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(noteData),
      });

      const data = await response.json();

      if (data.success) {
        await fetchMemberNotes(selectedMember.clientId2, selectedMember.memberName, selectedMember.healthPlan, true);

        // Reset form
        setNewNote({
          noteText: '',
          urgency: 'General',
          assignedTo: '',
          assignedToName: '',
          followUpDate: ''
        });

        toast({
          title: "Note Created",
          description: `Note added for ${selectedMember.memberName}${newNote.assignedToName ? ` and assigned to ${newNote.assignedToName}` : ''}`,
        });
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
      case 'Priority': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'High': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'Medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Low': return 'bg-green-100 text-green-800 border-green-200';
      case 'General': return 'bg-gray-100 text-gray-800 border-gray-200';
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

  const fetchFollowUpCalendar = async (month: Date) => {
    if (!user?.uid) return;
    setIsLoadingFollowUpCalendar(true);
    try {
      const start = startOfMonth(month);
      const end = endOfMonth(month);
      const params = new URLSearchParams();
      params.set('userId', user.uid);
      params.set('only', 'follow_up');
      params.set('start', start.toISOString());
      params.set('end', end.toISOString());
      const response = await fetch(`/api/staff/tasks?${params.toString()}`);
      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to load follow-up calendar');
      }
      setFollowUpCalendarTasks(Array.isArray(data?.tasks) ? data.tasks : []);
    } catch (error: any) {
      console.error('Failed to load follow-up calendar:', error);
      toast({
        variant: 'destructive',
        title: 'Calendar error',
        description: error.message || 'Could not load follow-up calendar.',
      });
      setFollowUpCalendarTasks([]);
    } finally {
      setIsLoadingFollowUpCalendar(false);
    }
  };

  const syncFollowUpsFromCaspio = async (month: Date) => {
    if (!user?.uid) return;
    setIsSyncingFollowUps(true);
    try {
      const start = startOfMonth(month);
      const end = endOfMonth(month);
      const response = await fetch('/api/staff/followups/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          start: start.toISOString(),
          end: end.toISOString(),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to sync follow-ups');
      }
      toast({
        title: 'Synced from Caspio',
        description: `Pulled ${data?.synced ?? 0} follow-up notes.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
      await fetchFollowUpCalendar(month);
      fetchMyTasks();
    } catch (error: any) {
      console.error('Follow-up sync failed:', error);
      toast({
        variant: 'destructive',
        title: 'Sync failed',
        description: error.message || 'Could not sync follow-ups from Caspio.',
      });
    } finally {
      setIsSyncingFollowUps(false);
    }
  };

  const importAllOpenFollowUpsFromCaspio = async () => {
    if (!user?.uid) return;
    const ok = confirm(
      'Initial import will pull ALL open follow-up notes with dates from Caspio for your assignment. This may take a bit the first time. Continue?'
    );
    if (!ok) return;

    setIsImportingAllFollowUps(true);
    try {
      const response = await fetch('/api/staff/followups/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          // No start/end = import all open follow-ups with dates
        }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to import follow-ups');
      }

      toast({
        title: 'Initial import complete',
        description: `Imported ${data?.synced ?? 0} open follow-up notes from Caspio.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });

      // Refresh current month calendar + full task list so overdue/past follow-ups appear.
      await fetchFollowUpCalendar(followUpMonth);
      fetchMyTasks();
    } catch (error: any) {
      console.error('Initial follow-up import failed:', error);
      toast({
        variant: 'destructive',
        title: 'Import failed',
        description: error.message || 'Could not import follow-ups from Caspio.',
      });
    } finally {
      setIsImportingAllFollowUps(false);
    }
  };

  // NOTE: Intentionally do NOT auto-fetch calendar data when switching tabs or months.
  // Use the explicit Calendar controls (Initial import / Sync / Refresh).

  const followUpByDay = useMemo(() => {
    const map = new Map<string, MyTask[]>();
    followUpCalendarTasks
      .filter((t) => t.taskType === 'follow_up' && t.status !== 'completed')
      .forEach((task) => {
        const d = new Date(task.dueDate);
        if (Number.isNaN(d.getTime())) return;
        const key = format(d, 'yyyy-MM-dd');
        const cur = map.get(key) || [];
        cur.push(task);
        map.set(key, cur);
      });
    return map;
  }, [followUpCalendarTasks]);

  const selectedFollowUpsForDay = useMemo(() => {
    if (!followUpDay) return [];
    const key = format(followUpDay, 'yyyy-MM-dd');
    const items = followUpByDay.get(key) || [];
    return [...items].sort((a, b) => {
      const ams = new Date(a.dueDate).getTime();
      const bms = new Date(b.dueDate).getTime();
      if (ams !== bms) return ams - bms;
      return String(a.memberName || '').localeCompare(String(b.memberName || ''));
    });
  }, [followUpByDay, followUpDay]);

  const openFollowUpTaskModal = (task: MyTask) => {
    setSelectedFollowUpTask(task);
    try {
      const d = new Date(String(task.dueDate || ''));
      setRescheduleDate(Number.isNaN(d.getTime()) ? '' : format(d, 'yyyy-MM-dd'));
    } catch {
      setRescheduleDate('');
    }
    setIsFollowUpTaskModalOpen(true);
  };

  const updateClientNote = async (task: MyTask, patch: { followUpStatus?: string; followUpDate?: string }) => {
    if (!task?.memberClientId) throw new Error('Client ID missing');
    const noteId = String(task.noteId || '').trim() || String(task.id || '').replace('client-followup-', '');
    if (!noteId) throw new Error('Note ID missing');
    const actorName = user?.displayName || user?.email || 'Staff';
    const actorEmail = user?.email || '';

    const response = await fetch('/api/client-notes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        noteId,
        clientId2: task.memberClientId,
        ...patch,
        actorName,
        actorEmail
      }),
    });
    const data = await response.json();
    if (!response.ok || !data?.success) {
      throw new Error(data?.error || 'Failed to update note');
    }
  };

  const deleteClientNote = async (task: MyTask) => {
    if (!task?.memberClientId) throw new Error('Client ID missing');
    const noteId = String(task.noteId || '').trim() || String(task.id || '').replace('client-followup-', '');
    if (!noteId) throw new Error('Note ID missing');
    const actorName = user?.displayName || user?.email || 'Staff';
    const actorEmail = user?.email || '';

    const response = await fetch('/api/client-notes', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        noteId,
        clientId2: task.memberClientId,
        actorName,
        actorEmail
      }),
    });
    const data = await response.json();
    if (!response.ok || !data?.success) {
      throw new Error(data?.error || 'Failed to delete note');
    }
  };

  const filteredMemberNotes = useMemo(() => {
    const notes = selectedMember?.notes || [];
    if (showClosedMemberNotes) return notes;
    return notes.filter((note) => {
      const statusLower = String(note?.status || 'Open').toLowerCase();
      return !statusLower.includes('closed');
    });
  }, [selectedMember?.notes, showClosedMemberNotes]);

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
          <Button
            variant="outline"
            onClick={() => {
              setSelectedTab('followup_calendar');
              try {
                tabsAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              } catch {
                // ignore
              }
            }}
          >
            <CalendarDays className="mr-2 h-4 w-4" />
            Calendar / Import
          </Button>
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
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Action item counts (uploads)</CardTitle>
          <CardDescription>Counts of items needing review by plan and type.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant="outline">K(D) {actionItemCounts.kDocs}</Badge>
          <Badge variant="outline">K(CS) {actionItemCounts.kCs}</Badge>
          <Badge variant="outline">H(D) {actionItemCounts.hDocs}</Badge>
          <Badge variant="outline">H(CS) {actionItemCounts.hCs}</Badge>
        </CardContent>
      </Card>

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
      <div ref={tabsAnchorRef} />
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="all">All ({taskCounts.all})</TabsTrigger>
          <TabsTrigger value="overdue">Overdue ({taskCounts.overdue})</TabsTrigger>
          <TabsTrigger value="today">Today ({taskCounts.today})</TabsTrigger>
          <TabsTrigger value="upcoming">Upcoming ({taskCounts.upcoming})</TabsTrigger>
          <TabsTrigger value="followup">Follow-ups ({taskCounts.followup})</TabsTrigger>
          <TabsTrigger value="followup_calendar">Calendar</TabsTrigger>
          <TabsTrigger value="completed">Completed ({taskCounts.completed})</TabsTrigger>
        </TabsList>

        <TabsContent value={selectedTab} className="space-y-4">
          {selectedTab === 'followup_calendar' ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <CardTitle>Follow-up Calendar</CardTitle>
                    <CardDescription>
                      Month view + daily agenda for follow-ups (click a date to see items)
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="default"
                      onClick={importAllOpenFollowUpsFromCaspio}
                      disabled={isImportingAllFollowUps || isSyncingFollowUps || isLoadingFollowUpCalendar}
                    >
                      <RefreshCw className={`mr-2 h-4 w-4 ${isImportingAllFollowUps ? 'animate-spin' : ''}`} />
                      Initial import (all open)
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => syncFollowUpsFromCaspio(followUpMonth)}
                      disabled={isSyncingFollowUps || isLoadingFollowUpCalendar}
                    >
                      <RefreshCw className={`mr-2 h-4 w-4 ${isSyncingFollowUps ? 'animate-spin' : ''}`} />
                      Sync from Caspio
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => fetchFollowUpCalendar(followUpMonth)}
                      disabled={isLoadingFollowUpCalendar}
                    >
                      <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingFollowUpCalendar ? 'animate-spin' : ''}`} />
                      Refresh month
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="rounded-lg border p-3">
                    <DateCalendar
                      mode="single"
                      selected={followUpDay}
                      month={followUpMonth}
                      onMonthChange={(m) => setFollowUpMonth(m)}
                      onSelect={(d) => {
                        if (!d) return;
                        setFollowUpDay(d);
                      }}
                      disabled={isLoadingFollowUpCalendar}
                      modifiers={{
                        hasFollowUps: (day) => followUpByDay.has(format(day, 'yyyy-MM-dd')),
                      }}
                      modifiersClassNames={{
                        hasFollowUps: 'ring-1 ring-primary/40',
                      }}
                    />
                    <div className="text-xs text-muted-foreground pt-2">
                      Days with follow-ups are highlighted. Select a day to see the agenda.
                    </div>
                  </div>

                  <div className="rounded-lg border p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium">
                        {followUpDay ? format(followUpDay, 'EEEE, MMM d, yyyy') : 'Select a day'}
                      </div>
                      <Badge variant="outline">
                        {selectedFollowUpsForDay.length} item{selectedFollowUpsForDay.length !== 1 ? 's' : ''}
                      </Badge>
                    </div>

                    {isLoadingFollowUpCalendar ? (
                      <div className="text-sm text-muted-foreground py-6">Loading follow-ups…</div>
                    ) : selectedFollowUpsForDay.length === 0 ? (
                      <div className="text-sm text-muted-foreground py-6">No follow-ups on this day.</div>
                    ) : (
                      <div className="space-y-2">
                        {selectedFollowUpsForDay.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            className="w-full text-left rounded-md border px-3 py-2 hover:bg-slate-50 transition-colors"
                            onClick={() => openFollowUpTaskModal(t)}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="font-medium text-sm">
                                  {t.memberName || 'Member'} {t.memberClientId ? `• ${t.memberClientId}` : ''}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {t.title}
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">
                                  Assigned to: {t.followUpAssignment || t.assignedToName || '—'} • Assigned by: {t.assignedByName || '—'}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className={getSourceBadge(t.source)}>
                                  {t.source === 'applications' ? 'Applications' : t.source === 'notes' ? 'Notes' : 'Manual'}
                                </Badge>
                                <Badge variant="outline" className={getPriorityColor(t.priority)}>
                                  {t.priority}
                                </Badge>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
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
                                {task.actionUrl && (
                                  <Button variant="outline" size="sm" asChild>
                                    <Link href={task.actionUrl}>
                                      <FileText className="h-4 w-4" />
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
          )}
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
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 rounded-md border px-2 py-1">
                    <div className="text-xs text-muted-foreground">Show closed</div>
                    <Switch
                      checked={showClosedMemberNotes}
                      onCheckedChange={setShowClosedMemberNotes}
                      disabled={isLoadingNotes}
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isLoadingNotes || isSyncingMemberNotes || !selectedMember?.clientId2 || !selectedMember?.memberName}
                    onClick={async () => {
                      if (!selectedMember?.clientId2 || !selectedMember?.memberName) return;
                      setIsSyncingMemberNotes(true);
                      try {
                        const ok = await fetchMemberNotes(
                          selectedMember.clientId2,
                          selectedMember.memberName,
                          selectedMember.healthPlan,
                          true
                        );
                        if (ok) {
                          toast({
                            title: 'Synced notes from Caspio',
                            description: 'Loaded full note history (including closed notes).',
                            className: 'bg-green-100 text-green-900 border-green-200',
                          });
                        }
                      } finally {
                        setIsSyncingMemberNotes(false);
                      }
                    }}
                  >
                    <RefreshCw className={`mr-2 h-4 w-4 ${isSyncingMemberNotes ? 'animate-spin' : ''}`} />
                    Sync all notes
                  </Button>
                  <Badge variant="outline">
                    {filteredMemberNotes.length} shown
                  </Badge>
                </div>
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
                    {filteredMemberNotes.length === 0 ? (
                      <div className="text-center py-8">
                        <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                        <h3 className="text-lg font-medium mb-2">No Notes Found</h3>
                        <p className="text-muted-foreground">
                          {showClosedMemberNotes
                            ? 'No notes have been created for this member yet.'
                            : 'No open notes. Toggle “Show closed” to view closed notes.'}
                        </p>
                      </div>
                    ) : (
                      filteredMemberNotes.map((note) => (
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
                              {String(note.status || 'Open').toLowerCase().includes('closed') && (
                                <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-200">
                                  Closed
                                </Badge>
                              )}
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
                    <Label htmlFor="urgency">Type</Label>
                    <Select 
                      value={newNote.urgency}
                      onValueChange={(value: 'General' | 'Immediate') =>
                        setNewNote((prev) => ({ ...prev, urgency: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="General">General</SelectItem>
                        <SelectItem value="Immediate">Immediate (triggers notification)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Immediate is used for notifications only.
                    </p>
                  </div>
                  <div className="space-y-2" />
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

                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-2 text-blue-800 mb-1">
                    <CheckCircle className="h-4 w-4" />
                    <span className="font-medium">On-demand sync</span>
                  </div>
                  <p className="text-xs text-blue-700">
                    Click “Sync all notes” to pull the full history from Caspio (including closed notes).
                  </p>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isFollowUpTaskModalOpen} onOpenChange={setIsFollowUpTaskModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Follow-up details</DialogTitle>
            <DialogDescription>
              View and manage this follow-up note. Caspio client notes can be rescheduled, closed/reopened, or deleted.
            </DialogDescription>
          </DialogHeader>

          {selectedFollowUpTask ? (
            <div className="space-y-4">
              <div className="rounded-md border p-3 space-y-1">
                <div className="font-medium">
                  {selectedFollowUpTask.memberName || 'Member'}{' '}
                  {selectedFollowUpTask.memberClientId ? `• ${selectedFollowUpTask.memberClientId}` : ''}
                </div>
                <div className="text-sm text-muted-foreground">{selectedFollowUpTask.title}</div>
                {selectedFollowUpTask.description ? (
                  <div className="text-sm">{selectedFollowUpTask.description}</div>
                ) : null}
                <div className="flex flex-wrap gap-2 pt-2">
                  <Badge variant="outline" className={getSourceBadge(selectedFollowUpTask.source)}>
                    {selectedFollowUpTask.source === 'applications'
                      ? 'Applications'
                      : selectedFollowUpTask.source === 'notes'
                        ? 'Notes'
                        : 'Manual'}
                  </Badge>
                  <Badge variant="outline" className={getPriorityColor(selectedFollowUpTask.priority)}>
                    {selectedFollowUpTask.priority}
                  </Badge>
                  <Badge variant="outline" className={getStatusColor(selectedFollowUpTask.status)}>
                    {selectedFollowUpTask.status.replace('_', ' ')}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Assigned to</Label>
                  <div className="text-sm">
                    {selectedFollowUpTask.followUpAssignment || selectedFollowUpTask.assignedToName || '—'}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Follow-up date</Label>
                  <Input
                    type="date"
                    value={rescheduleDate}
                    onChange={(e) => setRescheduleDate(e.target.value)}
                    disabled={isUpdatingFollowUpTask}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2 justify-end">
                {selectedFollowUpTask.actionUrl ? (
                  <Button variant="outline" asChild>
                    <Link href={selectedFollowUpTask.actionUrl}>
                      <MessageSquare className="mr-2 h-4 w-4" />
                      Open notes
                    </Link>
                  </Button>
                ) : null}

                <Button
                  variant="outline"
                  disabled={
                    isUpdatingFollowUpTask ||
                    !selectedFollowUpTask.id.startsWith('client-followup-') ||
                    !rescheduleDate
                  }
                  onClick={async () => {
                    if (!selectedFollowUpTask) return;
                    setIsUpdatingFollowUpTask(true);
                    try {
                      await updateClientNote(selectedFollowUpTask, { followUpDate: rescheduleDate });
                      toast({ title: 'Rescheduled', description: 'Follow-up date updated.' });
                      await fetchFollowUpCalendar(followUpMonth);
                      fetchMyTasks();
                    } catch (error: any) {
                      toast({
                        variant: 'destructive',
                        title: 'Error',
                        description: error.message || 'Failed to reschedule.',
                      });
                    } finally {
                      setIsUpdatingFollowUpTask(false);
                    }
                  }}
                >
                  <CalendarDays className="mr-2 h-4 w-4" />
                  Save date
                </Button>

                <Button
                  variant="outline"
                  disabled={isUpdatingFollowUpTask || !selectedFollowUpTask.id.startsWith('client-followup-')}
                  onClick={async () => {
                    if (!selectedFollowUpTask) return;
                    setIsUpdatingFollowUpTask(true);
                    try {
                      await updateClientNote(selectedFollowUpTask, { followUpStatus: 'Closed' });
                      toast({ title: 'Closed', description: 'Follow-up marked Closed.' });
                      await fetchFollowUpCalendar(followUpMonth);
                      fetchMyTasks();
                      setIsFollowUpTaskModalOpen(false);
                    } catch (error: any) {
                      toast({
                        variant: 'destructive',
                        title: 'Error',
                        description: error.message || 'Failed to close.',
                      });
                    } finally {
                      setIsUpdatingFollowUpTask(false);
                    }
                  }}
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Close
                </Button>

                <Button
                  variant="outline"
                  disabled={isUpdatingFollowUpTask || !selectedFollowUpTask.id.startsWith('client-followup-')}
                  onClick={async () => {
                    if (!selectedFollowUpTask) return;
                    setIsUpdatingFollowUpTask(true);
                    try {
                      await updateClientNote(selectedFollowUpTask, { followUpStatus: 'Open' });
                      toast({ title: 'Reopened', description: 'Follow-up marked Open.' });
                      await fetchFollowUpCalendar(followUpMonth);
                      fetchMyTasks();
                    } catch (error: any) {
                      toast({
                        variant: 'destructive',
                        title: 'Error',
                        description: error.message || 'Failed to reopen.',
                      });
                    } finally {
                      setIsUpdatingFollowUpTask(false);
                    }
                  }}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Reopen
                </Button>

                <Button
                  variant="destructive"
                  disabled={isUpdatingFollowUpTask || !selectedFollowUpTask.id.startsWith('client-followup-')}
                  onClick={async () => {
                    if (!selectedFollowUpTask) return;
                    const ok = confirm('Delete this note? This will delete it in Caspio.');
                    if (!ok) return;
                    setIsUpdatingFollowUpTask(true);
                    try {
                      await deleteClientNote(selectedFollowUpTask);
                      toast({ title: 'Deleted', description: 'Note deleted.' });
                      await fetchFollowUpCalendar(followUpMonth);
                      fetchMyTasks();
                      setIsFollowUpTaskModalOpen(false);
                    } catch (error: any) {
                      toast({
                        variant: 'destructive',
                        title: 'Error',
                        description: error.message || 'Failed to delete.',
                      });
                    } finally {
                      setIsUpdatingFollowUpTask(false);
                    }
                  }}
                >
                  <X className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </div>

              {!selectedFollowUpTask.id.startsWith('client-followup-') && (
                <div className="text-xs text-muted-foreground">
                  This follow-up is not a Caspio client note, so only viewing/opening is supported here.
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No follow-up selected.</div>
          )}
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