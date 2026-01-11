'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
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
  Download,
  Filter,
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
  priority?: 'low' | 'medium' | 'high';
  
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

interface StaffMember {
  id: string;
  name: string;
  email: string;
}

export default function SuperAdminNoteLog() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [staffFilter, setStaffFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'timestamp' | 'priority' | 'staff'>('timestamp');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  const { toast } = useToast();

  useEffect(() => {
    loadNotes();
  }, []);

  const loadNotes = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    
    try {
      const params = new URLSearchParams();
      params.append('limit', '200');
      if (staffFilter !== 'all') params.append('staff', staffFilter);
      if (typeFilter !== 'all') params.append('type', typeFilter);
      if (priorityFilter !== 'all') params.append('priority', priorityFilter);

      const response = await fetch(`/api/admin/all-notes?${params.toString()}`);
      const data = await response.json();

      if (data.success) {
        setNotes(data.notes || []);
        setStaffList(data.staffList || []);
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
        const staffName = note.staffName || note.senderName || '';
        
        if (
          !content.toLowerCase().includes(searchLower) &&
          !memberName.toLowerCase().includes(searchLower) &&
          !staffName.toLowerCase().includes(searchLower)
        ) {
          return false;
        }
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
        case 'priority':
          const priorityOrder = { high: 3, medium: 2, low: 1 };
          aVal = priorityOrder[a.priority as keyof typeof priorityOrder] || 0;
          bVal = priorityOrder[b.priority as keyof typeof priorityOrder] || 0;
          break;
        case 'staff':
          aVal = a.staffName || a.senderName || '';
          bVal = b.staffName || b.senderName || '';
          break;
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
  }, [notes, searchTerm, dateFilter, sortBy, sortOrder]);

  const stats = useMemo(() => {
    const total = notes.length;
    const today = notes.filter(n => isToday(new Date(n.timestamp))).length;
    const highPriority = notes.filter(n => n.priority === 'high').length;
    const staffNotes = notes.filter(n => n.tableType === 'staff_note' || n.source !== 'notification').length;
    const notifications = notes.filter(n => n.source === 'notification').length;

    return { total, today, highPriority, staffNotes, notifications };
  }, [notes]);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getSourceIcon = (note: Note) => {
    if (note.source === 'notification') {
      return <Bell className="h-4 w-4 text-blue-600" />;
    } else if (note.tableType === 'calaim_members') {
      return <FileText className="h-4 w-4 text-purple-600" />;
    } else if (note.tableType === 'client_notes') {
      return <MessageSquareText className="h-4 w-4 text-green-600" />;
    } else if (note.tableType === 'staff_note') {
      return <User className="h-4 w-4 text-orange-600" />;
    }
    return <MessageSquareText className="h-4 w-4 text-gray-600" />;
  };

  const getSourceLabel = (note: Note) => {
    if (note.source === 'notification') {
      return 'App Notification';
    } else if (note.tableType === 'calaim_members') {
      return 'CalAIM Note';
    } else if (note.tableType === 'client_notes') {
      return 'Client Note';
    } else if (note.tableType === 'staff_note') {
      return 'Staff Note';
    }
    return 'System Note';
  };

  const getNoteContent = (note: Note) => {
    return note.noteContent || note.Note_Content || note.Note_Text || note.message || note.title || 'No content available';
  };

  const exportToCSV = () => {
    const csvContent = [
      ['Date', 'Time', 'Staff', 'Member', 'Type', 'Priority', 'Content'].join(','),
      ...filteredAndSortedNotes.map(note => [
        format(new Date(note.timestamp), 'yyyy-MM-dd'),
        format(new Date(note.timestamp), 'HH:mm:ss'),
        `"${note.staffName || note.senderName || 'System'}"`,
        `"${note.memberName || 'N/A'}"`,
        `"${getSourceLabel(note)}"`,
        note.priority || 'medium',
        `"${getNoteContent(note).replace(/"/g, '""')}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `note_log_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
                <p className="text-sm font-medium text-muted-foreground">Total Notes</p>
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
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <div className="ml-2">
                <p className="text-sm font-medium text-muted-foreground">High Priority</p>
                <p className="text-2xl font-bold text-red-600">{stats.highPriority}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <User className="h-4 w-4 text-orange-600" />
              <div className="ml-2">
                <p className="text-sm font-medium text-muted-foreground">Staff Notes</p>
                <p className="text-2xl font-bold text-orange-600">{stats.staffNotes}</p>
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
      </div>

      {/* Filters and Controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MessageSquareText className="h-5 w-5" />
                Complete Note Log
              </CardTitle>
              <CardDescription>
                All notes, notifications, and communications across the system
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={exportToCSV} variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
              <Button onClick={() => loadNotes(true)} variant="outline" size="sm" disabled={refreshing}>
                {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            {/* Search and Filters Row */}
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search notes, members, or staff..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              
              <Select value={staffFilter} onValueChange={setStaffFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Staff" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Staff</SelectItem>
                  {staffList.map(staff => (
                    <SelectItem key={staff.id} value={staff.name}>
                      {staff.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
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

            {/* Sort Controls */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Sort by:</span>
              <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="timestamp">Date</SelectItem>
                  <SelectItem value="priority">Priority</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              >
                {sortOrder === 'asc' ? '↑' : '↓'}
              </Button>
              <span className="text-sm text-muted-foreground ml-4">
                Showing {filteredAndSortedNotes.length} of {notes.length} notes
              </span>
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
                  <TableHead>Staff</TableHead>
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
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No notes found matching your criteria
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
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-3 w-3 text-muted-foreground" />
                          {note.staffName || note.senderName || 'System'}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        {note.memberName || 'N/A'}
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <div className="truncate" title={getNoteContent(note)}>
                          {getNoteContent(note)}
                        </div>
                      </TableCell>
                      <TableCell>
                        {note.priority && (
                          <Badge variant="outline" className={getPriorityColor(note.priority)}>
                            {note.priority}
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