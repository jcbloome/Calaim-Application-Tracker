'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { getPriorityRank, normalizePriorityLabel } from '@/lib/notification-utils';
import { useFirestore } from '@/firebase';
import { collection, getDocs, limit as limitDocs, orderBy, query } from 'firebase/firestore';
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
  Download,
  Filter,
  FileText,
  Bell,
  Trash2
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
  recipientName?: string;
  recipientEmail?: string;
  userId?: string;
  actionUrl?: string;
  clientId2?: string;
  replyToId?: string;
  threadId?: string;
  status?: string;
  resolvedAt?: string;
}

interface StaffMember {
  id: string;
  name: string;
  email: string;
}

export default function SuperAdminNoteLog() {
  const firestore = useFirestore();
  const [notes, setNotes] = useState<Note[]>([]);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [userDirectory, setUserDirectory] = useState<Record<string, string>>({});
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

  useEffect(() => {
    if (!firestore) return;
    const loadUsers = async () => {
      try {
        const snapshot = await getDocs(collection(firestore, 'users'));
        const nextDirectory: Record<string, string> = {};
        snapshot.forEach((docSnap) => {
          const data: any = docSnap.data();
          const label = data?.displayName || data?.name || data?.email || docSnap.id;
          nextDirectory[docSnap.id] = label;
        });
        setUserDirectory(nextDirectory);
      } catch (error) {
        console.warn('Failed to load user directory:', error);
      }
    };
    loadUsers();
  }, [firestore]);

  const loadNotes = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    const finish = () => {
      setLoading(false);
      setRefreshing(false);
    };
    
    try {
      const params = new URLSearchParams();
      params.append('limit', '5000');
      if (staffFilter !== 'all') params.append('staff', staffFilter);
      if (typeFilter !== 'all') params.append('type', typeFilter);
      if (priorityFilter !== 'all') params.append('priority', priorityFilter);

      const response = await fetch(`/api/admin/all-notes?${params.toString()}`, {
        cache: 'no-store'
      });
      const data = await response.json();

      if (data.success && Array.isArray(data.notes) && data.notes.length > 0) {
        setNotes(data.notes || []);
        setStaffList(data.staffList || []);
        finish();
        return;
      }
      if (!data.success) {
        throw new Error(data.message || 'Failed to load notes');
      }
    } catch (error: any) {
      console.error('Error loading notes:', error);
    }

    if (!firestore) {
      toast({
        variant: 'destructive',
        title: 'Error Loading Notes',
        description: 'Failed to load notes. Firestore is not available.',
      });
      finish();
      return;
    } else {
      try {
        const collections = [
          { name: 'staff_notifications', tableType: 'notification', source: 'notification' as const },
          { name: 'client_notes', tableType: 'client_notes', source: 'caspio' as const },
          { name: 'calaim_members', tableType: 'calaim_members', source: 'caspio' as const },
          { name: 'staff_notes', tableType: 'staff_note', source: 'staff' as const },
          { name: 'systemNotes', tableType: 'system_note', source: 'system' as const }
        ];
        const nextNotes: any[] = [];
        const staffSet = new Set<string>();
        const maxPerCollection = 1000;

        for (const collectionInfo of collections) {
          let snapshot;
          try {
            snapshot = await getDocs(
              query(
                collection(firestore, collectionInfo.name),
                orderBy('timestamp', 'desc'),
                limitDocs(maxPerCollection)
              )
            );
          } catch {
            snapshot = await getDocs(
              query(
                collection(firestore, collectionInfo.name),
                limitDocs(maxPerCollection)
              )
            );
          }

          snapshot.forEach((docSnap) => {
            const data: any = docSnap.data();
            const rawPriority = String(data.priority || '').toLowerCase();
            const normalizedPriority = rawPriority.includes('urgent')
              ? 'Urgent'
              : rawPriority.includes('priority') || rawPriority.includes('high')
                ? 'Priority'
                : rawPriority.includes('medium') || rawPriority.includes('low')
                  ? 'General'
                  : undefined;
            const staffName = data.staffName || data.senderName || data.createdByName;
            if (staffName) staffSet.add(staffName);

            const timestampValue = data.timestamp?.toDate?.()
              ?? data.createdAt?.toDate?.()
              ?? data.createdAt
              ?? data.created_at
              ?? new Date();
            const timestamp = timestampValue instanceof Date
              ? timestampValue.toISOString()
              : new Date(timestampValue).toISOString();

            nextNotes.push({
              id: docSnap.id,
              ...data,
              tableType: collectionInfo.tableType,
              source: collectionInfo.source,
              staffName,
              priority: normalizedPriority || data.priority,
              timestamp
            });
          });
        }

        nextNotes.sort((a, b) => {
          const aTime = new Date(a.timestamp).getTime();
          const bTime = new Date(b.timestamp).getTime();
          return bTime - aTime;
        });

        setNotes(nextNotes);
        setStaffList(
          Array.from(staffSet).map((name) => ({ id: name, name, email: '' }))
        );
        finish();
        return;
      } catch (fallbackError: any) {
        console.error('Error loading notes from Firestore:', fallbackError);
        toast({
          variant: 'destructive',
          title: 'Error Loading Notes',
          description: fallbackError.message || 'Failed to load notes',
        });
        finish();
        return;
      }
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
        case 'priority': {
          aVal = getPriorityRank(a.priority);
          bVal = getPriorityRank(b.priority);
          break;
        }
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
    const priorityCount = notes.filter(
      (n) => normalizePriorityLabel(n.priority) === 'Priority' || normalizePriorityLabel(n.priority) === 'Urgent'
    ).length;
    const staffNotes = notes.filter(n => n.tableType === 'staff_note' || n.source !== 'notification').length;
    const notifications = notes.filter(n => n.source === 'notification').length;

    return { total, today, priorityCount, staffNotes, notifications };
  }, [notes]);

  const deletedNotes = useMemo(() => {
    return notes.filter((note) => {
      const content = String(
        note.noteContent || note.Note_Content || note.Note_Text || note.message || note.title || ''
      ).toLowerCase();
      return content.includes('deleted');
    });
  }, [notes]);

  const getPriorityColor = (priority: string) => {
    const label = normalizePriorityLabel(priority);
    if (label === 'Urgent') return 'bg-red-100 text-red-800 border-red-200';
    if (label === 'Priority') return 'bg-orange-100 text-orange-800 border-orange-200';
    return 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const getSourceLabel = (note: Note) => {
    if (note.source === 'notification') {
      const noteType = String(note.type || note.noteType || '').toLowerCase();
      if (noteType.includes('interoffice')) {
        return 'Interoffice';
      }
      return 'App Notification';
    } else if (note.tableType === 'calaim_members') {
      return 'Caspio (CalAIM)';
    } else if (note.tableType === 'client_notes') {
      return 'Caspio (Client)';
    } else if (note.tableType === 'staff_note') {
      return 'Staff Note';
    }
    return 'System Note';
  };

  const getSenderName = (note: Note) => {
    return note.senderName || note.staffName || 'System';
  };

  const getRecipientName = (note: Note) => {
    if (note.recipientName) return note.recipientName;
    if (note.recipientEmail) return note.recipientEmail;
    if (note.userId && userDirectory[note.userId]) return userDirectory[note.userId];
    return note.userId || '—';
  };

  const getReplyLabel = (note: Note) => {
    if (note.replyToId) return 'Reply';
    if (note.threadId) return 'Thread';
    return '—';
  };

  const getStatusLabel = (note: Note) => {
    if (note.status) return note.status;
    return note.isRead ? 'Read' : 'Open';
  };

  const getNoteContent = (note: Note) => {
    return note.noteContent || note.Note_Content || note.Note_Text || note.message || note.title || 'No content available';
  };

  const getNoteLink = (note: Note) => {
    if (note.actionUrl) return note.actionUrl;
    if (note.applicationId) return `/admin/applications/${note.applicationId}`;
    if (note.clientId2) return `/admin/applications/${note.clientId2}`;
    return null;
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
        normalizePriorityLabel(note.priority),
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
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Member</TableHead>
                  <TableHead>Content</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reply</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedNotes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      No notes found matching your criteria
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAndSortedNotes.map((note) => (
                    <TableRow key={note.id} className={note.source === 'notification' && !note.isRead ? 'bg-blue-50' : ''}>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {getSourceLabel(note)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {getSenderName(note)}
                      </TableCell>
                      <TableCell>
                        {getRecipientName(note)}
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
                            {normalizePriorityLabel(note.priority)}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-xs text-muted-foreground">
                          <div>{getStatusLabel(note)}</div>
                          {note.resolvedAt && (
                            <div>Closed {format(new Date(note.resolvedAt), 'MMM dd, yyyy')}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {getReplyLabel(note)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <div>{format(new Date(note.timestamp), 'MMM dd, yyyy')}</div>
                        <div>{format(new Date(note.timestamp), 'HH:mm')}</div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Deleted Notes Log */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-red-600" />
            Deleted Notes Log
          </CardTitle>
          <CardDescription>
            Notes that were deleted from the system ({deletedNotes.length})
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead>Member</TableHead>
                  <TableHead>Content</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deletedNotes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                      No deleted notes found
                    </TableCell>
                  </TableRow>
                ) : (
                  deletedNotes.map((note) => (
                    <TableRow key={`deleted-${note.id}`}>
                      <TableCell>
                        {note.staffName || note.senderName || 'System'}
                      </TableCell>
                      <TableCell className="font-medium">
                        {note.memberName || 'N/A'}
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <div className="truncate" title={getNoteContent(note)}>
                          {getNoteContent(note)}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <div>{format(new Date(note.timestamp), 'MMM dd, yyyy')}</div>
                        <div>{format(new Date(note.timestamp), 'HH:mm')}</div>
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