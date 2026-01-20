'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
  FileText
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAdmin } from '@/hooks/use-admin';
import { format } from 'date-fns';

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
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
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
          priority: 'High',
          followUpDate: '2026-01-20'
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
          priority: 'Medium',
          followUpDate: '2026-01-22'
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
          priority: 'Urgent'
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
          priority: 'Low'
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
          priority: 'Medium'
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

  const getFilteredNotes = (notes: StaffNote[]) => {
    return notes.filter(note => {
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
      if (filters.priority !== 'all' && note.priority !== filters.priority) return false;

      // Type filter
      if (filters.type !== 'all' && note.noteType !== filters.type) return false;

      // Status filter (read/unread)
      if (filters.status === 'unread' && note.isRead) return false;
      if (filters.status === 'read' && !note.isRead) return false;

      // Source filter
      if (filters.source !== 'all' && note.source !== filters.source) return false;

      return true;
    });
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
                <SelectItem value="Urgent">Urgent</SelectItem>
                <SelectItem value="High">High</SelectItem>
                <SelectItem value="Medium">Medium</SelectItem>
                <SelectItem value="Low">Low</SelectItem>
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
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => note.isRead ? markAsUnread(note.id) : markAsRead(note.id)}
                          >
                            {note.isRead ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                          <div className="text-sm text-muted-foreground">
                            {format(new Date(note.createdAt), 'MMM d, yyyy h:mm a')}
                          </div>
                        </div>
                      </div>
                      
                      <div className="mb-3">
                        <p className="font-medium text-sm mb-1">
                          {note.memberName} ({note.clientId2})
                        </p>
                        <p className="text-sm">{note.noteText}</p>
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
                            {note.priority}
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
                          <div className="text-sm text-muted-foreground">
                            {format(new Date(note.createdAt), 'MMM d, yyyy h:mm a')}
                          </div>
                        </div>
                      </div>
                      
                      <div className="mb-3">
                        <p className="font-medium text-sm mb-1">
                          {note.memberName} ({note.clientId2})
                        </p>
                        <p className="text-sm">{note.noteText}</p>
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