'use client';

import { Suspense, useState, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAdmin } from '@/hooks/use-admin';
import { Search, MessageSquare, Bell, Calendar, User, Clock, Filter, RefreshCw, Trash2, CheckCircle2, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { useSearchParams } from 'next/navigation';
import { ToastAction } from '@/components/ui/toast';

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

function ClientNotesContent() {
  const { user, isAdmin, isLoading, isUserLoading } = useAdmin();
  const searchParams = useSearchParams();
  const addNoteRef = useRef<HTMLDivElement | null>(null);
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
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const { toast } = useToast();
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [newNote, setNewNote] = useState({
    comments: '',
    followUpStatus: 'Open',
    followUpDate: ''
  });
  const [createStatus, setCreateStatus] = useState<{ caspio: boolean; firestore: boolean } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClientNote | null>(null);
  const deleteTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const deletedNotesRef = useRef<Map<string, ClientNote>>(new Map());

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

  // Debounced autocomplete search by last name prefix
  useEffect(() => {
    if (!selectedClientId) {
      if (clientSearch.trim().length >= 1) {
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
  const fetchNotesForClient = async (clientId2: string, clientName?: string, forceRefresh: boolean = false) => {
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
      if (forceRefresh) {
        params.append('forceRefresh', 'true');
      }

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
          setSelectedClientName(firstNote.seniorFullName || clientId);
        } else {
          setSelectedClientName(clientId);
        }
        
        if (forceRefresh) {
          toast({
            title: "Success",
            description: "Notes refreshed from Caspio",
          });
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

  const updateNoteStatus = async (note: ClientNote) => {
    const nextStatus = note.followUpStatus === 'Closed' ? 'Open' : 'Closed';
    try {
      const response = await fetch('/api/client-notes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          noteId: note.noteId || note.id,
          clientId2: note.clientId2,
          followUpStatus: nextStatus,
          actorName: user?.displayName || user?.email || 'Admin',
          actorEmail: user?.email || ''
        })
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to update note status');
      }

      setNotesData(prev => {
        if (!prev) return prev;
        const updated = prev.notes.map(existing =>
          existing.id === note.id ? { ...existing, followUpStatus: nextStatus } : existing
        );
        return { ...prev, notes: updated };
      });

      toast({
        title: `Note ${nextStatus === 'Closed' ? 'Closed' : 'Reopened'}`,
        description: `Follow-up status set to ${nextStatus}.`
      });
    } catch (error: any) {
      console.error('Error updating note status:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update note status",
        variant: "destructive",
      });
    }
  };

  const commitDeleteNote = async (note: ClientNote) => {
    try {
      const response = await fetch('/api/client-notes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          noteId: note.noteId || note.id,
          clientId2: note.clientId2,
          actorName: user?.displayName || user?.email || 'Admin',
          actorEmail: user?.email || ''
        })
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to delete note');
      }
      deletedNotesRef.current.delete(note.id);
    } catch (error: any) {
      console.error('Error deleting note:', error);
      deletedNotesRef.current.delete(note.id);
      setNotesData(prev => {
        if (!prev) return prev;
        const restored = [note, ...prev.notes];
        restored.sort((a, b) => new Date(b.timeStamp).getTime() - new Date(a.timeStamp).getTime());
        return { ...prev, notes: restored };
      });
      toast({
        title: "Error",
        description: error.message || "Failed to delete note",
        variant: "destructive",
      });
    }
  };

  const requestDeleteNote = (note: ClientNote) => {
    const pendingId = note.id;
    deletedNotesRef.current.set(pendingId, note);
    setNotesData(prev => {
      if (!prev) return prev;
      return { ...prev, notes: prev.notes.filter(existing => existing.id !== note.id) };
    });

    const timer = setTimeout(() => {
      deleteTimersRef.current.delete(pendingId);
      commitDeleteNote(note);
    }, 5000);
    deleteTimersRef.current.set(pendingId, timer);

    toast({
      title: "Note Deleted",
      description: "You can undo this action for a few seconds.",
      action: (
        <ToastAction
          altText="Undo delete"
          onClick={() => {
            const existingTimer = deleteTimersRef.current.get(pendingId);
            if (existingTimer) {
              clearTimeout(existingTimer);
              deleteTimersRef.current.delete(pendingId);
            }
            const cached = deletedNotesRef.current.get(pendingId);
            if (cached) {
              deletedNotesRef.current.delete(pendingId);
              setNotesData(prev => {
                if (!prev) return prev;
                const restored = [cached, ...prev.notes];
                restored.sort((a, b) => new Date(b.timeStamp).getTime() - new Date(a.timeStamp).getTime());
                return { ...prev, notes: restored };
              });
            }
          }}
        >
          Undo
        </ToastAction>
      )
    });
  };

  const handleAddNote = async () => {
    if (!selectedClientId) {
      toast({
        title: "Select a Client",
        description: "Choose an existing client before adding a note.",
        variant: "destructive",
      });
      return;
    }
    if (!newNote.comments.trim()) {
      toast({
        title: "Missing Note",
        description: "Please enter note details before saving.",
        variant: "destructive",
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
          clientId2: selectedClientId,
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

      setNotesData(prev => {
        if (!prev) return prev;
        const noteId = data.data?.noteId || `local_${Date.now()}`;
        const nextNote: ClientNote = {
          id: noteId,
          noteId,
          clientId2: selectedClientId,
          comments: newNote.comments.trim(),
          timeStamp: new Date().toISOString(),
          followUpDate: newNote.followUpDate || '',
          followUpStatus: newNote.followUpStatus,
          followUpAssignment: '',
          userId: user?.uid,
          userFullName: user?.displayName || user?.email || 'Current User',
          isNew: true
        };
        return {
          ...prev,
          notes: [nextNote, ...prev.notes],
          totalNotes: prev.totalNotes + 1
        };
      });

      setNewNote({ comments: '', followUpStatus: 'Open', followUpDate: '' });
      toast({
        title: "Note Added",
        description: "Client note saved successfully."
      });
    } catch (error: any) {
      console.error('Error creating note:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create note",
        variant: "destructive",
      });
    } finally {
      setIsSavingNote(false);
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

  useEffect(() => {
    if (filteredNotes.length === 0) {
      setSelectedNoteId(null);
      return;
    }
    if (!selectedNoteId || !filteredNotes.some(note => note.id === selectedNoteId)) {
      setSelectedNoteId(filteredNotes[0].id);
    }
  }, [filteredNotes, selectedNoteId]);

  // Add timeout for loading state
  useEffect(() => {
    if (isLoading && !isUserLoading) {
      // If we're stuck loading but user loading is done, there might be an issue
      const timeout = setTimeout(() => {
        console.warn('Authentication check taking longer than expected');
      }, 5000);
      return () => clearTimeout(timeout);
    }
  }, [isLoading, isUserLoading]);

  useEffect(() => {
    const compose = searchParams.get('compose');
    if (compose !== '1') return;
    if (!addNoteRef.current) return;
    addNoteRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [searchParams]);

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Clock className="w-8 h-8 animate-spin text-muted-foreground mx-auto mb-2" />
            <div className="text-lg">
              {isUserLoading ? 'Checking authentication...' : 'Loading...'}
            </div>
            {!isUserLoading && !user && (
              <p className="text-sm text-muted-foreground mt-2">
                Please log in to continue
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="text-lg mb-2">Access Denied</div>
            <p className="text-sm text-muted-foreground">
              {!user ? 'Please log in to view client notes' : 'You do not have permission to view this page'}
            </p>
          </div>
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
            Select a client to view notes synced from Caspio. Notes are automatically updated when you refresh.
          </p>
        </div>
        
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
            Type the first letter(s) of a last name to see matching clients.
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
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={() => fetchNotesForClient(selectedClientId, selectedClientName, true)}
                disabled={loading}
                size="sm"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button variant="outline" onClick={handleClearClient}>
                Change Client
              </Button>
            </div>
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

          {notesData && (
            <div className="flex flex-wrap items-center gap-2 pt-3">
              <Button
                size="sm"
                variant={statusFilter === 'all' ? 'default' : 'outline'}
                onClick={() => setStatusFilter('all')}
              >
                All
              </Button>
              <Button
                size="sm"
                variant={statusFilter === 'new' ? 'default' : 'outline'}
                onClick={() => setStatusFilter('new')}
              >
                New
              </Button>
              <Button
                size="sm"
                variant={statusFilter === 'open' ? 'default' : 'outline'}
                onClick={() => setStatusFilter('open')}
              >
                Open
              </Button>
              <Button
                size="sm"
                variant={statusFilter === 'pending' ? 'default' : 'outline'}
                onClick={() => setStatusFilter('pending')}
              >
                Pending
              </Button>
              <Button
                size="sm"
                variant={statusFilter === 'closed' ? 'default' : 'outline'}
                onClick={() => setStatusFilter('closed')}
              >
                Closed
              </Button>
            </div>
          )}

          {/* Add Note */}
          {selectedClientId && (
            <div ref={addNoteRef} id="add-client-note" className="mt-4 border rounded-lg p-4 bg-muted/30">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-base font-semibold">Add Client Note</h3>
                  <p className="text-sm text-muted-foreground">
                    Notes can only be created for clients that already exist in Caspio.
                  </p>
                </div>
                {createStatus && (
                  <div className="flex items-center gap-3 text-sm">
                    {createStatus.caspio && (
                      <span className="flex items-center gap-1 text-green-600">
                        <CheckCircle2 className="h-4 w-4" />
                        Caspio synced
                      </span>
                    )}
                    {createStatus.firestore && (
                      <span className="flex items-center gap-1 text-green-600">
                        <CheckCircle2 className="h-4 w-4" />
                        Firestore synced
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="client-note-comments">Note</Label>
                  <Textarea
                    id="client-note-comments"
                    rows={4}
                    value={newNote.comments}
                    onChange={(e) => setNewNote(prev => ({ ...prev, comments: e.target.value }))}
                    placeholder="Write the note details..."
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select
                      value={newNote.followUpStatus}
                      onValueChange={(value) => setNewNote(prev => ({ ...prev, followUpStatus: value }))}
                    >
                      <SelectTrigger className="h-9">
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
                    <Label>Follow-up Date (Optional)</Label>
                    <Input
                      type="date"
                      value={newNote.followUpDate}
                      onChange={(e) => setNewNote(prev => ({ ...prev, followUpDate: e.target.value }))}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button onClick={handleAddNote} disabled={isSavingNote}>
                      {isSavingNote ? 'Saving...' : 'Save Note'}
                    </Button>
                  </div>
                </div>
              </div>
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
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4">
              <div className="space-y-1 max-h-[520px] overflow-y-auto pr-1">
                {filteredNotes
                  .sort((a, b) => new Date(b.timeStamp).getTime() - new Date(a.timeStamp).getTime())
                  .map((note) => (
                    <div
                      key={note.id}
                      onClick={() => setSelectedNoteId(note.id)}
                      className={`border-b border-gray-200 py-3 cursor-pointer transition-colors ${
                        selectedNoteId === note.id ? 'bg-primary/5 border-primary' : ''
                      }`}
                    >
                      <div className="flex items-start gap-2 text-sm">
                        <span className="text-muted-foreground min-w-[100px]">
                          {format(new Date(note.timeStamp), 'MMM dd, yyyy HH:mm')}
                        </span>
                        <span className="text-muted-foreground min-w-[120px]">
                          {note.userFullName || 'System'}
                        </span>
                        <span className="flex-1 text-gray-700 line-clamp-2">
                          {note.comments}
                        </span>
                        {note.isNew && (
                          <Badge className="bg-orange-600 text-white text-xs">
                            NEW
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
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
                      </div>
                    </div>
                  ))}
              </div>

              <Card className="sticky top-4 h-fit">
                <CardHeader>
                  <CardTitle>Note Details</CardTitle>
                  <CardDescription>Selected client note details</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {!selectedNoteId ? (
                    <div className="text-muted-foreground">Select a note to view details.</div>
                  ) : (
                    (() => {
                      const note = filteredNotes.find((n) => n.id === selectedNoteId);
                      if (!note) return <div className="text-muted-foreground">Select a note to view details.</div>;
                      return (
                        <>
                          <div className="flex flex-wrap gap-2">
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
                          </div>
                          <div>
                            <p className="font-medium">Note</p>
                            <p className="text-muted-foreground whitespace-pre-wrap">{note.comments}</p>
                          </div>
                          <div className="text-xs text-muted-foreground space-y-1">
                            <div>Created: {format(new Date(note.timeStamp), 'MMM dd, yyyy HH:mm')}</div>
                            <div>By: {note.userFullName || 'System'}</div>
                            {note.followUpDate && (
                              <div>Follow-up: {format(new Date(note.followUpDate), 'MMM dd, yyyy')}</div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground text-xs">
                              {note.followUpStatus === 'Closed' ? 'Closed' : 'Open'}
                            </span>
                            <Switch
                              checked={note.followUpStatus !== 'Closed'}
                              onCheckedChange={() => updateNoteStatus(note)}
                            />
                            <AlertDialog open={deleteTarget?.id === note.id} onOpenChange={(open) => {
                              if (!open) setDeleteTarget(null);
                            }}>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs text-red-600 hover:text-red-700"
                                  onClick={() => setDeleteTarget(note)}
                                >
                                  <Trash2 className="h-3 w-3 mr-1" />
                                  Delete
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete this note?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This removes the note from Caspio and Firestore. You will have a brief chance to undo.
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
                          </div>
                        </>
                      );
                    })()
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function ClientNotesPage() {
  return (
    <Suspense
      fallback={(
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      )}
    >
      <ClientNotesContent />
    </Suspense>
  );
}