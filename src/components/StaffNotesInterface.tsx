'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/firebase';
import { getPriorityRank, normalizePriorityLabel } from '@/lib/notification-utils';
import { 
  Loader2, 
  RefreshCw, 
  Search, 
  MessageSquareText,
  Calendar,
  User,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Bell
} from 'lucide-react';
import { format, isToday, isThisWeek, isThisMonth } from 'date-fns';
import Link from 'next/link';

interface Note {
  id: string;
  timestamp: Date;
  source?: 'notification' | 'caspio';
  
  // Common fields
  memberName?: string;
  memberId?: string;
  staffName?: string;
  staffId?: string;
  priority?: 'General' | 'Priority' | 'Urgent' | string;
  
  // Note content
  noteContent?: string;
  Note_Content?: string;
  Note_Text?: string;
  message?: string;
  title?: string;
  
  // Type and category
  noteType?: string;
  tableType?: string;
  type?: string;
  
  // Notification specific
  isRead?: boolean;
  applicationId?: string;
  senderName?: string;
}

export default function StaffNotesInterface() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'timestamp' | 'priority'>('timestamp');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      loadNotes();
    }
  }, [user]);

  const loadNotes = async (isRefresh = false) => {
    if (!user) return;
    
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    
    try {
      const response = await fetch(`/api/staff/my-notes?staffId=${user.uid}`);
      const data = await response.json();

      if (data.success) {
        setNotes(data.notes || []);
      } else {
        throw new Error(data.message || 'Failed to load notes');
      }
    } catch (error: any) {
      console.error('Error loading notes:', error);
      toast({
        variant: 'destructive',
        title: 'Error Loading Notes',
        description: error.message || 'Failed to load notes',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const filteredAndSortedNotes = useMemo(() => {
    let filtered = notes.filter(note => {
      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const content = note.noteContent || note.Note_Content || note.Note_Text || note.message || note.title || '';
        const memberName = note.memberName || '';
        
        if (
          !content.toLowerCase().includes(searchLower) &&
          !memberName.toLowerCase().includes(searchLower)
        ) {
          return false;
        }
      }

      // Type filter
      if (typeFilter !== 'all') {
        if (typeFilter === 'my_notes' && note.source === 'notification') return false;
        if (typeFilter === 'notifications' && note.source !== 'notification') return false;
      }

      // Priority filter
      if (priorityFilter !== 'all' && normalizePriorityLabel(note.priority) !== priorityFilter) {
        return false;
      }

      // Date filter
      if (dateFilter !== 'all' && note.timestamp) {
        const noteDate = new Date(note.timestamp);
        switch (dateFilter) {
          case 'today':
            if (!isToday(noteDate)) return false;
            break;
          case 'week':
            if (!isThisWeek(noteDate)) return false;
            break;
          case 'month':
            if (!isThisMonth(noteDate)) return false;
            break;
        }
      }

      return true;
    });

    // Sort
    filtered.sort((a, b) => {
      let aVal, bVal;
      
      switch (sortBy) {
        case 'priority': {
          aVal = getPriorityRank(a.priority);
          bVal = getPriorityRank(b.priority);
          break;
        }
        case 'timestamp':
        default:
          aVal = new Date(a.timestamp).getTime();
          bVal = new Date(b.timestamp).getTime();
          break;
      }

      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    return filtered;
  }, [notes, searchTerm, typeFilter, priorityFilter, dateFilter, sortBy, sortOrder]);

  const stats = useMemo(() => {
    const total = notes.length;
    const today = notes.filter(n => isToday(new Date(n.timestamp))).length;
    const myNotes = notes.filter(n => n.source !== 'notification').length;
    const notifications = notes.filter(n => n.source === 'notification').length;
    const unread = notes.filter(n => n.source === 'notification' && !n.isRead).length;

    return { total, today, myNotes, notifications, unread };
  }, [notes]);

  const getPriorityColor = (priority: string) => {
    const label = normalizePriorityLabel(priority);
    if (label === 'Urgent') return 'bg-red-100 text-red-800 border-red-200';
    if (label === 'Priority') return 'bg-orange-100 text-orange-800 border-orange-200';
    return 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const getSourceIcon = (note: Note) => {
    if (note.source === 'notification') {
      return <Bell className="h-4 w-4 text-blue-600" />;
    } else {
      return <FileText className="h-4 w-4 text-orange-600" />;
    }
  };

  const getSourceLabel = (note: Note) => {
    if (note.source === 'notification') {
      return 'Notification';
    } else {
      return 'My Note';
    }
  };

  const getNoteContent = (note: Note) => {
    return note.noteContent || note.Note_Content || note.Note_Text || note.message || note.title || 'No content available';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <MessageSquareText className="h-4 w-4 text-muted-foreground" />
              <div className="ml-2">
                <p className="text-sm font-medium text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <Calendar className="h-4 w-4 text-green-600" />
              <div className="ml-2">
                <p className="text-sm font-medium text-muted-foreground">Today</p>
                <p className="text-2xl font-bold text-green-600">{stats.today}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <FileText className="h-4 w-4 text-orange-600" />
              <div className="ml-2">
                <p className="text-sm font-medium text-muted-foreground">My Notes</p>
                <p className="text-2xl font-bold text-orange-600">{stats.myNotes}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <Bell className="h-4 w-4 text-blue-600" />
              <div className="ml-2">
                <p className="text-sm font-medium text-muted-foreground">Notifications</p>
                <p className="text-2xl font-bold text-blue-600">{stats.notifications}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <div className="ml-2">
                <p className="text-sm font-medium text-muted-foreground">Unread</p>
                <p className="text-2xl font-bold text-red-600">{stats.unread}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MessageSquareText className="h-5 w-5" />
                My Notes & Notifications
              </CardTitle>
              <CardDescription>
                View your notes and notifications (read-only from Caspio)
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-blue-50 text-blue-900 border-blue-200">
                Notes are read-only from Caspio
              </Badge>
              
              <Button onClick={() => loadNotes(true)} variant="outline" size="sm" disabled={refreshing}>
                {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            {/* Search and Filters */}
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search notes and notifications..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="my_notes">My Notes</SelectItem>
                  <SelectItem value="notifications">Notifications</SelectItem>
                </SelectContent>
              </Select>

              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  <SelectItem value="Urgent">Urgent</SelectItem>
                  <SelectItem value="Priority">Priority</SelectItem>
                  <SelectItem value="General">General</SelectItem>
                </SelectContent>
              </Select>

              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Date" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notes Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Member</TableHead>
                  <TableHead>Content</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedNotes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No notes found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAndSortedNotes.map((note) => (
                    <TableRow key={note.id} className={note.source === 'notification' && !note.isRead ? 'bg-blue-50' : ''}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getSourceIcon(note)}
                          <Badge variant="outline" className="text-xs">
                            {getSourceLabel(note)}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        {note.memberName || 'General'}
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <div className="truncate" title={getNoteContent(note)}>
                          {getNoteContent(note)}
                        </div>
                      </TableCell>
                      <TableCell>
                        {note.priority && (
                          <Badge variant="outline" className={getPriorityColor(note.priority)}>
                            {normalizePriorityLabel(note.priority)}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <div>{format(new Date(note.timestamp), 'MMM dd, yyyy')}</div>
                        <div>{format(new Date(note.timestamp), 'HH:mm')}</div>
                      </TableCell>
                      <TableCell>
                        {note.applicationId && (
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                            title="View application"
                          >
                            <Link href={`/admin/applications/${note.applicationId}`}>
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}