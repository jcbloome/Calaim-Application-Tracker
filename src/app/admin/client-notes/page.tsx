'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Search, Plus, MessageSquare, Bell, Calendar, User, Clock, Filter } from 'lucide-react';
import { format } from 'date-fns';

// Types
interface ClientNote {
  id: string;
  noteId: string;
  clientId2: string;
  userId?: string;
  comments: string;
  timeStamp: string;
  followUpDate?: string;
  followUpAssignment?: string;
  followUpStatus?: string;
  seniorFirst?: string;
  seniorLast?: string;
  seniorFullName?: string;
  userFullName?: string;
  userRole?: string;
  isNew?: boolean;
}

interface User {
  userId: string;
  userFullName: string;
  role: string;
}

interface NotesData {
  notes: ClientNote[];
  notesByClient: { [key: string]: any };
  notesByUser: { [key: string]: any };
  totalNotes: number;
  newNotes: number;
  clients: number;
  assignedUsers: number;
  users: User[];
}

export default function ClientNotesPage() {
  const [notesData, setNotesData] = useState<NotesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedUser, setSelectedUser] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showNewNoteDialog, setShowNewNoteDialog] = useState(false);
  const [newNote, setNewNote] = useState({
    clientId2: '',
    comments: '',
    followUpDate: '',
    followUpAssignment: '',
    followUpStatus: 'Open'
  });
  const { toast } = useToast();

  // Fetch notes data
  const fetchNotes = async (clientId2?: string, userId?: string, since?: string) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (clientId2) params.append('clientId2', clientId2);
      if (userId) params.append('userId', userId);
      if (since) params.append('since', since);

      const response = await fetch(`/api/client-notes?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch notes');

      const data = await response.json();
      if (data.success) {
        setNotesData(data.data);
      } else {
        throw new Error(data.error || 'Failed to fetch notes');
      }
    } catch (error: any) {
      console.error('Error fetching notes:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to fetch client notes",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Create new note
  const createNote = async () => {
    if (!newNote.clientId2 || !newNote.comments) {
      toast({
        title: "Error",
        description: "Client ID and comments are required",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch('/api/client-notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newNote),
      });

      if (!response.ok) throw new Error('Failed to create note');

      const data = await response.json();
      if (data.success) {
        toast({
          title: "Success",
          description: "Note created successfully",
        });
        
        // Reset form and close dialog
        setNewNote({
          clientId2: '',
          comments: '',
          followUpDate: '',
          followUpAssignment: '',
          followUpStatus: 'Open'
        });
        setShowNewNoteDialog(false);
        
        // Refresh notes
        fetchNotes();
      } else {
        throw new Error(data.error || 'Failed to create note');
      }
    } catch (error: any) {
      console.error('Error creating note:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create note",
        variant: "destructive",
      });
    }
  };

  // Filter notes based on search and filters
  const filteredNotes = useMemo(() => {
    if (!notesData) return [];

    return notesData.notes.filter(note => {
      const matchesSearch = searchTerm === '' || 
        note.seniorFullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        note.comments.toLowerCase().includes(searchTerm.toLowerCase()) ||
        note.userFullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        note.clientId2.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesClient = selectedClient === '' || note.clientId2 === selectedClient;
      const matchesUser = selectedUser === '' || note.userId === selectedUser;
      
      const matchesStatus = statusFilter === 'all' || 
        (statusFilter === 'open' && note.followUpStatus === 'Open') ||
        (statusFilter === 'closed' && note.followUpStatus === 'Closed') ||
        (statusFilter === 'pending' && note.followUpStatus === 'Pending') ||
        (statusFilter === 'new' && note.isNew);

      return matchesSearch && matchesClient && matchesUser && matchesStatus;
    });
  }, [notesData, searchTerm, selectedClient, selectedUser, statusFilter]);

  // Get unique clients for filter dropdown
  const uniqueClients = useMemo(() => {
    if (!notesData) return [];
    return Object.values(notesData.notesByClient).map((client: any) => ({
      clientId2: client.clientId2,
      seniorFullName: client.seniorFullName
    }));
  }, [notesData]);

  useEffect(() => {
    fetchNotes();
  }, []);

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading client notes...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">📝 Client Notes & Communication</h1>
          <p className="text-muted-foreground">
            Manage client notes, staff assignments, and interoffice communication
          </p>
        </div>
        
        <Dialog open={showNewNoteDialog} onOpenChange={setShowNewNoteDialog}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" />
              New Note
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Client Note</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="clientId2">Client ID2 *</Label>
                <Input
                  id="clientId2"
                  value={newNote.clientId2}
                  onChange={(e) => setNewNote({ ...newNote, clientId2: e.target.value })}
                  placeholder="Enter Client ID2"
                />
              </div>
              
              <div>
                <Label htmlFor="comments">Comments *</Label>
                <Textarea
                  id="comments"
                  value={newNote.comments}
                  onChange={(e) => setNewNote({ ...newNote, comments: e.target.value })}
                  placeholder="Enter note comments..."
                  rows={4}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="followUpDate">Follow-up Date</Label>
                  <Input
                    id="followUpDate"
                    type="date"
                    value={newNote.followUpDate}
                    onChange={(e) => setNewNote({ ...newNote, followUpDate: e.target.value })}
                  />
                </div>
                
                <div>
                  <Label htmlFor="followUpAssignment">Assign to Staff</Label>
                  <Select
                    value={newNote.followUpAssignment}
                    onValueChange={(value) => setNewNote({ ...newNote, followUpAssignment: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select staff member" />
                    </SelectTrigger>
                    <SelectContent>
                      {notesData?.users.map((user) => (
                        <SelectItem key={user.userId} value={user.userId}>
                          {user.userFullName} ({user.role})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setShowNewNoteDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={createNote}>
                  Create Note
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Statistics Cards */}
      {notesData && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <MessageSquare className="w-5 h-5 text-blue-600" />
                <div>
                  <p className="text-sm text-muted-foreground">Total Notes</p>
                  <p className="text-2xl font-bold">{notesData.totalNotes}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Bell className="w-5 h-5 text-orange-600" />
                <div>
                  <p className="text-sm text-muted-foreground">New Notes</p>
                  <p className="text-2xl font-bold">{notesData.newNotes}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <User className="w-5 h-5 text-green-600" />
                <div>
                  <p className="text-sm text-muted-foreground">Active Clients</p>
                  <p className="text-2xl font-bold">{notesData.clients}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Calendar className="w-5 h-5 text-purple-600" />
                <div>
                  <p className="text-sm text-muted-foreground">Assigned Staff</p>
                  <p className="text-2xl font-bold">{notesData.assignedUsers}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <Label htmlFor="search">Search Notes</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Search by client, content, or staff..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <div>
              <Label htmlFor="clientFilter">Filter by Client</Label>
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger>
                  <SelectValue placeholder="All clients" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All clients</SelectItem>
                  {uniqueClients.map((client) => (
                    <SelectItem key={client.clientId2} value={client.clientId2}>
                      {client.seniorFullName} ({client.clientId2})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="userFilter">Filter by Staff</Label>
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger>
                  <SelectValue placeholder="All staff" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All staff</SelectItem>
                  {notesData?.users.map((user) => (
                    <SelectItem key={user.userId} value={user.userId}>
                      {user.userFullName} ({user.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="statusFilter">Filter by Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="new">New notes</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-end">
              <Button 
                variant="outline" 
                onClick={() => {
                  setSearchTerm('');
                  setSelectedClient('');
                  setSelectedUser('');
                  setStatusFilter('all');
                }}
                className="w-full"
              >
                <Filter className="w-4 h-4 mr-2" />
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notes List */}
      <Card>
        <CardHeader>
          <CardTitle>
            Client Notes ({filteredNotes.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredNotes.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No notes found matching your criteria</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredNotes.map((note) => (
                <Card key={note.id} className={`${note.isNew ? 'border-orange-200 bg-orange-50' : ''}`}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <h3 className="font-semibold text-lg">
                            {note.seniorFullName || 'Unknown Client'}
                          </h3>
                          <Badge variant="outline" className="text-xs">
                            {note.clientId2}
                          </Badge>
                          {note.isNew && (
                            <Badge className="bg-orange-600 text-white text-xs">
                              NEW
                            </Badge>
                          )}
                        </div>
                        
                        <div className="flex items-center space-x-4 text-sm text-muted-foreground mb-3">
                          <div className="flex items-center space-x-1">
                            <Clock className="w-4 h-4" />
                            <span>{format(new Date(note.timeStamp), 'MMM dd, yyyy HH:mm')}</span>
                          </div>
                          
                          {note.userFullName && (
                            <div className="flex items-center space-x-1">
                              <User className="w-4 h-4" />
                              <span>{note.userFullName} ({note.userRole})</span>
                            </div>
                          )}
                          
                          {note.followUpDate && (
                            <div className="flex items-center space-x-1">
                              <Calendar className="w-4 h-4" />
                              <span>Follow-up: {format(new Date(note.followUpDate), 'MMM dd, yyyy')}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {note.followUpStatus && (
                        <Badge 
                          variant={note.followUpStatus === 'Open' ? 'default' : 
                                  note.followUpStatus === 'Closed' ? 'secondary' : 'outline'}
                        >
                          {note.followUpStatus}
                        </Badge>
                      )}
                    </div>
                    
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-gray-700 whitespace-pre-wrap">{note.comments}</p>
                    </div>
                    
                    {note.followUpAssignment && (
                      <div className="mt-3 p-2 bg-blue-50 rounded-lg">
                        <p className="text-sm text-blue-700">
                          <strong>Assigned to:</strong> {note.followUpAssignment}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}