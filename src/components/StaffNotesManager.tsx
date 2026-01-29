'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/firebase';
import { getPriorityRank, normalizePriorityLabel } from '@/lib/notification-utils';
import { 
  Loader2, 
  RefreshCw, 
  Search, 
  Eye, 
  EyeOff, 
  Bell, 
  MessageSquareText,
  Calendar,
  User,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink
} from 'lucide-react';
import { format, parseISO, isToday, isThisWeek, isThisMonth } from 'date-fns';
import Link from 'next/link';
import MemberNotesView from './MemberNotesView';

interface StaffNote {
  id: string;
  noteId: string;
  title: string;
  message: string;
  senderName: string;
  memberName: string;
  type: string;
  priority: 'General' | 'Priority' | 'Urgent' | string;
  timestamp: any;
  isRead: boolean;
  applicationId?: string;
  tableType: 'calaim_members' | 'client_notes';
}

interface StaffNotesManagerProps {
  viewMode?: 'personal' | 'admin';
}

export default function StaffNotesManager({ viewMode = 'personal' }: StaffNotesManagerProps) {
  const [notes, setNotes] = useState<StaffNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'timestamp' | 'priority' | 'sender'>('timestamp');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedMember, setSelectedMember] = useState<{ id?: string; name?: string } | null>(null);
  
  const { user } = useAuth();
  const { toast } = useToast();


  useEffect(() => {
    loadNotes();
  }, [user]);

  const loadNotes = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const endpoint = viewMode === 'admin' 
        ? '/api/admin/all-notes' 
        : `/api/staff/notes?userId=${user.uid}`;
        
      const response = await fetch(endpoint);
      const data = await response.json();
      
      if (data.success) {
        setNotes(data.notifications || data.notes || []);
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
    }
  };

  const markAsRead = async (noteIds: string[]) => {
    try {
      const response = await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notificationIds: noteIds }),
      });

      if (response.ok) {
        setNotes(prev => prev.map(note => 
          noteIds.includes(note.id) ? { ...note, isRead: true } : note
        ));
        
        toast({
          title: 'Success',
          description: `${noteIds.length} note(s) marked as read`,
        });
      }
    } catch (error) {
      console.error('Error marking notes as read:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to mark notes as read',
      });
    }
  };

  const filteredAndSortedNotes = useMemo(() => {
    let filtered = notes.filter(note => {
      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        if (
          !note.memberName?.toLowerCase().includes(searchLower) &&
          !note.senderName?.toLowerCase().includes(searchLower) &&
          !note.message?.toLowerCase().includes(searchLower) &&
          !note.title?.toLowerCase().includes(searchLower)
        ) {
          return false;
        }
      }

      // Priority filter
      if (priorityFilter !== 'all' && normalizePriorityLabel(note.priority) !== priorityFilter) {
        return false;
      }

      // Type filter
      if (typeFilter !== 'all' && note.tableType !== typeFilter) {
        return false;
      }

      // Status filter
      if (statusFilter === 'read' && !note.isRead) return false;
      if (statusFilter === 'unread' && note.isRead) return false;

      // Date filter
      if (dateFilter !== 'all' && note.timestamp) {
        const noteDate = note.timestamp.toDate ? note.timestamp.toDate() : new Date(note.timestamp);
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
        case 'sender':
          aVal = a.senderName || '';
          bVal = b.senderName || '';
          break;
        case 'timestamp':
        default:
          aVal = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : new Date(a.timestamp).getTime();
          bVal = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : new Date(b.timestamp).getTime();
          break;
      }

      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    return filtered;
  }, [notes, searchTerm, priorityFilter, typeFilter, statusFilter, dateFilter, sortBy, sortOrder]);

  const stats = useMemo(() => {
    const total = notes.length;
    const unread = notes.filter(n => !n.isRead).length;
    const today = notes.filter(n => {
      const noteDate = n.timestamp?.toDate ? n.timestamp.toDate() : new Date(n.timestamp);
      return isToday(noteDate);
    }).length;
    const priorityCount = notes.filter(
      (n) => normalizePriorityLabel(n.priority) === 'Priority' || normalizePriorityLabel(n.priority) === 'Urgent'
    ).length;

    return { total, unread, today, priorityCount };
  }, [notes]);

  const getPriorityColor = (priority: string) => {
    const label = normalizePriorityLabel(priority);
    if (label === 'Urgent') return 'bg-red-100 text-red-800 border-red-200';
    if (label === 'Priority') return 'bg-orange-100 text-orange-800 border-orange-200';
    return 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'calaim_members': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'client_notes': return 'bg-purple-100 text-purple-800 border-purple-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
              <Bell className="h-4 w-4 text-blue-600" />
              <div className="ml-2">
                <p className="text-sm font-medium text-muted-foreground">Unread</p>
                <p className="text-2xl font-bold text-blue-600">{stats.unread}</p>
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
                <p className="text-sm font-medium text-muted-foreground">Priority / Urgent</p>
                <p className="text-2xl font-bold text-red-600">{stats.priorityCount}</p>
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
                {viewMode === 'admin' ? 'All Staff Notes' : 'My Notes'}
              </CardTitle>
              <CardDescription>
                {viewMode === 'admin' 
                  ? 'Manage all staff notifications and notes from Caspio'
                  : 'View and manage your personal notes and notifications'
                }
              </CardDescription>
            </div>
            <Button onClick={loadNotes} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
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

              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="calaim_members">CalAIM Notes</SelectItem>
                  <SelectItem value="client_notes">Client Notes</SelectItem>
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="unread">Unread</SelectItem>
                  <SelectItem value="read">Read</SelectItem>
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
                  <SelectItem value="sender">Sender</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              >
                {sortOrder === 'asc' ? '↑' : '↓'}
              </Button>
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
                  <TableHead className="w-12">Status</TableHead>
                  <TableHead>Member/Client</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedNotes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No notes found matching your criteria
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAndSortedNotes.map((note) => {
                    const noteDate = note.timestamp?.toDate ? note.timestamp.toDate() : new Date(note.timestamp);
                    
                    return (
                      <TableRow key={note.id} className={!note.isRead ? 'bg-blue-50' : ''}>
                        <TableCell>
                          {note.isRead ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          ) : (
                            <Clock className="h-4 w-4 text-blue-600" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          {note.memberName || 'Unknown'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <User className="h-3 w-3 text-muted-foreground" />
                            {note.senderName || 'System'}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-xs">
                          <div className="truncate" title={note.message}>
                            {note.message || note.title}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getTypeColor(note.tableType)}>
                            {note.tableType === 'calaim_members' ? 'CalAIM' : 'Client'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getPriorityColor(note.priority)}>
                            {normalizePriorityLabel(note.priority)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(noteDate, 'MMM dd, yyyy HH:mm')}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedMember({
                                id: note.applicationId,
                                name: note.memberName
                              })}
                              title="View all notes for this member"
                            >
                              <MessageSquareText className="h-3 w-3" />
                            </Button>
                            {!note.isRead && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => markAsRead([note.id])}
                                title="Mark as read"
                              >
                                <Eye className="h-3 w-3" />
                              </Button>
                            )}
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
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      {filteredAndSortedNotes.some(note => !note.isRead) && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {filteredAndSortedNotes.filter(note => !note.isRead).length} unread notes
              </span>
              <Button
                onClick={() => {
                  const unreadIds = filteredAndSortedNotes
                    .filter(note => !note.isRead)
                    .map(note => note.id);
                  markAsRead(unreadIds);
                }}
                variant="outline"
                size="sm"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Mark All as Read
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Member Notes View Modal */}
      {selectedMember && (
        <MemberNotesView
          memberId={selectedMember.id}
          memberName={selectedMember.name}
          onClose={() => setSelectedMember(null)}
        />
      )}
    </div>
  );
}