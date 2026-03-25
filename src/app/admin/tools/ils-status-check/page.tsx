'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

type KaiserMember = {
  client_ID2: string;
  memberFirstName: string;
  memberLastName: string;
  memberMrn?: string;
  birthDate?: string;
  CalAIM_MCO?: string;
  CalAIM_Status?: string;
  Kaiser_User_Assignment?: string;
};

type MemberNote = {
  id: string;
  clientId2: string;
  noteText: string;
  createdAt: string;
  createdByName?: string;
  source?: string;
};

type SyncProgress = {
  total: number;
  complete: number;
  success: number;
  failed: number;
  existingNotesLoaded: number;
  newNotesImported: number;
  recentErrors: string[];
  currentMember: string;
  stopped: boolean;
};

const normalizeCalaimStatus = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const toCanonicalCalaimStatus = (value: unknown) => {
  const key = normalizeCalaimStatus(value);
  if (!key) return '';
  if (key === 'authorized') return 'Authorized';
  return String(value ?? '').trim();
};

const csvEscape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const isRateLimitError = (error: unknown) => {
  const msg = String((error as any)?.message || '').toLowerCase();
  return msg.includes('429') || msg.includes('too many requests') || msg.includes('rate limit');
};

export default function IlsStatusCheckPage() {
  const { toast } = useToast();
  const [members, setMembers] = useState<KaiserMember[]>([]);
  const [notesByClientId, setNotesByClientId] = useState<Record<string, MemberNote[]>>({});
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [loadingSavedNotes, setLoadingSavedNotes] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncingOne, setSyncingOne] = useState<string>('');
  const [search, setSearch] = useState('');
  const [assignmentFilter, setAssignmentFilter] = useState('all');
  const [noteDateFrom, setNoteDateFrom] = useState('');
  const [noteDateTo, setNoteDateTo] = useState('');
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [lastSyncNewNotes, setLastSyncNewNotes] = useState(0);

  const stopRef = useRef(false);
  const controllersRef = useRef<Set<AbortController>>(new Set());
  const cooldownUntilRef = useRef(0);

  const getMemberAssignment = useCallback((m: KaiserMember) => {
    return String(m.Kaiser_User_Assignment || 'Unassigned').trim() || 'Unassigned';
  }, []);

  const matchesAssignmentFilter = useCallback(
    (m: KaiserMember) => (assignmentFilter === 'all' ? true : getMemberAssignment(m) === assignmentFilter),
    [assignmentFilter, getMemberAssignment]
  );

  const fetchMembers = useCallback(async () => {
    setLoadingMembers(true);
    try {
      const res = await fetch('/api/kaiser-members');
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Failed to load members (HTTP ${res.status})`);
      }

      const rows = Array.isArray(data?.members) ? data.members : [];
      const onlyKaiserAuthorized = rows
        .filter((m: any) => String(m?.CalAIM_MCO || '').trim().toLowerCase() === 'kaiser')
        .filter((m: any) => toCanonicalCalaimStatus(m?.CalAIM_Status) === 'Authorized')
        .map((m: any) => ({
          client_ID2: String(m?.client_ID2 || m?.Client_ID2 || '').trim(),
          memberFirstName: String(m?.memberFirstName || '').trim(),
          memberLastName: String(m?.memberLastName || '').trim(),
          memberMrn: String(m?.memberMrn || '').trim(),
          birthDate: String(m?.birthDate || m?.Birth_Date || '').trim(),
          CalAIM_MCO: String(m?.CalAIM_MCO || '').trim(),
          CalAIM_Status: String(m?.CalAIM_Status || '').trim(),
          Kaiser_User_Assignment: String(m?.Kaiser_User_Assignment || m?.Staff_Assigned || '').trim() || 'Unassigned',
        }))
        .filter((m: KaiserMember) => m.client_ID2)
        .sort((a: KaiserMember, b: KaiserMember) =>
          `${a.memberLastName}, ${a.memberFirstName}`.localeCompare(`${b.memberLastName}, ${b.memberFirstName}`)
        );

      setMembers(onlyKaiserAuthorized);
      setNotesByClientId({});
      setLastSyncNewNotes(0);
      setSyncProgress(null);
      toast({
        title: 'Members loaded',
        description: `Loaded ${onlyKaiserAuthorized.length} Kaiser Authorized members.`,
      });
    } catch (error: any) {
      toast({
        title: 'Load failed',
        description: error?.message || 'Could not load Kaiser Authorized members.',
        variant: 'destructive',
      });
    } finally {
      setLoadingMembers(false);
    }
  }, [toast]);

  const fetchMemberNotes = useCallback(
    async (member: KaiserMember, opts?: { signal?: AbortSignal; skipSync?: boolean; repairIfEmpty?: boolean }) => {
      const query = new URLSearchParams({
        clientId2: member.client_ID2,
        forceSync: 'false',
        skipSync: opts?.skipSync ? 'true' : 'false',
        repairIfEmpty: opts?.repairIfEmpty ? 'true' : 'false',
      });
      const res = await fetch(`/api/member-notes?${query.toString()}`, { signal: opts?.signal });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Failed to sync notes for ${member.client_ID2}`);
      }
      const notes = Array.isArray(data?.notes) ? (data.notes as MemberNote[]) : [];
      setNotesByClientId((prev) => ({ ...prev, [member.client_ID2]: notes }));
      return {
        totalNotes: notes.length,
        newNotesCount: Number(data?.newNotesCount || 0),
        repairImportedCount: Number(data?.repairImportedCount || 0),
        repairedFromEmptyStore: Boolean(data?.repairedFromEmptyStore),
      };
    },
    []
  );

  const syncSingleMember = useCallback(
    async (member: KaiserMember) => {
      setSyncingOne(member.client_ID2);
      try {
        const result = await fetchMemberNotes(member, { skipSync: false });
        toast({
          title: 'Member synced',
          description: `${member.memberFirstName} ${member.memberLastName}: ${result.totalNotes} total notes (${result.newNotesCount} new).`,
        });
      } catch (error: any) {
        toast({
          title: 'Sync failed',
          description: error?.message || 'Could not sync member notes.',
          variant: 'destructive',
        });
      } finally {
        setSyncingOne('');
      }
    },
    [fetchMemberNotes, toast]
  );

  const loadSavedNotesOnly = useCallback(async () => {
    const scope = members.filter(matchesAssignmentFilter);
    if (scope.length === 0) return;

    stopRef.current = false;
    controllersRef.current.forEach((c) => c.abort());
    controllersRef.current.clear();
    setLoadingSavedNotes(true);
    setSyncProgress({
      total: scope.length,
      complete: 0,
      success: 0,
      failed: 0,
      existingNotesLoaded: 0,
      newNotesImported: 0,
      recentErrors: [],
      currentMember: '',
      stopped: false,
    });

    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    let idx = 0;
    const concurrency = 3;

    const addRecentError = (msg: string) => {
      setSyncProgress((prev) =>
        prev ? { ...prev, recentErrors: [msg, ...prev.recentErrors].slice(0, 5) } : prev
      );
    };

    const worker = async () => {
      while (true) {
        if (stopRef.current) return;
        const i = idx;
        idx += 1;
        if (i >= scope.length) return;
        const member = scope[i];
        setSyncProgress((prev) =>
          prev ? { ...prev, currentMember: `${member.memberLastName}, ${member.memberFirstName}` } : prev
        );

        const controller = new AbortController();
        controllersRef.current.add(controller);
        try {
          const result = await fetchMemberNotes(member, {
            signal: controller.signal,
            skipSync: true,
            repairIfEmpty: false,
          });
          setSyncProgress((prev) =>
            prev
              ? {
                  ...prev,
                  complete: prev.complete + 1,
                  success: prev.success + 1,
                  existingNotesLoaded: prev.existingNotesLoaded + result.totalNotes,
                }
              : prev
          );
          await delay(80);
        } catch (error: any) {
          const aborted = String(error?.name || '').toLowerCase() === 'aborterror';
          if (aborted) {
            setSyncProgress((prev) => (prev ? { ...prev, stopped: true } : prev));
            return;
          }
          const label = `${member.memberLastName}, ${member.memberFirstName} (${member.client_ID2})`;
          addRecentError(`${label}: ${String(error?.message || 'Failed to load saved notes')}`);
          setSyncProgress((prev) =>
            prev ? { ...prev, complete: prev.complete + 1, failed: prev.failed + 1 } : prev
          );
        } finally {
          controllersRef.current.delete(controller);
        }
      }
    };

    try {
      await Promise.all(Array.from({ length: concurrency }, () => worker()));
      setSyncProgress((prev) => (prev ? { ...prev, currentMember: '' } : prev));
      toast({
        title: stopRef.current ? 'Load stopped' : 'Saved notes loaded',
        description: stopRef.current
          ? 'Stopped by user.'
          : `Loaded ${scope.length} members from saved notes store.`,
      });
    } finally {
      controllersRef.current.forEach((c) => c.abort());
      controllersRef.current.clear();
      setLoadingSavedNotes(false);
    }
  }, [fetchMemberNotes, matchesAssignmentFilter, members, toast]);

  const syncAllNewNotes = useCallback(async () => {
    const scope = members.filter(matchesAssignmentFilter);
    if (scope.length === 0) return;

    stopRef.current = false;
    controllersRef.current.forEach((c) => c.abort());
    controllersRef.current.clear();
    setSyncingAll(true);
    setSyncProgress({
      total: scope.length,
      complete: 0,
      success: 0,
      failed: 0,
      existingNotesLoaded: 0,
      newNotesImported: 0,
      recentErrors: [],
      currentMember: '',
      stopped: false,
    });

    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    let idx = 0;
    let totalNew = 0;
    const concurrency = 1;

    const addRecentError = (msg: string) => {
      setSyncProgress((prev) =>
        prev ? { ...prev, recentErrors: [msg, ...prev.recentErrors].slice(0, 5) } : prev
      );
    };

    const worker = async () => {
      while (true) {
        if (stopRef.current) return;
        const now = Date.now();
        if (cooldownUntilRef.current > now) {
          const waitMs = cooldownUntilRef.current - now;
          setSyncProgress((prev) =>
            prev ? { ...prev, currentMember: `Rate limit cooldown (${Math.ceil(waitMs / 1000)}s)...` } : prev
          );
          await delay(waitMs);
          if (stopRef.current) return;
        }

        const i = idx;
        idx += 1;
        if (i >= scope.length) return;
        const member = scope[i];
        setSyncProgress((prev) =>
          prev ? { ...prev, currentMember: `${member.memberLastName}, ${member.memberFirstName}` } : prev
        );

        const controller = new AbortController();
        controllersRef.current.add(controller);
        try {
          let result: { totalNotes: number; newNotesCount: number } | null = null;
          let lastError: any = null;
          for (let attempt = 1; attempt <= 4; attempt++) {
            try {
              result = await fetchMemberNotes(member, {
                signal: controller.signal,
                skipSync: false,
                repairIfEmpty: true,
              });
              break;
            } catch (error: any) {
              lastError = error;
              if (String(error?.name || '').toLowerCase() === 'aborterror') throw error;
              if (attempt >= 4) break;
              if (isRateLimitError(error)) {
                const backoffMs = Math.min(30000, 5000 * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 500);
                cooldownUntilRef.current = Date.now() + backoffMs;
                addRecentError(
                  `${member.memberLastName}, ${member.memberFirstName} (${member.client_ID2}): rate-limited, retrying in ${Math.ceil(backoffMs / 1000)}s (attempt ${attempt + 1}/4)`
                );
                await delay(backoffMs);
              } else {
                await delay(600);
              }
            }
          }
          if (!result) throw lastError || new Error('Sync failed');
          totalNew += result.newNotesCount || 0;
          setSyncProgress((prev) =>
            prev
              ? {
                  ...prev,
                  complete: prev.complete + 1,
                  success: prev.success + 1,
                  existingNotesLoaded: prev.existingNotesLoaded + Math.max(0, (result.totalNotes || 0) - (result.newNotesCount || 0)),
                  newNotesImported: prev.newNotesImported + (result.newNotesCount || 0),
                }
              : prev
          );
          await delay(300);
        } catch (error: any) {
          const aborted = String(error?.name || '').toLowerCase() === 'aborterror';
          if (aborted) {
            setSyncProgress((prev) => (prev ? { ...prev, stopped: true } : prev));
            return;
          }
          const label = `${member.memberLastName}, ${member.memberFirstName} (${member.client_ID2})`;
          addRecentError(`${label}: ${String(error?.message || 'Unknown sync error')}`);
          setSyncProgress((prev) =>
            prev ? { ...prev, complete: prev.complete + 1, failed: prev.failed + 1 } : prev
          );
        } finally {
          controllersRef.current.delete(controller);
        }
      }
    };

    try {
      await Promise.all(Array.from({ length: concurrency }, () => worker()));
      setSyncProgress((prev) => (prev ? { ...prev, currentMember: '' } : prev));
      setLastSyncNewNotes(totalNew);
      toast({
        title: stopRef.current ? 'Sync stopped' : 'Sync complete',
        description: stopRef.current
          ? 'Stopped by user.'
          : `Processed ${scope.length} members • Imported ${totalNew} new notes.`,
      });
    } finally {
      controllersRef.current.forEach((c) => c.abort());
      controllersRef.current.clear();
      setSyncingAll(false);
    }
  }, [fetchMemberNotes, matchesAssignmentFilter, members, toast]);

  const stopSync = useCallback(() => {
    stopRef.current = true;
    controllersRef.current.forEach((c) => c.abort());
    setSyncProgress((prev) => (prev ? { ...prev, stopped: true, currentMember: '' } : prev));
  }, []);

  const assignmentOptions = useMemo(() => {
    const values = new Set<string>();
    members.forEach((m) => values.add(getMemberAssignment(m)));
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [getMemberAssignment, members]);

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const inAssignment = members.filter(matchesAssignmentFilter);
    if (!q) return inAssignment;
    return inAssignment.filter((m) => {
      const name = `${m.memberLastName}, ${m.memberFirstName}`.toLowerCase();
      const mrn = String(m.memberMrn || '').toLowerCase();
      const id2 = m.client_ID2.toLowerCase();
      return name.includes(q) || mrn.includes(q) || id2.includes(q);
    });
  }, [matchesAssignmentFilter, members, search]);

  const reportRows = useMemo(() => {
    const rows: Array<{
      memberName: string;
      clientId2: string;
      mrn: string;
      dob: string;
      assignment: string;
      noteDate: string;
      source: string;
      createdBy: string;
      noteText: string;
    }> = [];
    members.filter(matchesAssignmentFilter).forEach((m) => {
      const notes = notesByClientId[m.client_ID2] || [];
      notes.forEach((n) => {
        rows.push({
          memberName: `${m.memberLastName}, ${m.memberFirstName}`.replace(/^,\s*/, '').trim(),
          clientId2: m.client_ID2,
          mrn: String(m.memberMrn || ''),
          dob: String(m.birthDate || ''),
          assignment: getMemberAssignment(m),
          noteDate: n.createdAt,
          source: String(n.source || ''),
          createdBy: String(n.createdByName || ''),
          noteText: String(n.noteText || ''),
        });
      });
    });
    rows.sort((a, b) => {
      if (a.memberName !== b.memberName) return a.memberName.localeCompare(b.memberName);
      return new Date(a.noteDate).getTime() - new Date(b.noteDate).getTime();
    });
    return rows;
  }, [getMemberAssignment, matchesAssignmentFilter, members, notesByClientId]);

  const filteredReportRows = useMemo(() => {
    if (!noteDateFrom && !noteDateTo) return reportRows;
    const fromMs = noteDateFrom ? new Date(`${noteDateFrom}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
    const toMs = noteDateTo ? new Date(`${noteDateTo}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
    return reportRows.filter((row) => {
      const noteMs = row.noteDate ? new Date(row.noteDate).getTime() : NaN;
      if (!Number.isFinite(noteMs)) return false;
      return noteMs >= fromMs && noteMs <= toMs;
    });
  }, [noteDateFrom, noteDateTo, reportRows]);

  const loadedMembersWithNotes = useMemo(
    () => Object.values(notesByClientId).filter((notes) => Array.isArray(notes) && notes.length > 0).length,
    [notesByClientId]
  );

  const totalLoadedNotes = useMemo(
    () => Object.values(notesByClientId).reduce((acc, notes) => acc + (Array.isArray(notes) ? notes.length : 0), 0),
    [notesByClientId]
  );

  const exportCsv = useCallback(() => {
    if (filteredReportRows.length === 0) {
      toast({
        title: 'Nothing to export',
        description: 'No note rows available for the current filters/date range.',
        variant: 'destructive',
      });
      return;
    }

    const header = [
      'Member Name',
      'Client ID2',
      'MRN',
      'DOB',
      'Kaiser User Assignment',
      'Note Timestamp',
      'Source',
      'Created By',
      'Note Text',
    ];

    const lines = [
      header.map(csvEscape).join(','),
      ...filteredReportRows.map((r) =>
        [
          r.memberName,
          r.clientId2,
          r.mrn,
          r.dob,
          r.assignment,
          r.noteDate,
          r.source,
          r.createdBy,
          r.noteText,
        ]
          .map(csvEscape)
          .join(',')
      ),
    ];

    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ILS_Kaiser_Authorized_Notes_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredReportRows, toast]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">ILS Status Check</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Kaiser Authorized member notes report with MRN and DOB. Notes are read-only; sync only pulls new notes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={fetchMembers} disabled={loadingMembers || syncingAll || loadingSavedNotes}>
            {loadingMembers ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Load Kaiser Authorized Members
          </Button>
          <Button
            variant="outline"
            onClick={loadSavedNotesOnly}
            disabled={members.length === 0 || syncingAll || loadingMembers || loadingSavedNotes}
          >
            {loadingSavedNotes ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Load Saved Notes
          </Button>
          <Button onClick={syncAllNewNotes} disabled={members.length === 0 || syncingAll || loadingMembers || loadingSavedNotes}>
            {syncingAll ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Sync New Notes
          </Button>
          {syncingAll || loadingSavedNotes ? (
            <Button variant="destructive" onClick={stopSync}>
              Stop
            </Button>
          ) : null}
          <Button variant="secondary" onClick={exportCsv} disabled={filteredReportRows.length === 0}>Export CSV</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Members in Scope</CardTitle>
            <CardDescription>Kaiser + Authorized + assignment filter</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{members.filter(matchesAssignmentFilter).length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Members with Loaded Notes</CardTitle>
            <CardDescription>In-memory report dataset</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loadedMembersWithNotes}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Existing Notes Loaded</CardTitle>
            <CardDescription>Previously saved notes in report</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalLoadedNotes}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">New Notes (Last Sync)</CardTitle>
            <CardDescription>Incremental notes added by latest sync</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{lastSyncNewNotes}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Scope</CardTitle>
            <CardDescription>Assignment + search filter</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <select
              className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={assignmentFilter}
              onChange={(e) => setAssignmentFilter(e.target.value)}
            >
              <option value="all">All assignments</option>
              {assignmentOptions.map((assignment) => (
                <option key={assignment} value={assignment}>
                  {assignment}
                </option>
              ))}
            </select>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, MRN, or ID2..." />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Input
                type="date"
                value={noteDateFrom}
                onChange={(e) => setNoteDateFrom(e.target.value)}
                placeholder="From date"
              />
              <Input
                type="date"
                value={noteDateTo}
                onChange={(e) => setNoteDateTo(e.target.value)}
                placeholder="To date"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              className="w-fit h-8 px-2 text-xs"
              onClick={() => {
                setNoteDateFrom('');
                setNoteDateTo('');
              }}
              disabled={!noteDateFrom && !noteDateTo}
            >
              Clear date range
            </Button>
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total Report Rows</CardTitle>
            <CardDescription>Flattened member-note lines in current filters</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filteredReportRows.length}</div>
          </CardContent>
        </Card>
      </div>

      {syncProgress ? (
        <Card>
          <CardContent className="py-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Sync progress</span>
              <span>
                {syncProgress.complete}/{syncProgress.total}
              </span>
            </div>
            <div className="h-2 rounded bg-slate-200 overflow-hidden">
              <div
                className="h-2 bg-blue-600"
                style={{ width: `${syncProgress.total > 0 ? (syncProgress.complete / syncProgress.total) * 100 : 0}%` }}
              />
            </div>
            <div className="text-xs text-muted-foreground flex items-center justify-between">
              <span>
                Success: {syncProgress.success} • Failed: {syncProgress.failed} • Existing loaded: {syncProgress.existingNotesLoaded} • New notes: {syncProgress.newNotesImported}
              </span>
              <span>{syncProgress.stopped ? 'Stopped' : syncProgress.currentMember || ''}</span>
            </div>
            {syncProgress.recentErrors.length > 0 ? (
              <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                <div className="font-medium mb-1">Recent sync errors</div>
                <div className="space-y-1">
                  {syncProgress.recentErrors.map((err, idx) => (
                    <div key={`${err}-${idx}`} className="truncate" title={err}>
                      {err}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Members
            </CardTitle>
            <CardDescription>Use per-member sync icon if you want to refresh one record.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[620px] overflow-y-auto pr-1">
            {filteredMembers.map((member) => {
              const notesCount = (notesByClientId[member.client_ID2] || []).length;
              return (
                <div key={member.client_ID2} className="rounded border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">
                        {member.memberLastName}, {member.memberFirstName}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        ID2: {member.client_ID2} • MRN: {member.memberMrn || 'N/A'} • DOB: {member.birthDate || 'N/A'}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Assignment: {getMemberAssignment(member)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold">
                        {notesCount} notes
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={syncingOne === member.client_ID2 || syncingAll}
                        onClick={() => void syncSingleMember(member)}
                      >
                        {syncingOne === member.client_ID2 ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Sync'}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredMembers.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">No members found.</div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Report Preview</CardTitle>
            <CardDescription>
              Previewing first {Math.min(filteredReportRows.length, 200)} rows. CSV export includes all rows in current scope/date range.
            </CardDescription>
          </CardHeader>
          <CardContent className="max-h-[620px] overflow-y-auto">
            {filteredReportRows.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No report rows yet. Load members, then sync new notes when needed.
              </div>
            ) : (
              <div className="relative w-full overflow-auto">
                <table className="w-full caption-bottom text-sm">
                  <thead className="[&_tr]:border-b">
                    <tr className="border-b transition-colors">
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Member</th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">MRN</th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">DOB</th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Note Date</th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Source</th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Author</th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Note</th>
                    </tr>
                  </thead>
                  <tbody className="[&_tr:last-child]:border-0">
                  {filteredReportRows.slice(0, 200).map((row, idx) => (
                    <tr
                      key={`${row.clientId2}-${row.noteDate}-${idx}`}
                      className="border-b transition-colors hover:bg-muted/50"
                    >
                      <td className="p-4 align-middle font-medium">{row.memberName}</td>
                      <td className="p-4 align-middle">{row.mrn || 'N/A'}</td>
                      <td className="p-4 align-middle">{row.dob || 'N/A'}</td>
                      <td className="p-4 align-middle">{row.noteDate ? new Date(row.noteDate).toLocaleString() : ''}</td>
                      <td className="p-4 align-middle">{row.source || ''}</td>
                      <td className="p-4 align-middle">{row.createdBy || ''}</td>
                      <td className="p-4 align-middle max-w-[360px] truncate" title={row.noteText}>
                        {row.noteText}
                      </td>
                    </tr>
                  ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

