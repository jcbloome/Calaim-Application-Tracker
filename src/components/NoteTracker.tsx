'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { 
  MessageSquare, 
  Send, 
  Reply, 
  Bell,
  User,
  Clock,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Plus,
  Filter,
  Search,
  Loader2,
  Pin,
  Archive,
  Star
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/firebase';
import { useGlobalNotifications } from '@/components/NotificationProvider';

interface Note {
  id: string;
  memberId: string;
  memberName: string;
  content: string;
  category: 'General' | 'Medical' | 'Insurance' | 'Discharge Planning' | 'Family Communication' | 'Internal';
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  isPrivate: boolean;
  isPinned: boolean;
  isArchived: boolean;
  authorId: string;
  authorName: string;
  authorRole: string;
  recipientIds: string[];
  recipientNames: string[];
  createdAt: Date;
  updatedAt: Date;
  readBy: Array<{ userId: string; userName: string; readAt: Date }>;
  replies: NoteReply[];
}

interface NoteReply {
  id: string;
  noteId: string;
  content: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  createdAt: Date;
  readBy: Array<{ userId: string; userName: string; readAt: Date }>;
}

interface NoteTrackerProps {
  memberId: string;
  memberName: string;
}

const NOTE_CATEGORIES = [
  'General',
  'Medical',
  'Insurance', 
  'Discharge Planning',
  'Family Communication',
  'Internal'
];

const PRIORITY_COLORS = {
  'Low': 'bg-gray-100 text-gray-800 border-gray-200',
  'Medium': 'bg-blue-100 text-blue-800 border-blue-200',
  'High': 'bg-orange-100 text-orange-800 border-orange-200',
  'Urgent': 'bg-red-100 text-red-800 border-red-200'
};

const CATEGORY_COLORS = {
  'General': 'bg-slate-100 text-slate-800',
  'Medical': 'bg-red-100 text-red-800',
  'Insurance': 'bg-blue-100 text-blue-800',
  'Discharge Planning': 'bg-green-100 text-green-800',
  'Family Communication': 'bg-purple-100 text-purple-800',
  'Internal': 'bg-yellow-100 text-yellow-800'
};

export default function NoteTracker({ memberId, memberName }: NoteTrackerProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [filteredNotes, setFilteredNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showNewNoteForm, setShowNewNoteForm] = useState(false);
  const [staffMembers, setStaffMembers] = useState<Array<{ id: string; name: string; role: string; email: string }>>([]);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [showArchived, setShowArchived] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const { showNotification } = useGlobalNotifications();
  const notesEndRef = useRef<HTMLDivElement>(null);

  // New note form state
  const [newNote, setNewNote] = useState({
    content: '',
    category: 'General' as Note['category'],
    priority: 'Medium' as Note['priority'],
    isPrivate: false,
    recipientIds: [] as string[],
    sendNotification: true
  });

  // Reply form state
  const [replyContent, setReplyContent] = useState('');

  // Load notes
  const loadNotes = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/member-notes?clientId2=${memberId}&includeArchived=${showArchived}`);
      const data = await response.json();
      
      if (data.success && data.notes) {
        const loadedNotes = data.notes.map((note: any) => ({
          ...note,
          createdAt: new Date(note.createdAt || note.timestamp),
          updatedAt: new Date(note.updatedAt || note.timestamp),
          readBy: note.readBy?.map((read: any) => ({
            ...read,
            readAt: new Date(read.readAt)
          })) || [],
          replies: note.replies?.map((reply: any) => ({
            ...reply,
            createdAt: new Date(reply.createdAt),
            readBy: reply.readBy?.map((read: any) => ({
              ...read,
              readAt: new Date(read.readAt)
            })) || []
          })) || []
        }));
        
        setNotes(loadedNotes);
        
        // Mark notes as read for current user
        if (user) {
          markNotesAsRead(loadedNotes.map(n => n.id));
        }
      }
    } catch (error: any) {
      console.error('Error loading notes:', error);
      toast({
        variant: 'destructive',
        title: 'Load Failed',
        description: 'Could not load member notes',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Load staff members
  const loadStaffMembers = async () => {
    try {
      const response = await fetch('/api/staff-members');
      const data = await response.json();
      
      if (data.success && data.staff) {
        setStaffMembers(data.staff);
      }
    } catch (error: any) {
      console.error('Error loading staff:', error);
    }
  };

  // Mark notes as read
  const markNotesAsRead = async (noteIds: string[]) => {
    if (!user || noteIds.length === 0) return;
    
    try {
      // For now, just log this action - implement API route if needed
      console.log('Marking notes as read:', noteIds);
    } catch (error: any) {
      console.error('Error marking notes as read:', error);
    }
  };

  // Save new note
  const saveNote = async () => {
    if (!newNote.content.trim()) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: 'Note content is required',
      });
      return;
    }

    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Authentication Error',
        description: 'You must be logged in to create notes',
      });
      return;
    }

    setIsSaving(true);
    try {
      const noteData = {
        clientId2: memberId,
        memberName,
        noteText: newNote.content,
        category: newNote.category,
        priority: newNote.priority,
        isPrivate: newNote.isPrivate,
        recipientIds: newNote.recipientIds,
        sendNotification: newNote.sendNotification,
        authorId: user.uid,
        authorName: user.displayName || user.email || 'Unknown User'
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
        const createdNote: Note = {
          id: data.note.id || `note-${Date.now()}`,
          memberId,
          memberName,
          content: newNote.content,
          category: newNote.category,
          priority: newNote.priority,
          isPrivate: newNote.isPrivate,
          isPinned: false,
          isArchived: false,
          authorId: user.uid,
          authorName: user.displayName || user.email || 'Unknown User',
          authorRole: 'Admin', // Default role
          recipientIds: newNote.recipientIds,
          recipientNames: [], // Would be populated from staff lookup
          createdAt: new Date(),
          updatedAt: new Date(),
          readBy: [],
          replies: []
        };
        
        setNotes(prev => [createdNote, ...prev]);
        setShowNewNoteForm(false);
        setNewNote({
          content: '',
          category: 'General',
          priority: 'Medium',
          isPrivate: false,
          recipientIds: [],
          sendNotification: true
        });
        
        toast({
          title: 'Note Created',
          description: newNote.sendNotification ? 'Notifications sent to selected staff' : 'Note saved successfully',
          className: 'bg-green-100 text-green-900 border-green-200',
        });

        // Show Windows-style notification
        showNotification({
          type: 'success',
          title: 'Note Created Successfully! 🎯',
          message: `Your ${newNote.category.toLowerCase()} note for ${memberName} has been posted${newNote.sendNotification ? ' and notifications sent to staff' : ''}.`,
          author: user.displayName || user.email || 'You',
          memberName,
          priority: newNote.priority,
          duration: 4000,
          sound: true,
          soundType: 'arrow-target',
          animation: 'bounce'
        });
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Save Failed',
        description: error.message || 'Could not create note',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Save reply
  const saveReply = async (noteId: string) => {
    if (!replyContent.trim() || !user) return;

    try {
      // For now, just add the reply locally - implement API route if needed
      const createdReply: NoteReply = {
        id: `reply-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        noteId,
        content: replyContent,
        authorId: user.uid,
        authorName: user.displayName || user.email || 'Unknown User',
        authorRole: 'Admin', // Default role
        createdAt: new Date(),
        readBy: []
      };
      
      setNotes(prev => prev.map(note => 
        note.id === noteId 
          ? { ...note, replies: [...note.replies, createdReply] }
          : note
      ));
      
      setReplyContent('');
      setReplyingTo(null);
      
      toast({
        title: 'Reply Added',
        description: 'Your reply has been posted',
        className: 'bg-green-100 text-green-900 border-green-200',
      });

      // Show Windows-style notification for reply
      showNotification({
        type: 'note',
        title: 'Reply Posted! 💬',
        message: `Your reply has been added to the conversation for ${memberName}.`,
        author: user.displayName || user.email || 'You',
        memberName,
        duration: 3000,
        sound: true,
        soundType: 'chime',
        animation: 'slide'
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Reply Failed',
        description: error.message || 'Could not post reply',
      });
    }
  };

  // Toggle note pin status
  const togglePin = async (noteId: string, isPinned: boolean) => {
    try {
      // For now, just update locally - implement API route if needed
      setNotes(prev => prev.map(note => 
        note.id === noteId 
          ? { ...note, isPinned: !isPinned }
          : note
      ));
      
      toast({
        title: isPinned ? 'Note Unpinned' : 'Note Pinned',
        description: isPinned ? 'Note removed from pinned' : 'Note pinned to top',
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: 'Could not update note',
      });
    }
  };

  // Filter notes
  useEffect(() => {
    let filtered = notes;

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(note => 
        note.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
        note.authorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        note.replies?.some(reply => reply.content.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    // Category filter
    if (filterCategory !== 'all') {
      filtered = filtered.filter(note => note.category === filterCategory);
    }

    // Priority filter
    if (filterPriority !== 'all') {
      filtered = filtered.filter(note => note.priority === filterPriority);
    }

    // Archive filter
    if (!showArchived) {
      filtered = filtered.filter(note => !note.isArchived);
    }

    // Sort: pinned first, then by creation date
    filtered.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (b.isPinned && !a.isPinned) return 1;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    setFilteredNotes(filtered);
  }, [notes, searchTerm, filterCategory, filterPriority, showArchived]);

  // Scroll to bottom when new notes are added
  useEffect(() => {
    notesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [notes.length]);

  useEffect(() => {
    loadNotes();
    loadStaffMembers();
  }, [memberId, showArchived]);

  const unreadCount = notes.filter(note => 
    !note.readBy?.some(read => read.userId === user?.uid)
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Notes & Communication
              {unreadCount > 0 && (
                <Badge className="bg-red-100 text-red-800 border-red-200">
                  {unreadCount} unread
                </Badge>
              )}
            </h3>
            <p className="text-sm text-muted-foreground">
              Team communication and notes for {memberName}
            </p>
          </div>
        </div>
        <Button
          onClick={() => setShowNewNoteForm(!showNewNoteForm)}
          className="bg-blue-600 hover:bg-blue-700"
        >
          <Plus className="mr-2 h-4 w-4" />
          New Note
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search notes and replies..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {NOTE_CATEGORIES.map((category) => (
                  <SelectItem key={category} value={category}>{category}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={filterPriority} onValueChange={setFilterPriority}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                <SelectItem value="Low">Low</SelectItem>
                <SelectItem value="Medium">Medium</SelectItem>
                <SelectItem value="High">High</SelectItem>
                <SelectItem value="Urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
            
            <div className="flex items-center space-x-2">
              <Checkbox
                id="show-archived"
                checked={showArchived}
                onCheckedChange={setShowArchived}
              />
              <Label htmlFor="show-archived" className="text-sm">Show archived</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* New Note Form */}
      {showNewNoteForm && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Create New Note
            </CardTitle>
            <CardDescription>
              Add a note and notify relevant staff members
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Note Content */}
            <div className="space-y-2">
              <Label htmlFor="note-content">Note Content *</Label>
              <Textarea
                id="note-content"
                placeholder="Enter your note here..."
                value={newNote.content}
                onChange={(e) => setNewNote(prev => ({ ...prev, content: e.target.value }))}
                rows={4}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Category */}
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={newNote.category} onValueChange={(value: Note['category']) => setNewNote(prev => ({ ...prev, category: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NOTE_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>{category}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Priority */}
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={newNote.priority} onValueChange={(value: Note['priority']) => setNewNote(prev => ({ ...prev, priority: value }))}>
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

              {/* Privacy */}
              <div className="space-y-2">
                <Label>Visibility</Label>
                <div className="flex items-center space-x-2 pt-2">
                  <Checkbox
                    id="is-private"
                    checked={newNote.isPrivate}
                    onCheckedChange={(checked) => setNewNote(prev => ({ ...prev, isPrivate: !!checked }))}
                  />
                  <Label htmlFor="is-private" className="text-sm">Private note</Label>
                </div>
              </div>
            </div>

            {/* Recipients */}
            <div className="space-y-2">
              <Label>Notify Staff Members</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-32 overflow-y-auto border rounded p-2">
                {staffMembers.map((staff) => (
                  <div key={staff.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`staff-${staff.id}`}
                      checked={newNote.recipientIds.includes(staff.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setNewNote(prev => ({ ...prev, recipientIds: [...prev.recipientIds, staff.id] }));
                        } else {
                          setNewNote(prev => ({ ...prev, recipientIds: prev.recipientIds.filter(id => id !== staff.id) }));
                        }
                      }}
                    />
                    <Label htmlFor={`staff-${staff.id}`} className="text-xs">
                      {staff.name}
                      {staff.role === 'Super Admin' && <Badge variant="outline" className="ml-1 text-xs">SA</Badge>}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Send Notification */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="send-notification"
                checked={newNote.sendNotification}
                onCheckedChange={(checked) => setNewNote(prev => ({ ...prev, sendNotification: !!checked }))}
              />
              <Label htmlFor="send-notification" className="text-sm">Send email notifications</Label>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button onClick={saveNote} disabled={isSaving}>
                {isSaving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Post Note
              </Button>
              <Button variant="outline" onClick={() => setShowNewNoteForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notes List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            <span>Loading notes...</span>
          </div>
        ) : filteredNotes.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-8 text-muted-foreground">
                <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No notes found for this member</p>
                <Button 
                  onClick={() => setShowNewNoteForm(true)} 
                  variant="outline" 
                  className="mt-4"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create First Note
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          filteredNotes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              currentUserId={user?.uid}
              isReplying={replyingTo === note.id}
              replyContent={replyContent}
              onReplyContentChange={setReplyContent}
              onStartReply={() => setReplyingTo(note.id)}
              onCancelReply={() => {
                setReplyingTo(null);
                setReplyContent('');
              }}
              onSaveReply={() => saveReply(note.id)}
              onTogglePin={() => togglePin(note.id, note.isPinned)}
            />
          ))
        )}
        <div ref={notesEndRef} />
      </div>
    </div>
  );
}

// Note Card Component
interface NoteCardProps {
  note: Note;
  currentUserId?: string;
  isReplying: boolean;
  replyContent: string;
  onReplyContentChange: (content: string) => void;
  onStartReply: () => void;
  onCancelReply: () => void;
  onSaveReply: () => void;
  onTogglePin: () => void;
}

function NoteCard({ 
  note, 
  currentUserId, 
  isReplying, 
  replyContent, 
  onReplyContentChange,
  onStartReply, 
  onCancelReply, 
  onSaveReply,
  onTogglePin 
}: NoteCardProps) {
  const isUnread = currentUserId && !note.readBy.some(read => read.userId === currentUserId);
  const hasUnreadReplies = currentUserId && note.replies.some(reply => 
    !reply.readBy.some(read => read.userId === currentUserId)
  );

  return (
    <Card className={`${isUnread ? 'border-blue-200 bg-blue-50' : ''} ${note.isPinned ? 'border-yellow-200 bg-yellow-50' : ''}`}>
      <CardContent className="pt-6">
        {/* Note Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{note.authorName}</span>
              {note.authorRole === 'Super Admin' && (
                <Badge variant="outline" className="text-xs">Super Admin</Badge>
              )}
            </div>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>{formatDistanceToNow(note.createdAt, { addSuffix: true })}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {note.isPinned && <Pin className="h-4 w-4 text-yellow-600" />}
            {isUnread && <Badge className="bg-blue-100 text-blue-800 text-xs">New</Badge>}
            <Badge className={CATEGORY_COLORS[note.category]}>
              {note.category}
            </Badge>
            <Badge className={PRIORITY_COLORS[note.priority]}>
              {note.priority}
            </Badge>
            {note.isPrivate && (
              <Badge variant="outline" className="text-xs">
                <EyeOff className="mr-1 h-3 w-3" />
                Private
              </Badge>
            )}
          </div>
        </div>

        {/* Note Content */}
        <div className="mb-4">
          <p className="text-sm whitespace-pre-wrap">{note.content}</p>
        </div>

        {/* Recipients */}
        {note.recipientNames && note.recipientNames.length > 0 && (
          <div className="mb-4 text-xs text-muted-foreground">
            <span>Notified: {note.recipientNames.join(', ')}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={onStartReply}>
              <Reply className="mr-1 h-3 w-3" />
              Reply ({note.replies?.length || 0})
            </Button>
            <Button size="sm" variant="outline" onClick={onTogglePin}>
              <Pin className="mr-1 h-3 w-3" />
              {note.isPinned ? 'Unpin' : 'Pin'}
            </Button>
          </div>
          
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {note.readBy && note.readBy.length > 0 && (
              <div className="flex items-center gap-1">
                <Eye className="h-3 w-3" />
                <span>Read by {note.readBy.length}</span>
              </div>
            )}
          </div>
        </div>

        {/* Replies */}
        {note.replies && note.replies.length > 0 && (
          <div className="mt-4 pl-4 border-l-2 border-gray-200 space-y-3">
            {note.replies.map((reply) => (
              <div key={reply.id} className="bg-gray-50 p-3 rounded">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium">{reply.authorName}</span>
                    {reply.authorRole === 'Super Admin' && (
                      <Badge variant="outline" className="text-xs">SA</Badge>
                    )}
                    <span className="text-muted-foreground">
                      {formatDistanceToNow(reply.createdAt, { addSuffix: true })}
                    </span>
                  </div>
                  {currentUserId && !reply.readBy.some(read => read.userId === currentUserId) && (
                    <Badge className="bg-blue-100 text-blue-800 text-xs">New</Badge>
                  )}
                </div>
                <p className="text-sm whitespace-pre-wrap">{reply.content}</p>
              </div>
            ))}
          </div>
        )}

        {/* Reply Form */}
        {isReplying && (
          <div className="mt-4 pl-4 border-l-2 border-blue-200 space-y-3">
            <Textarea
              placeholder="Write your reply..."
              value={replyContent}
              onChange={(e) => onReplyContentChange(e.target.value)}
              rows={3}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={onSaveReply} disabled={!replyContent.trim()}>
                <Send className="mr-1 h-3 w-3" />
                Post Reply
              </Button>
              <Button size="sm" variant="outline" onClick={onCancelReply}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}