'use client';

import React, { Suspense, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Search, 
  FileText, 
  Trash2,
  CheckCircle,
  Loader2,
  Download,
  MessageSquare
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAdmin } from '@/hooks/use-admin';
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

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function normalizeAssignmentValue(value: unknown): string {
  return String(value || '').trim();
}

type NoteStatus = 'Open' | 'Closed';
type PendingSyncScope = 'selected' | 'all';

type PendingStatusChange = {
  key: string;
  noteId: string;
  clientId2: string;
  memberName: string;
  fromStatus: NoteStatus;
  toStatus: NoteStatus;
  resolvedAt: string | null;
  updatedAt: string;
};

function normalizeNoteStatus(value: unknown): NoteStatus {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'Open';
  if (raw === 'close' || raw === 'closed' || raw.includes('closed')) return 'Closed';
  if (raw.includes('open')) return 'Open';
  return 'Open';
}

function noteStatusLabel(value: unknown): string {
  return normalizeNoteStatus(value) === 'Closed' ? '🔴 Closed' : '🟢 Open';
}

function pendingStatusKey(noteId: string, clientId2: string): string {
  return `${String(clientId2 || '').trim()}::${String(noteId || '').trim()}`;
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
  const [isLoading, setIsLoading] = useState(false);
  const [isNotesLoading, setIsNotesLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [memberScope, setMemberScope] = useState<'all' | 'kaiser_assignment'>('all');
  const [kaiserAssignmentFilter, setKaiserAssignmentFilter] = useState('all');
  const [kaiserAssignmentOptions, setKaiserAssignmentOptions] = useState<string[]>([]);
  
  const [noteFilter, setNoteFilter] = useState({
    status: 'all'
  });
  const [deleteTarget, setDeleteTarget] = useState<MemberNote | null>(null);
  const [followUpTasks, setFollowUpTasks] = useState<DailyTaskFollowup[]>([]);
  const [isFollowUpLoading, setIsFollowUpLoading] = useState(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [isBulkClosing, setIsBulkClosing] = useState(false);
  const [pendingStatusChanges, setPendingStatusChanges] = useState<Record<string, PendingStatusChange>>({});
  const [isSyncingPendingStatuses, setIsSyncingPendingStatuses] = useState(false);

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
      params.append('limit', shouldFetchWithoutSearch ? '300' : '200');
      if (memberScope === 'kaiser_assignment') {
        params.append('healthPlan', 'Kaiser');
      }
      if (shouldFilterKaiserByStaff) {
        params.append('kaiserUserAssignment', kaiserAssignmentFilter);
      }

      const membersPromise = fetch(`/api/members?${params.toString()}`).then((r) => r.json());
      const historyPromise =
        trimmedSearch.length >= 2
          ? fetch(`/api/member-notes?search=${encodeURIComponent(trimmedSearch)}`).then((r) => r.json())
          : Promise.resolve(null);

      const [memberData, historyData] = await Promise.all([membersPromise, historyPromise]);

      if (memberData.success) {
        const merged = new Map<string, Member>();
        for (const member of (memberData.members || []) as Member[]) {
          const key = String(member.clientId2 || '').trim();
          if (!key) continue;
          merged.set(key, member);
        }

        const historyRecords = Array.isArray(historyData?.results)
          ? historyData.results
          : Array.isArray(historyData?.notes)
            ? historyData.notes
            : [];
        for (const record of historyRecords) {
          const clientId2 = String(
            record?.clientId2 ||
              record?.memberId ||
              record?.Client_ID2 ||
              record?.notes?.[0]?.clientId2 ||
              ''
          ).trim();
          if (!clientId2 || merged.has(clientId2)) continue;
          const memberName = String(record?.memberName || record?.notes?.[0]?.memberName || '').trim();
          const nameParts = memberName.split(/\s+/).filter(Boolean);
          const firstName = nameParts.slice(0, -1).join(' ') || 'Unknown';
          const lastName = nameParts.slice(-1).join(' ') || memberName || 'Unknown';
          merged.set(clientId2, {
            clientId2,
            firstName,
            lastName,
            healthPlan: 'Unknown',
            status: 'From Notes History',
            noteCount: 0
          });
        }

        const mergedMembers = Array.from(merged.values()).sort((a, b) => {
          const aLast = String(a.lastName || '').toLowerCase();
          const bLast = String(b.lastName || '').toLowerCase();
          if (aLast !== bLast) return aLast.localeCompare(bLast);
          return String(a.firstName || '').toLowerCase().localeCompare(String(b.firstName || '').toLowerCase());
        });

        setMembers(mergedMembers);
        console.log(`✅ Found ${mergedMembers.length} CalAIM members`, {
          search: trimmedSearch,
          memberScope,
          kaiserAssignmentFilter,
        });
      } else {
        console.error('❌ Failed to search members:', memberData.error);
        toast({
          title: "Search Error",
          description: memberData.error || "Failed to search CalAIM members",
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

  const getMemberAssignment = useCallback((member: Member) => {
    return String(member.socialWorkerAssigned || member.kaiserUserAssignment || member.staffAssigned || '').trim();
  }, []);

  const filteredMembers = useMemo(() => {
    if (memberScope === 'all') return members;
    return members.filter((member) => {
      const isKaiser = String(member.healthPlan || '').toLowerCase().includes('kaiser');
      if (!isKaiser) return false;
      if (kaiserAssignmentFilter === 'all') return true;
      return normalizeAssignmentValue(member.kaiserUserAssignment) === kaiserAssignmentFilter;
    });
  }, [members, memberScope, kaiserAssignmentFilter]);

  const handleMemberSelect = (member: Member) => {
    const currentMemberId = String(selectedMember?.clientId2 || '').trim();
    const nextMemberId = String(member?.clientId2 || '').trim();
    if (currentMemberId && nextMemberId && currentMemberId !== nextMemberId) {
      const pendingForCurrent = Object.values(pendingStatusChanges).filter(
        (change) => change.clientId2 === currentMemberId
      ).length;
      if (pendingForCurrent > 0) {
        const proceed =
          typeof window !== 'undefined'
            ? window.confirm(
                `You have ${pendingForCurrent} unsynced status change(s) for this member.\n\nSwitch members without syncing?`
              )
            : false;
        if (!proceed) return;
      }
    }
    setSelectedMember(member);
    setMemberNotes([]); // Clear notes when selecting a new member
    setSelectedNoteIds([]);
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

  const handleRequestNotes = useCallback(async (
    member: Member,
    options?: { syncFromCaspio?: boolean }
  ) => {
    const syncFromCaspio = Boolean(options?.syncFromCaspio);
    setIsNotesLoading(true);
    try {
      const response = await fetch(
        `/api/member-notes?clientId2=${member.clientId2}&forceSync=${syncFromCaspio ? 'true' : 'false'}&skipSync=${syncFromCaspio ? 'false' : 'true'}&repairIfEmpty=true`
      );
      const data = await response.json();

      if (data.success) {
        const pendingForMember = new Map(
          Object.values(pendingStatusChanges)
            .filter((change) => change.clientId2 === member.clientId2)
            .map((change) => [change.noteId, change])
        );
        const normalizedNotes = Array.isArray(data?.notes)
          ? data.notes.map((note: MemberNote) => ({
              ...note,
              status:
                pendingForMember.get(String(note?.id || '').trim())?.toStatus ||
                normalizeNoteStatus((note as any)?.status),
            }))
          : [];
        setMemberNotes(normalizedNotes);

        const syncType = syncFromCaspio
          ? data.isFirstSync
            ? 'imported from Caspio'
            : data.newNotesCount > 0
              ? `synced ${data.newNotesCount} new notes`
              : 'already up to date'
          : 'loaded from saved notes';
        
        toast({
          title: "Notes Loaded",
          description: `${data.notes.length} notes for ${member.firstName} ${member.lastName} - ${syncType}`,
        });
      } else {
        throw new Error(data.error || 'Failed to load notes');
      }
      
    } catch (error: unknown) {
      console.error('Error loading member notes:', error);
      toast({
        title: "Error",
        description: getErrorMessage(error, "Failed to load member notes"),
        variant: "destructive"
      });
    } finally {
      setIsNotesLoading(false);
    }
  }, [toast, pendingStatusChanges]);

  useEffect(() => {
    if (!preselectId || autoSelectRef.current || filteredMembers.length === 0) return;
    const match = filteredMembers.find(
      (member) => String(member.clientId2).trim() === String(preselectId).trim()
    );
    if (!match) return;
    autoSelectRef.current = true;
    setSelectedMember(match);
    setMemberNotes([]);
    setSelectedNoteIds([]);
  }, [filteredMembers, preselectId]);

  useEffect(() => {
    if (!selectedMember) {
      setFollowUpTasks([]);
      return;
    }
    void loadFollowUpTasksForMember(selectedMember);
  }, [selectedMember, loadFollowUpTasksForMember]);

  useEffect(() => {
    if (!selectedMember) {
      setMemberNotes([]);
      return;
    }
    // Intentionally do not auto-load notes on select.
    // Staff should explicitly use Sync Notes to pull the full set from Caspio.
  }, [selectedMember, handleRequestNotes]);


  const filteredNotes = memberNotes.filter(note => {
    if (noteFilter.status !== 'all') {
      const currentStatus = normalizeNoteStatus(note.status);
      if (noteFilter.status !== currentStatus) return false;
    }
    return true;
  });

  const sortedNotes = [...filteredNotes].sort((a, b) => {
    const aTime = new Date(a.createdAt || 0).getTime();
    const bTime = new Date(b.createdAt || 0).getTime();
    return bTime - aTime;
  });

  const pendingChangeList = useMemo(
    () =>
      Object.values(pendingStatusChanges).sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ),
    [pendingStatusChanges]
  );

  const pendingByMember = useMemo(() => {
    const grouped = new Map<
      string,
      { clientId2: string; memberName: string; total: number; closing: number; reopening: number }
    >();
    for (const change of pendingChangeList) {
      const key = `${change.clientId2}::${change.memberName}`;
      const existing = grouped.get(key) || {
        clientId2: change.clientId2,
        memberName: change.memberName,
        total: 0,
        closing: 0,
        reopening: 0,
      };
      existing.total += 1;
      if (change.toStatus === 'Closed') {
        existing.closing += 1;
      } else {
        existing.reopening += 1;
      }
      grouped.set(key, existing);
    }
    return Array.from(grouped.values());
  }, [pendingChangeList]);

  const selectedMemberPendingChanges = useMemo(() => {
    if (!selectedMember?.clientId2) return [];
    return pendingChangeList.filter((change) => change.clientId2 === selectedMember.clientId2);
  }, [pendingChangeList, selectedMember?.clientId2]);

  const pendingStatusByNoteKey = useMemo(() => {
    const map = new Map<string, PendingStatusChange>();
    for (const change of selectedMemberPendingChanges) {
      map.set(pendingStatusKey(change.noteId, change.clientId2), change);
    }
    return map;
  }, [selectedMemberPendingChanges]);

  const stageStatusChange = useCallback((note: MemberNote, nextStatus: NoteStatus) => {
    const noteId = String(note?.id || '').trim();
    const clientId2 = String(note?.clientId2 || '').trim();
    if (!noteId || !clientId2) return;

    const key = pendingStatusKey(noteId, clientId2);
    const currentStatus = normalizeNoteStatus(note.status);
    const nowIso = new Date().toISOString();

    setMemberNotes((prev) =>
      prev.map((existing) =>
        existing.id === noteId
          ? { ...existing, status: nextStatus, resolvedAt: nextStatus === 'Closed' ? nowIso : undefined }
          : existing
      )
    );

    setPendingStatusChanges((prev) => {
      const existing = prev[key];
      const baseStatus = existing?.fromStatus || currentStatus;
      if (nextStatus === baseStatus) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return {
        ...prev,
        [key]: {
          key,
          noteId,
          clientId2,
          memberName: String(note.memberName || selectedMember?.firstName || 'Member').trim(),
          fromStatus: baseStatus,
          toStatus: nextStatus,
          resolvedAt: nextStatus === 'Closed' ? nowIso : null,
          updatedAt: nowIso,
        },
      };
    });
  }, [selectedMember?.firstName]);

  const handleToggleStatus = async (note: MemberNote) => {
    try {
      const nextStatus: NoteStatus = normalizeNoteStatus(note.status) === 'Closed' ? 'Open' : 'Closed';
      stageStatusChange(note, nextStatus);

      toast({
        title: 'Status staged',
        description: `${note.memberName}: ${noteStatusLabel(nextStatus)} queued for sync.`,
      });
    } catch (error: unknown) {
      console.error('Error resolving note:', error);
      toast({
        title: 'Error',
        description: getErrorMessage(error, 'Failed to stage note status'),
        variant: 'destructive'
      });
    }
  };

  const clearMemberFollowUpTasks = useCallback(async (memberClientId: string) => {
    const memberId = String(memberClientId || '').trim();
    if (!memberId) return 0;
    try {
      const response = await fetch('/api/daily-tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'clear_member_followups',
          memberClientId: memberId,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.success) return 0;
      return Number(data?.removedCount || 0);
    } catch {
      return 0;
    }
  }, []);

  const toggleSelectedNote = useCallback((noteId: string, checked: boolean) => {
    setSelectedNoteIds((prev) => {
      if (checked) {
        if (prev.includes(noteId)) return prev;
        return [...prev, noteId];
      }
      return prev.filter((id) => id !== noteId);
    });
  }, []);

  const selectableOpenNoteIds = useMemo(
    () => sortedNotes.filter((note) => normalizeNoteStatus(note.status) !== 'Closed').map((note) => note.id),
    [sortedNotes]
  );

  const selectedOpenCount = useMemo(
    () => selectedNoteIds.filter((id) => selectableOpenNoteIds.includes(id)).length,
    [selectedNoteIds, selectableOpenNoteIds]
  );

  const selectAllOpenNotesInView = useCallback(() => {
    setSelectedNoteIds(selectableOpenNoteIds);
  }, [selectableOpenNoteIds]);

  const clearSelectedNotes = useCallback(() => {
    setSelectedNoteIds([]);
  }, []);

  const closeSelectedNotes = useCallback(async () => {
    if (!selectedMember?.clientId2) return;
    const targetIds = selectedNoteIds.filter(Boolean);
    if (targetIds.length === 0) return;

    const openNoteIds = targetIds.filter((id) => {
      const note = memberNotes.find((n) => n.id === id);
      return note && normalizeNoteStatus(note.status) !== 'Closed';
    });
    if (openNoteIds.length === 0) {
      toast({
        title: 'Nothing to close',
        description: 'Selected notes are already closed.',
      });
      return;
    }

    setIsBulkClosing(true);
    try {
      const toClose = memberNotes.filter((note) => openNoteIds.includes(note.id));
      for (const note of toClose) {
        stageStatusChange(note, 'Closed');
      }
      setSelectedNoteIds([]);
      toast({
        title: 'Bulk close staged',
        description: `Queued ${toClose.length} note(s). Use Sync Pending Changes to push to Caspio.`,
      });
    } finally {
      setIsBulkClosing(false);
    }
  }, [selectedMember?.clientId2, selectedNoteIds, memberNotes, toast, stageStatusChange]);

  const syncPendingStatusChanges = useCallback(async (scope: PendingSyncScope = 'selected') => {
    const targetChanges =
      scope === 'all'
        ? pendingChangeList
        : selectedMemberPendingChanges;
    if (targetChanges.length === 0) {
      toast({
        title: 'Nothing to sync',
        description: scope === 'all' ? 'No pending status changes.' : 'No pending changes for this member.',
      });
      return;
    }

    setIsSyncingPendingStatuses(true);
    try {
      let synced = 0;
      let failed = 0;
      const successfulKeys = new Set<string>();
      const closedMemberIds = new Set<string>();
      for (const change of targetChanges) {
        const response = await fetch('/api/member-notes', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: change.noteId,
            clientId2: change.clientId2,
            status: change.toStatus,
            resolvedAt: change.toStatus === 'Closed' ? change.resolvedAt || new Date().toISOString() : null,
            actorName: user?.displayName || user?.email || 'Admin',
            actorEmail: user?.email || '',
            pushToCaspio: true,
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.success) {
          failed += 1;
          continue;
        }
        synced += 1;
        successfulKeys.add(change.key);
        if (change.toStatus === 'Closed') {
          closedMemberIds.add(change.clientId2);
        }
      }

      let removedTasks = 0;
      for (const memberId of closedMemberIds) {
        removedTasks += await clearMemberFollowUpTasks(memberId);
      }

      if (successfulKeys.size > 0) {
        setPendingStatusChanges((prev) => {
          const next = { ...prev };
          for (const key of successfulKeys) delete next[key];
          return next;
        });
      }

      if (selectedMember) {
        await handleRequestNotes(selectedMember, { syncFromCaspio: false });
      }

      toast({
        title: 'Pending changes synced',
        description: `${synced} synced${failed ? `, ${failed} failed` : ''}. Cleared ${removedTasks} follow-up task entries.`,
      });
    } finally {
      setIsSyncingPendingStatuses(false);
    }
  }, [
    clearMemberFollowUpTasks,
    handleRequestNotes,
    pendingChangeList,
    selectedMember,
    selectedMemberPendingChanges,
    toast,
    user?.displayName,
    user?.email,
  ]);

  useEffect(() => {
    setSelectedNoteIds((prev) => prev.filter((id) => memberNotes.some((note) => note.id === id)));
  }, [memberNotes]);

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
              Fast lookup from cached historical notes with incremental Caspio updates.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <Card>
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
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Lookup Scope</Label>
                <Select
                  value={memberScope}
                  onValueChange={(value) => setMemberScope(value as 'all' | 'kaiser_assignment')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">General Search (Last Name)</SelectItem>
                    <SelectItem value="kaiser_assignment">Kaiser Staff Assigned Lookup</SelectItem>
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
                  {searchTerm.trim()
                    ? `Searching members for "${searchTerm}"...`
                    : memberScope === 'kaiser_assignment' && kaiserAssignmentFilter !== 'all'
                      ? `Loading Kaiser members assigned to ${kaiserAssignmentFilter}...`
                      : 'Enter last name letters to find CalAIM members'}
                </p>
              </div>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto">
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
                    Search checks last name, first name, and RCFE name.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
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
                <div className="flex items-center gap-2">
                  <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                    Notes are read-only here. Use the sync button to pull latest from Caspio.
                  </div>
                  <Button
                    size="sm"
                    onClick={() => void syncPendingStatusChanges('all')}
                    disabled={isSyncingPendingStatuses || pendingChangeList.length === 0}
                  >
                    {isSyncingPendingStatuses ? (
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    ) : (
                      <CheckCircle className="mr-2 h-3 w-3" />
                    )}
                    Sync All Pending ({pendingChangeList.length})
                  </Button>
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
                <h3 className="text-lg font-medium mb-2">Notes Not Loaded Yet</h3>
                <p className="text-muted-foreground mb-4">
                  Click Sync Notes to pull all Caspio notes for {selectedMember.firstName} {selectedMember.lastName}.
                </p>
                <div className="flex items-center justify-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRequestNotes(selectedMember, { syncFromCaspio: true })}
                    disabled={isNotesLoading}
                  >
                    <Download className="mr-2 h-3 w-3" />
                    Sync Notes
                  </Button>
                </div>
                {pendingChangeList.length > 0 ? (
                  <div className="mx-auto mt-4 max-w-2xl rounded-md border border-amber-200 bg-amber-50 p-3 text-left">
                    <div className="text-sm font-medium text-amber-900">
                      Pending status changes: {pendingChangeList.length}
                    </div>
                    <div className="mt-1 text-xs text-amber-900">
                      {pendingByMember.map((row) => (
                        <div key={`${row.clientId2}-${row.memberName}`}>
                          {row.memberName} ({row.clientId2}): {row.total} change(s)
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => void syncPendingStatusChanges('selected')}
                        disabled={isSyncingPendingStatuses || selectedMemberPendingChanges.length === 0}
                      >
                        {isSyncingPendingStatuses ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                        Sync this member ({selectedMemberPendingChanges.length})
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-md border p-3">
                  <div className="text-sm font-medium mb-2">Follow-up from Daily Task Calendar</div>
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
                </div>

                <div className="flex justify-between items-center">
                  <div className="text-sm text-muted-foreground">
                    Showing {memberNotes.length} notes for {selectedMember.firstName} {selectedMember.lastName}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleRequestNotes(selectedMember, { syncFromCaspio: true })}
                      disabled={isNotesLoading}
                    >
                      {isNotesLoading ? (
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      ) : (
                        <Download className="mr-2 h-3 w-3" />
                      )}
                      Sync Notes
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => void syncPendingStatusChanges('selected')}
                      disabled={isSyncingPendingStatuses || selectedMemberPendingChanges.length === 0}
                    >
                      {isSyncingPendingStatuses ? (
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      ) : (
                        <CheckCircle className="mr-2 h-3 w-3" />
                      )}
                      Sync Pending ({selectedMemberPendingChanges.length})
                    </Button>
                  </div>
                </div>
                {pendingChangeList.length > 0 ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    <div className="font-medium">Pending Caspio sync: {pendingChangeList.length} change(s)</div>
                    <div className="mt-1 space-y-0.5">
                      {pendingByMember.map((row) => (
                        <div key={`${row.clientId2}-${row.memberName}`}>
                          {row.memberName} ({row.clientId2}): {row.total} ({row.closing} close, {row.reopening} reopen)
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
                  <div className="text-xs text-muted-foreground">
                    Selected notes: <span className="font-medium text-foreground">{selectedNoteIds.length}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={selectAllOpenNotesInView}
                      disabled={isBulkClosing || selectableOpenNoteIds.length === 0}
                    >
                      Select All Open
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={clearSelectedNotes}
                      disabled={isBulkClosing || selectedNoteIds.length === 0}
                    >
                      Clear
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => void closeSelectedNotes()}
                      disabled={isBulkClosing || selectedNoteIds.length === 0}
                    >
                      {isBulkClosing ? (
                        <>
                          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                          Closing...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="mr-2 h-3.5 w-3.5" />
                          Close Selected Notes
                        </>
                      )}
                    </Button>
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground -mt-1">
                  Open notes in view: {selectableOpenNoteIds.length} | Selected open: {selectedOpenCount}
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
                    🟢 Open
                  </Button>
                  <Button
                    size="sm"
                    variant={noteFilter.status === 'Closed' ? 'default' : 'outline'}
                    onClick={() => setNoteFilter(prev => ({ ...prev, status: 'Closed' }))}
                  >
                    🔴 Closed
                  </Button>
                </div>

                <div className="rounded-md border divide-y max-h-[70vh] overflow-y-auto">
                  {sortedNotes.map((note) => {
                    const pendingChange = pendingStatusByNoteKey.get(
                      pendingStatusKey(String(note.id || ''), String(note.clientId2 || ''))
                    );
                    const followUpAssignedTo = String(note.assignedToName || note.assignedTo || '').trim();
                    return (
                    <div key={note.id} className={`p-3 ${!note.isRead ? 'bg-blue-50' : ''}`}>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={selectedNoteIds.includes(note.id)}
                            onCheckedChange={(checked) => toggleSelectedNote(note.id, Boolean(checked))}
                            aria-label={`Select note ${note.id}`}
                          />
                          <Badge variant="outline">{noteStatusLabel(note.status)}</Badge>
                          {pendingChange ? (
                            <Badge variant="secondary" className="bg-amber-100 text-amber-900 border border-amber-200">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Status changed (pending sync)
                            </Badge>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-[11px] text-muted-foreground">
                            {format(new Date(note.createdAt), 'MMM d, yyyy h:mm a')}
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[10px]"
                            onClick={() => void handleToggleStatus(note)}
                            title={normalizeNoteStatus(note.status) === 'Closed' ? 'Reopen note' : 'Close note'}
                          >
                            <CheckCircle className="h-3 w-3 mr-1" />
                            {normalizeNoteStatus(note.status) === 'Closed' ? 'Reopen' : 'Close'}
                          </Button>
                          <AlertDialog
                            open={deleteTarget?.id === note.id}
                            onOpenChange={(open) => {
                              if (!open) setDeleteTarget(null);
                            }}
                          >
                            <AlertDialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-[10px] text-red-600 hover:text-red-700"
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

                      <div className="text-sm whitespace-pre-wrap break-words">{note.noteText}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        By: {note.createdByName}
                        {followUpAssignedTo ? ` • Follow-up staff assigned: ${followUpAssignedTo}` : ''}
                        {note.followUpDate ? ` • Follow-up: ${format(new Date(note.followUpDate), 'MMM d, yyyy')}` : ''}
                      </div>
                    </div>
                    );
                  })}

                  {sortedNotes.length === 0 && (
                    <div className="text-center py-8">
                      <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-medium mb-2">No Notes Found</h3>
                      <p className="text-muted-foreground">
                        No notes match the selected status filter
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

export default function MemberNotesPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>}>
      <MemberNotesPageContent />
    </Suspense>
  );
}