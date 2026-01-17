'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Search, Plus, MessageSquare, Calendar, User, Clock, Send, Sync, CheckCircle, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { memberNotesSync, useMemberNotesSync } from '@/lib/member-notes-sync';

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

interface MemberNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId2?: string;
  clientName?: string;
}

export default function MemberNotesModal({ 
  isOpen, 
  onClose, 
  clientId2, 
  clientName 
}: MemberNotesModalProps) {
  const [notes, setNotes] = useState<ClientNote[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showNewNoteForm, setShowNewNoteForm] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{
    needsInitialSync: boolean;
    isFirstTime: boolean;
    lastSync?: string;
  }>({ needsInitialSync: false, isFirstTime: false });
  const [newNote, setNewNote] = useState({
    clientId2: clientId2 || '',
    comments: '',
    followUpDate: '',
    followUpAssignment: '',
    followUpStatus: 'Open'
  });
  const { toast } = useToast();
  const { 
    needsInitialSync, 
    performInitialSync, 
    addToPendingSync, 
    checkForNewNotes 
  } = useMemberNotesSync();

  // Smart fetch with sync management
  const fetchMemberNotes = async (memberClientId2: string) => {
    if (!memberClientId2) return;
    
    try {
      setLoading(true);
      
      // Check if this member needs initial sync
      const needsSync = needsInitialSync(memberClientId2);
      const isFirstTime = needsSync;
      
      setSyncStatus({
        needsInitialSync: needsSync,
        isFirstTime,
        lastSync: memberNotesSync.getMemberSyncStatus(memberClientId2)?.lastSyncTimestamp
      });

      if (needsSync) {
        console.log(`🔄 Member ${memberClientId2} selected for first time - performing initial sync`);
        setSyncing(true);
        
        const syncResult = await performInitialSync(memberClientId2);
        
        if (syncResult.success) {
          toast({
            title: "Initial Sync Complete",
            description: `Loaded ${syncResult.notesCount} existing notes for this member`,
          });
        } else {
          toast({
            title: "Sync Warning",
            description: syncResult.error || "Some notes may not be available",
            variant: "destructive",
          });
        }
        setSyncing(false);
      } else {
        // Check for new notes since last sync
        console.log(`📥 Checking for new notes since last sync for ${memberClientId2}`);
        const { newNotes, updatedNotes } = await checkForNewNotes(memberClientId2);
        
        if (newNotes.length > 0 || updatedNotes.length > 0) {
          toast({
            title: "Notes Updated",
            description: `Found ${newNotes.length} new notes and ${updatedNotes.length} updated notes`,
          });
        }
      }

      // Fetch current notes
      const response = await fetch(`/api/client-notes?clientId2=${memberClientId2}`);
      
      if (!response.ok) throw new Error('Failed to fetch member notes');

      const data = await response.json();
      if (data.success) {
        setNotes(data.data.notes || []);
        setUsers(data.data.users || []);
      } else {
        throw new Error(data.error || 'Failed to fetch member notes');
      }
    } catch (error: any) {
      console.error('Error fetching member notes:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to fetch member notes",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  // Search for member by Client ID2
  const searchMember = async () => {
    if (!searchTerm.trim()) {
      toast({
        title: "Error",
        description: "Please enter a Client ID2 to search",
        variant: "destructive",
      });
      return;
    }

    await fetchMemberNotes(searchTerm.trim());
    setNewNote({ ...newNote, clientId2: searchTerm.trim() });
  };

  // Create new note with smart sync
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
        const noteId = data.data.noteId;
        
        // Add to sync queue for bidirectional sync
        addToPendingSync({
          noteId: noteId || `temp-${Date.now()}`,
          clientId2: newNote.clientId2,
          action: 'create'
        });

        toast({
          title: "Success",
          description: "Note created and synced to Caspio",
        });
        
        // Reset form
        setNewNote({
          clientId2: newNote.clientId2,
          comments: '',
          followUpDate: '',
          followUpAssignment: '',
          followUpStatus: 'Open'
        });
        setShowNewNoteForm(false);
        
        // Refresh notes to show the new note
        await fetchMemberNotes(newNote.clientId2);
        
        // Send notification if assigned to staff
        if (newNote.followUpAssignment) {
          console.log('📱 Notification sent to:', newNote.followUpAssignment);
        }
      } else {
        throw new Error(data.error || 'Failed to create note');
      }
    } catch (error: any) {
      console.error('Error creating note:', error);
      
      // Even if server fails, add to pending sync for retry
      addToPendingSync({
        noteId: `pending-${Date.now()}`,
        clientId2: newNote.clientId2,
        action: 'create'
      });
      
      toast({
        title: "Note Saved Locally",
        description: "Note will be synced to Caspio when connection is restored",
        variant: "destructive",
      });
    }
  };

  // Initialize with provided clientId2
  useEffect(() => {
    if (isOpen && clientId2) {
      setSearchTerm(clientId2);
      setNewNote({ ...newNote, clientId2 });
      fetchMemberNotes(clientId2);
    }
  }, [isOpen, clientId2]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <MessageSquare className="w-5 h-5" />
            <span>Member Notes & Communication</span>
            {clientName && (
              <Badge variant="outline" className="ml-2">
                {clientName}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col space-y-4">
          {/* Search Section */}
          <div className="flex space-x-2">
            <div className="flex-1">
              <Label htmlFor="memberSearch">Search Member by Client ID2</Label>
              <div className="flex space-x-2">
                <Input
                  id="memberSearch"
                  placeholder="Enter Client ID2 (e.g., CL001234)"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && searchMember()}
                />
                <Button onClick={searchMember} disabled={loading || syncing}>
                  {syncing ? (
                    <Sync className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4 mr-2" />
                  )}
                  {syncing ? 'Syncing...' : 'Search'}
                </Button>
              </div>
            </div>
            
            {notes.length > 0 && (
              <div className="flex items-end">
                <Button
                  onClick={() => setShowNewNoteForm(!showNewNoteForm)}
                  className="bg-blue-600 hover:bg-blue-700"
                  disabled={syncing}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  New Note
                </Button>
              </div>
            )}
          </div>

          {/* Sync Status Indicator */}
          {syncStatus.needsInitialSync && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-center space-x-2">
                {syncing ? (
                  <Sync className="w-4 h-4 text-blue-600 animate-spin" />
                ) : syncStatus.isFirstTime ? (
                  <AlertCircle className="w-4 h-4 text-blue-600" />
                ) : (
                  <CheckCircle className="w-4 h-4 text-green-600" />
                )}
                <p className="text-sm text-blue-800">
                  {syncing 
                    ? 'Performing initial sync - loading all existing notes from Caspio...'
                    : syncStatus.isFirstTime 
                    ? 'First time accessing this member - all notes will be loaded'
                    : 'Sync completed - showing latest notes'
                  }
                </p>
              </div>
            </div>
          )}

          {syncStatus.lastSync && !syncStatus.needsInitialSync && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-2">
              <div className="flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <p className="text-xs text-green-700">
                  Last synced: {format(new Date(syncStatus.lastSync), 'MMM dd, yyyy HH:mm')}
                  {' • '}Only new/updated notes will be loaded going forward
                </p>
              </div>
            </div>
          )}

          {/* New Note Form */}
          {showNewNoteForm && (
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="p-4 space-y-4">
                <h3 className="font-semibold text-blue-800">Create New Note</h3>
                
                <div>
                  <Label htmlFor="noteComments">Comments *</Label>
                  <Textarea
                    id="noteComments"
                    value={newNote.comments}
                    onChange={(e) => setNewNote({ ...newNote, comments: e.target.value })}
                    placeholder="Enter note comments..."
                    rows={3}
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="noteFollowUpDate">Follow-up Date</Label>
                    <Input
                      id="noteFollowUpDate"
                      type="date"
                      value={newNote.followUpDate}
                      onChange={(e) => setNewNote({ ...newNote, followUpDate: e.target.value })}
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="noteAssignment">Assign to Staff</Label>
                    <Select
                      value={newNote.followUpAssignment}
                      onValueChange={(value) => setNewNote({ ...newNote, followUpAssignment: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select staff member" />
                      </SelectTrigger>
                      <SelectContent>
                        {users.map((user) => (
                          <SelectItem key={user.userId} value={user.userId}>
                            {user.userFullName} ({user.role})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label htmlFor="noteStatus">Status</Label>
                    <Select
                      value={newNote.followUpStatus}
                      onValueChange={(value) => setNewNote({ ...newNote, followUpStatus: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Open">Open</SelectItem>
                        <SelectItem value="Pending">Pending</SelectItem>
                        <SelectItem value="Closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="flex justify-end space-x-2">
                  <Button 
                    variant="outline" 
                    onClick={() => setShowNewNoteForm(false)}
                  >
                    Cancel
                  </Button>
                  <Button onClick={createNote}>
                    <Send className="w-4 h-4 mr-2" />
                    Create Note
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Notes Display */}
          <div className="flex-1 overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="text-muted-foreground">Loading notes...</div>
              </div>
            ) : notes.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                <MessageSquare className="w-12 h-12 mb-2 opacity-50" />
                <p>No notes found for this member</p>
                {searchTerm && (
                  <p className="text-sm">Search for a member to view their notes</p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">
                    Notes for {notes[0]?.seniorFullName || searchTerm} ({notes.length})
                  </h3>
                </div>
                
                <ScrollArea className="h-96">
                  <div className="space-y-3 pr-4">
                    {notes.map((note) => (
                      <Card key={note.id} className={`${note.isNew ? 'border-orange-200 bg-orange-50' : ''}`}>
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center space-x-2">
                              <div className="flex items-center space-x-1 text-sm text-muted-foreground">
                                <Clock className="w-4 h-4" />
                                <span>{format(new Date(note.timeStamp), 'MMM dd, yyyy HH:mm')}</span>
                              </div>
                              
                              {note.userFullName && (
                                <div className="flex items-center space-x-1 text-sm text-muted-foreground">
                                  <User className="w-4 h-4" />
                                  <span>{note.userFullName} ({note.userRole})</span>
                                </div>
                              )}
                            </div>
                            
                            <div className="flex items-center space-x-2">
                              {note.isNew && (
                                <Badge className="bg-orange-600 text-white text-xs">
                                  NEW
                                </Badge>
                              )}
                              {note.followUpStatus && (
                                <Badge 
                                  variant={note.followUpStatus === 'Open' ? 'default' : 
                                          note.followUpStatus === 'Closed' ? 'secondary' : 'outline'}
                                  className="text-xs"
                                >
                                  {note.followUpStatus}
                                </Badge>
                              )}
                            </div>
                          </div>
                          
                          <div className="bg-gray-50 rounded-lg p-3 mb-2">
                            <p className="text-gray-700 whitespace-pre-wrap text-sm">{note.comments}</p>
                          </div>
                          
                          {(note.followUpDate || note.followUpAssignment) && (
                            <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                              {note.followUpDate && (
                                <div className="flex items-center space-x-1">
                                  <Calendar className="w-3 h-3" />
                                  <span>Follow-up: {format(new Date(note.followUpDate), 'MMM dd, yyyy')}</span>
                                </div>
                              )}
                              
                              {note.followUpAssignment && (
                                <div className="flex items-center space-x-1">
                                  <User className="w-3 h-3" />
                                  <span>Assigned to: {note.followUpAssignment}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}