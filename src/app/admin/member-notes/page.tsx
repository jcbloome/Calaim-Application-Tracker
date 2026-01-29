'use client';

import React, { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { Progress } from '@/components/ui/progress';
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
import { useSearchParams } from 'next/navigation';
import { ToastAction } from '@/components/ui/toast';

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
  status?: 'Open' | 'Closed';
  followUpDate?: string;
  tags?: string[];
}

function MemberNotesPageContent() {
  const { toast } = useToast();
  const { user, isAdmin } = useAdmin();
  const searchParams = useSearchParams();
  const preselectId = searchParams.get('clientId2') || searchParams.get('memberId') || '';
  const autoSelectRef = useRef(false);

  // State management
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [memberNotes, setMemberNotes] = useState<MemberNote[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isNotesLoading, setIsNotesLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Real-time sync status
  const [syncProgress, setSyncProgress] = useState({
    isSync: false,
    progress: 0,
    stage: 'idle' as 'idle' | 'fetching-regular' | 'fetching-ils' | 'saving' | 'complete',
    message: '',
    notesFound: { regular: 0, ils: 0, total: 0 }
  });
  const [noteFilter, setNoteFilter] = useState({
    type: 'all',
    priority: 'all',
    assignedTo: 'all',
    source: 'all',
    status: 'all'
  });

  // ILS permissions state
  const [hasILSPermission, setHasILSPermission] = useState(false);
  const [isCheckingILSPermission, setIsCheckingILSPermission] = useState(false);

  // New note dialog state
  const [isNewNoteDialogOpen, setIsNewNoteDialogOpen] = useState(false);
  const [newNote, setNewNote] = useState({
    noteText: '',
    assignedTo: '',
    assignedToName: '',
    priority: 'Medium' as MemberNote['priority'],
    status: 'Open' as MemberNote['status'],
    followUpDate: '',
    tags: [] as string[]
  });

  // Staff list for dropdown
  const [staffList, setStaffList] = useState<Array<{uid: string, name: string, email: string}>>([]);
  const [isLoadingStaff, setIsLoadingStaff] = useState(false);

  // Health monitoring
  const [healthStatus, setHealthStatus] = useState<any>(null);
  const [showHealthDetails, setShowHealthDetails] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MemberNote | null>(null);
  const deleteTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const deletedNotesRef = useRef<Map<string, MemberNote>>(new Map());

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

  // Load staff members for assignment dropdown
  const loadStaffMembers = useCallback(async () => {
    setIsLoadingStaff(true);
    try {
      const response = await fetch('/api/staff-members?includeFirebaseAdmins=true&includeCaspioStaff=true');
      const data = await response.json();
      
      if (data.success) {
        setStaffList(data.staff || []);
      }
    } catch (error) {
      console.error('Error loading staff members:', error);
    } finally {
      setIsLoadingStaff(false);
    }
  }, []);

  // Load health status
  const loadHealthStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/member-notes/health');
      const data = await response.json();
      
      if (data.success) {
        setHealthStatus(data.health);
      }
    } catch (error) {
      console.error('Error loading health status:', error);
    }
  }, []);

  // Check ILS permissions on mount
  useEffect(() => {
    const checkILSPermissions = async () => {
      if (!user?.uid) return;
      
      setIsCheckingILSPermission(true);
      try {
        const response = await fetch(`/api/admin/ils-permissions?userId=${user.uid}`);
        const data = await response.json();
        
        if (data.success) {
          setHasILSPermission(data.hasILSPermission);
        }
      } catch (error) {
        console.error('Error checking ILS permissions:', error);
      } finally {
        setIsCheckingILSPermission(false);
      }
    };

    checkILSPermissions();
    loadStaffMembers();
    loadHealthStatus();
  }, [user?.uid, loadStaffMembers, loadHealthStatus]);

  // Don't load members on mount - only when searching
  // Search members when search term changes (with debounce)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchMembers(searchTerm);
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [searchTerm, fetchMembers]);

  useEffect(() => {
    if (!preselectId || searchTerm) return;
    setSearchTerm(preselectId);
  }, [preselectId, searchTerm]);

  // Since we're doing server-side search, we don't need client-side filtering
  const filteredMembers = members;

  useEffect(() => {
    if (!preselectId || autoSelectRef.current || filteredMembers.length === 0) return;
    const match = filteredMembers.find(
      (member) => String(member.clientId2).trim() === String(preselectId).trim()
    );
    if (!match) return;
    autoSelectRef.current = true;
    handleMemberSelect(match);
    handleRequestNotes(match);
  }, [filteredMembers, preselectId]);

  const handleMemberSelect = (member: Member) => {
    setSelectedMember(member);
    setMemberNotes([]); // Clear notes when selecting a new member
  };

  const handleRequestNotes = async (member: Member) => {
    setIsNotesLoading(true);
    setSyncProgress({
      isSync: true,
      progress: 0,
      stage: 'fetching-regular',
      message: 'Fetching regular notes from Caspio...',
      notesFound: { regular: 0, ils: 0, total: 0 }
    });
    
    try {
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setSyncProgress(prev => {
          if (prev.stage === 'fetching-regular' && prev.progress < 30) {
            return { ...prev, progress: prev.progress + 10 };
          } else if (prev.stage === 'fetching-regular' && prev.progress >= 30) {
            return { 
              ...prev, 
              stage: 'fetching-ils', 
              progress: 40,
              message: 'Fetching ILS notes from Caspio...'
            };
          } else if (prev.stage === 'fetching-ils' && prev.progress < 70) {
            return { ...prev, progress: prev.progress + 10 };
          } else if (prev.stage === 'fetching-ils' && prev.progress >= 70) {
            return { 
              ...prev, 
              stage: 'saving', 
              progress: 80,
              message: 'Saving notes to Firestore...'
            };
          } else if (prev.stage === 'saving' && prev.progress < 95) {
            return { ...prev, progress: prev.progress + 5 };
          }
          return prev;
        });
      }, 500);

      const response = await fetch(`/api/member-notes?clientId2=${member.clientId2}&forceSync=true`);
      const data = await response.json();
      
      clearInterval(progressInterval);
      
      if (data.success) {
        setMemberNotes(data.notes);
        
        setSyncProgress({
          isSync: false,
          progress: 100,
          stage: 'complete',
          message: 'Sync completed successfully!',
          notesFound: {
            regular: data.regularNotes || 0,
            ils: data.ilsNotes || 0,
            total: data.totalNotes || 0
          }
        });
        
        const syncType = data.isFirstSync ? 'imported from Caspio' : 
                        data.newNotesCount > 0 ? `synced ${data.newNotesCount} new notes` : 
                        'already up to date';
        
        toast({
          title: "Notes Loaded",
          description: `${data.notes.length} notes for ${member.firstName} ${member.lastName} - ${syncType}`,
        });

        // Reset progress after 3 seconds
        setTimeout(() => {
          setSyncProgress({
            isSync: false,
            progress: 0,
            stage: 'idle',
            message: '',
            notesFound: { regular: 0, ils: 0, total: 0 }
          });
        }, 3000);
      } else {
        throw new Error(data.error || 'Failed to load notes');
      }
      
    } catch (error: any) {
      console.error('Error loading member notes:', error);
      setSyncProgress({
        isSync: false,
        progress: 0,
        stage: 'idle',
        message: 'Sync failed',
        notesFound: { regular: 0, ils: 0, total: 0 }
      });
      
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
        priority: newNote.priority,
        status: newNote.status || 'Open',
        assignedTo: newNote.assignedTo || undefined,
        assignedToName: newNote.assignedToName || undefined,
        followUpDate: newNote.followUpDate || undefined,
        authorId: user?.uid || 'current-user', // Required field
        authorName: user?.displayName || user?.email || 'Current User', // Required field
        createdBy: user?.uid || 'current-user',
        createdByName: user?.displayName || user?.email || 'Current User',
        tags: newNote.tags,
        sendNotification: Boolean(newNote.assignedTo && ['High', 'Urgent'].includes(newNote.priority)),
        recipientIds: newNote.assignedTo ? [newNote.assignedTo] : []
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
          assignedTo: '',
          assignedToName: '',
          priority: 'Medium',
          status: 'Open',
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
    if (noteFilter.status !== 'all') {
      const currentStatus = note.status || 'Open';
      if (noteFilter.status !== currentStatus) return false;
    }
    return true;
  });

  useEffect(() => {
    if (filteredNotes.length === 0) {
      setSelectedNoteId(null);
      return;
    }
    if (!selectedNoteId || !filteredNotes.some((note) => note.id === selectedNoteId)) {
      setSelectedNoteId(filteredNotes[0].id);
    }
  }, [filteredNotes, selectedNoteId]);

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
      case 'ILS': return 'bg-green-100 text-green-800 border-green-200';
      case 'App': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'Admin': return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const handleToggleStatus = async (note: MemberNote) => {
    try {
      const nextStatus = (note.status || 'Open') === 'Closed' ? 'Open' : 'Closed';
      const response = await fetch('/api/member-notes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: note.id,
          clientId2: note.clientId2,
          status: nextStatus,
          resolvedAt: nextStatus === 'Closed' ? new Date().toISOString() : null,
          actorName: user?.displayName || user?.email || 'Admin',
          actorEmail: user?.email || ''
        })
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to resolve note');
      }

      setMemberNotes(prev => prev.map(existing => (
        existing.id === note.id ? { ...existing, status: nextStatus } : existing
      )));

      toast({
        title: `Note ${nextStatus === 'Closed' ? 'Closed' : 'Reopened'}`,
        description: `This note has been marked as ${nextStatus.toLowerCase()}.`
      });
    } catch (error: any) {
      console.error('Error resolving note:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to resolve note',
        variant: 'destructive'
      });
    }
  };

  const commitDeleteNote = async (note: MemberNote) => {
    try {
      const response = await fetch('/api/member-notes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: note.id,
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
      setMemberNotes(prev => [note, ...prev]);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete note',
        variant: 'destructive'
      });
    }
  };

  const requestDeleteNote = (note: MemberNote) => {
    deletedNotesRef.current.set(note.id, note);
    setMemberNotes(prev => prev.filter(existing => existing.id !== note.id));

    const timer = setTimeout(() => {
      deleteTimersRef.current.delete(note.id);
      commitDeleteNote(note);
    }, 5000);
    deleteTimersRef.current.set(note.id, timer);

    toast({
      title: 'Note Deleted',
      description: 'You can undo this action for a few seconds.',
      action: (
        <ToastAction
          altText="Undo delete"
          onClick={() => {
            const existingTimer = deleteTimersRef.current.get(note.id);
            if (existingTimer) {
              clearTimeout(existingTimer);
              deleteTimersRef.current.delete(note.id);
            }
            const cached = deletedNotesRef.current.get(note.id);
            if (cached) {
              deletedNotesRef.current.delete(note.id);
              setMemberNotes(prev => [cached, ...prev]);
            }
          }}
        >
          Undo
        </ToastAction>
      )
    });
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
              Search and manage notes for CalAIM members across all health plans. Includes both regular notes and ILS notes with smart caching.
            </p>
            <div className="flex gap-2 mt-2">
              <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                ✓ Regular Notes Integration
              </Badge>
              <Badge className="bg-purple-100 text-purple-800 border-purple-200">
                ✓ ILS Notes Integration
              </Badge>
              {hasILSPermission && (
                <Badge className="bg-green-100 text-green-800 border-green-200">
                  ✓ ILS Permissions Enabled
                </Badge>
              )}
              <Badge className="bg-orange-100 text-orange-800 border-orange-200">
                ✓ Smart Caching & Sync
              </Badge>
              {healthStatus && (
                <Badge 
                  className={`cursor-pointer hover:opacity-80 ${
                    healthStatus.overallHealth === 'healthy' 
                      ? 'bg-green-100 text-green-800 border-green-200'
                      : healthStatus.overallHealth === 'degraded'
                      ? 'bg-yellow-100 text-yellow-800 border-yellow-200'
                      : 'bg-red-100 text-red-800 border-red-200'
                  }`}
                  onClick={() => setShowHealthDetails(!showHealthDetails)}
                >
                  {healthStatus.overallHealth === 'healthy' ? '🟢' : 
                   healthStatus.overallHealth === 'degraded' ? '🟡' : '🔴'} 
                  System {healthStatus.overallHealth} ({healthStatus.uptimePercentage}%)
                </Badge>
              )}
            </div>
            
            {/* Health Details */}
            {showHealthDetails && healthStatus && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg border">
                <h4 className="font-medium mb-2">System Health Status</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Caspio API:</span>
                    <Badge className={`ml-2 ${
                      healthStatus.caspioApiHealth === 'healthy' ? 'bg-green-100 text-green-800' :
                      healthStatus.caspioApiHealth === 'degraded' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {healthStatus.caspioApiHealth}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Firestore:</span>
                    <Badge className={`ml-2 ${
                      healthStatus.firestoreHealth === 'healthy' ? 'bg-green-100 text-green-800' :
                      healthStatus.firestoreHealth === 'degraded' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {healthStatus.firestoreHealth}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Failed Syncs:</span>
                    <span className="ml-2 font-medium">{healthStatus.failedSyncCount}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Last Success:</span>
                    <span className="ml-2 font-medium">{healthStatus.timeSinceLastSuccess}m ago</span>
                  </div>
                </div>
                {healthStatus.recommendations && healthStatus.recommendations.length > 0 && (
                  <div className="mt-3">
                    <span className="text-muted-foreground text-sm">Recommendations:</span>
                    <ul className="mt-1 text-xs space-y-1">
                      {healthStatus.recommendations.map((rec: string, idx: number) => (
                        <li key={idx} className="text-muted-foreground">{rec}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
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
              Search by last name to view notes
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="search">Search CalAIM Members (Last Name)</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Type last name..."
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
                  'Enter last name letters to find CalAIM members'
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
                          <Label htmlFor="assignedTo">Assign to Staff (Optional)</Label>
                          <Select 
                            value={newNote.assignedTo} 
                            onValueChange={(value) => {
                              const selectedStaff = staffList.find(s => s.uid === value);
                              setNewNote(prev => ({ 
                                ...prev, 
                                assignedTo: value,
                                assignedToName: selectedStaff?.name || ''
                              }));
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select staff member" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="">No assignment</SelectItem>
                              {staffList.map((staff) => (
                                <SelectItem key={staff.uid} value={staff.uid}>
                                  {staff.name} ({staff.email})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
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
                  <br />
                  <span className="text-xs">
                    This will fetch both regular notes and ILS notes from Caspio, then cache them in Firestore for faster future access.
                  </span>
                </p>
                <div className="space-y-4">
                  <Button 
                    onClick={() => handleRequestNotes(selectedMember)}
                    disabled={isNotesLoading || syncProgress.isSync}
                    size="lg"
                    className="bg-blue-600 hover:bg-blue-700 w-full"
                  >
                    {isNotesLoading || syncProgress.isSync ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {syncProgress.message || 'Loading Notes...'}
                      </>
                    ) : (
                      <>
                        <Download className="mr-2 h-4 w-4" />
                        Request Notes
                      </>
                    )}
                  </Button>
                  
                  {/* Sync Progress Indicator */}
                  {(syncProgress.isSync || syncProgress.stage === 'complete') && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{syncProgress.message}</span>
                        <span className="font-medium">{syncProgress.progress}%</span>
                      </div>
                      <Progress value={syncProgress.progress} className="h-2" />
                      
                      {syncProgress.stage === 'complete' && syncProgress.notesFound.total > 0 && (
                        <div className="text-xs text-muted-foreground bg-green-50 p-2 rounded border border-green-200">
                          ✅ Found {syncProgress.notesFound.total} total notes: {syncProgress.notesFound.regular} regular + {syncProgress.notesFound.ils} ILS
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Refresh Notes Button */}
                <div className="flex justify-between items-center">
                  <div className="text-sm text-muted-foreground">
                    Showing {memberNotes.length} notes for {selectedMember.firstName} {selectedMember.lastName}
                    <div className="text-xs mt-1">
                      Regular: {filteredNotes.filter(n => n.source === 'Caspio').length} • 
                      ILS: {filteredNotes.filter(n => n.source === 'ILS').length} • 
                      App: {filteredNotes.filter(n => n.source === 'App' || n.source === 'Admin').length}
                    </div>
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
                      <SelectItem value="ILS">ILS</SelectItem>
                      <SelectItem value="App">App</SelectItem>
                      <SelectItem value="Admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={noteFilter.status} onValueChange={(value) => setNoteFilter(prev => ({ ...prev, status: value }))}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="Open">Open</SelectItem>
                      <SelectItem value="Closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-wrap items-center gap-2 px-4">
                  <Button
                    size="sm"
                    variant={noteFilter.status === 'all' ? 'default' : 'outline'}
                    onClick={() => setNoteFilter(prev => ({ ...prev, status: 'all' }))}
                  >
                    All
                  </Button>
                  <Button
                    size="sm"
                    variant={noteFilter.status === 'Open' ? 'default' : 'outline'}
                    onClick={() => setNoteFilter(prev => ({ ...prev, status: 'Open' }))}
                  >
                    Open
                  </Button>
                  <Button
                    size="sm"
                    variant={noteFilter.status === 'Closed' ? 'default' : 'outline'}
                    onClick={() => setNoteFilter(prev => ({ ...prev, status: 'Closed' }))}
                  >
                    Closed
                  </Button>
                </div>

                {/* Notes List + Detail */}
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4">
                  <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                    {filteredNotes.map((note) => (
                      <div
                        key={note.id}
                        onClick={() => setSelectedNoteId(note.id)}
                        className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                          selectedNoteId === note.id ? 'border-primary bg-primary/5' : ''
                        } ${!note.isRead ? 'border-blue-200 bg-blue-50' : ''}`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex gap-2 flex-wrap">
                            <Badge variant="outline" className={getPriorityColor(note.priority)}>
                              {note.priority}
                            </Badge>
                            <Badge variant="outline">{note.noteType}</Badge>
                            <Badge variant="outline" className={getSourceColor(note.source)}>
                              {note.source}
                            </Badge>
                            <Badge variant="outline">{note.status || 'Open'}</Badge>
                            {!note.isRead && (
                              <Badge className="bg-blue-600">
                                <Bell className="h-3 w-3 mr-1" />
                                New
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {format(new Date(note.createdAt), 'MMM d, yyyy h:mm a')}
                          </div>
                        </div>
                        
                        <p className="text-sm mb-2 line-clamp-2">{note.noteText}</p>
                        <div className="text-xs text-muted-foreground">
                          <span className="font-medium">By:</span> {note.createdByName}
                          {note.assignedToName && (
                            <>
                              <span className="mx-2">•</span>
                              <span className="font-medium">Assigned to:</span> {note.assignedToName}
                            </>
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

                  <div className="space-y-3">
                    <Card className="sticky top-4">
                      <CardHeader>
                        <CardTitle>Note Details</CardTitle>
                        <CardDescription>Selected note information</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {filteredNotes.length === 0 || !selectedNoteId ? (
                          <div className="text-sm text-muted-foreground">Select a note to view details.</div>
                        ) : (
                          (() => {
                            const note = filteredNotes.find((n) => n.id === selectedNoteId);
                            if (!note) return <div className="text-sm text-muted-foreground">Select a note to view details.</div>;
                            return (
                              <div className="space-y-3 text-sm">
                                <div className="flex flex-wrap gap-2">
                                  <Badge variant="outline" className={getPriorityColor(note.priority)}>
                                    {note.priority}
                                  </Badge>
                                  <Badge variant="outline">{note.noteType}</Badge>
                                  <Badge variant="outline">{note.status || 'Open'}</Badge>
                                  <Badge variant="outline" className={getSourceColor(note.source)}>
                                    {note.source}
                                  </Badge>
                                </div>
                                <div>
                                  <p className="font-medium">Note</p>
                                  <p className="text-muted-foreground whitespace-pre-wrap">{note.noteText}</p>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  <div>Created: {format(new Date(note.createdAt), 'MMM d, yyyy h:mm a')}</div>
                                  <div>By: {note.createdByName}</div>
                                  {note.assignedToName && <div>Assigned to: {note.assignedToName}</div>}
                                  {note.followUpDate && (
                                    <div>Follow-up: {format(new Date(note.followUpDate), 'MMM d, yyyy')}</div>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-muted-foreground text-xs">
                                    {(note.status || 'Open') === 'Closed' ? 'Closed' : 'Open'}
                                  </span>
                                  <Switch
                                    checked={(note.status || 'Open') !== 'Closed'}
                                    onCheckedChange={() => handleToggleStatus(note)}
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
                              </div>
                            );
                          })()
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function MemberNotesPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>}>
      <MemberNotesPageContent />
    </Suspense>
  );
}