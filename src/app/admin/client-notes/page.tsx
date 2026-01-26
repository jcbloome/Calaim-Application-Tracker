'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAdmin } from '@/hooks/use-admin';
import { Search, MessageSquare, Bell, Calendar, User, Clock, Filter, RefreshCw } from 'lucide-react';
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
  const { user, isAdmin, isLoading, isUserLoading } = useAdmin();
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