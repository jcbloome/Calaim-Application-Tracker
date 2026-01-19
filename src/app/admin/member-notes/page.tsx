'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { 
  Search, 
  FileText, 
  Bell, 
  Plus, 
  Eye, 
  Edit, 
  Trash2,
  Clock,
  User,
  AlertCircle,
  CheckCircle,
  Loader2,
  Download,
  Upload,
  Filter,
  Calendar,
  MessageSquare
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAdmin } from '@/hooks/use-admin';
import { format } from 'date-fns';

interface Member {
  clientId2: string;
  firstName: string;
  lastName: string;
  healthPlan: string;
  status: string;
  rcfeName?: string;
  lastNoteDate?: string;
  noteCount: number;
}

interface MemberNote {
  id: string;
  clientId2: string;
  memberName: string;
  noteText: string;
  noteType: 'General' | 'Medical' | 'Social' | 'Administrative' | 'Follow-up' | 'Emergency';
  createdBy: string;
  createdByName: string;
  assignedTo?: string;
  assignedToName?: string;
  createdAt: string;
  updatedAt: string;
  source: 'Caspio' | 'App' | 'Admin';
  isRead: boolean;
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  followUpDate?: string;
  tags?: string[];
}

export default function MemberNotesPage() {
  const { toast } = useToast();
  const { user, isAdmin } = useAdmin();

  // State management
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [memberNotes, setMemberNotes] = useState<MemberNote[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isNotesLoading, setIsNotesLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [noteFilter, setNoteFilter] = useState({
    type: 'all',
    priority: 'all',
    assignedTo: 'all',
    source: 'all'
  });

  // New note dialog state
  const [isNewNoteDialogOpen, setIsNewNoteDialogOpen] = useState(false);
  const [newNote, setNewNote] = useState({
    noteText: '',
    noteType: 'General' as MemberNote['noteType'],
    assignedTo: '',
    assignedToName: '',
    priority: 'Medium' as MemberNote['priority'],
    followUpDate: '',
    tags: [] as string[]
  });

  // Fetch members from Caspio API with search
  const fetchMembers = useCallback(async (search: string = '') => {
    // Only search if there's a search term (don't load all members by default)
    if (!search.trim()) {
      setMembers([]);
      return;
    }

    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('search', search.trim());
      params.append('limit', '20'); // Reduced limit for faster searches
      
      const response = await fetch(`/api/members?${params.toString()}`);
      const data = await response.json();
      
      if (data.success) {
        setMembers(data.members);
        console.log(`✅ Found ${data.members.length} CalAIM members matching "${search}"`);
      } else {
        console.error('❌ Failed to search members:', data.error);
        toast({
          title: "Search Error",
          description: data.error || "Failed to search CalAIM members",
          variant: "destructive"
        });
        setMembers([]);
      }
    } catch (error) {
      console.error('❌ Error searching members:', error);
      toast({
        title: "Connection Error",
        description: "Unable to connect to Caspio. Please check your connection.",
        variant: "destructive"
      });
      setMembers([]);
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  // Don't load members on mount - only when searching
  // Search members when search term changes (with debounce)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchMembers(searchTerm);
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [searchTerm, fetchMembers]);

  // Since we're doing server-side search, we don't need client-side filtering
  const filteredMembers = members;

  const handleMemberSelect = (member: Member) => {
    setSelectedMember(member);
    setMemberNotes([]); // Clear notes when selecting a new member
  };

  const handleRequestNotes = async (member: Member) => {
    setIsNotesLoading(true);
    
    try {
      const response = await fetch(`/api/member-notes?clientId2=${member.clientId2}&forceSync=true`);
      const data = await response.json();
      
      if (data.success) {
        setMemberNotes(data.notes);
        
        const syncType = data.isFirstSync ? 'imported from Caspio' : 
                        data.newNotesCount > 0 ? `synced ${data.newNotesCount} new notes` : 
                        'already up to date';
        
        toast({
          title: "Notes Loaded",
          description: `${data.notes.length} notes for ${member.firstName} ${member.lastName} - ${syncType}`,
        });
      } else {
        throw new Error(data.error || 'Failed to load notes');
      }
      
    } catch (error: any) {
      console.error('Error loading member notes:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to load member notes",
        variant: "destructive"
      });
    } finally {
      setIsNotesLoading(false);
    }
  };

  const handleCreateNote = async () => {
    if (!selectedMember || !newNote.noteText.trim()) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    try {
      const noteData = {
        clientId2: selectedMember.clientId2,
        memberName: `${selectedMember.firstName} ${selectedMember.lastName}`,
        noteText: newNote.noteText,
        noteType: newNote.noteType,
        priority: newNote.priority,
        assignedTo: newNote.assignedTo || undefined,
        assignedToName: newNote.assignedToName || undefined,
        followUpDate: newNote.followUpDate || undefined,
        createdBy: user?.uid || 'current-user',
        createdByName: user?.displayName || user?.email || 'Current User',
        tags: newNote.tags
      };

      const response = await fetch('/api/member-notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(noteData),
      });

      const data = await response.json();

      if (data.success) {
        setMemberNotes(prev => [data.note, ...prev]);
        setIsNewNoteDialogOpen(false);
        setNewNote({
          noteText: '',
          noteType: 'General',
          assignedTo: '',
          assignedToName: '',
          priority: 'Medium',
          followUpDate: '',
          tags: []
        });

        toast({
          title: "Note Created",
          description: "New note has been added and synced to Caspio",
        });

        // If note is assigned to someone, show notification
        if (newNote.assignedTo) {
          toast({
            title: "Notification Sent",
            description: `${newNote.assignedToName} has been notified of the new note`,
          });
        }
      } else {
        throw new Error(data.error || 'Failed to create note');
      }

    } catch (error: any) {
      console.error('Error creating note:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create note",
        variant: "destructive"
      });
    }
  };

  const filteredNotes = memberNotes.filter(note => {
    if (noteFilter.type !== 'all' && note.noteType !== noteFilter.type) return false;
    if (noteFilter.priority !== 'all' && note.priority !== noteFilter.priority) return false;
    if (noteFilter.assignedTo !== 'all' && note.assignedTo !== noteFilter.assignedTo) return false;
    if (noteFilter.source !== 'all' && note.source !== noteFilter.source) return false;
    return true;
  });

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'Urgent': return 'bg-red-100 text-red-800 border-red-200';
      case 'High': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'Medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getSourceColor = (source: string) => {
    switch (source) {
      case 'Caspio': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'App': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'Admin': return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MessageSquare className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Member Notes Lookup</h1>
            <p className="text-muted-foreground">
              Search and manage notes for CalAIM members across all health plans
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Member Search Panel */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Member Search
            </CardTitle>
            <CardDescription>
              Search for members to view their notes
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="search">Search CalAIM Members</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Search CalAIM members by name, Client ID, or RCFE name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
                {isLoading && (
                  <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {searchTerm.trim() ? 
                  `Searching Caspio for "${searchTerm}"...` : 
                  'Enter search terms to find CalAIM members from Caspio database'
                }
              </p>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  <span className="text-muted-foreground">Loading CalAIM members from Caspio...</span>
                </div>
              ) : filteredMembers.length > 0 ? (
                filteredMembers.map((member) => (
                  <div
                    key={member.clientId2}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors hover:bg-gray-50 ${
                      selectedMember?.clientId2 === member.clientId2 ? 'border-primary bg-primary/5' : ''
                    }`}
                    onClick={() => handleMemberSelect(member)}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium">{member.firstName} {member.lastName}</p>
                        <p className="text-sm text-muted-foreground">{member.clientId2}</p>
                        {member.rcfeName && (
                          <p className="text-xs text-muted-foreground">{member.rcfeName}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <Badge variant="outline" className={
                          member.healthPlan === 'Kaiser' ? 'bg-green-50 text-green-700 border-green-200' :
                          member.healthPlan === 'Health Net' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                          'bg-gray-50 text-gray-700 border-gray-200'
                        }>
                          {member.healthPlan}
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-1">
                          Status: {member.status}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    {searchTerm.trim() ? 
                      `No CalAIM members found for "${searchTerm}"` : 
                      'Enter a search term to find CalAIM members'
                    }
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Search by member name, Client ID, or RCFE name
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Notes Panel */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  {selectedMember ? `Notes for ${selectedMember.firstName} ${selectedMember.lastName}` : 'Select a Member'}
                </CardTitle>
                <CardDescription>
                  {selectedMember ? `Client ID: ${selectedMember.clientId2}` : 'Choose a member from the list to view their notes'}
                </CardDescription>
              </div>
              {selectedMember && (
                <Dialog open={isNewNoteDialogOpen} onOpenChange={setIsNewNoteDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Note
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Add New Note</DialogTitle>
                      <DialogDescription>
                        Create a new note for {selectedMember.firstName} {selectedMember.lastName}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="noteType">Note Type</Label>
                          <Select value={newNote.noteType} onValueChange={(value: MemberNote['noteType']) => setNewNote(prev => ({ ...prev, noteType: value }))}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="General">General</SelectItem>
                              <SelectItem value="Medical">Medical</SelectItem>
                              <SelectItem value="Social">Social</SelectItem>
                              <SelectItem value="Administrative">Administrative</SelectItem>
                              <SelectItem value="Follow-up">Follow-up</SelectItem>
                              <SelectItem value="Emergency">Emergency</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="priority">Priority</Label>
                          <Select value={newNote.priority} onValueChange={(value: MemberNote['priority']) => setNewNote(prev => ({ ...prev, priority: value }))}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Low">Low</SelectItem>
                              <SelectItem value="Medium">Medium</SelectItem>
                              <SelectItem value="High">High</SelectItem>
                              <SelectItem value="Urgent">Urgent</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="noteText">Note Content</Label>
                        <Textarea
                          id="noteText"
                          value={newNote.noteText}
                          onChange={(e) => setNewNote(prev => ({ ...prev, noteText: e.target.value }))}
                          placeholder="Enter note content..."
                          rows={4}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="assignedToName">Assign to Staff (Optional)</Label>
                          <Input
                            id="assignedToName"
                            value={newNote.assignedToName}
                            onChange={(e) => setNewNote(prev => ({ ...prev, assignedToName: e.target.value }))}
                            placeholder="Staff member name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="followUpDate">Follow-up Date (Optional)</Label>
                          <Input
                            id="followUpDate"
                            type="date"
                            value={newNote.followUpDate}
                            onChange={(e) => setNewNote(prev => ({ ...prev, followUpDate: e.target.value }))}
                          />
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsNewNoteDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleCreateNote}>
                        Create Note
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!selectedMember ? (
              <div className="text-center py-12">
                <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No Member Selected</h3>
                <p className="text-muted-foreground">
                  Select a member from the list to view their notes
                </p>
              </div>
            ) : isNotesLoading ? (
              <div className="text-center py-12">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                <p className="text-muted-foreground">Loading notes...</p>
              </div>
            ) : memberNotes.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No Notes Loaded</h3>
                <p className="text-muted-foreground mb-6">
                  Click "Request Notes" to load notes for {selectedMember.firstName} {selectedMember.lastName}
                </p>
                <Button 
                  onClick={() => handleRequestNotes(selectedMember)}
                  disabled={isNotesLoading}
                  size="lg"
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {isNotesLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading Notes...
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Request Notes
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Refresh Notes Button */}
                <div className="flex justify-between items-center">
                  <div className="text-sm text-muted-foreground">
                    Showing {memberNotes.length} notes for {selectedMember.firstName} {selectedMember.lastName}
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleRequestNotes(selectedMember)}
                    disabled={isNotesLoading}
                  >
                    {isNotesLoading ? (
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    ) : (
                      <Download className="mr-2 h-3 w-3" />
                    )}
                    Sync Notes
                  </Button>
                </div>

                {/* Note Filters */}
                <div className="flex gap-4 p-4 bg-gray-50 rounded-lg">
                  <Select value={noteFilter.type} onValueChange={(value) => setNoteFilter(prev => ({ ...prev, type: value }))}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="General">General</SelectItem>
                      <SelectItem value="Medical">Medical</SelectItem>
                      <SelectItem value="Social">Social</SelectItem>
                      <SelectItem value="Administrative">Administrative</SelectItem>
                      <SelectItem value="Follow-up">Follow-up</SelectItem>
                      <SelectItem value="Emergency">Emergency</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <Select value={noteFilter.priority} onValueChange={(value) => setNoteFilter(prev => ({ ...prev, priority: value }))}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Priority</SelectItem>
                      <SelectItem value="Urgent">Urgent</SelectItem>
                      <SelectItem value="High">High</SelectItem>
                      <SelectItem value="Medium">Medium</SelectItem>
                      <SelectItem value="Low">Low</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={noteFilter.source} onValueChange={(value) => setNoteFilter(prev => ({ ...prev, source: value }))}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sources</SelectItem>
                      <SelectItem value="Caspio">Caspio</SelectItem>
                      <SelectItem value="App">App</SelectItem>
                      <SelectItem value="Admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Notes List */}
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {filteredNotes.map((note) => (
                    <div key={note.id} className={`p-4 border rounded-lg ${!note.isRead ? 'border-blue-200 bg-blue-50' : ''}`}>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex gap-2">
                          <Badge variant="outline" className={getPriorityColor(note.priority)}>
                            {note.priority}
                          </Badge>
                          <Badge variant="outline">
                            {note.noteType}
                          </Badge>
                          <Badge variant="outline" className={getSourceColor(note.source)}>
                            {note.source}
                          </Badge>
                          {!note.isRead && (
                            <Badge className="bg-blue-600">
                              <Bell className="h-3 w-3 mr-1" />
                              New
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {format(new Date(note.createdAt), 'MMM d, yyyy h:mm a')}
                        </div>
                      </div>
                      
                      <p className="text-sm mb-3">{note.noteText}</p>
                      
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <div>
                          <span className="font-medium">By:</span> {note.createdByName}
                          {note.assignedToName && (
                            <>
                              <span className="mx-2">•</span>
                              <span className="font-medium">Assigned to:</span> {note.assignedToName}
                            </>
                          )}
                        </div>
                        {note.followUpDate && (
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Follow-up: {format(new Date(note.followUpDate), 'MMM d, yyyy')}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  
                  {filteredNotes.length === 0 && (
                    <div className="text-center py-8">
                      <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-medium mb-2">No Notes Found</h3>
                      <p className="text-muted-foreground">
                        No notes match the current filters
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}