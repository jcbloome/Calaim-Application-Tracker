'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth, useFirestore } from '@/firebase';
import { collection, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { Download, FileText, Loader2, RefreshCw, Search } from 'lucide-react';

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
  mode: 'incremental' | 'first-time' | 'backfill';
  total: number;
  complete: number;
  success: number;
  failed: number;
  skipped: number;
  newNotesImported: number;
  firstSyncMembers: number;
  stopped: boolean;
  recentErrors: string[];
  currentMember: string;
};

type MemberPrefs = {
  excludedNoteIds: string[];
  lastRequestedAt?: string;
};

type SyncMeta = {
  hasSync: boolean;
  lastSyncAtMs: number;
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
  if (key === 'pending') return 'Pending';
  if (key === 'non active') return 'Non_Active';
  if (key === 'member died' || key === 'died') return 'Member Died';
  if (key === 'authorized on hold') return 'Authorized on hold';
  if (key === 'authorization ended') return 'Authorization Ended';
  if (key === 'not interested') return 'Not interested';
  if (key === 'pending to switch') return 'Pending to switch';
  return String(value ?? '').trim();
};

const toDateInput = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const noteVisibilityKey = (clientId2: string, noteId: string) => `${clientId2}::${noteId}`;

const csvEscape = (value: unknown) => {
  const s = String(value ?? '');
  const escaped = s.replace(/"/g, '""');
  return `"${escaped}"`;
};

const isRateLimitError = (error: unknown) => {
  const msg = String((error as any)?.message || '').toLowerCase();
  return msg.includes('429') || msg.includes('too many requests') || msg.includes('rate limit');
};

export default function IlsStatusCheckPage() {
  const { toast } = useToast();
  const auth = useAuth();
  const firestore = useFirestore();
  const [members, setMembers] = useState<KaiserMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncingFirstTime, setSyncingFirstTime] = useState(false);
  const [syncingBackfill, setSyncingBackfill] = useState(false);
  const [syncingOne, setSyncingOne] = useState<string>('');
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [search, setSearch] = useState('');
  const [assignmentFilter, setAssignmentFilter] = useState('all');
  const [selectedClientId2, setSelectedClientId2] = useState('');
  const [reportStart, setReportStart] = useState('');
  const [reportEnd, setReportEnd] = useState(toDateInput(new Date()));
  const [useLastRequestBaseline, setUseLastRequestBaseline] = useState(true);
  const [bulkIncrementalOnly, setBulkIncrementalOnly] = useState(true);
  const [firstTimeBatchSize, setFirstTimeBatchSize] = useState(10);
  const [firstTimeBatchPauseSec, setFirstTimeBatchPauseSec] = useState(20);
  const [notesByClientId, setNotesByClientId] = useState<Record<string, MemberNote[]>>({});
  const [notRelevantByKey, setNotRelevantByKey] = useState<Record<string, boolean>>({});
  const [prefsByClientId, setPrefsByClientId] = useState<Record<string, MemberPrefs>>({});
  const [hasPriorSyncByClientId, setHasPriorSyncByClientId] = useState<Record<string, boolean>>({});
  const [syncMetaByClientId, setSyncMetaByClientId] = useState<Record<string, SyncMeta>>({});
  const [showNeverSyncedOnly, setShowNeverSyncedOnly] = useState(false);
  const stopBulkSyncRef = useRef(false);
  const bulkSyncControllersRef = useRef<Set<AbortController>>(new Set());
  const rateLimitCooldownUntilRef = useRef(0);

  const hydrateExcludedNotesIntoLocalState = useCallback((prefMap: Record<string, MemberPrefs>) => {
    const next: Record<string, boolean> = {};
    Object.entries(prefMap).forEach(([clientId2, pref]) => {
      const excluded = Array.isArray(pref?.excludedNoteIds) ? pref.excludedNoteIds : [];
      excluded.forEach((noteId) => {
        if (!noteId) return;
        next[noteVisibilityKey(clientId2, noteId)] = true;
      });
    });
    setNotRelevantByKey((prev) => ({ ...prev, ...next }));
  }, []);

  const loadMemberPrefs = useCallback(
    async (clientIds: string[]) => {
      if (!firestore || clientIds.length === 0) return;
      const idSet = new Set(clientIds.map((v) => String(v || '').trim()).filter(Boolean));
      if (idSet.size === 0) return;
      const snap = await getDocs(collection(firestore, 'ils_status_check_member_prefs'));
      const prefMap: Record<string, MemberPrefs> = {};
      snap.forEach((docSnap) => {
        const id = String(docSnap.id || '').trim();
        if (!idSet.has(id)) return;
        const data = docSnap.data() as any;
        const excluded = Array.isArray(data?.excludedNoteIds)
          ? data.excludedNoteIds.map((v: unknown) => String(v || '').trim()).filter(Boolean)
          : [];
        prefMap[id] = {
          excludedNoteIds: excluded,
          lastRequestedAt: String(data?.lastRequestedAt || '').trim() || undefined,
        };
      });
      setPrefsByClientId((prev) => ({ ...prev, ...prefMap }));
      hydrateExcludedNotesIntoLocalState(prefMap);
    },
    [firestore, hydrateExcludedNotesIntoLocalState]
  );

  const loadPriorSyncState = useCallback(
    async (clientIds: string[]) => {
      if (!firestore || clientIds.length === 0) return;
      const idSet = new Set(clientIds.map((v) => String(v || '').trim()).filter(Boolean));
      if (idSet.size === 0) return;
      const snap = await getDocs(collection(firestore, 'member-notes-sync-status'));
      const next: Record<string, boolean> = {};
      const nextMeta: Record<string, SyncMeta> = {};
      snap.forEach((docSnap) => {
        const id = String(docSnap.id || '').trim();
        if (!idSet.has(id)) return;
        const data = docSnap.data() as any;
        let lastSyncAtMs = 0;
        try {
          if (typeof data?.lastSyncAt?.toDate === 'function') {
            const d = data.lastSyncAt.toDate();
            lastSyncAtMs = d instanceof Date ? d.getTime() : 0;
          } else if (data?.lastSyncAt) {
            const d = new Date(data.lastSyncAt);
            const ms = d.getTime();
            lastSyncAtMs = Number.isNaN(ms) ? 0 : ms;
          }
        } catch {
          lastSyncAtMs = 0;
        }
        const hasSync = Boolean(data?.firstSyncCompleted) || lastSyncAtMs > 0;
        if (hasSync) next[id] = true;
        nextMeta[id] = { hasSync, lastSyncAtMs };
      });
      setHasPriorSyncByClientId((prev) => ({ ...prev, ...next }));
      setSyncMetaByClientId((prev) => ({ ...prev, ...nextMeta }));
    },
    [firestore]
  );

  const saveMemberPrefs = useCallback(
    async (clientId2: string, nextPrefs: MemberPrefs) => {
      if (!firestore) return;
      const id = String(clientId2 || '').trim();
      if (!id) return;
      const payload: Record<string, unknown> = {
        clientId2: id,
        excludedNoteIds: nextPrefs.excludedNoteIds || [],
        lastRequestedAt: nextPrefs.lastRequestedAt || null,
        updatedAt: serverTimestamp(),
      };
      const email = String(auth?.currentUser?.email || '').trim();
      const uid = String(auth?.currentUser?.uid || '').trim();
      if (uid) payload.updatedByUid = uid;
      if (email) payload.updatedByEmail = email;
      await setDoc(doc(firestore, 'ils_status_check_member_prefs', id), payload, { merge: true });
    },
    [auth?.currentUser?.email, auth?.currentUser?.uid, firestore]
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
        .filter((m: KaiserMember) => m.client_ID2);

      onlyKaiserAuthorized.sort((a: KaiserMember, b: KaiserMember) =>
        `${a.memberLastName}, ${a.memberFirstName}`.localeCompare(`${b.memberLastName}, ${b.memberFirstName}`)
      );

      setMembers(onlyKaiserAuthorized);
      setSelectedClientId2((prev) => prev || onlyKaiserAuthorized[0]?.client_ID2 || '');
      const ids = onlyKaiserAuthorized.map((m: KaiserMember) => m.client_ID2);
      await Promise.all([loadMemberPrefs(ids), loadPriorSyncState(ids)]);
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
  }, [loadMemberPrefs, loadPriorSyncState, toast]);

  const getMemberAssignment = useCallback((member: KaiserMember) => {
    return String(member.Kaiser_User_Assignment || 'Unassigned').trim() || 'Unassigned';
  }, []);

  const matchesAssignmentFilter = useCallback(
    (member: KaiserMember) => {
      const assignment = getMemberAssignment(member);
      if (assignmentFilter === 'all') return true;
      return assignment === assignmentFilter;
    },
    [assignmentFilter, getMemberAssignment]
  );

  const syncMemberNotes = useCallback(async (member: KaiserMember, opts?: { forceSync?: boolean; signal?: AbortSignal }) => {
    const forceSync = opts?.forceSync === true;
    const query = new URLSearchParams({
      clientId2: member.client_ID2,
      forceSync: forceSync ? 'true' : 'false',
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
      isFirstSync: Boolean(data?.isFirstSync),
    };
  }, []);

  const syncSelectedMember = useCallback(async () => {
    const member = members.find((m) => m.client_ID2 === selectedClientId2);
    if (!member) return;
    setSyncingOne(member.client_ID2);
    try {
      const result = await syncMemberNotes(member, { forceSync: false });
      setHasPriorSyncByClientId((prev) => ({ ...prev, [member.client_ID2]: true }));
      setSyncMetaByClientId((prev) => ({
        ...prev,
        [member.client_ID2]: { hasSync: true, lastSyncAtMs: Date.now() },
      }));
      toast({
        title: 'Notes synced',
        description: `${member.memberFirstName} ${member.memberLastName}: ${result.totalNotes} total notes (${result.newNotesCount} new).`,
      });
    } catch (error: any) {
      toast({
        title: 'Sync failed',
        description: error?.message || 'Could not sync selected member notes.',
        variant: 'destructive',
      });
    } finally {
      setSyncingOne('');
    }
  }, [members, selectedClientId2, syncMemberNotes, toast]);

  const syncAllMembers = useCallback(async () => {
    const scopeMembers = members.filter(matchesAssignmentFilter);
    if (scopeMembers.length === 0) return;
    stopBulkSyncRef.current = false;
    bulkSyncControllersRef.current.forEach((controller) => controller.abort());
    bulkSyncControllersRef.current.clear();
    setSyncingAll(true);
    setProgress({
      mode: 'incremental',
      total: scopeMembers.length,
      complete: 0,
      success: 0,
      failed: 0,
      skipped: 0,
      newNotesImported: 0,
      firstSyncMembers: 0,
      stopped: false,
      recentErrors: [],
      currentMember: '',
    });

    let index = 0;
    let totalNewNotesImported = 0;
    let totalFirstSyncMembers = 0;
    const concurrency = 1;

    const addRecentError = (message: string) => {
      setProgress((prev) =>
        prev
          ? {
              ...prev,
              recentErrors: [message, ...prev.recentErrors].slice(0, 5),
            }
          : prev
      );
    };

    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const worker = async () => {
      while (true) {
        if (stopBulkSyncRef.current) return;
        const now = Date.now();
        if (rateLimitCooldownUntilRef.current > now) {
          const waitMs = rateLimitCooldownUntilRef.current - now;
          setProgress((prev) =>
            prev
              ? {
                  ...prev,
                  currentMember: `Rate limit cooldown (${Math.ceil(waitMs / 1000)}s)...`,
                }
              : prev
          );
          await delay(waitMs);
          if (stopBulkSyncRef.current) return;
        }
        const i = index;
        index += 1;
        if (i >= scopeMembers.length) return;
        const member = scopeMembers[i];
        if (bulkIncrementalOnly && !hasPriorSyncByClientId[member.client_ID2]) {
          setProgress((prev) =>
            prev
              ? {
                  ...prev,
                  complete: prev.complete + 1,
                  skipped: prev.skipped + 1,
                  currentMember: `${member.memberLastName}, ${member.memberFirstName} (skipped: no prior sync)`,
                }
              : prev
          );
          continue;
        }
        setProgress((prev) =>
          prev
            ? {
                ...prev,
                currentMember: `${member.memberLastName}, ${member.memberFirstName}`,
              }
            : prev
        );

        const controller = new AbortController();
        bulkSyncControllersRef.current.add(controller);
        try {
          let result: { totalNotes: number; newNotesCount: number; isFirstSync: boolean } | null = null;
          let lastError: any = null;
          for (let attempt = 1; attempt <= 4; attempt++) {
            try {
              result = await syncMemberNotes(member, { forceSync: false, signal: controller.signal });
              break;
            } catch (error: any) {
              lastError = error;
              if (String(error?.name || '').toLowerCase() === 'aborterror') throw error;
              if (attempt >= 4) break;
              if (isRateLimitError(error)) {
                const backoffMs = Math.min(30000, 5000 * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 500);
                rateLimitCooldownUntilRef.current = Date.now() + backoffMs;
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
          totalNewNotesImported += result.newNotesCount || 0;
          if (result.isFirstSync) totalFirstSyncMembers += 1;
          setHasPriorSyncByClientId((prev) => ({ ...prev, [member.client_ID2]: true }));
          setSyncMetaByClientId((prev) => ({
            ...prev,
            [member.client_ID2]: { hasSync: true, lastSyncAtMs: Date.now() },
          }));
          setProgress((prev) =>
            prev
              ? {
                  ...prev,
                  complete: prev.complete + 1,
                  success: prev.success + 1,
                  newNotesImported: prev.newNotesImported + (result.newNotesCount || 0),
                  firstSyncMembers: prev.firstSyncMembers + (result.isFirstSync ? 1 : 0),
                }
              : prev
          );
          // Keep pace conservative to avoid repeated Caspio 429 responses.
          await delay(300);
        } catch (error: any) {
          const aborted = String(error?.name || '').toLowerCase() === 'aborterror';
          if (aborted) {
            setProgress((prev) =>
              prev
                ? {
                    ...prev,
                    stopped: true,
                  }
                : prev
            );
            return;
          }
          const memberLabel = `${member.memberLastName}, ${member.memberFirstName} (${member.client_ID2})`;
          const errorMsg = String(error?.message || 'Unknown sync error');
          addRecentError(`${memberLabel}: ${errorMsg}`);
          setProgress((prev) =>
            prev
              ? {
                  ...prev,
                  complete: prev.complete + 1,
                  failed: prev.failed + 1,
                }
              : prev
          );
        } finally {
          bulkSyncControllersRef.current.delete(controller);
        }
      }
    };

    try {
      await Promise.all(Array.from({ length: Math.min(concurrency, members.length) }, () => worker()));
      setProgress((prev) => (prev ? { ...prev, currentMember: '' } : prev));
      toast({
        title: stopBulkSyncRef.current ? 'Bulk sync stopped' : 'Bulk note sync complete',
        description: stopBulkSyncRef.current
          ? 'Sync stopped by user.'
          : `Processed ${scopeMembers.length} members • Imported ${totalNewNotesImported} new notes • First-time imports: ${totalFirstSyncMembers}`,
      });
    } finally {
      bulkSyncControllersRef.current.forEach((controller) => controller.abort());
      bulkSyncControllersRef.current.clear();
      setSyncingAll(false);
    }
  }, [bulkIncrementalOnly, hasPriorSyncByClientId, matchesAssignmentFilter, members, syncMemberNotes, toast]);

  const runFirstTimeSyncQueue = useCallback(async () => {
    const scopeMembers = members.filter(matchesAssignmentFilter);
    const queue = scopeMembers.filter((m) => !hasPriorSyncByClientId[m.client_ID2]);
    if (queue.length === 0) {
      toast({
        title: 'Queue is empty',
        description: 'All current members already have sync history.',
      });
      return;
    }

    stopBulkSyncRef.current = false;
    bulkSyncControllersRef.current.forEach((controller) => controller.abort());
    bulkSyncControllersRef.current.clear();
    setSyncingFirstTime(true);
    setProgress({
      mode: 'first-time',
      total: queue.length,
      complete: 0,
      success: 0,
      failed: 0,
      skipped: 0,
      newNotesImported: 0,
      firstSyncMembers: 0,
      stopped: false,
      recentErrors: [],
      currentMember: '',
    });

    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const batchSize = Math.max(1, Math.min(50, Number(firstTimeBatchSize) || 10));
    const batchPauseMs = Math.max(0, Number(firstTimeBatchPauseSec) || 0) * 1000;
    let processedInBatch = 0;
    let totalNewNotesImported = 0;
    let totalFirstSyncMembers = 0;
    let failed = 0;

    for (let i = 0; i < queue.length; i++) {
      if (stopBulkSyncRef.current) break;

      const now = Date.now();
      if (rateLimitCooldownUntilRef.current > now) {
        const waitMs = rateLimitCooldownUntilRef.current - now;
        setProgress((prev) =>
          prev ? { ...prev, currentMember: `Rate limit cooldown (${Math.ceil(waitMs / 1000)}s)...` } : prev
        );
        await delay(waitMs);
        if (stopBulkSyncRef.current) break;
      }

      const member = queue[i];
      setProgress((prev) =>
        prev ? { ...prev, currentMember: `${member.memberLastName}, ${member.memberFirstName}` } : prev
      );

      const controller = new AbortController();
      bulkSyncControllersRef.current.add(controller);
      try {
        let result: { totalNotes: number; newNotesCount: number; isFirstSync: boolean } | null = null;
        let lastError: any = null;
        for (let attempt = 1; attempt <= 4; attempt++) {
          try {
            result = await syncMemberNotes(member, { forceSync: true, signal: controller.signal });
            break;
          } catch (error: any) {
            lastError = error;
            if (String(error?.name || '').toLowerCase() === 'aborterror') throw error;
            if (attempt >= 4) break;
            if (isRateLimitError(error)) {
              const backoffMs = Math.min(45000, 8000 * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 500);
              rateLimitCooldownUntilRef.current = Date.now() + backoffMs;
              setProgress((prev) =>
                prev
                  ? {
                      ...prev,
                      recentErrors: [
                        `${member.memberLastName}, ${member.memberFirstName} (${member.client_ID2}): rate-limited, retrying in ${Math.ceil(backoffMs / 1000)}s (attempt ${attempt + 1}/4)`,
                        ...prev.recentErrors,
                      ].slice(0, 5),
                    }
                  : prev
              );
              await delay(backoffMs);
            } else {
              await delay(1000);
            }
          }
        }
        if (!result) throw lastError || new Error('Sync failed');

        totalNewNotesImported += result.newNotesCount || 0;
        if (result.isFirstSync) totalFirstSyncMembers += 1;
        setHasPriorSyncByClientId((prev) => ({ ...prev, [member.client_ID2]: true }));
        setSyncMetaByClientId((prev) => ({
          ...prev,
          [member.client_ID2]: { hasSync: true, lastSyncAtMs: Date.now() },
        }));
        setProgress((prev) =>
          prev
            ? {
                ...prev,
                complete: prev.complete + 1,
                success: prev.success + 1,
                newNotesImported: prev.newNotesImported + (result.newNotesCount || 0),
                firstSyncMembers: prev.firstSyncMembers + (result.isFirstSync ? 1 : 0),
              }
            : prev
        );
      } catch (error: any) {
        const aborted = String(error?.name || '').toLowerCase() === 'aborterror';
        if (aborted) {
          setProgress((prev) => (prev ? { ...prev, stopped: true } : prev));
          break;
        }
        failed += 1;
        const memberLabel = `${member.memberLastName}, ${member.memberFirstName} (${member.client_ID2})`;
        const errorMsg = String(error?.message || 'Unknown sync error');
        setProgress((prev) =>
          prev
            ? {
                ...prev,
                complete: prev.complete + 1,
                failed: prev.failed + 1,
                recentErrors: [`${memberLabel}: ${errorMsg}`, ...prev.recentErrors].slice(0, 5),
              }
            : prev
        );
      } finally {
        bulkSyncControllersRef.current.delete(controller);
      }

      processedInBatch += 1;
      if (processedInBatch >= batchSize && i < queue.length - 1 && !stopBulkSyncRef.current && batchPauseMs > 0) {
        setProgress((prev) =>
          prev ? { ...prev, currentMember: `Batch pause (${Math.ceil(batchPauseMs / 1000)}s)...` } : prev
        );
        await delay(batchPauseMs);
        processedInBatch = 0;
      } else if (!stopBulkSyncRef.current) {
        await delay(500);
      }
    }

    bulkSyncControllersRef.current.forEach((controller) => controller.abort());
    bulkSyncControllersRef.current.clear();
    setSyncingFirstTime(false);
    setProgress((prev) => (prev ? { ...prev, currentMember: '' } : prev));
    toast({
      title: stopBulkSyncRef.current ? 'First-time sync stopped' : 'First-time sync queue complete',
      description: stopBulkSyncRef.current
        ? 'Stopped by user.'
        : `Processed ${queue.length} members • Imported ${totalNewNotesImported} new notes • First-time imports: ${totalFirstSyncMembers} • Failed: ${failed}`,
    });
  }, [firstTimeBatchPauseSec, firstTimeBatchSize, hasPriorSyncByClientId, matchesAssignmentFilter, members, syncMemberNotes, toast]);

  const runHistoricalBackfillQueue = useCallback(async () => {
    const queue = members.filter(matchesAssignmentFilter);
    if (queue.length === 0) {
      toast({
        title: 'Queue is empty',
        description: 'No members found in the current assignment filter.',
      });
      return;
    }

    stopBulkSyncRef.current = false;
    bulkSyncControllersRef.current.forEach((controller) => controller.abort());
    bulkSyncControllersRef.current.clear();
    setSyncingBackfill(true);
    setProgress({
      mode: 'backfill',
      total: queue.length,
      complete: 0,
      success: 0,
      failed: 0,
      skipped: 0,
      newNotesImported: 0,
      firstSyncMembers: 0,
      stopped: false,
      recentErrors: [],
      currentMember: '',
    });

    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const batchSize = Math.max(1, Math.min(50, Number(firstTimeBatchSize) || 10));
    const batchPauseMs = Math.max(0, Number(firstTimeBatchPauseSec) || 0) * 1000;
    let processedInBatch = 0;
    let totalNewNotesImported = 0;
    let totalFirstSyncMembers = 0;
    let failed = 0;

    for (let i = 0; i < queue.length; i++) {
      if (stopBulkSyncRef.current) break;

      const now = Date.now();
      if (rateLimitCooldownUntilRef.current > now) {
        const waitMs = rateLimitCooldownUntilRef.current - now;
        setProgress((prev) =>
          prev ? { ...prev, currentMember: `Rate limit cooldown (${Math.ceil(waitMs / 1000)}s)...` } : prev
        );
        await delay(waitMs);
        if (stopBulkSyncRef.current) break;
      }

      const member = queue[i];
      setProgress((prev) =>
        prev ? { ...prev, currentMember: `${member.memberLastName}, ${member.memberFirstName}` } : prev
      );

      const controller = new AbortController();
      bulkSyncControllersRef.current.add(controller);
      try {
        let result: { totalNotes: number; newNotesCount: number; isFirstSync: boolean } | null = null;
        let lastError: any = null;
        for (let attempt = 1; attempt <= 4; attempt++) {
          try {
            result = await syncMemberNotes(member, { forceSync: true, signal: controller.signal });
            break;
          } catch (error: any) {
            lastError = error;
            if (String(error?.name || '').toLowerCase() === 'aborterror') throw error;
            if (attempt >= 4) break;
            if (isRateLimitError(error)) {
              const backoffMs = Math.min(45000, 8000 * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 500);
              rateLimitCooldownUntilRef.current = Date.now() + backoffMs;
              setProgress((prev) =>
                prev
                  ? {
                      ...prev,
                      recentErrors: [
                        `${member.memberLastName}, ${member.memberFirstName} (${member.client_ID2}): rate-limited, retrying in ${Math.ceil(backoffMs / 1000)}s (attempt ${attempt + 1}/4)`,
                        ...prev.recentErrors,
                      ].slice(0, 5),
                    }
                  : prev
              );
              await delay(backoffMs);
            } else {
              await delay(1000);
            }
          }
        }
        if (!result) throw lastError || new Error('Sync failed');

        totalNewNotesImported += result.newNotesCount || 0;
        if (result.isFirstSync) totalFirstSyncMembers += 1;
        setHasPriorSyncByClientId((prev) => ({ ...prev, [member.client_ID2]: true }));
        setProgress((prev) =>
          prev
            ? {
                ...prev,
                complete: prev.complete + 1,
                success: prev.success + 1,
                newNotesImported: prev.newNotesImported + (result.newNotesCount || 0),
                firstSyncMembers: prev.firstSyncMembers + (result.isFirstSync ? 1 : 0),
              }
            : prev
        );
      } catch (error: any) {
        const aborted = String(error?.name || '').toLowerCase() === 'aborterror';
        if (aborted) {
          setProgress((prev) => (prev ? { ...prev, stopped: true } : prev));
          break;
        }
        failed += 1;
        const memberLabel = `${member.memberLastName}, ${member.memberFirstName} (${member.client_ID2})`;
        const errorMsg = String(error?.message || 'Unknown sync error');
        setProgress((prev) =>
          prev
            ? {
                ...prev,
                complete: prev.complete + 1,
                failed: prev.failed + 1,
                recentErrors: [`${memberLabel}: ${errorMsg}`, ...prev.recentErrors].slice(0, 5),
              }
            : prev
        );
      } finally {
        bulkSyncControllersRef.current.delete(controller);
      }

      processedInBatch += 1;
      if (processedInBatch >= batchSize && i < queue.length - 1 && !stopBulkSyncRef.current && batchPauseMs > 0) {
        setProgress((prev) =>
          prev ? { ...prev, currentMember: `Batch pause (${Math.ceil(batchPauseMs / 1000)}s)...` } : prev
        );
        await delay(batchPauseMs);
        processedInBatch = 0;
      } else if (!stopBulkSyncRef.current) {
        await delay(500);
      }
    }

    bulkSyncControllersRef.current.forEach((controller) => controller.abort());
    bulkSyncControllersRef.current.clear();
    setSyncingBackfill(false);
    setProgress((prev) => (prev ? { ...prev, currentMember: '' } : prev));
    toast({
      title: stopBulkSyncRef.current ? 'Historical backfill stopped' : 'Historical backfill complete',
      description: stopBulkSyncRef.current
        ? 'Stopped by user.'
        : `Processed ${queue.length} members • Imported ${totalNewNotesImported} new notes • First-time imports: ${totalFirstSyncMembers} • Failed: ${failed}`,
    });
  }, [firstTimeBatchPauseSec, firstTimeBatchSize, matchesAssignmentFilter, members, syncMemberNotes, toast]);

  const stopBulkSync = useCallback(() => {
    stopBulkSyncRef.current = true;
    bulkSyncControllersRef.current.forEach((controller) => controller.abort());
    setProgress((prev) =>
      prev
        ? {
            ...prev,
            stopped: true,
            currentMember: '',
          }
        : prev
    );
  }, []);

  const assignmentOptions = useMemo(() => {
    const values = new Set<string>();
    members.forEach((m) => values.add(getMemberAssignment(m)));
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [getMemberAssignment, members]);

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const inAssignment = members
      .filter(matchesAssignmentFilter)
      .filter((m) => (showNeverSyncedOnly ? !hasPriorSyncByClientId[m.client_ID2] : true));
    if (!q) return inAssignment;
    return inAssignment.filter((m) => {
      const name = `${m.memberLastName}, ${m.memberFirstName}`.toLowerCase();
      const mrn = String(m.memberMrn || '').toLowerCase();
      const id2 = m.client_ID2.toLowerCase();
      return name.includes(q) || mrn.includes(q) || id2.includes(q);
    });
  }, [hasPriorSyncByClientId, matchesAssignmentFilter, members, search, showNeverSyncedOnly]);

  const unsyncedMembers = useMemo(
    () =>
      members.filter((m) => {
        const inAssignment = matchesAssignmentFilter(m);
        return inAssignment && !hasPriorSyncByClientId[m.client_ID2];
      }),
    [hasPriorSyncByClientId, matchesAssignmentFilter, members]
  );

  const selectedMember = useMemo(
    () => members.find((m) => m.client_ID2 === selectedClientId2) || null,
    [members, selectedClientId2]
  );

  const selectedMemberNotes = useMemo(
    () => (selectedMember ? notesByClientId[selectedMember.client_ID2] || [] : []),
    [selectedMember, notesByClientId]
  );

  const getAutoStartForMember = useCallback(
    (clientId2: string): Date | null => {
      const notes = notesByClientId[clientId2] || [];
      let minTime = Number.POSITIVE_INFINITY;
      for (const note of notes) {
        const t = new Date(note.createdAt).getTime();
        if (!Number.isNaN(t) && t < minTime) minTime = t;
      }
      if (!Number.isFinite(minTime)) return null;
      return new Date(minTime);
    },
    [notesByClientId]
  );

  const inReportWindow = useCallback(
    (clientId2: string, createdAtRaw: string) => {
      const createdAt = new Date(createdAtRaw);
      if (Number.isNaN(createdAt.getTime())) return false;
      const manualStart = reportStart ? new Date(`${reportStart}T00:00:00`) : null;
      const autoStart = !manualStart ? getAutoStartForMember(clientId2) : null;
      const lastRequestedRaw = String(prefsByClientId[clientId2]?.lastRequestedAt || '').trim();
      const baselineStart = useLastRequestBaseline && lastRequestedRaw ? new Date(lastRequestedRaw) : null;
      const startCandidate = manualStart || autoStart;
      const start =
        startCandidate && baselineStart
          ? new Date(Math.max(startCandidate.getTime(), baselineStart.getTime()))
          : startCandidate || baselineStart;
      const end = reportEnd ? new Date(`${reportEnd}T23:59:59`) : null;
      if (start && createdAt < start) return false;
      if (end && createdAt > end) return false;
      return true;
    },
    [getAutoStartForMember, prefsByClientId, reportEnd, reportStart, useLastRequestBaseline]
  );

  const selectedPreviewNotes = useMemo(() => {
    if (!selectedMember) return [];
    return selectedMemberNotes.filter((note) => {
      if (!inReportWindow(selectedMember.client_ID2, note.createdAt)) return false;
      const key = noteVisibilityKey(selectedMember.client_ID2, note.id);
      return !notRelevantByKey[key];
    });
  }, [notRelevantByKey, inReportWindow, selectedMember, selectedMemberNotes]);

  const selectedReviewNotes = useMemo(() => {
    if (!selectedMember) return [];
    return selectedMemberNotes
      .filter((note) => {
        const key = noteVisibilityKey(selectedMember.client_ID2, note.id);
        if (notRelevantByKey[key]) return false;
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [notRelevantByKey, selectedMember, selectedMemberNotes]);

  const includedRows = useMemo(() => {
    const rows: Array<{
      memberName: string;
      clientId2: string;
      mrn: string;
      dob: string;
      noteId: string;
      createdAt: string;
      source: string;
      createdBy: string;
      noteText: string;
    }> = [];

    members.forEach((member) => {
      const notes = notesByClientId[member.client_ID2] || [];
      notes.forEach((note) => {
        if (!inReportWindow(member.client_ID2, note.createdAt)) return;
        const key = noteVisibilityKey(member.client_ID2, note.id);
        if (notRelevantByKey[key]) return;
        rows.push({
          memberName: `${member.memberLastName}, ${member.memberFirstName}`.replace(/^,\s*/, '').trim(),
          clientId2: member.client_ID2,
          mrn: String(member.memberMrn || ''),
          dob: String(member.birthDate || ''),
          noteId: note.id,
          createdAt: note.createdAt,
          source: String(note.source || ''),
          createdBy: String(note.createdByName || ''),
          noteText: String(note.noteText || ''),
        });
      });
    });

    rows.sort((a, b) => {
      if (a.memberName !== b.memberName) return a.memberName.localeCompare(b.memberName);
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    return rows;
  }, [notRelevantByKey, inReportWindow, members, notesByClientId]);

  const exportCsv = useCallback(async () => {
    if (includedRows.length === 0) {
      toast({
        title: 'Nothing to export',
        description: 'No included notes found in the selected report window.',
        variant: 'destructive',
      });
      return;
    }

    const header = [
      'Member Name',
      'Client ID2',
      'MRN',
      'DOB',
      'Note ID',
      'Note Timestamp',
      'Source',
      'Created By',
      'Note Text',
    ];
    const lines = [
      header.map(csvEscape).join(','),
      ...includedRows.map((row) =>
        [
          row.memberName,
          row.clientId2,
          row.mrn,
          row.dob,
          row.noteId,
          row.createdAt,
          row.source,
          row.createdBy,
          row.noteText,
        ]
          .map(csvEscape)
          .join(',')
      ),
    ];

    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const filename = `ILS_Status_Check_${reportStart || 'start'}_to_${reportEnd || 'end'}.csv`;
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    // Mark this export as the latest request baseline so next cycle focuses on new notes.
    const requestTimestamp = new Date().toISOString();
    const memberIds = Object.keys(notesByClientId).filter(Boolean);
    const updates = memberIds.map(async (clientId2) => {
      const current = prefsByClientId[clientId2] || { excludedNoteIds: [] };
      const nextPrefs: MemberPrefs = {
        ...current,
        excludedNoteIds: Array.isArray(current.excludedNoteIds) ? current.excludedNoteIds : [],
        lastRequestedAt: requestTimestamp,
      };
      setPrefsByClientId((prev) => ({ ...prev, [clientId2]: nextPrefs }));
      await saveMemberPrefs(clientId2, nextPrefs);
    });
    await Promise.all(updates);

    toast({
      title: 'CSV exported',
      description: 'Saved. Future reports now use this export as the last-request baseline.',
    });
  }, [includedRows, notesByClientId, prefsByClientId, reportEnd, reportStart, saveMemberPrefs, toast]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">ILS Status Check</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monthly Kaiser note package for ILS: pull Kaiser + CalAIM Authorized members, sync notes, mark only non-relevant notes, preview, and export CSV.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={fetchMembers} disabled={loadingMembers || syncingAll || syncingFirstTime || syncingBackfill}>
            {loadingMembers ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Load Kaiser Authorized Members
          </Button>
          <Button onClick={syncAllMembers} disabled={members.length === 0 || syncingAll || syncingFirstTime || syncingBackfill || loadingMembers}>
            {syncingAll ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Sync New Notes
          </Button>
          {syncingAll || syncingFirstTime || syncingBackfill ? (
            <Button variant="destructive" onClick={stopBulkSync}>
              Stop Sync
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => void exportCsv()} disabled={includedRows.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Members in Scope</CardTitle>
            <CardDescription>Kaiser + CalAIM Authorized (respecting assignment filter)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {members.filter(matchesAssignmentFilter).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Members Synced</CardTitle>
            <CardDescription>Members with notes loaded</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Object.keys(notesByClientId).length}</div>
            <div className="text-xs text-muted-foreground mt-1">
              Prior sync status known: {Object.keys(hasPriorSyncByClientId).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Included Notes</CardTitle>
            <CardDescription>After date + checkbox filters</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{includedRows.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Report Window</CardTitle>
            <CardDescription>Monthly date range + last request baseline</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Input type="date" value={reportStart} onChange={(e) => setReportStart(e.target.value)} />
            <Input type="date" value={reportEnd} onChange={(e) => setReportEnd(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">
              Leave start date blank to include notes from the member&apos;s first note date.
            </p>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox checked={useLastRequestBaseline} onCheckedChange={(v) => setUseLastRequestBaseline(v === true)} />
              Only include notes since last exported request
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox checked={bulkIncrementalOnly} onCheckedChange={(v) => setBulkIncrementalOnly(v === true)} />
              Bulk sync incremental only (skip members with no prior sync)
            </label>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Historical Import Queues</CardTitle>
          <CardDescription>
            Slow, batched full-history imports to avoid Caspio 429 limits. Use first-time queue for unsynced members, or full backfill for everyone in the current filter.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="text-sm">
              Unsynced members in queue: <span className="font-semibold">{unsyncedMembers.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Batch size</label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={String(firstTimeBatchSize)}
                  onChange={(e) => setFirstTimeBatchSize(Number(e.target.value || 10))}
                  className="h-8 w-24"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Pause between batches (sec)</label>
                <Input
                  type="number"
                  min={0}
                  max={120}
                  value={String(firstTimeBatchPauseSec)}
                  onChange={(e) => setFirstTimeBatchPauseSec(Number(e.target.value || 20))}
                  className="h-8 w-36"
                />
              </div>
              <Button
                onClick={runFirstTimeSyncQueue}
                disabled={unsyncedMembers.length === 0 || syncingAll || syncingFirstTime || syncingBackfill || loadingMembers}
              >
                {syncingFirstTime ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Run First-time Sync Queue
              </Button>
              <Button
                variant="outline"
                onClick={runHistoricalBackfillQueue}
                disabled={members.filter(matchesAssignmentFilter).length === 0 || syncingAll || syncingFirstTime || syncingBackfill || loadingMembers}
              >
                {syncingBackfill ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Run Full Historical Backfill
              </Button>
            </div>
          </div>
          {unsyncedMembers.length > 0 ? (
            <div className="rounded border bg-slate-50 p-2 text-xs text-muted-foreground">
              Next in queue:{' '}
              {unsyncedMembers
                .slice(0, 8)
                .map((m) => `${m.memberLastName}, ${m.memberFirstName}`)
                .join(' • ')}
              {unsyncedMembers.length > 8 ? ' ...' : ''}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {progress ? (
        <Card>
          <CardContent className="py-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                {progress.mode === 'first-time'
                  ? 'First-time sync progress'
                  : progress.mode === 'backfill'
                    ? 'Historical backfill progress'
                    : 'Bulk sync progress'}
              </span>
              <span>
                {progress.complete}/{progress.total}
              </span>
            </div>
            <div className="h-2 rounded bg-slate-200 overflow-hidden">
              <div
                className="h-2 bg-blue-600"
                style={{ width: `${progress.total > 0 ? (progress.complete / progress.total) * 100 : 0}%` }}
              />
            </div>
            <div className="text-xs text-muted-foreground flex items-center justify-between">
              <span>
                Success: {progress.success} • Failed: {progress.failed} • Skipped: {progress.skipped} • New notes: {progress.newNotesImported} • First-time imports:{' '}
                {progress.firstSyncMembers}
              </span>
              <span>{progress.stopped ? 'Stopped' : progress.currentMember || ''}</span>
            </div>
            {progress.recentErrors.length > 0 ? (
              <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                <div className="font-medium mb-1">Recent sync errors</div>
                <div className="space-y-1">
                  {progress.recentErrors.map((err, idx) => (
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
              <Search className="h-4 w-4" />
              Member list
            </CardTitle>
            <CardDescription>Select a member to review and curate ILS-relevant notes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Kaiser User Assignment</label>
                <Select value={assignmentFilter} onValueChange={setAssignmentFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by assignment" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All assignments</SelectItem>
                    {assignmentOptions.map((assignment) => (
                      <SelectItem key={assignment} value={assignment}>
                        {assignment}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Sync status</label>
                <label className="flex items-center gap-2 text-xs text-muted-foreground h-10 px-3 rounded-md border">
                  <Checkbox checked={showNeverSyncedOnly} onCheckedChange={(v) => setShowNeverSyncedOnly(v === true)} />
                  Never synced only
                </label>
              </div>
            </div>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, MRN, or ID2..."
            />
            <div className="max-h-[520px] overflow-y-auto space-y-2 pr-1">
              {filteredMembers.map((member) => {
                const selected = selectedClientId2 === member.client_ID2;
                const notesCount = (notesByClientId[member.client_ID2] || []).length;
                const syncMeta = syncMetaByClientId[member.client_ID2];
                const isSynced = Boolean(syncMeta?.hasSync || hasPriorSyncByClientId[member.client_ID2]);
                const daysSinceSync =
                  syncMeta?.lastSyncAtMs && syncMeta.lastSyncAtMs > 0
                    ? Math.floor((Date.now() - syncMeta.lastSyncAtMs) / (1000 * 60 * 60 * 24))
                    : null;
                const isStale = isSynced && daysSinceSync != null && daysSinceSync > 30;
                const lastSyncLabel =
                  syncMeta?.lastSyncAtMs && syncMeta.lastSyncAtMs > 0
                    ? new Date(syncMeta.lastSyncAtMs).toLocaleString()
                    : '';
                return (
                  <div
                    key={member.client_ID2}
                    role="button"
                    tabIndex={0}
                    className={`w-full rounded border text-left p-3 transition cursor-pointer ${
                      selected ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'
                    }`}
                    onClick={() => setSelectedClientId2(member.client_ID2)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedClientId2(member.client_ID2);
                      }
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium">
                          {member.memberLastName}, {member.memberFirstName}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          ID2: {member.client_ID2} • MRN: {member.memberMrn || 'N/A'} • DOB: {member.birthDate || 'N/A'}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {isSynced ? (
                            <span>
                              Last synced: {lastSyncLabel || 'Synced (time unavailable)'}
                              {daysSinceSync != null ? ` (${daysSinceSync}d ago)` : ''}
                            </span>
                          ) : (
                            <span>Last synced: Never</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={isSynced ? 'outline' : 'secondary'}
                          className={isStale ? 'bg-amber-50 text-amber-800 border-amber-200' : ''}
                        >
                          {isSynced ? (isStale ? 'Synced (stale)' : 'Synced') : 'Never synced'}
                        </Badge>
                        <Badge variant="outline">{notesCount} notes</Badge>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={syncingOne === member.client_ID2 || syncingAll || syncingFirstTime || syncingBackfill}
                          onClick={async (e) => {
                            e.stopPropagation();
                            setSelectedClientId2(member.client_ID2);
                            setSyncingOne(member.client_ID2);
                            try {
                              const result = await syncMemberNotes(member, { forceSync: false });
                              setHasPriorSyncByClientId((prev) => ({ ...prev, [member.client_ID2]: true }));
                              setSyncMetaByClientId((prev) => ({
                                ...prev,
                                [member.client_ID2]: { hasSync: true, lastSyncAtMs: Date.now() },
                              }));
                              toast({
                                title: 'Notes synced',
                                description: `${member.memberFirstName} ${member.memberLastName}: ${result.totalNotes} total notes (${result.newNotesCount} new).`,
                              });
                            } catch (error: any) {
                              toast({
                                title: 'Sync failed',
                                description: error?.message || 'Could not sync selected member notes.',
                                variant: 'destructive',
                              });
                            } finally {
                              setSyncingOne('');
                            }
                          }}
                        >
                          {syncingOne === member.client_ID2 ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {filteredMembers.length === 0 ? (
                <div className="text-sm text-muted-foreground py-8 text-center">No members found.</div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              ILS note curation + preview
            </CardTitle>
            <CardDescription>
              Check notes that are not relevant for ILS. Unchecked notes are included by default.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedMember ? (
              <div className="text-sm text-muted-foreground">Select a member to review notes.</div>
            ) : (
              <div className="space-y-4">
                <div className="rounded border bg-slate-50 p-3">
                  <div className="font-semibold">
                    {selectedMember.memberLastName}, {selectedMember.memberFirstName}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    MRN: {selectedMember.memberMrn || 'N/A'} • DOB: {selectedMember.birthDate || 'N/A'} • Client ID2:{' '}
                    {selectedMember.client_ID2}
                  </div>
                </div>

                <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                  {selectedReviewNotes.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      No review notes available. This usually means all notes for this member were already excluded.
                    </div>
                  ) : (
                    selectedReviewNotes.map((note) => {
                      const key = noteVisibilityKey(selectedMember.client_ID2, note.id);
                      return (
                        <div key={note.id} className="rounded border p-3">
                          <div className="flex items-start gap-3">
                            <Checkbox
                              checked={false}
                              onCheckedChange={(checked) => {
                                const exclude = checked === true;
                                setNotRelevantByKey((prev) => ({ ...prev, [key]: exclude }));
                                const current = prefsByClientId[selectedMember.client_ID2] || { excludedNoteIds: [] };
                                const nextExcluded = new Set(current.excludedNoteIds || []);
                                if (exclude) nextExcluded.add(note.id);
                                else nextExcluded.delete(note.id);
                                const nextPrefs: MemberPrefs = {
                                  ...current,
                                  excludedNoteIds: Array.from(nextExcluded),
                                };
                                setPrefsByClientId((prev) => ({
                                  ...prev,
                                  [selectedMember.client_ID2]: nextPrefs,
                                }));
                                void saveMemberPrefs(selectedMember.client_ID2, nextPrefs).catch(() => {
                                  // Keep UI responsive even if persistence briefly fails.
                                });
                              }}
                              aria-label={`Mark note ${note.id} as not relevant`}
                              className="mt-1"
                            />
                            <div className="flex-1">
                              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <Badge variant="outline">{new Date(note.createdAt).toLocaleString()}</Badge>
                                <Badge variant="outline">{note.source || 'Unknown source'}</Badge>
                                <span>{note.createdByName || 'Unknown author'}</span>
                              </div>
                              <div className="mt-2 text-sm whitespace-pre-wrap">{note.noteText || '(No note text)'}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="rounded border p-3 bg-emerald-50">
                  <div className="text-sm font-semibold">Preview (included notes in report window)</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {selectedPreviewNotes.length} notes will be included for this member.
                  </div>
                  <div className="mt-2 space-y-2 max-h-56 overflow-y-auto pr-1">
                    {selectedPreviewNotes.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No included notes in selected report window.</div>
                    ) : (
                      selectedPreviewNotes.map((note) => (
                        <div key={`preview-${note.id}`} className="rounded border bg-white p-2 text-sm">
                          <div className="text-xs text-muted-foreground mb-1">
                            {new Date(note.createdAt).toLocaleString()} • {note.createdByName || 'Unknown author'}
                          </div>
                          <div className="whitespace-pre-wrap">{note.noteText}</div>
                        </div>
                      ))
                    )}
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

