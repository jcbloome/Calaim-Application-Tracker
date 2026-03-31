'use client';

import React, { Suspense, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Search, 
  FileText, 
  Bell, 
  Trash2,
  CheckCircle,
  Loader2,
  Download,
  MessageSquare
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAdmin } from '@/hooks/use-admin';
import { getPriorityRank, normalizePriorityLabel } from '@/lib/notification-utils';
import { format } from 'date-fns';
import { useSearchParams } from 'next/navigation';

interface Member {
  clientId2: string;
  firstName: string;
  lastName: string;
  healthPlan: string;
  status: string;
  rcfeName?: string;
  socialWorkerAssigned?: string;
  kaiserUserAssignment?: string;
  staffAssigned?: string;
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
  priority: 'General' | 'Priority' | 'Urgent' | string;
  status?: 'Open' | 'Closed';
  followUpDate?: string;
  tags?: string[];
}

interface DailyTaskFollowup {
  id?: string;
  title: string;
  description?: string;
  memberName?: string;
  memberClientId?: string;
  assignedTo?: string;
  assignedToName?: string;
  dueDate?: string;
  status?: string;
  notes?: string;
}

interface HealthStatus {
  overallHealth: 'healthy' | 'degraded' | 'down' | string;
  uptimePercentage: number;
  caspioApiHealth: 'healthy' | 'degraded' | 'down' | string;
  firestoreHealth: 'healthy' | 'degraded' | 'down' | string;
  failedSyncCount: number;
  timeSinceLastSuccess: number;
  recommendations?: string[];
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function normalizeAssignmentValue(value: unknown): string {
  return String(value || '').trim();
}

function MemberNotesPageContent() {
  const { toast } = useToast();
  const { user } = useAdmin();
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
  const [memberScope, setMemberScope] = useState<'all' | 'assigned_to_me' | 'kaiser_assignment'>('all');
  const [kaiserAssignmentFilter, setKaiserAssignmentFilter] = useState('all');
  const [kaiserAssignmentOptions, setKaiserAssignmentOptions] = useState<string[]>([]);
  
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
  const [, setIsCheckingILSPermission] = useState(false);

  // Health monitoring
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [showHealthDetails, setShowHealthDetails] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MemberNote | null>(null);
  const [followUpTasks, setFollowUpTasks] = useState<DailyTaskFollowup[]>([]);
  const [isFollowUpLoading, setIsFollowUpLoading] = useState(false);

  // Fetch members from Caspio API with search
  const fetchMembers = useCallback(async (search: string = '') => {
    const trimmedSearch = search.trim();
    const shouldFilterKaiserByStaff =
      memberScope === 'kaiser_assignment' && kaiserAssignmentFilter !== 'all';
    const shouldFetchWithoutSearch = shouldFilterKaiserByStaff;
    if (!trimmedSearch && !shouldFetchWithoutSearch) {
      setMembers([]);
      return;
    }

    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (trimmedSearch) params.append('search', trimmedSearch);
      params.append('limit', shouldFetchWithoutSearch ? '200' : '20');
      if (memberScope === 'kaiser_assignment') {
        params.append('healthPlan', 'Kaiser');
      }
      if (shouldFilterKaiserByStaff) {
        params.append('kaiserUserAssignment', kaiserAssignmentFilter);
      }
      
      const response = await fetch(`/api/members?${params.toString()}`);
      const data = await response.json();
      
      if (data.success) {
        setMembers(data.members);
        console.log(`✅ Found ${data.members.length} CalAIM members`, {
          search: trimmedSearch,
          memberScope,
          kaiserAssignmentFilter,
        });
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
  }, [toast, memberScope, kaiserAssignmentFilter]);

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

  const loadKaiserAssignmentOptions = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.append('healthPlan', 'Kaiser');
      params.append('limit', '500');
      const response = await fetch(`/api/members?${params.toString()}`);
      const data = await response.json();
      if (!data?.success || !Array.isArray(data?.members)) {
        setKaiserAssignmentOptions([]);
        return;
      }
      const uniqueAssignments = new Set<string>();
      for (const member of data.members as Member[]) {
        const assigned = normalizeAssignmentValue(member.kaiserUserAssignment);
        if (!assigned) continue;
        uniqueAssignments.add(assigned);
      }
      setKaiserAssignmentOptions(Array.from(uniqueAssignments).sort((a, b) => a.localeCompare(b)));
    } catch {
      setKaiserAssignmentOptions([]);
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
    loadHealthStatus();
  }, [user?.uid, loadHealthStatus]);

  // Don't load members on mount - only when searching
  // Search members when search term changes (with debounce)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchMembers(searchTerm);
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [searchTerm, fetchMembers]);

  useEffect(() => {
    if (memberScope !== 'kaiser_assignment') return;
    void loadKaiserAssignmentOptions();
  }, [memberScope, loadKaiserAssignmentOptions]);

  useEffect(() => {
    if (!preselectId || searchTerm) return;
    setSearchTerm(preselectId);
  }, [preselectId, searchTerm]);

  const userMatchTokens = useMemo(() => {
    const tokens = new Set<string>();
    const add = (value: unknown) => {
      const v = String(value || '').trim().toLowerCase();
      if (!v) return;
      tokens.add(v);
    };
    add(user?.displayName);
    add(user?.email);
    add(String(user?.email || '').split('@')[0]);
    add(user?.uid);
    return Array.from(tokens);
  }, [user?.displayName, user?.email, user?.uid]);

  const doesAssignmentMatchCurrentUser = useCallback(
    (assignment: unknown) => {
      const assigned = String(assignment || '').trim().toLowerCase();
      if (!assigned || /^\d+$/.test(assigned)) return false;
      return userMatchTokens.some((token) => assigned === token || assigned.includes(token) || token.includes(assigned));
    },
    [userMatchTokens]
  );

  const getMemberAssignment = useCallback((member: Member) => {
    return String(member.socialWorkerAssigned || member.kaiserUserAssignment || member.staffAssigned || '').trim();
  }, []);

  const filteredMembers = useMemo(() => {
    if (memberScope === 'all') return members;
    if (memberScope === 'assigned_to_me') {
      return members.filter((member) => doesAssignmentMatchCurrentUser(getMemberAssignment(member)));
    }
    return members.filter((member) => {
      const isKaiser = String(member.healthPlan || '').toLowerCase().includes('kaiser');
      if (!isKaiser) return false;
      if (kaiserAssignmentFilter === 'all') return true;
      return normalizeAssignmentValue(member.kaiserUserAssignment) === kaiserAssignmentFilter;
    });
  }, [members, memberScope, doesAssignmentMatchCurrentUser, getMemberAssignment, kaiserAssignmentFilter]);

  const handleMemberSelect = (member: Member) => {
    setSelectedMember(member);
    setMemberNotes([]); // Clear notes when selecting a new member
  };

  const loadFollowUpTasksForMember = useCallback(async (member: Member) => {
    setIsFollowUpLoading(true);
    try {
      const response = await fetch('/api/daily-tasks');
      const data = await response.json().catch(() => ({}));
      const tasks = Array.isArray(data?.tasks) ? (data.tasks as DailyTaskFollowup[]) : [];
      const memberId = String(member.clientId2 || '').trim();
      const linked = tasks
        .filter((task) => String(task.memberClientId || '').trim() === memberId)
        .sort((a, b) => new Date(String(a?.dueDate || '')).getTime() - new Date(String(b?.dueDate || '')).getTime());
      setFollowUpTasks(linked);
    } catch {
      setFollowUpTasks([]);
    } finally {
      setIsFollowUpLoading(false);
    }
  }, []);

  const handleRequestNotes = useCallback(async (member: Member) => {
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

      const response = await fetch(
        `/api/member-notes?clientId2=${member.clientId2}&forceSync=false&skipSync=false&repairIfEmpty=true`
      );
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
      
    } catch (error: unknown) {
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
        description: getErrorMessage(error, "Failed to load member notes"),
        variant: "destructive"
      });
    } finally {
      setIsNotesLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!preselectId || autoSelectRef.current || filteredMembers.length === 0) return;
    const match = filteredMembers.find(
      (member) => String(member.clientId2).trim() === String(preselectId).trim()
    );
    if (!match) return;
    autoSelectRef.current = true;
    handleMemberSelect(match);
    void handleRequestNotes(match);
  }, [filteredMembers, preselectId, handleRequestNotes]);

  useEffect(() => {
    if (!selectedMember) {
      setFollowUpTasks([]);
      return;
    }
    void loadFollowUpTasksForMember(selectedMember);
  }, [selectedMember, loadFollowUpTasksForMember]);


  const filteredNotes = memberNotes.filter(note => {
    if (noteFilter.type !== 'all' && note.noteType !== noteFilter.type) return false;
    if (noteFilter.priority !== 'all' && normalizePriorityLabel(note.priority) !== noteFilter.priority) return false;
    if (noteFilter.assignedTo !== 'all' && note.assignedTo !== noteFilter.assignedTo) return false;
    if (noteFilter.source !== 'all' && note.source !== noteFilter.source) return false;
    if (noteFilter.status !== 'all') {
      const currentStatus = note.status || 'Open';
      if (noteFilter.status !== currentStatus) return false;
    }
    return true;
  });

  const sortedNotes = [...filteredNotes].sort((a, b) => {
    const aPriority = normalizePriorityLabel(a.priority);
    const bPriority = normalizePriorityLabel(b.priority);
    const rankDiff = getPriorityRank(bPriority) - getPriorityRank(aPriority);
    if (rankDiff !== 0) return rankDiff;
    const aTime = new Date(a.createdAt || 0).getTime();
    const bTime = new Date(b.createdAt || 0).getTime();
    return bTime - aTime;
  });

  useEffect(() => {
    if (sortedNotes.length === 0) {
      setSelectedNoteId(null);
      return;
    }
    if (!selectedNoteId || !sortedNotes.some((note) => note.id === selectedNoteId)) {
      setSelectedNoteId(sortedNotes[0].id);
    }
  }, [sortedNotes, selectedNoteId]);

  const getPriorityColor = (priority: string) => {
    const label = normalizePriorityLabel(priority);
    if (label === 'Urgent') return 'bg-red-100 text-red-800 border-red-200';
    if (label === 'Priority') return 'bg-orange-100 text-orange-800 border-orange-200';
    return 'bg-gray-100 text-gray-800 border-gray-200';
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
    } catch (error: unknown) {
      console.error('Error resolving note:', error);
      toast({
        title: 'Error',
        description: getErrorMessage(error, 'Failed to resolve note'),
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
    } catch (error: unknown) {
      console.error('Error deleting note:', error);
      setMemberNotes(prev => [note, ...prev]);
      toast({
        title: 'Error',
        description: getErrorMessage(error, 'Failed to delete note'),
        variant: 'destructive'
      });
    }
  };

  const requestDeleteNote = (note: MemberNote) => {
    setMemberNotes(prev => prev.filter(existing => existing.id !== note.id));
    commitDeleteNote(note);
    toast({
      title: 'Note Deleted',
      description: 'The note was removed.'
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
              <Label>Lookup Scope</Label>
              <Select
                value={memberScope}
                onValueChange={(value) => setMemberScope(value as 'all' | 'assigned_to_me' | 'kaiser_assignment')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All CalAIM Members</SelectItem>
                  <SelectItem value="assigned_to_me">My Assigned Members</SelectItem>
                  <SelectItem value="kaiser_assignment">Kaiser by Kaiser_User_Assignment</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {memberScope === 'kaiser_assignment' && (
              <div className="space-y-2">
                <Label>Kaiser_User_Assignment Staff</Label>
                <Select value={kaiserAssignmentFilter} onValueChange={setKaiserAssignmentFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Kaiser staff" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Kaiser Assignments</SelectItem>
                    {kaiserAssignmentOptions.map((staff) => (
                      <SelectItem key={staff} value={staff}>
                        {staff}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Select a staff name to load all Kaiser members assigned to that staff.
                </p>
              </div>
            )}
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
                  memberScope === 'kaiser_assignment' && kaiserAssignmentFilter !== 'all'
                    ? `Loading Kaiser members assigned to ${kaiserAssignmentFilter}...`
                    : 'Enter last name letters to find CalAIM members'
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
                        {getMemberAssignment(member) && (
                          <p className="text-xs text-muted-foreground">Assigned: {getMemberAssignment(member)}</p>
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
                      memberScope === 'kaiser_assignment' && kaiserAssignmentFilter !== 'all'
                        ? `No Kaiser members found for ${kaiserAssignmentFilter}`
                        : 'Enter a search term to find CalAIM members'
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
                <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                  Notes are read-only here. Use the sync button to pull latest from Caspio.
                </div>
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
                  Click &quot;Request Notes&quot; to load notes for {selectedMember.firstName} {selectedMember.lastName}
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
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Follow-up from Daily Task Calendar</CardTitle>
                    <CardDescription>
                      Tasks linked by Client ID for this assigned member.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {isFollowUpLoading ? (
                      <div className="text-sm text-muted-foreground flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading follow-up tasks...
                      </div>
                    ) : followUpTasks.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No follow-up tasks found for this member.</div>
                    ) : (
                      <div className="space-y-2">
                        {followUpTasks.map((task) => (
                          <div key={task.id || `${task.title}-${task.dueDate}`} className="rounded border p-2 text-sm">
                            <div className="font-medium">{task.title}</div>
                            <div className="text-xs text-muted-foreground">
                              Due: {task.dueDate ? format(new Date(task.dueDate), 'MMM d, yyyy') : 'N/A'} • Status:{' '}
                              {String(task.status || 'pending').replace(/_/g, ' ')}
                              {task.assignedToName ? ` • Assigned: ${task.assignedToName}` : ''}
                            </div>
                            {task.notes ? <div className="text-xs mt-1">{task.notes}</div> : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

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
                      <SelectItem value="Priority">Priority</SelectItem>
                      <SelectItem value="General">General</SelectItem>
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
                    {sortedNotes.map((note) => (
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
                              {normalizePriorityLabel(note.priority)}
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
                          <div className="flex items-center gap-2">
                            <div className="text-xs text-muted-foreground">
                              {format(new Date(note.createdAt), 'MMM d, yyyy h:mm a')}
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-[10px]"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleToggleStatus(note);
                              }}
                              title={(note.status || 'Open') === 'Closed' ? 'Reopen note' : 'Close note'}
                            >
                              <CheckCircle className="h-3 w-3 mr-1" />
                              {(note.status || 'Open') === 'Closed' ? 'Reopen' : 'Close'}
                            </Button>
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
                    
                    {sortedNotes.length === 0 && (
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
                        {sortedNotes.length === 0 || !selectedNoteId ? (
                          <div className="text-sm text-muted-foreground">Select a note to view details.</div>
                        ) : (
                          (() => {
                            const note = sortedNotes.find((n) => n.id === selectedNoteId);
                            if (!note) return <div className="text-sm text-muted-foreground">Select a note to view details.</div>;
                            return (
                              <div className="space-y-3 text-sm">
                                <div className="flex flex-wrap gap-2">
                                  <Badge variant="outline" className={getPriorityColor(note.priority)}>
                                    {normalizePriorityLabel(note.priority)}
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
                                          This removes the note from Caspio and Firestore.
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