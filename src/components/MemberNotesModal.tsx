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
import { Search, Plus, MessageSquare, Calendar, User, Clock, Send } from 'lucide-react';
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
  const [searchTerm, setSearchTerm] = useState('');
  const [showNewNoteForm, setShowNewNoteForm] = useState(false);
  const [newNote, setNewNote] = useState({
    clientId2: clientId2 || '',
    comments: '',
    followUpDate: '',
    followUpAssignment: '',
    followUpStatus: 'Open'
  });
  const { toast } = useToast();

  // Fetch notes for specific member
  const fetchMemberNotes = async (memberClientId2: string) => {
    if (!memberClientId2) return;
    
    try {
      setLoading(true);
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
        
        // Reset form
        setNewNote({
          clientId2: newNote.clientId2,
          comments: '',
          followUpDate: '',
          followUpAssignment: '',
          followUpStatus: 'Open'
        });
        setShowNewNoteForm(false);
        
        // Refresh notes
        await fetchMemberNotes(newNote.clientId2);
        
        // Send notification if assigned to staff
        if (newNote.followUpAssignment) {
          // This would trigger the notification system
          console.log('Sending notification to:', newNote.followUpAssignment);
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
                <Button onClick={searchMember} disabled={loading}>
                  <Search className="w-4 h-4 mr-2" />
                  Search
                </Button>
              </div>
            </div>
            
            {notes.length > 0 && (
              <div className="flex items-end">
                <Button
                  onClick={() => setShowNewNoteForm(!showNewNoteForm)}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  New Note
                </Button>
              </div>
            )}
          </div>

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