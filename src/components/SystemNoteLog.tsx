'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { 
  RefreshCw, 
  Search, 
  Download, 
  MessageSquare, 
  User, 
  Clock, 
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Loader2,
  FileText,
  Eye,
  Calendar
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format } from 'date-fns';

interface SystemNote {
  id: string;
  senderName: string;
  senderEmail: string;
  recipientName: string;
  recipientEmail: string;
  memberName?: string;
  applicationId?: string;
  noteContent: string;
  noteType: 'internal' | 'task' | 'alert' | 'system';
  priority: 'low' | 'medium' | 'high';
  timestamp: Date;
  wasNotificationSent: boolean;
  notificationMethod?: 'popup' | 'email' | 'both';
  readAt?: Date;
  readBy?: string;
}

type SortField = 'timestamp' | 'senderName' | 'recipientName' | 'memberName' | 'priority';
type SortDirection = 'asc' | 'desc';

export function SystemNoteLog() {
  const [notes, setNotes] = useState<SystemNote[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBy, setFilterBy] = useState<'all' | 'sent' | 'received' | 'unread'>('all');
  const [staffFilter, setStaffFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month' | 'all'>('week');
  const { toast } = useToast();

  // Get unique staff members for filter
  const staffMembers = useMemo(() => {
    const senders = notes.map(note => note.senderName);
    const recipients = notes.map(note => note.recipientName);
    const allStaff = [...new Set([...senders, ...recipients])].filter(Boolean).sort();
    return allStaff;
  }, [notes]);

  // Filter and sort notes
  const filteredAndSortedNotes = useMemo(() => {
    let filtered = notes;

    // Apply search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(note => 
        note.senderName.toLowerCase().includes(search) ||
        note.recipientName.toLowerCase().includes(search) ||
        note.memberName?.toLowerCase().includes(search) ||
        note.noteContent.toLowerCase().includes(search)
      );
    }

    // Apply staff filter
    if (staffFilter !== 'all') {
      filtered = filtered.filter(note => 
        note.senderName === staffFilter || note.recipientName === staffFilter
      );
    }

    // Apply notification filter
    switch (filterBy) {
      case 'sent':
        filtered = filtered.filter(note => note.wasNotificationSent);
        break;
      case 'received':
        filtered = filtered.filter(note => !note.wasNotificationSent);
        break;
      case 'unread':
        filtered = filtered.filter(note => !note.readAt);
        break;
    }

    // Apply date range filter
    const now = new Date();
    switch (dateRange) {
      case 'today':
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        filtered = filtered.filter(note => note.timestamp >= today);
        break;
      case 'week':
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        filtered = filtered.filter(note => note.timestamp >= weekAgo);
        break;
      case 'month':
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        filtered = filtered.filter(note => note.timestamp >= monthAgo);
        break;
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: any, bValue: any;
      
      switch (sortField) {
        case 'timestamp':
          aValue = a.timestamp.getTime();
          bValue = b.timestamp.getTime();
          break;
        case 'senderName':
          aValue = a.senderName.toLowerCase();
          bValue = b.senderName.toLowerCase();
          break;
        case 'recipientName':
          aValue = a.recipientName.toLowerCase();
          bValue = b.recipientName.toLowerCase();
          break;
        case 'memberName':
          aValue = (a.memberName || '').toLowerCase();
          bValue = (b.memberName || '').toLowerCase();
          break;
        case 'priority':
          const priorityOrder = { high: 3, medium: 2, low: 1 };
          aValue = priorityOrder[a.priority];
          bValue = priorityOrder[b.priority];
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [notes, searchTerm, filterBy, staffFilter, sortField, sortDirection, dateRange]);

  useEffect(() => {
    loadNotes();
  }, []);

  const loadNotes = async () => {
    setIsLoading(true);
    try {
      const functions = getFunctions();
      const getSystemNotes = httpsCallable(functions, 'getSystemNoteLog');
      
      const result = await getSystemNotes();
      const data = result.data as any;
      
      if (data.success) {
        const notesWithDates = data.notes.map((note: any) => ({
          ...note,
          timestamp: new Date(note.timestamp),
          readAt: note.readAt ? new Date(note.readAt) : undefined
        }));
        setNotes(notesWithDates);
      } else {
        throw new Error(data.message || 'Failed to load notes');
      }
    } catch (error: any) {
      console.error('Error loading system notes:', error);
      toast({
        variant: 'destructive',
        title: 'Load Failed',
        description: error.message || 'Failed to load system note log',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="ml-2 h-4 w-4" />;
    return sortDirection === 'asc' ? 
      <ArrowUp className="ml-2 h-4 w-4" /> : 
      <ArrowDown className="ml-2 h-4 w-4" />;
  };

  const getPriorityBadge = (priority: string) => {
    const colors = {
      high: 'bg-red-100 text-red-800 border-red-200',
      medium: 'bg-orange-100 text-orange-800 border-orange-200',
      low: 'bg-blue-100 text-blue-800 border-blue-200'
    };
    return colors[priority as keyof typeof colors] || colors.low;
  };

  const exportToCSV = () => {
    const csvContent = [
      ['Timestamp', 'Sender', 'Recipient', 'Member', 'Note Type', 'Priority', 'Content', 'Notification Sent', 'Read At'].join(','),
      ...filteredAndSortedNotes.map(note => [
        `"${format(note.timestamp, 'yyyy-MM-dd HH:mm:ss')}"`,
        `"${note.senderName}"`,
        `"${note.recipientName}"`,
        `"${note.memberName || ''}"`,
        `"${note.noteType}"`,
        `"${note.priority}"`,
        `"${note.noteContent.replace(/"/g, '""')}"`,
        note.wasNotificationSent ? 'Yes' : 'No',
        note.readAt ? `"${format(note.readAt, 'yyyy-MM-dd HH:mm:ss')}"` : ''
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `system_note_log_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: 'Export Complete',
      description: `Exported ${filteredAndSortedNotes.length} note records to CSV`,
      className: 'bg-green-100 text-green-900 border-green-200',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">System Note Log</h2>
          <p className="text-muted-foreground">
            Comprehensive log of all staff notes and notifications sent through the system
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={loadNotes} disabled={isLoading} variant="outline">
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
          <Button onClick={exportToCSV} variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{notes.length}</p>
                <p className="text-xs text-muted-foreground">Total Notes</p>
              </div>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-green-600">
                  {notes.filter(n => n.wasNotificationSent).length}
                </p>
                <p className="text-xs text-muted-foreground">Notifications Sent</p>
              </div>
              <Bell className="h-4 w-4 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-orange-600">
                  {notes.filter(n => !n.readAt).length}
                </p>
                <p className="text-xs text-muted-foreground">Unread Notes</p>
              </div>
              <Eye className="h-4 w-4 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-blue-600">{staffMembers.length}</p>
                <p className="text-xs text-muted-foreground">Active Staff</p>
              </div>
              <User className="h-4 w-4 text-blue-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters & Search
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <Input
                placeholder="Search notes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full"
              />
            </div>
            
            <Select value={staffFilter} onValueChange={setStaffFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by staff" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Staff</SelectItem>
                {staffMembers.map(staff => (
                  <SelectItem key={staff} value={staff}>{staff}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterBy} onValueChange={(value: any) => setFilterBy(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Notes</SelectItem>
                <SelectItem value="sent">Notifications Sent</SelectItem>
                <SelectItem value="received">No Notification</SelectItem>
                <SelectItem value="unread">Unread</SelectItem>
              </SelectContent>
            </Select>

            <Select value={dateRange} onValueChange={(value: any) => setDateRange(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Date range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">Past Week</SelectItem>
                <SelectItem value="month">Past Month</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
              </SelectContent>
            </Select>

            <div className="text-sm text-muted-foreground flex items-center">
              Showing {filteredAndSortedNotes.length} of {notes.length} notes
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notes Table */}
      <Card>
        <CardHeader>
          <CardTitle>Note Log</CardTitle>
          <CardDescription>
            Detailed log of all staff notes and notification activity
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => handleSort('timestamp')}
                    className="h-auto p-0 font-semibold hover:bg-transparent"
                  >
                    Timestamp {getSortIcon('timestamp')}
                  </Button>
                </TableHead>
                <TableHead>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => handleSort('senderName')}
                    className="h-auto p-0 font-semibold hover:bg-transparent"
                  >
                    Sender {getSortIcon('senderName')}
                  </Button>
                </TableHead>
                <TableHead>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => handleSort('recipientName')}
                    className="h-auto p-0 font-semibold hover:bg-transparent"
                  >
                    Recipient {getSortIcon('recipientName')}
                  </Button>
                </TableHead>
                <TableHead>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => handleSort('memberName')}
                    className="h-auto p-0 font-semibold hover:bg-transparent"
                  >
                    Member {getSortIcon('memberName')}
                  </Button>
                </TableHead>
                <TableHead>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => handleSort('priority')}
                    className="h-auto p-0 font-semibold hover:bg-transparent"
                  >
                    Priority {getSortIcon('priority')}
                  </Button>
                </TableHead>
                <TableHead>Note Content</TableHead>
                <TableHead>Notification</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSortedNotes.map((note) => (
                <TableRow key={note.id}>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <div className="text-sm">
                        <div>{format(note.timestamp, 'MMM dd, yyyy')}</div>
                        <div className="text-xs text-muted-foreground">
                          {format(note.timestamp, 'HH:mm:ss')}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <User className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium">{note.senderName}</span>
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <User className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium">{note.recipientName}</span>
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    {note.memberName ? (
                      <span className="font-medium">{note.memberName}</span>
                    ) : (
                      <span className="text-muted-foreground text-sm">N/A</span>
                    )}
                  </TableCell>
                  
                  <TableCell>
                    <Badge variant="outline" className={getPriorityBadge(note.priority)}>
                      {note.priority}
                    </Badge>
                  </TableCell>
                  
                  <TableCell>
                    <div className="max-w-xs truncate" title={note.noteContent}>
                      {note.noteContent}
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    {note.wasNotificationSent ? (
                      <Badge variant="secondary" className="bg-green-100 text-green-800">
                        Sent ({note.notificationMethod})
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-gray-100 text-gray-800">
                        None
                      </Badge>
                    )}
                  </TableCell>
                  
                  <TableCell>
                    {note.readAt ? (
                      <div className="text-sm">
                        <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                          Read
                        </Badge>
                        <div className="text-xs text-muted-foreground mt-1">
                          {format(note.readAt, 'MMM dd, HH:mm')}
                        </div>
                      </div>
                    ) : (
                      <Badge variant="secondary" className="bg-orange-100 text-orange-800">
                        Unread
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          
          {filteredAndSortedNotes.length === 0 && (
            <div className="text-center py-8">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Notes Found</h3>
              <p className="text-muted-foreground">
                {searchTerm || staffFilter !== 'all' || filterBy !== 'all' 
                  ? 'Try adjusting your filters to see more results'
                  : 'No system notes have been logged yet'
                }
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}