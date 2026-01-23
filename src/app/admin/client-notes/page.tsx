'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAdmin } from '@/hooks/use-admin';
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

interface Client {
  clientId2: string;
  seniorFirst: string;
  seniorLast: string;
  seniorFullName: string;
}

export default function ClientNotesPage() {
  const { user, isAdmin } = useAdmin();
  const [notesData, setNotesData] = useState<NotesData | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchingClients, setSearchingClients] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [clientResults, setClientResults] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedClientName, setSelectedClientName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
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

  // Search for clients by last name
  const searchClientsByLastName = async (lastName: string) => {
    if (!lastName || !lastName.trim()) {
      setClientResults([]);
      return;
    }

    try {
      setSearchingClients(true);
      const params = new URLSearchParams();
      params.append('lastName', lastName.trim());

      const response = await fetch(`/api/clients/search?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to search clients');

      const data = await response.json();
      if (data.success) {
        setClientResults(data.data.clients || []);
      } else {
        throw new Error(data.error || 'Failed to search clients');
      }
    } catch (error: any) {
      console.error('Error searching clients:', error);
      setClientResults([]);
    } finally {
      setSearchingClients(false);
    }
  };

  // Debounced autocomplete search with minimum character requirement
  useEffect(() => {
    if (!selectedClientId) {
      // Require at least 2 characters to reduce API calls
      if (clientSearch.trim().length >= 2) {
        const timeoutId = setTimeout(() => {
          searchClientsByLastName(clientSearch.trim());
        }, 500); // 500ms debounce to reduce API calls

        return () => clearTimeout(timeoutId);
      } else if (clientSearch.trim().length === 0) {
        setClientResults([]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientSearch, selectedClientId]);

  // Fetch notes data for a specific client
  const fetchNotesForClient = async (clientId2: string, clientName?: string) => {
    // Ensure clientId2 is a string
    const clientId = String(clientId2 || '').trim();
    
    if (!clientId) {
      toast({
        title: "Error",
        description: "Client ID is required",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('clientId2', clientId);

      const response = await fetch(`/api/client-notes?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch notes');

      const data = await response.json();
      if (data.success) {
        setNotesData(data.data);
        // Use provided name or extract from notes
        if (clientName) {
          setSelectedClientName(clientName);
        } else if (data.data.notes && data.data.notes.length > 0) {
          const firstNote = data.data.notes[0];
          setSelectedClientName(firstNote.seniorFullName || clientId2);
        } else {
          setSelectedClientName(clientId2);
        }
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
      setNotesData(null);
    } finally {
      setLoading(false);
    }
  };

  // Handle client selection from search results
  const handleSelectClient = (client: Client) => {
    setSelectedClientId(client.clientId2);
    setSelectedClientName(client.seniorFullName);
    setClientSearch(client.seniorLast);
    setClientResults([]);
    fetchNotesForClient(client.clientId2, client.seniorFullName);
  };

  // Handle client search/load
  const handleSearchClients = () => {
    if (clientSearch.trim()) {
      searchClientsByLastName(clientSearch.trim());
    }
  };

  // Clear client selection
  const handleClearClient = () => {
    setSelectedClientId('');
    setSelectedClientName('');
    setClientSearch('');
    setClientResults([]);
    setNotesData(null);
    setSearchTerm('');
    setSelectedUser('');
    setStatusFilter('all');
  };

  // Create new note
  const createNote = async () => {
    if (!selectedClientId || !newNote.comments) {
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
        body: JSON.stringify({
          ...newNote,
          clientId2: selectedClientId
        }),
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
        
        // Refresh notes if we have a client selected
        if (selectedClientId) {
          fetchNotesForClient(selectedClientId);
        }
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
        note.comments.toLowerCase().includes(searchTerm.toLowerCase()) ||
        note.userFullName?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesUser = selectedUser === '' || selectedUser === 'all' || note.userId === selectedUser;
      
      const matchesStatus = statusFilter === 'all' || 
        (statusFilter === 'open' && note.followUpStatus === 'Open') ||
        (statusFilter === 'closed' && note.followUpStatus === 'Closed') ||
        (statusFilter === 'pending' && note.followUpStatus === 'Pending') ||
        (statusFilter === 'new' && note.isNew);

      return matchesSearch && matchesUser && matchesStatus;
    });
  }, [notesData, searchTerm, selectedUser, statusFilter]);

  if (!user || !isAdmin) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Checking authentication...</div>
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
            Select a client to view and manage their notes
          </p>
        </div>
        
        {selectedClientId && (
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
                  value={selectedClientId}
                  disabled
                  placeholder={selectedClientId || "Enter Client ID2"}
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
        )}
      </div>

      {/* Client Selection */}
      {!selectedClientId ? (
        <div className="border rounded-lg p-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Type client last name (autocomplete)..."
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              className="pl-10 h-10"
              autoFocus
            />
            {searchingClients && (
              <Clock className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground animate-spin" />
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Type at least 2 characters of a last name to see matching clients (autocomplete)
          </p>

          {/* Client Search Results */}
          {clientResults.length > 0 && (
            <div className="mt-4 border rounded-lg">
              <div className="p-3 bg-gray-50 border-b">
                <p className="text-sm font-medium">
                  Found {clientResults.length} client{clientResults.length !== 1 ? 's' : ''}:
                </p>
              </div>
              <div className="divide-y">
                {clientResults.map((client) => (
                  <button
                    key={client.clientId2}
                    onClick={() => handleSelectClient(client)}
                    className="w-full text-left p-3 hover:bg-gray-50 transition-colors flex items-center justify-between"
                  >
                    <div>
                      <p className="font-medium">{client.seniorFullName}</p>
                      <p className="text-sm text-muted-foreground">ID: {client.clientId2}</p>
                    </div>
                    <span className="ml-2 text-sm text-blue-600">Load Notes →</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Selected Client Header */}
          <div className="flex items-center justify-between border-b pb-3">
            <div className="flex items-center gap-3">
              <div>
                <h2 className="text-xl font-semibold">{selectedClientName || selectedClientId}</h2>
                <p className="text-sm text-muted-foreground">Client ID: {selectedClientId}</p>
              </div>
              {notesData && (
                <div className="flex items-center gap-4 text-sm text-muted-foreground ml-4">
                  <span>Total Notes: <strong className="text-foreground">{notesData.totalNotes}</strong></span>
                  {notesData.newNotes > 0 && (
                    <span className="text-orange-600">
                      New: <strong>{notesData.newNotes}</strong>
                    </span>
                  )}
                </div>
              )}
            </div>
            <Button variant="outline" onClick={handleClearClient}>
              Change Client
            </Button>
          </div>

          {/* Filters */}
          {notesData && (
            <div className="flex flex-wrap items-center gap-3 pb-3 border-b">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search notes..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-9"
                />
              </div>
              
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger className="w-[150px] h-9">
                  <SelectValue placeholder="All staff" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All staff</SelectItem>
                  {notesData.users.map((user) => (
                    <SelectItem key={user.userId} value={user.userId}>
                      {user.userFullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[120px] h-9">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
              
              <Button 
                variant="ghost" 
                size="sm"
                className="h-9"
                onClick={() => {
                  setSearchTerm('');
                  setSelectedUser('');
                  setStatusFilter('all');
                }}
              >
                <Filter className="w-4 h-4 mr-2" />
                Clear
              </Button>
            </div>
          )}

          {/* Notes List */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <Clock className="w-8 h-8 text-muted-foreground mx-auto mb-2 animate-spin" />
                <p className="text-muted-foreground">Loading notes...</p>
              </div>
            </div>
          ) : !notesData ? (
            <div className="text-center py-8">
              <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No notes loaded. Select a client above.</p>
            </div>
          ) : filteredNotes.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No notes found matching your criteria</p>
            </div>
          ) : (
            <div className="space-y-1">
              {/* Single client - just show notes directly */}
              {filteredNotes
                .sort((a, b) => new Date(b.timeStamp).getTime() - new Date(a.timeStamp).getTime())
                .map((note) => (
                  <div key={note.id} className="border-b border-gray-200 py-3">
                    <div className="flex items-start gap-2 text-sm">
                      <span className="text-muted-foreground min-w-[100px]">
                        {format(new Date(note.timeStamp), 'MMM dd, yyyy HH:mm')}
                      </span>
                      <span className="text-muted-foreground min-w-[120px]">
                        {note.userFullName || 'System'}
                      </span>
                      <span className="flex-1 text-gray-700">
                        {note.comments}
                      </span>
                      {note.followUpStatus && (
                        <Badge 
                          variant={note.followUpStatus === 'Open' ? 'default' : 
                                  note.followUpStatus === 'Closed' ? 'secondary' : 'outline'}
                          className="text-xs"
                        >
                          {note.followUpStatus}
                        </Badge>
                      )}
                      {note.followUpAssignment && (
                        <Badge variant="outline" className="text-xs">
                          → {note.followUpAssignment}
                        </Badge>
                      )}
                      {note.isNew && (
                        <Badge className="bg-orange-600 text-white text-xs">
                          NEW
                        </Badge>
                      )}
                    </div>
                    {note.followUpDate && (
                      <div className="ml-[220px] mt-1 text-xs text-muted-foreground">
                        Follow-up: {format(new Date(note.followUpDate), 'MMM dd, yyyy')}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}