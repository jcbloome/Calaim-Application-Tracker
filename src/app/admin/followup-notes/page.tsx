'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, RefreshCw, CheckCircle2, CircleX, Filter, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type FollowUpNote = {
  id: string;
  noteId: string;
  clientId2?: string;
  memberName?: string;
  senderName?: string;
  calaimMco?: string;
  kaiserStatus?: string;
  comments?: string;
  timeStamp?: string;
  followUpDate?: string;
  followUpAssignment?: string;
  followUpStatus?: string;
  syncedAt?: string;
};

type ClientNote = {
  id: string;
  noteId: string;
  clientId2: string;
  comments: string;
  timeStamp: string;
  followUpDate?: string;
  followUpAssignment?: string;
  followUpStatus?: string;
  userFirst?: string;
  userFullName?: string;
  userRole?: string;
};

type CanonicalFollowUpStatus = 'Open' | 'Closed';

const normalizeFollowUpStatus = (value: unknown): CanonicalFollowUpStatus => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'Open';
  if (raw === 'close' || raw === 'closed' || raw.includes('closed')) return 'Closed';
  if (raw.includes('open')) return 'Open';
  return 'Open';
};

const followUpStatusLabel = (value: unknown) =>
  normalizeFollowUpStatus(value) === 'Closed' ? '🔴Closed' : '🟢Open';

export default function FollowUpNotesPage() {
  const { user, isAdmin, isLoading: adminLoading } = useAdmin();
  const { toast } = useToast();

  const formatCreatedDate = useCallback((value: unknown) => {
    const raw = String(value || '').trim();
    if (!raw) return '—';
    const ymd = raw.includes('T') ? raw.slice(0, 10) : raw.slice(0, 10);
    const parts = ymd.split('-');
    if (parts.length === 3 && parts[0]?.length === 4) {
      const [y, m, d] = parts;
      if (y && m && d) return `${m}/${d}/${y}`;
    }
    // Fallback: try Date parse, then format as MM/DD/YYYY in local time.
    try {
      const dt = new Date(raw);
      const ms = dt.getTime();
      if (!ms || Number.isNaN(ms)) return raw;
      const mm = String(dt.getMonth() + 1).padStart(2, '0');
      const dd = String(dt.getDate()).padStart(2, '0');
      const yyyy = String(dt.getFullYear());
      return `${mm}/${dd}/${yyyy}`;
    } catch {
      return raw;
    }
  }, []);

  const [notes, setNotes] = useState<FollowUpNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [allNotesOpen, setAllNotesOpen] = useState(false);
  const [allNotesLoading, setAllNotesLoading] = useState(false);
  const [allNotesError, setAllNotesError] = useState<string | null>(null);
  const [allNotesClientId2, setAllNotesClientId2] = useState<string>('');
  const [allNotesMemberName, setAllNotesMemberName] = useState<string>('');
  const [allNotesMode, setAllNotesMode] = useState<'recent' | 'all'>('recent');
  const [allNotes, setAllNotes] = useState<ClientNote[]>([]);

  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [kaiserOnly, setKaiserOnly] = useState(true);
  const [onlyDated, setOnlyDated] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const [draftById, setDraftById] = useState<
    Record<string, { followUpDate: string; followUpStatus: CanonicalFollowUpStatus | string }>
  >({});
  const [syncingChanges, setSyncingChanges] = useState(false);
  const [bulkFollowUpDate, setBulkFollowUpDate] = useState('');

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([k]) => k),
    [selected]
  );

  const filteredNotes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((n) => {
      const hay = [
        String(n.noteId || ''),
        String(n.clientId2 || ''),
        String(n.memberName || ''),
        String(n.senderName || ''),
        String(n.kaiserStatus || ''),
        String(n.followUpAssignment || ''),
        String(n.comments || ''),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [notes, query]);

  const noteById = useMemo(() => {
    const m = new Map<string, FollowUpNote>();
    notes.forEach((n) => {
      const id = String(n.noteId || n.id);
      m.set(id, n);
    });
    return m;
  }, [notes]);

  const pendingUpdates = useMemo(() => {
    const out: { noteId: string; followUpStatus?: string; followUpDate?: string }[] = [];
    for (const [id, d] of Object.entries(draftById)) {
      const n = noteById.get(id);
      if (!n) continue;
      const origStatus = normalizeFollowUpStatus(n.followUpStatus);
      const origDate = String(n.followUpDate || '').slice(0, 10);
      const nextStatus = normalizeFollowUpStatus(String(d.followUpStatus || '').trim() || origStatus);
      const nextDate = String(d.followUpDate || '');

      const statusChanged = nextStatus !== origStatus;
      const dateChanged = nextDate !== origDate;
      if (!statusChanged && !dateChanged) continue;

      const update: { noteId: string; followUpStatus?: string; followUpDate?: string } = { noteId: id };
      if (statusChanged) update.followUpStatus = nextStatus;
      if (dateChanged) update.followUpDate = nextDate; // '' clears
      out.push(update);
    }
    return out;
  }, [draftById, noteById]);

  const loadNotes = useCallback(
    async (opts?: { toastOnSuccess?: boolean }) => {
      if (!user?.uid) return;
      setLoadingNotes(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set('userId', user.uid);
        // Include closed notes by default so staff can see full context.
        params.set('includeClosed', statusFilter === 'open' ? 'false' : 'true');
        if (kaiserOnly) params.set('kaiserOnly', 'true');
        if (onlyDated) params.set('onlyDated', 'true');
        params.set('max', '2000');
        const res = await fetch(`/api/staff/followups/list?${params.toString()}`);
        const data = await res.json().catch(() => ({} as any));
        if (!res.ok || !data?.success) throw new Error(data?.error || `Failed to load notes (HTTP ${res.status})`);
        const list: FollowUpNote[] = Array.isArray(data?.notes) ? data.notes : [];
        const normalized = list.map((n) => ({
          ...n,
          followUpStatus: normalizeFollowUpStatus((n as any)?.followUpStatus),
        }));
        const filtered =
          statusFilter === 'open'
            ? normalized.filter((n) => normalizeFollowUpStatus(n?.followUpStatus) !== 'Closed')
            : statusFilter === 'closed'
              ? normalized.filter((n) => normalizeFollowUpStatus(n?.followUpStatus) === 'Closed')
              : normalized;

        setNotes(filtered);
        setSelected({});
        setDraftById({});
        if (opts?.toastOnSuccess) {
          toast({
            title: 'Loaded follow-up notes',
            description: `${filtered.length} note(s)`,
          });
        }
      } catch (e: any) {
        setNotes([]);
        setSelected({});
        setDraftById({});
        setError(e?.message || 'Failed to load notes.');
      } finally {
        setLoadingNotes(false);
      }
    },
    [kaiserOnly, onlyDated, statusFilter, toast, user?.uid]
  );

  const syncFromCaspio = useCallback(async () => {
    if (!user?.uid) return;
    setLoadingNotes(true);
    setError(null);
    try {
      // Sync follow-up notes (open + has Follow_Up_Date) into Firestore cache.
      // This is the same sync used by the Daily Task Tracker follow-up calendar.
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
      monthEnd.setHours(23, 59, 59, 999);

      const res = await fetch('/api/staff/followups/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          start: monthStart.toISOString(),
          end: monthEnd.toISOString(),
          mode: 'full',
        }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) throw new Error(data?.error || `Sync failed (HTTP ${res.status})`);
      toast({
        title: 'Synced from Caspio',
        description: `Synced ${Number(data?.synced || 0)} note(s)`,
      });
      await loadNotes();
    } catch (e: any) {
      setError(e?.message || 'Sync failed.');
      toast({ title: 'Sync failed', description: e?.message || 'Could not sync notes.', variant: 'destructive' });
    } finally {
      setLoadingNotes(false);
    }
  }, [loadNotes, toast, user?.uid]);

  const importAllOpenFollowUps = useCallback(async () => {
    if (!user?.uid) return;
    const ok =
      typeof window !== 'undefined'
        ? window.confirm(
            'Initial import will pull ALL open follow-up notes with dates from Caspio for your assignment. This may take a bit the first time. Continue?'
          )
        : false;
    if (!ok) return;

    setLoadingNotes(true);
    setError(null);
    try {
      const res = await fetch('/api/staff/followups/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          mode: 'full',
          // No start/end = import all open follow-ups with dates
        }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) throw new Error(data?.error || `Import failed (HTTP ${res.status})`);
      toast({
        title: 'Initial import complete',
        description: `Imported ${Number(data?.synced || 0)} open follow-up note(s)`,
      });
      await loadNotes();
    } catch (e: any) {
      setError(e?.message || 'Import failed.');
      toast({ title: 'Import failed', description: e?.message || 'Could not import notes.', variant: 'destructive' });
    } finally {
      setLoadingNotes(false);
    }
  }, [loadNotes, toast, user?.uid]);

  const bulkSetStatus = useCallback(
    async (followUpStatus: 'Closed' | 'Open') => {
      if (selectedIds.length === 0) return;
      setDraftById((prev) => {
        const next = { ...prev };
        selectedIds.forEach((id) => {
          const n = noteById.get(id);
          const origStatus = normalizeFollowUpStatus(n?.followUpStatus);
          const origDate = String(n?.followUpDate || '').slice(0, 10);
          const existing = next[id];
          next[id] = {
            followUpStatus,
            followUpDate: existing?.followUpDate ?? origDate,
          };
          // Preserve date draft if already set
          if (existing?.followUpDate !== undefined) next[id].followUpDate = existing.followUpDate;
          // Preserve status if draft exists and we're not changing it (not the case here)
          if (!origStatus && existing?.followUpStatus) next[id].followUpStatus = existing.followUpStatus;
        });
        return next;
      });
      toast({ title: 'Staged changes', description: `Marked ${selectedIds.length} as ${followUpStatus}. Click “Sync changes”.` });
    },
    [noteById, selectedIds, toast]
  );

  const bulkSetFollowUpDateForSelected = useCallback(async () => {
    if (!bulkFollowUpDate.trim()) return;
    if (selectedIds.length === 0) return;
    setDraftById((prev) => {
      const next = { ...prev };
      selectedIds.forEach((id) => {
        const n = noteById.get(id);
        const origStatus = normalizeFollowUpStatus(n?.followUpStatus);
        const existing = next[id];
        next[id] = {
          followUpStatus: existing?.followUpStatus ?? origStatus,
          followUpDate: bulkFollowUpDate.trim(),
        };
      });
      return next;
    });
    setBulkFollowUpDate('');
    toast({ title: 'Staged changes', description: `Set date for ${selectedIds.length} note(s). Click “Sync changes”.` });
  }, [bulkFollowUpDate, noteById, selectedIds, toast]);

  const syncStagedChanges = useCallback(async () => {
    if (pendingUpdates.length === 0) return;
    setSyncingChanges(true);
    try {
      const res = await fetch('/api/staff/followups/bulk-update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ updates: pendingUpdates }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) throw new Error(data?.error || `Sync failed (HTTP ${res.status})`);
      toast({ title: 'Synced to Caspio', description: `Updated ${Number(data?.updated || 0)} note(s)` });
      setDraftById({});
      await loadNotes();
    } catch (e: any) {
      toast({ title: 'Sync failed', description: e?.message || 'Could not sync changes.', variant: 'destructive' });
    } finally {
      setSyncingChanges(false);
    }
  }, [loadNotes, pendingUpdates, toast]);

  const loadAllNotesForClient = useCallback(
    async (opts?: {
      clientId2: string;
      memberName?: string;
      forceRefresh?: boolean;
      mode?: 'recent' | 'all';
    }) => {
      const clientId2 = String(opts?.clientId2 || '').trim();
      if (!clientId2) return;
      const forceRefresh = opts?.forceRefresh ?? true;
      setAllNotesClientId2(clientId2);
      setAllNotesMemberName(String(opts?.memberName || '').trim());
      const mode = opts?.mode || 'recent';
      setAllNotesMode(mode);
      setAllNotesOpen(true);
      setAllNotesLoading(true);
      setAllNotesError(null);
      try {
        const params = new URLSearchParams();
        params.set('clientId2', clientId2);
        if (mode === 'recent') {
          params.set('months', '3');
        } else {
          params.set('includeAll', 'true');
        }
        if (forceRefresh) params.set('forceRefresh', 'true');
        const res = await fetch(`/api/client-notes?${params.toString()}`);
        const data = await res.json().catch(() => ({} as any));
        const list: ClientNote[] = Array.isArray(data?.data?.notes) ? data.data.notes : [];
        if (!res.ok || !data?.success) throw new Error(data?.error || `Failed to load client notes (HTTP ${res.status})`);
        // Keep UI snappy: show newest 250 notes (full list still exists in Caspio).
        setAllNotes(list.slice(0, 250));
      } catch (e: any) {
        setAllNotes([]);
        setAllNotesError(e?.message || 'Failed to load notes.');
      } finally {
        setAllNotesLoading(false);
      }
    },
    []
  );

  const closeAllOpenWithoutDate = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const res = await fetch('/api/staff/followups/cleanup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: user.uid }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) throw new Error(data?.error || `Cleanup failed (HTTP ${res.status})`);
      toast({
        title: 'Cleanup complete',
        description: data?.message || `Closed ${Number(data?.closed || 0)} note(s)`,
      });
      await loadNotes();
    } catch (e: any) {
      toast({ title: 'Cleanup failed', description: e?.message || 'Could not close notes.', variant: 'destructive' });
    }
  }, [loadNotes, toast, user?.uid]);

  useEffect(() => {
    if (adminLoading) return;
    if (!isAdmin) return;
    if (!user?.uid) return;
    void loadNotes();
  }, [adminLoading, isAdmin, loadNotes, user?.uid]);

  useEffect(() => {
    // Refresh list when filters toggle
    if (adminLoading) return;
    if (!isAdmin) return;
    if (!user?.uid) return;
    void loadNotes();
  }, [adminLoading, isAdmin, kaiserOnly, loadNotes, onlyDated, statusFilter, user?.uid]);

  const allChecked = filteredNotes.length > 0 && filteredNotes.every((n) => Boolean(selected[String(n.noteId || n.id)]));
  const someChecked = filteredNotes.some((n) => Boolean(selected[String(n.noteId || n.id)]));

  if (adminLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Access denied</CardTitle>
            <CardDescription>You must be signed in as staff/admin to view follow-up notes.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Follow-up Notes (Caspio)</h1>
          <p className="text-muted-foreground">
            Notes from <span className="font-mono">connect_tbl_clientnotes</span> assigned to you via <span className="font-mono">Follow_Up_Assignment</span>.
            Sorts by note created date (newest first). Daily Tasks are driven by notes with a follow-up date.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Button className="w-full sm:w-auto" variant="outline" onClick={() => void loadNotes({ toastOnSuccess: true })} disabled={loadingNotes}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loadingNotes ? 'animate-spin' : ''}`} />
            Refresh list
          </Button>
          <Button className="w-full sm:w-auto" onClick={() => void syncFromCaspio()} disabled={loadingNotes}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loadingNotes ? 'animate-spin' : ''}`} />
            Sync from Caspio
          </Button>
          <Button className="w-full sm:w-auto" variant="outline" onClick={() => void importAllOpenFollowUps()} disabled={loadingNotes}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loadingNotes ? 'animate-spin' : ''}`} />
            Initial import (all open)
          </Button>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Controls</CardTitle>
          <CardDescription>Bulk close/reopen and cleanup.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {pendingUpdates.length ? (
            <div className="flex flex-col gap-2 rounded-md border bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm">
                <span className="font-medium">{pendingUpdates.length}</span> staged change(s) not yet synced to Caspio.
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button
                  type="button"
                  onClick={() => void syncStagedChanges()}
                  disabled={syncingChanges || loadingNotes || pendingUpdates.length === 0}
                  className="w-full sm:w-auto"
                >
                  {syncingChanges ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Syncing…
                    </>
                  ) : (
                    'Sync changes to Caspio'
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={syncingChanges || pendingUpdates.length === 0}
                  onClick={() => setDraftById({})}
                  className="w-full sm:w-auto"
                >
                  Discard changes
                </Button>
              </div>
            </div>
          ) : null}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="relative w-full sm:w-[420px]">
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search member, Client_ID2, note text…" />
                {query.trim() ? (
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                    onClick={() => setQuery('')}
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>

              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                <div className="grid grid-cols-3 gap-2 sm:flex sm:gap-1">
                  <Button
                    type="button"
                    variant={statusFilter === 'all' ? 'default' : 'outline'}
                    onClick={() => setStatusFilter('all')}
                    disabled={loadingNotes}
                    className="w-full sm:w-auto"
                  >
                    All
                  </Button>
                  <Button
                    type="button"
                    variant={statusFilter === 'open' ? 'default' : 'outline'}
                    onClick={() => setStatusFilter('open')}
                    disabled={loadingNotes}
                    className="w-full sm:w-auto"
                  >
                    Open
                  </Button>
                  <Button
                    type="button"
                    variant={statusFilter === 'closed' ? 'default' : 'outline'}
                    onClick={() => setStatusFilter('closed')}
                    disabled={loadingNotes}
                    className="w-full sm:w-auto"
                  >
                    Closed
                  </Button>
                </div>
              </div>

              <Button
                type="button"
                disabled={loadingNotes}
                className="gap-2"
                variant={kaiserOnly ? 'default' : 'outline'}
                onClick={() => setKaiserOnly((v) => !v)}
              >
                <Filter className="h-4 w-4" />
                {kaiserOnly ? 'Kaiser only' : 'All MCOs'}
              </Button>

              <Button
                type="button"
                disabled={loadingNotes}
                className="gap-2"
                variant={onlyDated ? 'default' : 'outline'}
                onClick={() => setOnlyDated((v) => !v)}
              >
                <Filter className="h-4 w-4" />
                {onlyDated ? 'Only with follow-up date' : 'All (dated + undated)'}
              </Button>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="secondary">{filteredNotes.length} shown</Badge>
                <Badge variant="secondary">{selectedIds.length} selected</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={bulkFollowUpDate}
                  onChange={(e) => setBulkFollowUpDate(e.target.value)}
                  className="w-full sm:w-[160px]"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={selectedIds.length === 0 || !bulkFollowUpDate.trim()}
                  onClick={() => void bulkSetFollowUpDateForSelected()}
                  className="w-full sm:w-auto"
                >
                  Stage date for selected
                </Button>
              </div>
              <Button className="w-full sm:w-auto" type="button" variant="outline" disabled={selectedIds.length === 0} onClick={() => void bulkSetStatus('Open')}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Stage re-open
              </Button>
              <Button className="w-full sm:w-auto" type="button" disabled={selectedIds.length === 0} onClick={() => void bulkSetStatus('Closed')}>
                <CircleX className="h-4 w-4 mr-2" />
                Stage close
              </Button>
              <Button className="w-full sm:w-auto" type="button" variant="destructive" onClick={() => void closeAllOpenWithoutDate()} disabled={loadingNotes}>
                Close ALL open notes without follow-up date
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Notes</CardTitle>
          <CardDescription>Checkbox-select notes and bulk close/re-open status.</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingNotes ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : filteredNotes.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6">No notes found for your current filters.</div>
          ) : (
            <div className="space-y-3">
              {/* Mobile list: no horizontal overflow */}
              <div className="md:hidden space-y-2">
                <div className="flex items-center justify-between rounded-md border bg-white px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={allChecked}
                      onCheckedChange={(v) => {
                        const want = Boolean(v);
                        if (!want) {
                          setSelected((prev) => {
                            const next = { ...prev };
                            filteredNotes.forEach((n) => {
                              const id = String(n.noteId || n.id);
                              delete next[id];
                            });
                            return next;
                          });
                          return;
                        }
                        setSelected((prev) => {
                          const next = { ...prev };
                          filteredNotes.forEach((n) => {
                            const id = String(n.noteId || n.id);
                            next[id] = true;
                          });
                          return next;
                        });
                      }}
                      aria-label="Select all"
                    />
                    <div className="text-sm font-medium">Select all</div>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant="secondary">{filteredNotes.length}</Badge>
                    <Badge variant="secondary">{selectedIds.length} selected</Badge>
                  </div>
                </div>

                {filteredNotes.map((n) => {
                  const id = String(n.noteId || n.id);
                  const checked = Boolean(selected[id]);
                  const status = normalizeFollowUpStatus(n.followUpStatus);
                  const statusLower = status.toLowerCase();
                  const followUpDateValue = String(n.followUpDate || '').slice(0, 10);
                  const createdValue = formatCreatedDate(n.timeStamp);
                  const senderName = String(n.senderName || '').trim();
                  const kaiserStatus = String(n.kaiserStatus || '').trim();
                  const draft = draftById[id];
                  const draftStatus = normalizeFollowUpStatus(draft?.followUpStatus ?? status);
                  const draftDate = draft?.followUpDate ?? followUpDateValue;
                  const dirty = Boolean(draft) && (draftStatus !== status || draftDate !== followUpDateValue);

                  return (
                    <div key={id} className="rounded-lg border bg-white p-3">
                      <div className="flex items-start gap-3">
                        <Checkbox checked={checked} onCheckedChange={(v) => setSelected((prev) => ({ ...prev, [id]: Boolean(v) }))} />
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium">{n.memberName || '—'}</div>
                              {senderName ? (
                                <div className="truncate text-xs text-muted-foreground">Written by: {senderName}</div>
                              ) : null}
                              {kaiserStatus ? (
                                <div className="truncate text-xs text-muted-foreground">Kaiser: {kaiserStatus}</div>
                              ) : null}
                              {String(n.clientId2 || '').trim() ? (
                                <button
                                  type="button"
                                  className="text-left text-xs underline underline-offset-2 text-blue-700"
                                  onClick={() =>
                                    void loadAllNotesForClient({
                                      clientId2: String(n.clientId2 || '').trim(),
                                      memberName: String(n.memberName || '').trim(),
                                    })
                                  }
                                >
                                  View all notes for this member
                                </button>
                              ) : null}
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                <span className="font-mono">{n.clientId2 || '—'}</span>
                                <span>{createdValue || '—'}</span>
                              </div>
                            </div>
                            <Badge variant={statusLower === 'closed' ? 'outline' : 'secondary'} className="shrink-0">
                              {followUpStatusLabel(status)}
                            </Badge>
                          </div>

                          <div className="grid grid-cols-1 gap-2">
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                              <Input
                                type="date"
                                value={draftDate}
                                onChange={(e) =>
                                  setDraftById((prev) => ({
                                    ...prev,
                                    [id]: { followUpStatus: String(draftStatus), followUpDate: e.target.value },
                                  }))
                                }
                                className="no-date-indicator"
                              />
                              <select
                                className="h-9 rounded-md border bg-background px-3 text-sm"
                                value={normalizeFollowUpStatus(draftStatus)}
                                onChange={(e) =>
                                  setDraftById((prev) => ({
                                    ...prev,
                                    [id]: { followUpStatus: e.target.value, followUpDate: String(draftDate) },
                                  }))
                                }
                              >
                                <option value="Open">🟢Open</option>
                                <option value="Closed">🔴Closed</option>
                              </select>
                            </div>
                            <div className="whitespace-pre-wrap break-words text-sm text-slate-900">
                              {(n.comments || '').slice(0, 420) || '—'}
                              {n.comments && n.comments.length > 420 ? <span className="text-xs text-muted-foreground"> …</span> : null}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              {dirty ? (
                                <Badge variant="secondary" className="h-9 items-center px-3">
                                  Edited
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="h-9 items-center px-3">
                                  No changes
                                </Badge>
                              )}
                              <Button
                                type="button"
                                size="sm"
                                className="flex-1"
                                variant="outline"
                                disabled={!draftById[id]}
                                onClick={() =>
                                  setDraftById((prev) => {
                                    const next = { ...prev };
                                    delete next[id];
                                    return next;
                                  })
                                }
                              >
                                Reset
                              </Button>
                            </div>
                            {String(n.followUpAssignment || '').trim() ? (
                              <div className="text-xs text-muted-foreground truncate">{String(n.followUpAssignment || '').trim()}</div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-700">
                    <tr>
                      <th className="p-3 text-left w-[46px]">
                        <Checkbox
                          checked={allChecked}
                          onCheckedChange={(v) => {
                            const want = Boolean(v);
                            if (!want) {
                              // Clear only visible
                              setSelected((prev) => {
                                const next = { ...prev };
                                filteredNotes.forEach((n) => {
                                  const id = String(n.noteId || n.id);
                                  delete next[id];
                                });
                                return next;
                              });
                              return;
                            }
                            setSelected((prev) => {
                              const next = { ...prev };
                              filteredNotes.forEach((n) => {
                                const id = String(n.noteId || n.id);
                                next[id] = true;
                              });
                              return next;
                            });
                          }}
                          aria-label="Select all"
                        />
                      </th>
                      <th className="p-3 text-left min-w-[140px]">Created</th>
                      <th className="p-3 text-left min-w-[200px]">Follow-up</th>
                      <th className="p-3 text-left min-w-[180px]">Member</th>
                      <th className="p-3 text-left min-w-[110px]">Client_ID2</th>
                      <th className="p-3 text-left">Note</th>
                      <th className="p-3 text-left min-w-[170px]">Status</th>
                      <th className="p-3 text-left min-w-[120px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredNotes.map((n) => {
                      const id = String(n.noteId || n.id);
                      const checked = Boolean(selected[id]);
                      const status = normalizeFollowUpStatus(n.followUpStatus);
                      const statusLower = status.toLowerCase();
                      const followUpDateValue = String(n.followUpDate || '').slice(0, 10);
                      const createdValue = formatCreatedDate(n.timeStamp);
                      const senderName = String(n.senderName || '').trim();
                      const kaiserStatus = String(n.kaiserStatus || '').trim();
                      const draft = draftById[id];
                      const draftStatus = normalizeFollowUpStatus(draft?.followUpStatus ?? status);
                      const draftDate = draft?.followUpDate ?? followUpDateValue;
                      const dirty = Boolean(draft) && (draftStatus !== status || draftDate !== followUpDateValue);
                      return (
                        <tr key={id} className="border-t align-top">
                          <td className="p-3">
                            <Checkbox checked={checked} onCheckedChange={(v) => setSelected((prev) => ({ ...prev, [id]: Boolean(v) }))} />
                          </td>
                          <td className="p-3">
                            <div className="font-medium">{createdValue || '—'}</div>
                          </td>
                          <td className="p-3">
                            <div className="flex flex-col gap-1">
                              <Input
                                type="date"
                                value={draftDate}
                                onChange={(e) =>
                                  setDraftById((prev) => ({
                                    ...prev,
                                    [id]: { followUpStatus: String(draftStatus), followUpDate: e.target.value },
                                  }))
                                }
                                className="w-[160px] no-date-indicator"
                              />
                              <div className="text-xs text-muted-foreground">{String(n.followUpAssignment || '').trim() || '—'}</div>
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="font-medium">{n.memberName || '—'}</div>
                            {senderName ? <div className="text-xs text-muted-foreground">Written by: {senderName}</div> : null}
                            {kaiserStatus ? <div className="text-xs text-muted-foreground">Kaiser: {kaiserStatus}</div> : null}
                            {String(n.clientId2 || '').trim() ? (
                              <button
                                type="button"
                                className="mt-1 text-left text-xs underline underline-offset-2 text-blue-700"
                                onClick={() =>
                                  void loadAllNotesForClient({
                                    clientId2: String(n.clientId2 || '').trim(),
                                    memberName: String(n.memberName || '').trim(),
                                  })
                                }
                              >
                                View all notes
                              </button>
                            ) : null}
                          </td>
                          <td className="p-3">
                            <div className="font-mono text-xs">{n.clientId2 || '—'}</div>
                          </td>
                          <td className="p-3">
                            <div className="whitespace-pre-wrap break-words text-slate-900">
                              {(n.comments || '').slice(0, 600) || '—'}
                              {n.comments && n.comments.length > 600 ? <span className="text-xs text-muted-foreground"> …</span> : null}
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <select
                                className="h-9 rounded-md border bg-background px-3 text-sm"
                                value={normalizeFollowUpStatus(draftStatus)}
                                onChange={(e) =>
                                  setDraftById((prev) => ({
                                    ...prev,
                                    [id]: { followUpStatus: e.target.value, followUpDate: String(draftDate) },
                                  }))
                                }
                              >
                                <option value="Open">🟢Open</option>
                                <option value="Closed">🔴Closed</option>
                              </select>
                              <Badge variant={statusLower === 'closed' ? 'outline' : 'secondary'}>{followUpStatusLabel(status)}</Badge>
                              {dirty ? <Badge variant="secondary">Edited</Badge> : null}
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={!draftById[id]}
                                onClick={() =>
                                  setDraftById((prev) => {
                                    const next = { ...prev };
                                    delete next[id];
                                    return next;
                                  })
                                }
                              >
                                Reset
                              </Button>
                              {String(n.clientId2 || '').trim() ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    void loadAllNotesForClient({
                                      clientId2: String(n.clientId2 || '').trim(),
                                      memberName: String(n.memberName || '').trim(),
                                    })
                                  }
                                >
                                  All notes
                                </Button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {someChecked ? (
            <div className="mt-3 text-xs text-muted-foreground">
              Tip: After closing notes, your Daily Task Tracker will only show follow-ups that have a follow-up date.
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog
        open={allNotesOpen}
        onOpenChange={(v) => {
          setAllNotesOpen(v);
          if (!v) {
            setAllNotesError(null);
            setAllNotes([]);
            setAllNotesClientId2('');
            setAllNotesMemberName('');
            setAllNotesMode('recent');
          }
        }}
      >
        <DialogContent className="max-w-3xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">
              All client notes {allNotesMemberName ? `— ${allNotesMemberName}` : ''}{' '}
              {allNotesClientId2 ? <span className="font-mono text-xs text-muted-foreground">({allNotesClientId2})</span> : null}
            </DialogTitle>
            <DialogDescription>
              {allNotesMode === 'recent' ? (
                <>
                  Showing the last 3 months of notes from <span className="font-mono">connect_tbl_clientnotes</span> (newest first).
                </>
              ) : (
                <>
                  Showing all notes from <span className="font-mono">connect_tbl_clientnotes</span> (newest first).
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-muted-foreground">
              Showing {allNotes.length} note(s){allNotes.length >= 250 ? ' (latest 250)' : ''}.
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {allNotesMode === 'recent' ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={allNotesLoading || !allNotesClientId2}
                  onClick={() =>
                    void loadAllNotesForClient({
                      clientId2: allNotesClientId2,
                      memberName: allNotesMemberName,
                      forceRefresh: true,
                      mode: 'all',
                    })
                  }
                >
                  Load older notes
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  disabled={allNotesLoading || !allNotesClientId2}
                  onClick={() =>
                    void loadAllNotesForClient({
                      clientId2: allNotesClientId2,
                      memberName: allNotesMemberName,
                      forceRefresh: true,
                      mode: 'recent',
                    })
                  }
                >
                  Back to last 3 months
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                disabled={allNotesLoading || !allNotesClientId2}
                onClick={() =>
                  void loadAllNotesForClient({
                    clientId2: allNotesClientId2,
                    memberName: allNotesMemberName,
                    forceRefresh: true,
                    mode: allNotesMode,
                  })
                }
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${allNotesLoading ? 'animate-spin' : ''}`} />
                Refresh from Caspio
              </Button>
            </div>
          </div>

          {allNotesError ? (
            <Alert variant="destructive">
              <AlertDescription>{allNotesError}</AlertDescription>
            </Alert>
          ) : null}

          <div className="max-h-[70vh] overflow-y-auto rounded-md border bg-white">
            {allNotesLoading ? (
              <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : allNotes.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">No notes found for this member.</div>
            ) : (
              <div className="divide-y">
                {allNotes.map((n) => {
                  const created = formatCreatedDate(n.timeStamp);
                  const writer = String(n.userFirst || '').trim() || String(n.userFullName || '').trim() || '—';
                  const followUpStatus = normalizeFollowUpStatus(n.followUpStatus);
                  const isClosed = followUpStatus === 'Closed';
                  return (
                    <div key={String(n.noteId || n.id)} className="p-4 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-medium">{created}</div>
                        <div className="flex flex-wrap items-center gap-2">
                          {followUpStatus ? (
                            <Badge variant={isClosed ? 'outline' : 'secondary'}>{followUpStatusLabel(followUpStatus)}</Badge>
                          ) : null}
                          {String(n.followUpDate || '').slice(0, 10) ? (
                            <Badge variant="outline">Follow-up: {String(n.followUpDate || '').slice(0, 10)}</Badge>
                          ) : null}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">Written by: {writer}</div>
                      <div className="whitespace-pre-wrap break-words text-sm text-slate-900">{String(n.comments || '').trim() || '—'}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

