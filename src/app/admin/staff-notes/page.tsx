'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Bell, 
  MessageSquare, 
  Clock, 
  User, 
  AlertCircle,
  CheckCircle,
  Loader2,
  Filter,
  Calendar,
  Eye,
  EyeOff,
  Search,
  FileText,
  Trash2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAdmin } from '@/hooks/use-admin';
import { getPriorityRank, normalizePriorityLabel } from '@/lib/notification-utils';
import { format } from 'date-fns';
import { logSystemNoteAction } from '@/lib/system-note-log';
import { ToastAction } from '@/components/ui/toast';

interface StaffNote {
  id: string;
  clientId2: string;
  memberName: string;
  noteText: string;
  noteType: 'General' | 'Medical' | 'Social' | 'Administrative' | 'Follow-up' | 'Emergency';
  createdBy: string;
  createdByName: string;
  assignedTo: string;
  assignedToName: string;
  createdAt: string;
  updatedAt: string;
  source: 'Caspio' | 'App' | 'Admin';
  isRead: boolean;
  priority: 'General' | 'Priority' | 'Urgent' | string;
  status?: 'Open' | 'Closed';
  followUpDate?: string;
  tags?: string[];
}

export default function StaffNotesPage() {
  const { toast } = useToast();
  const { user, isAdmin } = useAdmin();

  // State management
  const [assignedNotes, setAssignedNotes] = useState<StaffNote[]>([]);
  const [allNotes, setAllNotes] = useState<StaffNote[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('assigned');
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [newNote, setNewNote] = useState({
    clientId2: '',
    comments: '',
    followUpStatus: 'Open',
    followUpDate: ''
  });
  const [createStatus, setCreateStatus] = useState<{ caspio: boolean; firestore: boolean } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StaffNote | null>(null);
  const deleteTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const deletedNotesRef = useRef<Map<string, StaffNote>>(new Map());
  const [filters, setFilters] = useState({
    priority: 'all',
    type: 'all',
    status: 'all',
    source: 'all'
  });

  useEffect(() => {
    if (user?.uid) {
      fetchStaffNotes();
    }
  }, [user?.uid]);

  const fetchStaffNotes = async () => {
    if (!user?.uid) return;

    setIsLoading(true);
    try {
      // Sample data - in production this would come from API
      const sampleAssignedNotes: StaffNote[] = [
        {
          id: '1',
          clientId2: 'KAI-12345',
          memberName: 'Sample Member A',
          noteText: 'Follow-up required for medication management. Coordinate with facility nurse. Member has been experiencing some confusion with medication timing.',
          noteType: 'Medical',
          createdBy: 'mike_wilson',
          createdByName: 'Dr. Mike Wilson, RN',
          assignedTo: user.uid,
          assignedToName: user.displayName || user.email || 'Current User',
          createdAt: '2026-01-17T14:15:00Z',
          updatedAt: '2026-01-17T14:15:00Z',
          source: 'App',
          isRead: false,
          priority: 'Priority',
          followUpDate: '2026-01-20',
          status: 'Open'
        },
        {
          id: '2',
          clientId2: 'HN-67890',
          memberName: 'Sample Member B',
          noteText: 'Please review member\'s care plan and coordinate with family for upcoming visit.',
          noteType: 'Administrative',
          createdBy: 'sarah_johnson',
          createdByName: 'Sarah Johnson, MSW',
          assignedTo: user.uid,
          assignedToName: user.displayName || user.email || 'Current User',
          createdAt: '2026-01-16T10:30:00Z',
          updatedAt: '2026-01-16T10:30:00Z',
          source: 'Caspio',
          isRead: true,
          priority: 'General',
          followUpDate: '2026-01-22',
          status: 'Closed'
        },
        {
          id: '3',
          clientId2: 'KAI-11111',
          memberName: 'Sample Member C',
          noteText: 'URGENT: Member has requested immediate transfer to different facility. Please contact family ASAP.',
          noteType: 'Emergency',
          createdBy: 'admin',
          createdByName: 'System Administrator',
          assignedTo: user.uid,
          assignedToName: user.displayName || user.email || 'Current User',
          createdAt: '2026-01-17T16:45:00Z',
          updatedAt: '2026-01-17T16:45:00Z',
          source: 'Admin',
          isRead: false,
          priority: 'Urgent',
          status: 'Open'
        }
      ];

      const sampleAllNotes: StaffNote[] = [
        ...sampleAssignedNotes,
        {
          id: '4',
          clientId2: 'HN-22222',
          memberName: 'Maria Garcia',
          noteText: 'Monthly assessment completed. Member is doing well and satisfied with current care.',
          noteType: 'Follow-up',
          createdBy: 'emily_davis',
          createdByName: 'Emily Davis, MSW',
          assignedTo: 'other_user',
          assignedToName: 'Other Staff Member',
          createdAt: '2026-01-15T09:00:00Z',
          updatedAt: '2026-01-15T09:00:00Z',
          source: 'App',
          isRead: true,
          priority: 'General',
          status: 'Closed'
        },
        {
          id: '5',
          clientId2: 'KAI-33333',
          memberName: 'David Wilson',
          noteText: 'New member intake completed. All documentation received and processed.',
          noteType: 'Administrative',
          createdBy: user.uid,
          createdByName: user.displayName || user.email || 'Current User',
          assignedTo: 'supervisor',
          assignedToName: 'Supervisor',
          createdAt: '2026-01-14T13:20:00Z',
          updatedAt: '2026-01-14T13:20:00Z',
          source: 'App',
          isRead: true,
          priority: 'General',
          status: 'Open'
        }
      ];

      setAssignedNotes(sampleAssignedNotes);
      setAllNotes(sampleAllNotes);

      toast({
        title: "Notes Loaded",
        description: `Loaded ${sampleAssignedNotes.length} assigned notes and ${sampleAllNotes.length} total notes`,
      });

    } catch (error: any) {
      console.error('Error fetching staff notes:', error);
      toast({
        title: "Error",
        description: "Failed to load staff notes",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const markAsRead = async (noteId: string) => {
    try {
      setAssignedNotes(prev => 
        prev.map(note => 
          note.id === noteId ? { ...note, isRead: true } : note
        )
      );
      
      setAllNotes(prev => 
        prev.map(note => 
          note.id === noteId ? { ...note, isRead: true } : note
        )
      );

      // In production, this would call the API
      console.log(`Marking note ${noteId} as read`);

    } catch (error) {
      console.error('Error marking note as read:', error);
    }
  };

  const markAsUnread = async (noteId: string) => {
    try {
      setAssignedNotes(prev => 
        prev.map(note => 
          note.id === noteId ? { ...note, isRead: false } : note
        )
      );
      
      setAllNotes(prev => 
        prev.map(note => 
          note.id === noteId ? { ...note, isRead: false } : note
        )
      );

      // In production, this would call the API
      console.log(`Marking note ${noteId} as unread`);

    } catch (error) {
      console.error('Error marking note as unread:', error);
    }
  };

  const toggleStatus = async (note: StaffNote) => {
    const nextStatus = (note.status || 'Open') === 'Closed' ? 'Open' : 'Closed';
    setAssignedNotes(prev =>
      prev.map(item => item.id === note.id ? { ...item, status: nextStatus } : item)
    );
    setAllNotes(prev =>
      prev.map(item => item.id === note.id ? { ...item, status: nextStatus } : item)
    );
    await logSystemNoteAction({
      action: 'Staff note status updated',
      noteId: note.id,
      memberName: note.memberName,
      status: nextStatus,
      actorName: user?.displayName || user?.email || 'Staff',
      actorEmail: user?.email || ''
    });
    toast({
      title: `Note ${nextStatus === 'Closed' ? 'Closed' : 'Reopened'}`,
      description: `Status set to ${nextStatus}.`
    });
  };

  const commitDeleteNote = async (note: StaffNote) => {
    await logSystemNoteAction({
      action: 'Staff note deleted',
      noteId: note.id,
      memberName: note.memberName,
      status: note.status || 'Open',
      actorName: user?.displayName || user?.email || 'Staff',
      actorEmail: user?.email || ''
    });
    deletedNotesRef.current.delete(note.id);
  };

  const requestDeleteNote = (note: StaffNote) => {
    deletedNotesRef.current.set(note.id, note);
    setAssignedNotes(prev => prev.filter(item => item.id !== note.id));
    setAllNotes(prev => prev.filter(item => item.id !== note.id));
    const timer = setTimeout(() => {
      deleteTimersRef.current.delete(note.id);
      commitDeleteNote(note).catch(() => undefined);
    }, 5000);
    deleteTimersRef.current.set(note.id, timer);

    toast({
      title: 'Note Deleted',
      description: 'You can undo this action for a few seconds.',
      action: (
        <ToastAction
          altText="Undo delete"
          onClick={() => {
            const existingTimer = deleteTimersRef.current.get(note.id);
            if (existingTimer) {
              clearTimeout(existingTimer);
              deleteTimersRef.current.delete(note.id);
            }
            const cached = deletedNotesRef.current.get(note.id);
            if (cached) {
              deletedNotesRef.current.delete(note.id);
              setAssignedNotes(prev => (cached.assignedTo === user?.uid ? [cached, ...prev] : prev));
              setAllNotes(prev => [cached, ...prev]);
            }
          }}
        >
          Undo
        </ToastAction>
      )
    });
  };

  const handleAddClientNote = async () => {
    if (!newNote.clientId2.trim()) {
      toast({
        title: "Client ID Required",
        description: "Enter a valid Client_ID2 to create a note.",
        variant: "destructive"
      });
      return;
    }
    if (!newNote.comments.trim()) {
      toast({
        title: "Note Required",
        description: "Enter note details before saving.",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsSavingNote(true);
      setCreateStatus(null);
      const response = await fetch('/api/client-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId2: newNote.clientId2.trim(),
          comments: newNote.comments.trim(),
          followUpStatus: newNote.followUpStatus,
          followUpDate: newNote.followUpDate || null,
          actorName: user?.displayName || user?.email || 'Staff',
          actorEmail: user?.email || ''
        })
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || data.error || 'Failed to create note');
      }
      const sync = data.sync || { caspio: true, firestore: Boolean(data.data?.firestoreSaved) };
      setCreateStatus(sync);
      setNewNote({ clientId2: '', comments: '', followUpStatus: 'Open', followUpDate: '' });
      toast({
        title: "Note Added",
        description: "Client note saved successfully."
      });
    } catch (error: any) {
      console.error('Error creating client note:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create note",
        variant: "destructive"
      });
    } finally {
      setIsSavingNote(false);
    }
  };


  const getFilteredNotes = (notes: StaffNote[]) => {
    const filtered = notes.filter(note => {
      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch = 
          note.memberName.toLowerCase().includes(searchLower) ||
          note.noteText.toLowerCase().includes(searchLower) ||
          note.clientId2.toLowerCase().includes(searchLower) ||
          note.createdByName.toLowerCase().includes(searchLower);
        
        if (!matchesSearch) return false;
      }

      // Priority filter
      if (filters.priority !== 'all' && normalizePriorityLabel(note.priority) !== filters.priority) return false;

      // Type filter
      if (filters.type !== 'all' && note.noteType !== filters.type) return false;

      // Status filter (read/unread)
      if (filters.status === 'unread' && note.isRead) return false;
      if (filters.status === 'read' && !note.isRead) return false;

      // Source filter
      if (filters.source !== 'all' && note.source !== filters.source) return false;

      return true;
    });

    return filtered.sort((a, b) => {
      const aPriority = normalizePriorityLabel(a.priority);
      const bPriority = normalizePriorityLabel(b.priority);
      const rankDiff = getPriorityRank(bPriority) - getPriorityRank(aPriority);
      if (rankDiff !== 0) return rankDiff;
      const aTime = new Date(a.createdAt || 0).getTime();
      const bTime = new Date(b.createdAt || 0).getTime();
      return bTime - aTime;
    });
  };

  const getPriorityColor = (priority: string) => {
    const label = normalizePriorityLabel(priority);
    if (label === 'Urgent') return 'bg-red-100 text-red-800 border-red-200';
    if (label === 'Priority') return 'bg-orange-100 text-orange-800 border-orange-200';
    return 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const getSourceColor = (source: string) => {
    switch (source) {
      case 'Caspio': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'App': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'Admin': return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const filteredAssignedNotes = getFilteredNotes(assignedNotes);
  const filteredAllNotes = getFilteredNotes(allNotes);
  const unreadCount = assignedNotes.filter(note => !note.isRead).length;

  if (!user) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Staff Notes</h1>
            <p className="text-muted-foreground">
              Manage notes assigned to you and view all member notes
            </p>
          </div>
        </div>
        {unreadCount > 0 && (
          <Badge variant="destructive" className="text-lg px-3 py-1">
            {unreadCount} unread
          </Badge>
        )}
      </div>

      {/* Search and Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Search & Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search notes, members, or staff..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full"
              />
            </div>
            <Button variant="outline" onClick={fetchStaffNotes} disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Refresh
            </Button>
          </div>
          
          <div className="flex gap-4">
            <Select value={filters.priority} onValueChange={(value) => setFilters(prev => ({ ...prev, priority: value }))}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priority</SelectItem>
                <SelectItem value="Priority">Priority</SelectItem>
                <SelectItem value="General">General</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filters.type} onValueChange={(value) => setFilters(prev => ({ ...prev, type: value }))}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="General">General</SelectItem>
                <SelectItem value="Medical">Medical</SelectItem>
                <SelectItem value="Social">Social</SelectItem>
                <SelectItem value="Administrative">Administrative</SelectItem>
                <SelectItem value="Follow-up">Follow-up</SelectItem>
                <SelectItem value="Emergency">Emergency</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filters.status} onValueChange={(value) => setFilters(prev => ({ ...prev, status: value }))}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="unread">Unread</SelectItem>
                <SelectItem value="read">Read</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filters.source} onValueChange={(value) => setFilters(prev => ({ ...prev, source: value }))}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="Caspio">Caspio</SelectItem>
                <SelectItem value="App">App</SelectItem>
                <SelectItem value="Admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={filters.status === 'all' ? 'default' : 'outline'}
              onClick={() => setFilters(prev => ({ ...prev, status: 'all' }))}
            >
              All
            </Button>
            <Button
              size="sm"
              variant={filters.status === 'unread' ? 'default' : 'outline'}
              onClick={() => setFilters(prev => ({ ...prev, status: 'unread' }))}
            >
              Unread
            </Button>
            <Button
              size="sm"
              variant={filters.status === 'read' ? 'default' : 'outline'}
              onClick={() => setFilters(prev => ({ ...prev, status: 'read' }))}
            >
              Read
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Add Client Note */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Add Client Note
          </CardTitle>
          <CardDescription>
            Create a note for an existing Client_ID2 in Caspio. The note syncs to Caspio and Firestore.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="staff-client-id">Client_ID2</Label>
              <Input
                id="staff-client-id"
                placeholder="Enter Client_ID2"
                value={newNote.clientId2}
                onChange={(e) => setNewNote(prev => ({ ...prev, clientId2: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={newNote.followUpStatus}
                onValueChange={(value) => setNewNote(prev => ({ ...prev, followUpStatus: value }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Open">Open</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Follow-up Date</Label>
              <Input
                type="date"
                value={newNote.followUpDate}
                onChange={(e) => setNewNote(prev => ({ ...prev, followUpDate: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Note</Label>
            <Textarea
              rows={3}
              value={newNote.comments}
              onChange={(e) => setNewNote(prev => ({ ...prev, comments: e.target.value }))}
              placeholder="Write the note details..."
            />
          </div>
          <div className="flex items-center justify-between">
            <Button onClick={handleAddClientNote} disabled={isSavingNote}>
              {isSavingNote ? 'Saving...' : 'Save Note'}
            </Button>
            {createStatus && (
              <div className="flex items-center gap-3 text-sm">
                {createStatus.caspio && (
                  <span className="flex items-center gap-1 text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    Caspio synced
                  </span>
                )}
                {createStatus.firestore && (
                  <span className="flex items-center gap-1 text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    Firestore synced
                  </span>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Notes Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="assigned" className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            My Assigned Notes ({filteredAssignedNotes.length})
          </TabsTrigger>
          <TabsTrigger value="all" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            All Notes ({filteredAllNotes.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="assigned" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Notes Assigned to You</CardTitle>
              <CardDescription>
                Notes that have been specifically assigned to you for action or follow-up
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                  <p className="text-muted-foreground">Loading assigned notes...</p>
                </div>
              ) : filteredAssignedNotes.length === 0 ? (
                <div className="text-center py-8">
                  <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Assigned Notes</h3>
                  <p className="text-muted-foreground">
                    {searchTerm || Object.values(filters).some(f => f !== 'all') 
                      ? 'No notes match the current filters' 
                      : 'You have no notes assigned to you at this time'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredAssignedNotes.map((note) => (
                    <div key={note.id} className={`p-4 border rounded-lg ${!note.isRead ? 'border-blue-200 bg-blue-50' : ''}`}>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex gap-2">
                          <Badge variant="outline" className={getPriorityColor(note.priority)}>
                            {normalizePriorityLabel(note.priority)}
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
                          <Badge variant="outline">
                            {note.status || 'Open'}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => note.isRead ? markAsUnread(note.id) : markAsRead(note.id)}
                          >
                            {note.isRead ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-muted-foreground">
                              {(note.status || 'Open') === 'Closed' ? 'Closed' : 'Open'}
                            </span>
                            <Switch
                              checked={(note.status || 'Open') !== 'Closed'}
                              onCheckedChange={() => toggleStatus(note)}
                            />
                          </div>
                          <AlertDialog open={deleteTarget?.id === note.id} onOpenChange={(open) => {
                            if (!open) setDeleteTarget(null);
                          }}>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-red-600 hover:text-red-700"
                                onClick={() => setDeleteTarget(note)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete this note?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  You will have a brief chance to undo this deletion.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel onClick={() => setDeleteTarget(null)}>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => {
                                    if (deleteTarget) {
                                      requestDeleteNote(deleteTarget);
                                    }
                                    setDeleteTarget(null);
                                  }}
                                  className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                          <div className="text-sm text-muted-foreground">
                            {format(new Date(note.createdAt), 'MMM d, yyyy h:mm a')}
                          </div>
                        </div>
                      </div>
                      
                      <div className="mb-3">
                        <p className="font-medium text-sm mb-1">
                          {note.memberName} ({note.clientId2})
                        </p>
                        <p className="text-sm line-clamp-2">{note.noteText}</p>
                      </div>
                      
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <div>
                          <span className="font-medium">From:</span> {note.createdByName}
                        </div>
                        {note.followUpDate && (
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Follow-up: {format(new Date(note.followUpDate), 'MMM d, yyyy')}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="all" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>All Member Notes</CardTitle>
              <CardDescription>
                All notes in the system, including those created by you and assigned to others
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                  <p className="text-muted-foreground">Loading all notes...</p>
                </div>
              ) : filteredAllNotes.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Notes Found</h3>
                  <p className="text-muted-foreground">
                    {searchTerm || Object.values(filters).some(f => f !== 'all') 
                      ? 'No notes match the current filters' 
                      : 'No notes found in the system'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredAllNotes.map((note) => (
                    <div key={note.id} className={`p-4 border rounded-lg ${note.assignedTo === user.uid && !note.isRead ? 'border-blue-200 bg-blue-50' : ''}`}>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex gap-2">
                          <Badge variant="outline" className={getPriorityColor(note.priority)}>
                            {normalizePriorityLabel(note.priority)}
                          </Badge>
                          <Badge variant="outline">
                            {note.noteType}
                          </Badge>
                          <Badge variant="outline" className={getSourceColor(note.source)}>
                            {note.source}
                          </Badge>
                          {note.assignedTo === user.uid && !note.isRead && (
                            <Badge className="bg-blue-600">
                              <Bell className="h-3 w-3 mr-1" />
                              Assigned to You
                            </Badge>
                          )}
                          <Badge variant="outline">
                            {note.status || 'Open'}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          {note.assignedTo === user.uid && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => note.isRead ? markAsUnread(note.id) : markAsRead(note.id)}
                            >
                              {note.isRead ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                          )}
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-muted-foreground">
                              {(note.status || 'Open') === 'Closed' ? 'Closed' : 'Open'}
                            </span>
                            <Switch
                              checked={(note.status || 'Open') !== 'Closed'}
                              onCheckedChange={() => toggleStatus(note)}
                            />
                          </div>
                          <AlertDialog open={deleteTarget?.id === note.id} onOpenChange={(open) => {
                            if (!open) setDeleteTarget(null);
                          }}>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-red-600 hover:text-red-700"
                                onClick={() => setDeleteTarget(note)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete this note?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  You will have a brief chance to undo this deletion.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel onClick={() => setDeleteTarget(null)}>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => {
                                    if (deleteTarget) {
                                      requestDeleteNote(deleteTarget);
                                    }
                                    setDeleteTarget(null);
                                  }}
                                  className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                          <div className="text-sm text-muted-foreground">
                            {format(new Date(note.createdAt), 'MMM d, yyyy h:mm a')}
                          </div>
                        </div>
                      </div>
                      
                      <div className="mb-3">
                        <p className="font-medium text-sm mb-1">
                          {note.memberName} ({note.clientId2})
                        </p>
                        <p className="text-sm line-clamp-2">{note.noteText}</p>
                      </div>
                      
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <div>
                          <span className="font-medium">From:</span> {note.createdByName}
                          {note.assignedToName && note.assignedTo !== user.uid && (
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
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}