'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/firebase';
import { useAdmin } from '@/hooks/use-admin';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  DEFAULT_CLAIMABLE_OVERRIDE_REASON,
  DEFAULT_CLAIMABLE_REASON,
  DEFAULT_JUSTIFY_REASON,
  DEFAULT_NO_WORK_REASON,
  DEFAULT_NOTES_CLAIMABLE_REASON,
  enrichKaiserT2038FutureClaimFields,
  formatMonthLabel,
  isClaimableStaffOverride,
  isClaimAuditActiveCalaimStatus,
  isNoWorkJustification,
  isUnpushedClaimableMonth,
  recomputeKaiserT2038FutureClaimFields,
  summarizeKaiserT2038ClaimAudit,
  T2038_CLAIM_AUDIT_RATE_USD,
  type ClaimAuditActivityEntry,
  type KaiserT2038ClaimAuditRow,
  type KaiserT2038ClaimAuditRunMode,
  type MonthDisposition,
} from '@/lib/kaiser-t2038-claim-audit';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Database,
  Download,
  Eye,
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
} from 'lucide-react';
import { MemberNotesModal } from '@/app/admin/kaiser-tracker/components/MemberNotesModal';
import type { KaiserMember } from '@/app/admin/kaiser-tracker/components/shared';
import { KaiserMrnMcoMismatchCard } from './KaiserMrnMcoMismatchCard';
import {
  ClaimableClaimSubmitModal,
  type ClaimPushResult,
  type ClaimSubmitTarget,
} from './ClaimableClaimSubmitModal';

type CoverageFilter =
  | 'all'
  | 'incomplete'
  | 'gaps_only'
  | 'no_claims_yet'
  | 'claimable'
  | 'no_work'
  | 'next_claim_due'
  | 'complete';
type AuthFilter = 'all' | 'open' | 'ended' | 'missing_dates';
/** `all` | `Authorized` | exact CalAIM_Status label from data (e.g. Member Died). */
type StatusFilter = 'all' | 'Authorized' | string;

const normalizeStatus = (value: unknown) =>
  clean(value)
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

const COMMON_CALAIM_STATUSES = [
  'Authorized',
  'H2022',
  'Authorized On Hold',
  'Authorization Ended',
  'Member Died',
  'Not Interested',
  'Non_Active',
  'Non-Active',
  'Inactive',
] as const;

type Summary = {
  total: number;
  openAuth: number;
  authEnded: number;
  missingDates: number;
  noClaimsYet: number;
  incomplete: number;
  complete: number;
  openMissingMonths: number;
  claimableMonths?: number;
  noWorkMonths?: number;
  h2022UnsubmittedClaims?: number;
  h2022MemberCount?: number;
  claimableAmountUsd?: number;
  noWorkAmountUsd?: number;
  h2022UnsubmittedAmountUsd?: number;
  rateUsd?: number;
};

const formatUsd = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);

const clean = (value: unknown) => String(value || '').trim();

const lastClaimDateFor = (row: KaiserT2038ClaimAuditRow) => {
  if (row.lastClaimDate) return row.lastClaimDate;
  let best: { iso: string; display: string } | null = null;
  for (const claim of row.submittedClaims || []) {
    if (!claim.dateOfServiceIso) continue;
    if (!best || claim.dateOfServiceIso > best.iso) {
      best = { iso: claim.dateOfServiceIso, display: claim.dateOfService };
    }
  }
  return best?.display || '';
};

const STATUS_BLUE = 'bg-blue-50 text-blue-800 border-blue-300';

const statusLine = (calaimStatus: string, kaiserStatus: string) => (
  <>
    CalAIM <span className="font-medium text-blue-700">{calaimStatus || '—'}</span>
    {' · '}
    Kaiser <span className="font-medium text-blue-700">{kaiserStatus || '—'}</span>
  </>
);

const windowBadge = (row: KaiserT2038ClaimAuditRow) => {
  if (row.window === 'missing_dates') return { label: 'Missing auth dates', className: 'bg-slate-100 text-slate-800' };
  if (row.window === 'not_started') return { label: 'Not started', className: 'bg-blue-100 text-blue-900' };
  if (row.window === 'ending_soon') return { label: 'Ending soon', className: 'bg-amber-100 text-amber-950' };
  if (row.window === 'expired') return { label: 'Auth ended', className: 'bg-rose-100 text-rose-900' };
  return { label: 'Open auth', className: 'bg-emerald-100 text-emerald-900' };
};

/** CalAIM_Status / Kaiser_Status badges — blue so they stand out from auth/gap chips. */
const calaimStatusBadge = (calaimStatus: string) => {
  const label = clean(calaimStatus) || '—';
  return { label, className: STATUS_BLUE };
};

const kaiserStatusBadge = (kaiserStatus: string) => {
  const label = clean(kaiserStatus) || '—';
  return { label: `Kaiser ${label}`, className: STATUS_BLUE };
};

const EMPTY_NOTES_MODAL = {
  isOpen: false,
  member: null as KaiserMember | null,
  notes: [] as any[],
  isLoadingNotes: false,
  lastSyncAt: '',
  existingNotesCount: 0,
  newNotesCount: 0,
  didSync: false,
};

function rowToKaiserMember(row: KaiserT2038ClaimAuditRow): KaiserMember {
  return {
    id: row.clientId2 || row.id,
    memberFirstName: row.memberFirstName || '',
    memberLastName: row.memberLastName || '',
    memberMrn: row.mrn || '',
    memberCounty: '',
    memberPhone: '',
    memberEmail: '',
    client_ID2: row.clientId2 || '',
    pathway: '',
    Kaiser_Status: row.kaiserStatus || '',
    CalAIM_Status: row.calaimStatus || '',
    Staff_Assigned: '',
    Next_Step_Due_Date: '',
    Kaiser_Next_Step_Date: '',
    workflow_step: '',
    workflow_notes: '',
    last_updated: '',
    created_at: '',
  } as KaiserMember;
}

export default function KaiserT2038ClaimAuditPage() {
  const auth = useAuth();
  const { isAdmin, isLoading: isAdminLoading } = useAdmin();
  const { toast } = useToast();
  const [rows, setRows] = useState<KaiserT2038ClaimAuditRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [fetchedAt, setFetchedAt] = useState('');
  const [snapshotAt, setSnapshotAt] = useState('');
  const [firestoreStoredAt, setFirestoreStoredAt] = useState('');
  const [lastCaspioRefreshAt, setLastCaspioRefreshAt] = useState('');
  const [runMode, setRunMode] = useState<KaiserT2038ClaimAuditRunMode | ''>('');
  const [runId, setRunId] = useState('');
  const [hasSavedRun, setHasSavedRun] = useState(false);
  const [refreshingMemberId, setRefreshingMemberId] = useState('');
  const [claimStats, setClaimStats] = useState<{
    live: number;
    cached: number;
    targeted: number;
    newClaims: number;
    total: number;
    clients: number;
  }>({
    live: 0,
    cached: 0,
    targeted: 0,
    newClaims: 0,
    total: 0,
    clients: 0,
  });
  const [memberStats, setMemberStats] = useState<{ cursor: number | null; cache: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMode, setLoadingMode] = useState<KaiserT2038ClaimAuditRunMode | ''>('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [lastNameFilter, setLastNameFilter] = useState('');
  const [mrnFilter, setMrnFilter] = useState('');
  const [coverageFilter, setCoverageFilter] = useState<CoverageFilter>('incomplete');
  const [authFilter, setAuthFilter] = useState<AuthFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('Authorized');
  const [expandedId, setExpandedId] = useState('');
  const [summaryGapsOpen, setSummaryGapsOpen] = useState(false);
  const [summaryNoClaimsOpen, setSummaryNoClaimsOpen] = useState(false);
  const [summaryClaimableOpen, setSummaryClaimableOpen] = useState(false);
  const [summaryNoWorkOpen, setSummaryNoWorkOpen] = useState(false);
  const [summaryNextClaimOpen, setSummaryNextClaimOpen] = useState(false);
  const [summaryH2022UnsentOpen, setSummaryH2022UnsentOpen] = useState(false);
  const [summaryExAuthOpen, setSummaryExAuthOpen] = useState(false);
  const [savingKey, setSavingKey] = useState('');
  const [memberNotesModal, setMemberNotesModal] = useState(EMPTY_NOTES_MODAL);
  const [claimSubmitOpen, setClaimSubmitOpen] = useState(false);
  const [claimSubmitTargets, setClaimSubmitTargets] = useState<ClaimSubmitTarget[]>([]);
  const [activityOpenId, setActivityOpenId] = useState('');
  const [activityByClient, setActivityByClient] = useState<Record<string, ClaimAuditActivityEntry[]>>({});
  const [activityLoadingId, setActivityLoadingId] = useState('');

  const loadMemberActivity = useCallback(
    async (clientId2: string, opts?: { force?: boolean }) => {
      const key = clean(clientId2);
      if (!key) return;
      if (!opts?.force && activityByClient[key]) return;
      const user = auth.currentUser;
      if (!user) return;
      setActivityLoadingId(key);
      try {
        const idToken = await user.getIdToken();
        const response = await fetch(
          `/api/admin/kaiser-t2038-claim-audit/activity?clientId2=${encodeURIComponent(key)}`,
          { headers: { Authorization: `Bearer ${idToken}` } }
        );
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body?.success) {
          throw new Error(String(body?.error || `HTTP ${response.status}`));
        }
        const entries = Array.isArray(body.entries) ? (body.entries as ClaimAuditActivityEntry[]) : [];
        setActivityByClient((prev) => ({ ...prev, [key]: entries }));
      } catch (err: unknown) {
        toast({
          title: 'Activity log failed',
          description: String((err as { message?: string })?.message || err),
          variant: 'destructive',
        });
      } finally {
        setActivityLoadingId('');
      }
    },
    [activityByClient, auth.currentUser, toast]
  );

  const toggleMemberActivity = useCallback(
    (clientId2: string) => {
      const key = clean(clientId2);
      if (!key) return;
      if (activityOpenId === key) {
        setActivityOpenId('');
        return;
      }
      setActivityOpenId(key);
      void loadMemberActivity(key);
    },
    [activityOpenId, loadMemberActivity]
  );

  const applyAuditResponse = useCallback((body: Record<string, unknown>) => {
    const rawRows = Array.isArray(body.rows) ? (body.rows as KaiserT2038ClaimAuditRow[]) : [];
    setRows(rawRows.map((row) => enrichKaiserT2038FutureClaimFields(row)));
    setSummary((body.summary as Summary) || null);
    setFetchedAt(String(body.fetchedAt || ''));
    const stored = String(body.firestoreStoredAt || body.snapshotAt || body.fetchedAt || '');
    setSnapshotAt(String(body.snapshotAt || stored));
    setFirestoreStoredAt(stored);
    setLastCaspioRefreshAt(String(body.lastCaspioRefreshAt || ''));
    setRunMode((String(body.mode || '') as KaiserT2038ClaimAuditRunMode) || '');
    setRunId(String(body.runId || ''));
    setHasSavedRun(Boolean(body.hasSavedRun));
    setClaimStats({
      live: Number(body.claimRowsLive || 0) || 0,
      cached: Number(body.claimRowsCached || 0) || 0,
      targeted: Number(body.claimRowsTargeted || 0) || 0,
      newClaims: Number(body.claimRowsNew || 0) || 0,
      total: Number(body.claimRowsFetched || 0) || 0,
      clients: Number(body.claimClientsIndexed || 0) || 0,
    });
    setMemberStats(
      body.membersFromCache !== undefined
        ? {
            cursor: body.membersFromCursor === null ? null : Number(body.membersFromCursor) || 0,
            cache: Number(body.membersFromCache) || 0,
          }
        : null
    );
  }, []);

  const load = useCallback(
    async (mode: KaiserT2038ClaimAuditRunMode, opts?: { silent?: boolean }) => {
      const user = auth.currentUser;
      if (!user) {
        setError('Sign in required.');
        return false;
      }
      setIsLoading(true);
      setLoadingMode(mode);
      setError('');
      try {
        const idToken = await user.getIdToken();
        const response = await fetch(`/api/admin/kaiser-t2038-claim-audit?mode=${mode}`, {
          headers: { Authorization: `Bearer ${idToken}` },
          cache: 'no-store',
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body?.success) {
          throw new Error(String(body?.error || `HTTP ${response.status}`));
        }
        applyAuditResponse(body);
        if (!opts?.silent) {
          if (mode === 'incremental') {
            toast({
              title: 'Refreshed from Caspio',
              description: `${Number(body.claimRowsNew || 0) || 0} new · ${
                Number(body.claimRowsTargeted || 0) || 0
              } targeted for no-claims members · gaps recalculated`,
            });
          } else if (mode === 'full') {
            toast({
              title: 'Full rebuild saved',
              description: `${Number(body.claimRowsFetched || 0) || 0} claim rows · run stored in Firestore`,
            });
          }
        }
        return Boolean(body.hasSavedRun);
      } catch (err: unknown) {
        setError(String((err as { message?: string })?.message || 'Could not load claim audit.'));
        return false;
      } finally {
        setIsLoading(false);
        setLoadingMode('');
      }
    },
    [auth, applyAuditResponse, toast]
  );

  const refreshMemberClaims = useCallback(
    async (row: KaiserT2038ClaimAuditRow) => {
      const user = auth.currentUser;
      if (!user) {
        setError('Sign in required.');
        return;
      }
      const params = new URLSearchParams({ mode: 'refresh_member' });
      if (row.clientId2) params.set('clientId2', row.clientId2);
      if (row.mrn) params.set('mrn', row.mrn);
      if (row.memberFirstName) params.set('first', row.memberFirstName);
      if (row.memberLastName) params.set('last', row.memberLastName);
      setRefreshingMemberId(row.id);
      setError('');
      try {
        const idToken = await user.getIdToken();
        const response = await fetch(`/api/admin/kaiser-t2038-claim-audit?${params.toString()}`, {
          headers: { Authorization: `Bearer ${idToken}` },
          cache: 'no-store',
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body?.success) {
          throw new Error(String(body?.error || `HTTP ${response.status}`));
        }
        applyAuditResponse(body);
        const refreshed = body.refreshedRow as KaiserT2038ClaimAuditRow | null;
        toast({
          title: 'Member claims refreshed',
          description: refreshed?.noClaimsYet
            ? `${row.memberName || row.clientId2}: still no submitted claims in Caspio`
            : `${row.memberName || row.clientId2}: ${Number(body.claimRowsLive || 0) || 0} claim row(s) pulled`,
        });
      } catch (err: unknown) {
        toast({
          title: 'Refresh failed',
          description: String((err as { message?: string })?.message || 'Could not refresh member claims.'),
          variant: 'destructive',
        });
      } finally {
        setRefreshingMemberId('');
      }
    },
    [auth, applyAuditResponse, toast]
  );

  // Instant paint from Firestore; Caspio only when staff refresh globally or per-member.
  useEffect(() => {
    if (!isAdminLoading && isAdmin) void load('saved', { silent: true });
  }, [isAdmin, isAdminLoading, load]);

  const openMemberNotes = useCallback(
    async (row: KaiserT2038ClaimAuditRow) => {
      const clientId2 = String(row.clientId2 || '').trim();
      if (!clientId2) {
        toast({
          title: 'No Client_ID2',
          description: 'This row has no Client_ID2, so member notes cannot be opened.',
          variant: 'destructive',
        });
        return;
      }
      setMemberNotesModal({
        ...EMPTY_NOTES_MODAL,
        isOpen: true,
        member: rowToKaiserMember(row),
        isLoadingNotes: true,
      });
      try {
        const response = await fetch(
          `/api/member-notes?clientId2=${encodeURIComponent(clientId2)}&skipSync=true`,
          { cache: 'no-store' }
        );
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.success) {
          throw new Error(String(data?.error || `Failed to load notes (HTTP ${response.status})`));
        }
        setMemberNotesModal((prev) => ({
          ...prev,
          notes: Array.isArray(data.notes) ? data.notes : [],
          isLoadingNotes: false,
          lastSyncAt: String(data?.syncLastAt || ''),
          existingNotesCount: Number(data?.existingNotesCount || data?.notes?.length || 0),
          newNotesCount: Number(data?.newNotesCount || 0),
          didSync: false,
        }));
      } catch (err: unknown) {
        toast({
          title: 'Could not load notes',
          description: String((err as { message?: string })?.message || 'Failed to load member notes'),
          variant: 'destructive',
        });
        setMemberNotesModal((prev) => ({
          ...prev,
          notes: [],
          isLoadingNotes: false,
        }));
      }
    },
    [toast]
  );

  const syncMemberNotes = useCallback(async () => {
    const member = memberNotesModal.member;
    if (!member) return;
    const clientId2 = String(member.client_ID2 || '').trim();
    if (!clientId2) return;
    setMemberNotesModal((prev) => ({ ...prev, isLoadingNotes: true }));
    try {
      const response = await fetch(
        `/api/member-notes?clientId2=${encodeURIComponent(clientId2)}&forceSync=false&skipSync=false&repairIfEmpty=true`,
        { cache: 'no-store' }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.success) {
        throw new Error(String(data?.error || 'Failed to sync notes'));
      }
      setMemberNotesModal((prev) => ({
        ...prev,
        notes: Array.isArray(data.notes) ? data.notes : [],
        isLoadingNotes: false,
        lastSyncAt: String(data?.syncLastAt || ''),
        existingNotesCount: Number(data?.existingNotesCount || 0),
        newNotesCount: Number(data?.newNotesCount || 0),
        didSync: true,
      }));
      toast({
        title: 'Notes sync complete',
        description: `${data?.existingNotesCount || 0} existing + ${data?.newNotesCount || 0} new notes for ${
          member.memberFirstName
        } ${member.memberLastName}`,
      });
    } catch (err: unknown) {
      setMemberNotesModal((prev) => ({ ...prev, isLoadingNotes: false }));
      toast({
        title: 'Sync failed',
        description: String((err as { message?: string })?.message || 'Could not refresh member notes.'),
        variant: 'destructive',
      });
    }
  }, [memberNotesModal.member, toast]);

  const formatStamp = (iso: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
  };

  const statusOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const label = clean(row.calaimStatus) || '(blank)';
      counts.set(label, (counts.get(label) || 0) + 1);
    }
    // Ensure common CalAIM_Status values appear even if count is 0 in this run.
    for (const status of COMMON_CALAIM_STATUSES) {
      if (![...counts.keys()].some((key) => normalizeStatus(key) === normalizeStatus(status))) {
        counts.set(status, 0);
      }
    }
    return Array.from(counts.entries()).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0], undefined, { sensitivity: 'base' });
    });
  }, [rows]);

  const matchesStatusAndAuth = useCallback(
    (row: KaiserT2038ClaimAuditRow) => {
      if (authFilter === 'open' && !(row.window === 'in_window' || row.window === 'ending_soon')) return false;
      if (authFilter === 'ended' && !row.authEnded) return false;
      if (authFilter === 'missing_dates' && row.window !== 'missing_dates') return false;
      if (statusFilter === 'all') return true;
      const wantStatus = normalizeStatus(statusFilter);
      // Default "Authorized" lane also includes H2022 (active members needing T2038 claim coverage).
      if (wantStatus === 'authorized') return isClaimAuditActiveCalaimStatus(row.calaimStatus);
      if (wantStatus === 'non active' || wantStatus === 'nonactive' || wantStatus === 'inactive') {
        const got = normalizeStatus(row.calaimStatus);
        return got === 'non active' || got === 'nonactive' || got === 'inactive';
      }
      return normalizeStatus(row.calaimStatus) === wantStatus;
    },
    [authFilter, statusFilter]
  );

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const lastNeedle = lastNameFilter.trim().toLowerCase();
    // Compare MRNs on digits/letters only; strip leading zeros so 000001732688 matches 1732688.
    const normalizeMrn = (value: unknown) =>
      String(value || '')
        .toUpperCase()
        .replace(/[^0-9A-Z]/g, '')
        .replace(/^0+(?=\d)/, '');
    const mrnNeedle = normalizeMrn(mrnFilter);
    return rows.filter((row) => {
      if (!matchesStatusAndAuth(row)) return false;
      const claimableCount = Number(row.claimableMonthCount || 0);
      const noWorkCount = Number(row.noWorkMonthCount || 0);
      // Keep members with claimable months visible after gaps are "satisfied".
      if (
        coverageFilter === 'incomplete' &&
        row.openMissingMonthCount <= 0 &&
        !row.noClaimsYet &&
        claimableCount <= 0
      ) {
        return false;
      }
      if (
        coverageFilter === 'gaps_only' &&
        (row.noClaimsYet || (row.openMissingMonthCount <= 0 && claimableCount <= 0))
      ) {
        return false;
      }
      if (coverageFilter === 'no_claims_yet' && !row.noClaimsYet) return false;
      if (coverageFilter === 'claimable' && claimableCount <= 0) return false;
      if (coverageFilter === 'no_work' && noWorkCount <= 0) return false;
      if (coverageFilter === 'next_claim_due' && !row.futureClaimDue) return false;
      if (coverageFilter === 'complete' && (!row.claimsComplete || claimableCount > 0)) return false;
      if (lastNeedle) {
        const last = String(row.memberLastName || row.memberName.split(',')[0] || '').toLowerCase();
        if (!last.startsWith(lastNeedle) && !last.includes(lastNeedle)) return false;
      }
      if (mrnNeedle && !normalizeMrn(row.mrn).includes(mrnNeedle)) return false;
      if (!needle) return true;
      const haystack = [
        row.memberName,
        row.memberFirstName,
        row.memberLastName,
        row.mrn,
        row.clientId2,
        row.authorizationNumber,
        row.calaimStatus,
        row.kaiserStatus,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [rows, query, lastNameFilter, mrnFilter, coverageFilter, matchesStatusAndAuth]);

  /** Top-of-page work summary for current CalAIM_Status + Authorization filters. */
  const cardSummary = useMemo(
    () => (rows.length ? (summarizeKaiserT2038ClaimAudit(rows.filter(matchesStatusAndAuth)) as Summary) : summary),
    [rows, matchesStatusAndAuth, summary]
  );

  /** Dollar portions: H2022 not-sent always from H2022 rows; claimable / no-work follow auth + status filters. */
  const valueSummary = useMemo(() => {
    const rate = T2038_CLAIM_AUDIT_RATE_USD;
    const h2022Rows = rows.filter((row) => normalizeStatus(row.calaimStatus) === 'h2022');
    const h2022UnsubmittedClaims = h2022Rows.reduce(
      (sum, row) => sum + Number(row.unsubmittedClaimCount || 0),
      0
    );
    const scoped = rows.filter(matchesStatusAndAuth);
    const claimableMonths = scoped.reduce((sum, row) => sum + Number(row.claimableMonthCount || 0), 0);
    const noWorkMonths = scoped.reduce((sum, row) => sum + Number(row.noWorkMonthCount || 0), 0);
    return {
      rate,
      h2022MemberCount: h2022Rows.length,
      h2022UnsubmittedClaims,
      h2022UnsubmittedAmountUsd: h2022UnsubmittedClaims * rate,
      claimableMonths,
      claimableAmountUsd: claimableMonths * rate,
      noWorkMonths,
      noWorkAmountUsd: noWorkMonths * rate,
    };
  }, [rows, matchesStatusAndAuth]);

  const focusMemberInList = useCallback(
    (opts: {
      id: string;
      clientId2?: string;
      name?: string;
      coverage?: CoverageFilter;
      status?: StatusFilter;
      auth?: AuthFilter;
    }) => {
      if (opts.status) setStatusFilter(opts.status);
      if (opts.auth) setAuthFilter(opts.auth);
      setCoverageFilter(opts.coverage || 'incomplete');
      setQuery(opts.clientId2 || opts.name || '');
      setExpandedId(opts.id);
      requestAnimationFrame(() => {
        document.getElementById('kaiser-t2038-members')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    },
    []
  );

  const queueSummary = useMemo(() => {
    const scoped = rows.filter(matchesStatusAndAuth);
    const toMonthList = (
      row: KaiserT2038ClaimAuditRow,
      predicate: (month: KaiserT2038ClaimAuditRow['months'][number]) => boolean
    ) =>
      (row.months || [])
        .filter(predicate)
        .map((month) => ({
          key: month.monthKey,
          label: month.label || month.monthKey,
          noteCount: Number(month.noteCount || 0),
          noteEvidence: month.noteEvidence || 'unknown',
          reason: month.justificationReason || '',
        }));
    const toGapMember = (row: KaiserT2038ClaimAuditRow) => {
      const months = toMonthList(row, (month) => month.status === 'missing');
      return {
        id: row.id,
        name: row.memberName || row.clientId2 || 'Member',
        clientId2: row.clientId2,
        calaimStatus: row.calaimStatus,
        kaiserStatus: row.kaiserStatus,
        authorizationStart: row.authorizationStart,
        authorizationEnd: row.authorizationEnd,
        firstClaimDate: row.firstClaimDate,
        lastClaimDate: lastClaimDateFor(row),
        openGaps: row.openMissingMonthCount,
        months,
      };
    };
    const toNoteQueueMember = (
      row: KaiserT2038ClaimAuditRow,
      months: ReturnType<typeof toMonthList>,
      kind: 'claimable' | 'no_work'
    ) => ({
      id: row.id,
      name: row.memberName || row.clientId2 || 'Member',
      clientId2: row.clientId2,
      calaimStatus: row.calaimStatus,
      kaiserStatus: row.kaiserStatus,
      authorizationStart: row.authorizationStart,
      authorizationEnd: row.authorizationEnd,
      firstClaimDate: row.firstClaimDate,
      kind,
      monthCount: months.length,
      months,
      why:
        kind === 'claimable'
          ? 'Notes on file that month → claimable'
          : 'No notes that month → not claimable (no work)',
    });
    const noClaimsMembers = scoped
      .filter((row) => row.noClaimsYet)
      .map((row) => ({
        id: row.id,
        name: row.memberName || row.clientId2 || 'Member',
        clientId2: row.clientId2,
        calaimStatus: row.calaimStatus,
        kaiserStatus: row.kaiserStatus,
        authorizationStart: row.authorizationStart,
        authorizationEnd: row.authorizationEnd,
        unsubmittedClaimCount: row.unsubmittedClaimCount || 0,
      }));
    const gapMembers = scoped.filter((row) => !row.noClaimsYet && row.openMissingMonthCount > 0).map(toGapMember);
    const claimableMembers = scoped
      .filter((row) => Number(row.claimableMonthCount || 0) > 0)
      .map((row) =>
        toNoteQueueMember(
          row,
          toMonthList(row, (month) => isUnpushedClaimableMonth(month)),
          'claimable'
        )
      )
      .sort((a, b) => b.monthCount - a.monthCount || a.name.localeCompare(b.name));
    const noWorkMembers = scoped
      .filter((row) => Number(row.noWorkMonthCount || 0) > 0)
      .map((row) =>
        toNoteQueueMember(
          row,
          toMonthList(
            row,
            (month) => month.status === 'justified' && isNoWorkJustification(month.justificationReason)
          ),
          'no_work'
        )
      )
      .sort((a, b) => b.monthCount - a.monthCount || a.name.localeCompare(b.name));
    const h2022UnsentMembers = rows
      .filter(
        (row) =>
          normalizeStatus(row.calaimStatus) === 'h2022' && Number(row.unsubmittedClaimCount || 0) > 0
      )
      .map((row) => ({
        id: row.id,
        name: row.memberName || row.clientId2 || 'Member',
        clientId2: row.clientId2,
        calaimStatus: row.calaimStatus,
        kaiserStatus: row.kaiserStatus,
        authorizationStart: row.authorizationStart,
        authorizationEnd: row.authorizationEnd,
        unsubmittedClaimCount: Number(row.unsubmittedClaimCount || 0),
        unsubmittedClaimDates: row.unsubmittedClaimDates || [],
      }))
      .sort((a, b) => b.unsubmittedClaimCount - a.unsubmittedClaimCount || a.name.localeCompare(b.name));
    // Ongoing claims after past claimables are done — last DOS + ≥30 days.
    const nextClaimDueMembers = scoped
      .filter((row) => Boolean(row.futureClaimDue))
      .map((row) => ({
        id: row.id,
        name: row.memberName || row.clientId2 || 'Member',
        clientId2: row.clientId2,
        calaimStatus: row.calaimStatus,
        kaiserStatus: row.kaiserStatus,
        authorizationStart: row.authorizationStart,
        authorizationEnd: row.authorizationEnd,
        lastClaimDate: lastClaimDateFor(row),
        daysSinceLastClaim: row.daysSinceLastClaim ?? null,
        nextClaimEligibleDate: row.nextClaimEligibleDate || '',
        nextClaimMonthKey: row.nextClaimMonthKey || '',
      }))
      .sort(
        (a, b) =>
          Number(b.daysSinceLastClaim || 0) - Number(a.daysSinceLastClaim || 0) ||
          a.name.localeCompare(b.name)
      );
    // Members we did bill, now off Authorized/H2022, with gaps inside the 3-month window —
    // ignores the status/auth filters so stopped billing is always visible.
    const exAuthGapMembers = rows
      .filter(
        (row) =>
          !isClaimAuditActiveCalaimStatus(row.calaimStatus) &&
          !row.noClaimsYet &&
          Boolean(row.firstClaimDate) &&
          row.openMissingMonthCount > 0
      )
      .map(toGapMember);
    const hiddenNoClaimsByStatus = new Map<string, number>();
    for (const row of rows) {
      if (!row.noClaimsYet || matchesStatusAndAuth(row)) continue;
      const label = clean(row.calaimStatus) || '(blank)';
      hiddenNoClaimsByStatus.set(label, (hiddenNoClaimsByStatus.get(label) || 0) + 1);
    }
    const monthRollup = new Map<string, { key: string; label: string; count: number }>();
    for (const member of gapMembers) {
      for (const month of member.months) {
        const existing = monthRollup.get(month.key);
        if (existing) existing.count += 1;
        else monthRollup.set(month.key, { key: month.key, label: month.label, count: 1 });
      }
    }
    const gapMonthsByMonth = Array.from(monthRollup.values()).sort((a, b) => a.key.localeCompare(b.key));
    return {
      scopedCount: scoped.length,
      noClaimsMembers,
      gapMembers,
      claimableMembers,
      noWorkMembers,
      h2022UnsentMembers,
      nextClaimDueMembers,
      claimableMonthTotal: claimableMembers.reduce((sum, member) => sum + member.monthCount, 0),
      noWorkMonthTotal: noWorkMembers.reduce((sum, member) => sum + member.monthCount, 0),
      exAuthGapMembers,
      exAuthOpenGapMonths: exAuthGapMembers.reduce((sum, member) => sum + member.openGaps, 0),
      hiddenNoClaims: Array.from(hiddenNoClaimsByStatus.entries()).sort((a, b) => b[1] - a[1]),
      gapMonthsByMonth,
      totalOpenGapMonths: gapMembers.reduce((sum, member) => sum + member.openGaps, 0),
    };
  }, [rows, matchesStatusAndAuth]);

  const openClaimableSubmit = useCallback(
    (
      members = queueSummary.claimableMembers,
      opts?: { onlyUnpushed?: boolean; single?: { clientId2: string; monthKey: string; memberName?: string } }
    ) => {
      if (opts?.single) {
        const row = rows.find((item) => item.clientId2 === opts.single!.clientId2);
        const cell = row?.months?.find((month) => month.monthKey === opts.single!.monthKey);
        const alreadyPushed = Boolean(cell?.caspioPushedAt);
        if (alreadyPushed) {
          toast({
            title: 'Already pushed',
            description: `${opts.single.memberName || opts.single.clientId2} · ${
              opts.single.monthKey
            } was already pushed and cannot be pushed again.`,
            variant: 'destructive',
          });
          return;
        }
        setClaimSubmitTargets([
          {
            ...opts.single,
            alreadyPushed: false,
            caspioDateOfService: cell?.caspioDateOfService || '',
          },
        ]);
        setClaimSubmitOpen(true);
        return;
      }
      const targets: ClaimSubmitTarget[] = [];
      const onlyUnpushed = opts?.onlyUnpushed !== false;
      for (const member of members) {
        const row = rows.find((item) => item.id === member.id || item.clientId2 === member.clientId2);
        for (const month of member.months || []) {
          if (!member.clientId2 || !month.key) continue;
          const cell = row?.months?.find((m) => m.monthKey === month.key);
          if (onlyUnpushed && cell?.caspioPushedAt) continue;
          targets.push({
            clientId2: member.clientId2,
            monthKey: month.key,
            memberName: member.name,
            alreadyPushed: Boolean(cell?.caspioPushedAt),
            caspioDateOfService: cell?.caspioDateOfService || '',
          });
        }
      }
      if (!targets.length) {
        toast({
          title: onlyUnpushed ? 'Nothing left to push' : 'No claimable months',
          description: onlyUnpushed
            ? 'All claimable months for this selection are already pushed to Caspio.'
            : 'Mark or auto-detect claimable months (notes on file) first.',
          variant: 'destructive',
        });
        return;
      }
      setClaimSubmitTargets(targets);
      setClaimSubmitOpen(true);
    },
    [queueSummary.claimableMembers, rows, toast]
  );

  const markMonthsPushed = useCallback(
    (results: ClaimPushResult[]) => {
      if (!results.length) return;
      const clientIds = [...new Set(results.map((result) => clean(result.clientId2)).filter(Boolean))];
      for (const clientId2 of clientIds) {
        void loadMemberActivity(clientId2, { force: true });
      }
      setRows((prev) =>
        prev.map((row) => {
          const hits = results.filter((result) => result.clientId2 === row.clientId2);
          if (!hits.length) return row;
          let months = row.months.map((month) => {
            const hit = hits.find((result) => result.monthKey === month.monthKey);
            if (!hit) return month;
            return {
              ...month,
              status: 'claimable' as const,
              caspioPushedAt: hit.caspioPushedAt,
              caspioClaimPkId: hit.caspioClaimPkId || month.caspioClaimPkId || '',
              caspioDateOfService: hit.caspioDateOfService || month.caspioDateOfService || '',
            };
          });
          // Next-claim months may not be in the gap grid — keep a cell so re-push stays locked.
          for (const hit of hits) {
            if (months.some((month) => month.monthKey === hit.monthKey)) continue;
            months = [
              ...months,
              {
                monthKey: hit.monthKey,
                label: formatMonthLabel(hit.monthKey),
                status: 'claimable' as const,
                claimDates: [],
                unsubmittedDates: [],
                justificationReason: '',
                justifiedBy: '',
                justifiedAt: '',
                noteEvidence: 'unknown' as const,
                noteCount: 0,
                caspioPushedAt: hit.caspioPushedAt,
                caspioClaimPkId: hit.caspioClaimPkId || '',
                caspioDateOfService: hit.caspioDateOfService || '',
              },
            ];
          }
          return recomputeKaiserT2038FutureClaimFields({ ...row, months });
        })
      );
    },
    [loadMemberActivity]
  );

  const pushedClaimTargets = useMemo(() => {
    const targets: ClaimSubmitTarget[] = [];
    for (const row of rows) {
      for (const month of row.months || []) {
        if (month.status !== 'claimable' || !month.caspioPushedAt) continue;
        if (!row.clientId2) continue;
        targets.push({
          clientId2: row.clientId2,
          monthKey: month.monthKey,
          memberName: row.memberName,
        });
      }
    }
    return targets;
  }, [rows]);

  const [isBuildingEdi, setIsBuildingEdi] = useState(false);

  const downloadPushedClaimsEdi = useCallback(async () => {
    if (!pushedClaimTargets.length) {
      toast({
        title: 'No pushed claims',
        description: 'Push claimable months to Caspio first, then download SDS EDI.',
        variant: 'destructive',
      });
      return;
    }
    const user = auth.currentUser;
    if (!user) return;
    setIsBuildingEdi(true);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/admin/kaiser-t2038-claim-submit', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'edi_pushed',
          targets: pushedClaimTargets.map((target) => ({
            clientId2: target.clientId2,
            monthKey: target.monthKey,
          })),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.success) {
        throw new Error(String(body?.error || `HTTP ${response.status}`));
      }
      const edi = String(body.edi || '');
      if (!edi) {
        throw new Error('EDI builder returned an empty file.');
      }
      const blob = new Blob([edi], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `kaiser-t2038-sds-pushed-${new Date().toISOString().slice(0, 10)}.edi`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast({
        title: 'SDS EDI ready',
        description: `${body.included || pushedClaimTargets.length} claim(s) for SDS 837P — upload the .edi manually in the SDS portal (Sender/Receiver IDs not required yet).`,
      });
    } catch (err: unknown) {
      toast({
        title: 'EDI download failed',
        description: String((err as { message?: string })?.message || err),
        variant: 'destructive',
      });
    } finally {
      setIsBuildingEdi(false);
    }
  }, [auth.currentUser, pushedClaimTargets, toast]);

  const saveMonthDisposition = async (
    row: KaiserT2038ClaimAuditRow,
    monthKey: string,
    opts: { disposition?: MonthDisposition; clear?: boolean }
  ) => {
    const user = auth.currentUser;
    if (!user) return;
    const draftKey = `${row.clientId2}__${monthKey}`;
    const clear = Boolean(opts.clear);
    const disposition: MonthDisposition = opts.disposition || 'justified';
    const cell = row.months?.find((month) => month.monthKey === monthKey);
    const noNotes = cell?.noteEvidence === 'no_notes';
    const reason =
      disposition === 'claimable'
        ? noNotes
          ? DEFAULT_CLAIMABLE_OVERRIDE_REASON
          : DEFAULT_CLAIMABLE_REASON
        : DEFAULT_JUSTIFY_REASON;
    setSavingKey(draftKey);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/admin/kaiser-t2038-claim-audit', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clientId2: row.clientId2,
          monthKey,
          disposition: clear ? undefined : disposition,
          reason: clear ? '' : reason,
          clear,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.success) {
        throw new Error(String(body?.error || `HTTP ${response.status}`));
      }
      toast({
        title: clear
          ? 'Cleared'
          : disposition === 'claimable'
            ? noNotes
              ? 'Marked claimable (staff override)'
              : 'Marked claimable'
            : 'Marked no-claim',
        description: `${row.memberName} · ${monthKey}${
          disposition === 'claimable' && noNotes ? ' · no notes that month' : ''
        }`,
      });
      void loadMemberActivity(row.clientId2, { force: true });
      setRows((prev) => {
        const next = prev.map((item) => {
          if (item.clientId2 !== row.clientId2) return item;
          const months = item.months.map((month) => {
            if (month.monthKey !== monthKey) return month;
            if (clear) {
              if (month.claimDates.length > 0) {
                return {
                  ...month,
                  status: 'claimed' as const,
                  justificationReason: '',
                  justifiedBy: '',
                  justifiedAt: '',
                };
              }
              // Fall back to note evidence when staff clears a manual disposition.
              if (month.noteEvidence === 'has_notes') {
                return {
                  ...month,
                  status: 'claimable' as const,
                  justificationReason: DEFAULT_NOTES_CLAIMABLE_REASON,
                  justifiedBy: '',
                  justifiedAt: '',
                };
              }
              if (month.noteEvidence === 'no_notes') {
                return {
                  ...month,
                  status: 'justified' as const,
                  justificationReason: DEFAULT_NO_WORK_REASON,
                  justifiedBy: '',
                  justifiedAt: '',
                };
              }
              return {
                ...month,
                status: 'missing' as const,
                justificationReason: '',
                justifiedBy: '',
                justifiedAt: '',
              };
            }
            return {
              ...month,
              status: disposition === 'claimable' ? ('claimable' as const) : ('justified' as const),
              justificationReason: reason,
              justifiedBy: String(body?.justification?.justifiedBy || user.displayName || user.email || 'Admin'),
              justifiedAt: String(body?.justification?.updatedAt || new Date().toISOString()),
            };
          });
          const openMissingFromGrid = months.filter((m) => m.status === 'missing').length;
          const justifiedMonthCount = months.filter((m) => m.status === 'justified').length;
          const claimedMonthCount = months.filter((m) => m.status === 'claimed').length;
          const claimableMonthCount = months.filter((m) => isUnpushedClaimableMonth(m)).length;
          const noWorkMonthCount = months.filter(
            (m) => m.status === 'justified' && isNoWorkJustification(m.justificationReason)
          ).length;
          const resolvedCount = months.filter(
            (m) => m.status === 'justified' || m.status === 'claimable'
          ).length;
          return {
            ...item,
            months,
            claimedMonthCount,
            justifiedMonthCount,
            claimableMonthCount,
            noWorkMonthCount,
            missingMonthCount: item.noClaimsYet ? 1 : openMissingFromGrid + resolvedCount,
            openMissingMonthCount: item.noClaimsYet ? 1 : openMissingFromGrid,
            claimsComplete: !item.noClaimsYet && months.length > 0 && openMissingFromGrid === 0,
          };
        });
        setSummary(summarizeKaiserT2038ClaimAudit(next) as Summary);
        return next;
      });
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Could not save',
        description: String((err as { message?: string })?.message || 'Save failed'),
      });
    } finally {
      setSavingKey('');
    }
  };

  if (isAdminLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Checking access
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <Alert>
        <AlertTitle>Admin only</AlertTitle>
        <AlertDescription>Sign in as an admin to audit Kaiser T2038 claim months.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Kaiser T2038 Claim Audit</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Kaiser members (<span className="font-medium">Authorized</span> or{' '}
            <span className="font-medium">H2022</span>, plus ended auths) vs{' '}
            <span className="font-medium">Kaiser-only</span>{' '}
            <code className="text-xs">CalAIM_Claim_Submit_T2038</code> rows (<code className="text-xs">MCP</code>).{' '}
            <span className="font-medium">Unsubmitted</span> = blank <code className="text-xs">Claim_Status</code>{' '}
            (entered in Caspio, not sent to clearinghouse).{' '}
            <span className="font-medium">No claims yet</span> = no clearinghouse-submitted rows on the member (prior
            auths count). Gap months start at the first claim on/after the current auth start through auth end / today;
            gaps from <span className="font-medium">2025</span> or <span className="font-medium">older than 3 months</span>{' '}
            are ignored.
          </p>
          <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
            <p>
              <span className="font-medium text-foreground/80">Last Firestore stored:</span>{' '}
              {formatStamp(firestoreStoredAt || snapshotAt || fetchedAt)}
              {runMode === 'saved' ? ' · loaded from snapshot' : null}
              {runMode && runMode !== 'saved' ? ` · last run ${runMode}` : null}
              {runId ? ` · ${runId.slice(0, 8)}…` : ''}
            </p>
            <p>
              <span className="font-medium text-foreground/80">Last Caspio refresh:</span>{' '}
              {formatStamp(lastCaspioRefreshAt)}
              {claimStats.total
                ? ` · ${claimStats.total} claims · ${claimStats.clients} Client_ID2 keys`
                : ''}
              {claimStats.newClaims ? ` · +${claimStats.newClaims} new` : ''}
              {claimStats.targeted ? ` · targeted ${claimStats.targeted}` : ''}
              {memberStats ? ` · members cursor ${memberStats.cursor ?? 'n/a'} / cache ${memberStats.cache}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void load('saved')} disabled={isLoading || isAdminLoading || !isAdmin}>
            {isLoading && loadingMode === 'saved' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Database className="mr-2 h-4 w-4" />
            )}
            Load saved
          </Button>
          <Button
            onClick={() => void load('incremental')}
            disabled={isLoading || isAdminLoading || !isAdmin}
          >
            {isLoading && loadingMode === 'incremental' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh from Caspio
          </Button>
          <Button variant="secondary" onClick={() => void load('full')} disabled={isLoading || isAdminLoading || !isAdmin}>
            {isLoading && loadingMode === 'full' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Full rebuild
          </Button>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load audit</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {!hasSavedRun && !isLoading && !error ? (
        <Alert>
          <AlertTitle>No saved audit yet</AlertTitle>
          <AlertDescription>
            Run <span className="font-medium">Full rebuild</span> or{' '}
            <span className="font-medium">Refresh from Caspio</span> once to store the audit in Firestore. After that,
            the page loads the saved snapshot on open; use global refresh or per-member{' '}
            <span className="font-medium">Refresh claims</span> as you submit claims in Caspio.
          </AlertDescription>
        </Alert>
      ) : null}

      <KaiserMrnMcoMismatchCard enabled={!isAdminLoading && isAdmin} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Kaiser members in scope</CardDescription>
            <CardTitle>{cardSummary?.total ?? '—'}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Open auth {cardSummary?.openAuth ?? 0} · Ended {cardSummary?.authEnded ?? 0}
            {summary && cardSummary && cardSummary.total !== summary.total
              ? ` · ${summary.total} total before CalAIM_Status / auth filters`
              : ''}
          </CardContent>
        </Card>
        <Card className={cardSummary?.incomplete ? 'border-amber-400' : undefined}>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> Incomplete claims
            </CardDescription>
            <CardTitle>{cardSummary?.incomplete ?? '—'}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {cardSummary?.openMissingMonths ?? 0} gap month{cardSummary?.openMissingMonths === 1 ? '' : 's'} after
            first claim · {cardSummary?.noClaimsYet ?? 0} with no claims yet
          </CardContent>
        </Card>
        <Card className={cardSummary?.noClaimsYet ? 'border-sky-300' : undefined}>
          <CardHeader className="pb-2">
            <CardDescription>No claims yet</CardDescription>
            <CardTitle>{cardSummary?.noClaimsYet ?? '—'}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Auth on file, zero rows in CalAIM_Claim_Submit_T2038
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Claims complete</CardDescription>
            <CardTitle>{cardSummary?.complete ?? '—'}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Every month claimed or no-work · claimable months stay in the member table
          </CardContent>
        </Card>
      </div>

      {hasSavedRun ? (
        <Card className="border-violet-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Value at ${T2038_CLAIM_AUDIT_RATE_USD}/claim</CardTitle>
            <CardDescription>
              H2022 not-sent is all H2022 members · claimable / no-work follow current CalAIM_Status + auth filters
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-3">
              <button
                type="button"
                className="rounded border border-violet-200 bg-violet-50/40 px-3 py-2 text-left transition hover:bg-violet-100/60"
                onClick={() => {
                  setSummaryH2022UnsentOpen(true);
                  setStatusFilter('H2022');
                  setCoverageFilter('all');
                  setQuery('');
                  document
                    .getElementById('kaiser-t2038-gap-queues')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              >
                <div className="text-xs font-medium text-violet-950">H2022 not sent</div>
                <div className="text-2xl font-semibold tabular-nums">
                  {valueSummary.h2022UnsubmittedClaims}
                </div>
                <div className="text-sm font-medium text-violet-900">
                  {formatUsd(valueSummary.h2022UnsubmittedAmountUsd)}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Blank Claim_Status on {valueSummary.h2022MemberCount} H2022 member
                  {valueSummary.h2022MemberCount === 1 ? '' : 's'} · click for member list
                </p>
              </button>
              <button
                type="button"
                className="rounded border border-sky-200 bg-sky-50/40 px-3 py-2 text-left transition hover:bg-sky-100/60"
                onClick={() => {
                  setSummaryNoWorkOpen(true);
                  setCoverageFilter('no_work');
                  setQuery('');
                  document
                    .getElementById('kaiser-t2038-gap-queues')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              >
                <div className="text-xs font-medium text-sky-950">Not claimable · no work</div>
                <div className="text-2xl font-semibold tabular-nums">{valueSummary.noWorkMonths}</div>
                <div className="text-sm font-medium text-sky-900">
                  {formatUsd(valueSummary.noWorkAmountUsd)}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  No notes that month · click for members &amp; why
                </p>
              </button>
              <button
                type="button"
                className="rounded border border-emerald-200 bg-emerald-50/40 px-3 py-2 text-left transition hover:bg-emerald-100/60"
                onClick={() => {
                  setSummaryClaimableOpen(true);
                  setCoverageFilter('claimable');
                  setQuery('');
                  document
                    .getElementById('kaiser-t2038-gap-queues')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              >
                <div className="text-xs font-medium text-emerald-950">Claimable · notes on file</div>
                <div className="text-2xl font-semibold tabular-nums">{valueSummary.claimableMonths}</div>
                <div className="text-sm font-medium text-emerald-900">
                  {formatUsd(valueSummary.claimableAmountUsd)}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Notes that month · click for members &amp; why
                </p>
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={queueSummary.claimableMembers.length === 0}
                onClick={() => openClaimableSubmit()}
              >
                Preview &amp; push claimable to Caspio
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pushedClaimTargets.length === 0 || isBuildingEdi}
                onClick={() => void downloadPushedClaimsEdi()}
              >
                {isBuildingEdi ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                )}
                SDS EDI for pushed ({pushedClaimTargets.length})
              </Button>
              <span className="self-center text-[11px] text-muted-foreground">
                Or use Preview / Push on each month under the member
              </span>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {hasSavedRun ? (
        <Card id="kaiser-t2038-gap-queues" className="border-amber-200/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Gap months &amp; no claims yet</CardTitle>
            <CardDescription>
              For current filters
              {statusFilter !== 'all' ? ` · CalAIM_Status ${statusFilter}` : ''}
              {authFilter !== 'all' ? ` · auth ${authFilter}` : ''} · {queueSummary.scopedCount} members ·{' '}
              {queueSummary.totalOpenGapMonths} open gap month
              {queueSummary.totalOpenGapMonths === 1 ? '' : 's'} · {queueSummary.noClaimsMembers.length} no
              claims yet · {queueSummary.claimableMembers.length} claimable ·{' '}
              {queueSummary.noWorkMembers.length} not claimable
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {queueSummary.gapMonthsByMonth.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 pb-1">
                {queueSummary.gapMonthsByMonth.map((month) => (
                  <Badge
                    key={month.key}
                    variant="outline"
                    className="bg-amber-50 text-amber-950 border-amber-300 font-normal"
                  >
                    {month.label}
                    <span className="ml-1 text-amber-800/80">· {month.count}</span>
                  </Badge>
                ))}
              </div>
            ) : null}

            <div className="rounded border">
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-amber-50/70"
                onClick={() => setSummaryGapsOpen((open) => !open)}
              >
                {summaryGapsOpen ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="font-medium text-amber-950">Gap members</span>
                <Badge variant="outline" className="bg-amber-50 text-amber-950 border-amber-300">
                  {queueSummary.gapMembers.length}
                </Badge>
                <span className="truncate text-xs text-muted-foreground">
                  {queueSummary.totalOpenGapMonths} open gap month
                  {queueSummary.totalOpenGapMonths === 1 ? '' : 's'}
                </span>
              </button>
              {summaryGapsOpen ? (
                <div className="max-h-56 space-y-0.5 overflow-y-auto border-t bg-white px-2 py-1.5 text-xs">
                  {queueSummary.gapMembers.length === 0 ? (
                    <p className="px-1 py-2 text-muted-foreground">No gap members in this filter set.</p>
                  ) : (
                    queueSummary.gapMembers.map((member) => (
                      <button
                        key={member.id}
                        type="button"
                        className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-amber-50"
                        onClick={() =>
                          focusMemberInList({
                            id: member.id,
                            clientId2: member.clientId2,
                            name: member.name,
                            coverage: 'gaps_only',
                          })
                        }
                      >
                        <span className="min-w-0 truncate font-medium">{member.name}</span>
                        <span className="hidden shrink-0 text-muted-foreground sm:inline">
                          Auth {member.authorizationStart || '—'} → {member.authorizationEnd || '—'}
                        </span>
                        <span className="hidden shrink-0 text-muted-foreground md:inline">
                          First {member.firstClaimDate || '—'}
                        </span>
                        <span className="hidden shrink-0 text-muted-foreground lg:inline">
                          {statusLine(member.calaimStatus, member.kaiserStatus)}
                        </span>
                        <span className="ml-auto min-w-0 truncate text-muted-foreground">
                          {member.months.map((month) => month.label).join(', ') || `${member.openGaps} gaps`}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>

            <div className="rounded border border-emerald-200">
              <div className="flex items-center gap-2 px-3 py-2">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm hover:opacity-90"
                  onClick={() => setSummaryClaimableOpen((open) => !open)}
                >
                  {summaryClaimableOpen ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="font-medium text-emerald-950">Claimable · notes on file</span>
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-950 border-emerald-300">
                    {queueSummary.claimableMembers.length}
                  </Badge>
                  <span className="truncate text-xs text-muted-foreground">
                    {queueSummary.claimableMonthTotal} month
                    {queueSummary.claimableMonthTotal === 1 ? '' : 's'} · click member to see why
                  </span>
                </button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-7 shrink-0"
                  disabled={queueSummary.claimableMembers.length === 0}
                  onClick={() => openClaimableSubmit()}
                >
                  Submit claims…
                </Button>
              </div>
              {summaryClaimableOpen ? (
                <div className="max-h-72 space-y-0.5 overflow-y-auto border-t bg-emerald-50/30 px-2 py-1.5 text-xs">
                  {queueSummary.claimableMembers.length === 0 ? (
                    <p className="px-1 py-2 text-muted-foreground">
                      No claimable months in this filter set (need notes that month).
                    </p>
                  ) : (
                    queueSummary.claimableMembers.map((member) => (
                      <div
                        key={`claimable-${member.id}`}
                        className="flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded px-1.5 py-1 hover:bg-emerald-100/70"
                      >
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 text-left"
                          onClick={() =>
                            focusMemberInList({
                              id: member.id,
                              clientId2: member.clientId2,
                              name: member.name,
                              coverage: 'claimable',
                            })
                          }
                        >
                          <span className="min-w-0 truncate font-medium">{member.name}</span>
                          <span className="hidden shrink-0 lg:inline">
                            {statusLine(member.calaimStatus, member.kaiserStatus)}
                          </span>
                          <span className="text-emerald-900">{member.why}</span>
                          <span className="ml-auto min-w-0 truncate text-emerald-950">
                            {member.months
                              .map((month) =>
                                month.noteCount > 0 ? `${month.label} (${month.noteCount} notes)` : month.label
                              )
                              .join(', ')}
                          </span>
                        </button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-6 shrink-0 px-2 text-[11px]"
                          onClick={() => openClaimableSubmit([member])}
                        >
                          Preview
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              ) : null}
            </div>

            <div className="rounded border border-sky-200">
              <div className="flex items-center gap-2 px-3 py-2">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm hover:opacity-90"
                  onClick={() => setSummaryNextClaimOpen((open) => !open)}
                >
                  {summaryNextClaimOpen ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="font-medium text-sky-950">Next claim due · ≥30d since last DOS</span>
                  <Badge variant="outline" className="bg-sky-50 text-sky-950 border-sky-300">
                    {queueSummary.nextClaimDueMembers.length}
                  </Badge>
                  <span className="truncate text-xs text-muted-foreground">
                    Past claimables done · show last Date_of_Service · push next month
                  </span>
                </button>
              </div>
              {summaryNextClaimOpen ? (
                <div className="max-h-72 space-y-0.5 overflow-y-auto border-t bg-sky-50/40 px-2 py-1.5 text-xs">
                  {queueSummary.nextClaimDueMembers.length === 0 ? (
                    <p className="px-1 py-2 text-muted-foreground">
                      No members ready for a future claim yet (need past gaps/claimables cleared and ≥30 days
                      since last Date_of_Service).
                    </p>
                  ) : (
                    queueSummary.nextClaimDueMembers.map((member) => (
                      <div
                        key={`nextdue-${member.id}`}
                        className="flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded px-1.5 py-1 hover:bg-sky-100/70"
                      >
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 text-left"
                          onClick={() =>
                            focusMemberInList({
                              id: member.id,
                              clientId2: member.clientId2,
                              name: member.name,
                              coverage: 'next_claim_due',
                            })
                          }
                        >
                          <span className="min-w-0 truncate font-medium">{member.name}</span>
                          <span className="shrink-0 text-sky-950">
                            Last DOS {member.lastClaimDate || '—'}
                            {member.daysSinceLastClaim != null
                              ? ` · ${member.daysSinceLastClaim}d ago`
                              : ''}
                          </span>
                          <span className="ml-auto min-w-0 truncate text-muted-foreground">
                            Eligible {member.nextClaimEligibleDate || '—'} · next{' '}
                            {member.nextClaimMonthKey || '—'}
                          </span>
                        </button>
                        {member.nextClaimMonthKey ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-6 shrink-0 px-2 text-[11px]"
                            onClick={() =>
                              openClaimableSubmit(undefined, {
                                single: {
                                  clientId2: member.clientId2,
                                  monthKey: member.nextClaimMonthKey,
                                  memberName: member.name,
                                },
                              })
                            }
                          >
                            Preview
                          </Button>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              ) : null}
            </div>

            <div className="rounded border border-slate-300">
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                onClick={() => setSummaryNoWorkOpen((open) => !open)}
              >
                {summaryNoWorkOpen ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="font-medium text-slate-900">Not claimable · no work</span>
                <Badge variant="outline" className="bg-slate-100 text-slate-900 border-slate-300">
                  {queueSummary.noWorkMembers.length}
                </Badge>
                <span className="truncate text-xs text-muted-foreground">
                  {queueSummary.noWorkMonthTotal} month
                  {queueSummary.noWorkMonthTotal === 1 ? '' : 's'} · no notes that month · click to view
                </span>
              </button>
              {summaryNoWorkOpen ? (
                <div className="max-h-72 space-y-0.5 overflow-y-auto border-t bg-slate-50/50 px-2 py-1.5 text-xs">
                  {queueSummary.noWorkMembers.length === 0 ? (
                    <p className="px-1 py-2 text-muted-foreground">
                      No not-claimable (no notes) months in this filter set.
                    </p>
                  ) : (
                    queueSummary.noWorkMembers.map((member) => (
                      <button
                        key={`nowork-${member.id}`}
                        type="button"
                        className="flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded px-1.5 py-1 text-left hover:bg-slate-100"
                        onClick={() =>
                          focusMemberInList({
                            id: member.id,
                            clientId2: member.clientId2,
                            name: member.name,
                            coverage: 'no_work',
                          })
                        }
                      >
                        <span className="min-w-0 truncate font-medium">{member.name}</span>
                        <span className="hidden shrink-0 lg:inline">
                          {statusLine(member.calaimStatus, member.kaiserStatus)}
                        </span>
                        <span className="text-slate-700">{member.why}</span>
                        <span className="ml-auto min-w-0 truncate text-slate-900">
                          {member.months.map((month) => month.label).join(', ')}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>

            <div className="rounded border border-violet-200">
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-violet-50/70"
                onClick={() => setSummaryH2022UnsentOpen((open) => !open)}
              >
                {summaryH2022UnsentOpen ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="font-medium text-violet-950">H2022 not sent</span>
                <Badge variant="outline" className="bg-violet-50 text-violet-950 border-violet-300">
                  {queueSummary.h2022UnsentMembers.length}
                </Badge>
                <span className="truncate text-xs text-muted-foreground">
                  Blank Claim_Status on H2022 · all filters ignored for this list
                </span>
              </button>
              {summaryH2022UnsentOpen ? (
                <div className="max-h-56 space-y-0.5 overflow-y-auto border-t bg-violet-50/30 px-2 py-1.5 text-xs">
                  {queueSummary.h2022UnsentMembers.length === 0 ? (
                    <p className="px-1 py-2 text-muted-foreground">
                      No H2022 members with blank Claim_Status rows.
                    </p>
                  ) : (
                    queueSummary.h2022UnsentMembers.map((member) => (
                      <button
                        key={`h2022-unsent-${member.id}`}
                        type="button"
                        className="flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded px-1.5 py-1 text-left hover:bg-violet-100/70"
                        onClick={() =>
                          focusMemberInList({
                            id: member.id,
                            clientId2: member.clientId2,
                            name: member.name,
                            coverage: 'all',
                            status: 'H2022',
                          })
                        }
                      >
                        <span className="min-w-0 truncate font-medium">{member.name}</span>
                        <span className="hidden shrink-0 lg:inline">
                          {statusLine(member.calaimStatus, member.kaiserStatus)}
                        </span>
                        <span className="ml-auto min-w-0 truncate text-violet-950">
                          {member.unsubmittedClaimCount} not sent
                          {member.unsubmittedClaimDates.length
                            ? ` · DOS ${member.unsubmittedClaimDates.slice(0, 4).join(', ')}${
                                member.unsubmittedClaimDates.length > 4 ? '…' : ''
                              }`
                            : ''}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>

            <div className="rounded border border-sky-200">
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-sky-50/70"
                onClick={() => setSummaryNoClaimsOpen((open) => !open)}
              >
                {summaryNoClaimsOpen ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="font-medium text-sky-950">No claims yet</span>
                <Badge variant="outline" className="bg-sky-50 text-sky-950 border-sky-300">
                  {queueSummary.noClaimsMembers.length}
                </Badge>
                <span className="truncate text-xs text-muted-foreground">
                  Authorized / H2022 with no clearinghouse claims on file
                </span>
              </button>
              {summaryNoClaimsOpen ? (
                <div className="max-h-56 space-y-0.5 overflow-y-auto border-t bg-sky-50/40 px-2 py-1.5 text-xs">
                  {queueSummary.noClaimsMembers.length === 0 ? (
                    <p className="px-1 py-2 text-muted-foreground">
                      No Authorized / H2022 members missing clearinghouse claims in this filter set.
                    </p>
                  ) : (
                    queueSummary.noClaimsMembers.map((member) => (
                      <button
                        key={member.id}
                        type="button"
                        className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-sky-100/80"
                        onClick={() =>
                          focusMemberInList({
                            id: member.id,
                            clientId2: member.clientId2,
                            name: member.name,
                            coverage: 'no_claims_yet',
                          })
                        }
                      >
                        <span className="min-w-0 truncate font-medium">{member.name}</span>
                        <span className="hidden shrink-0 text-muted-foreground sm:inline">
                          Auth {member.authorizationStart || '—'} → {member.authorizationEnd || '—'}
                        </span>
                        <span className="hidden shrink-0 text-muted-foreground md:inline">
                          {statusLine(member.calaimStatus, member.kaiserStatus)}
                        </span>
                        <span className="ml-auto shrink-0 text-muted-foreground">
                          Client_ID2 {member.clientId2 || 'none yet'} ·{' '}
                          {member.unsubmittedClaimCount
                            ? `${member.unsubmittedClaimCount} in Caspio, not sent to clearinghouse`
                            : 'No claims on file'}
                        </span>
                      </button>
                    ))
                  )}
                  {queueSummary.hiddenNoClaims.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5 border-t border-sky-200 px-1 pt-2 pb-1 text-muted-foreground">
                      <span>
                        Hidden by filters:{' '}
                        {queueSummary.hiddenNoClaims.map(([label, count]) => `${label} ${count}`).join(' · ')}
                      </span>
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-xs"
                        onClick={() => {
                          setStatusFilter('all');
                          setAuthFilter('all');
                          setCoverageFilter('no_claims_yet');
                        }}
                      >
                        Show all statuses
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="rounded border border-rose-200">
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-rose-50/70"
                onClick={() => setSummaryExAuthOpen((open) => !open)}
              >
                {summaryExAuthOpen ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="font-medium text-rose-950">No longer authorized — recent gaps</span>
                <Badge variant="outline" className="bg-rose-50 text-rose-950 border-rose-300">
                  {queueSummary.exAuthGapMembers.length}
                </Badge>
                <span className="truncate text-xs text-muted-foreground">
                  Billed before, CalAIM_Status not Authorized · {queueSummary.exAuthOpenGapMonths} gap month
                  {queueSummary.exAuthOpenGapMonths === 1 ? '' : 's'} (last 3 months, all filters ignored)
                </span>
              </button>
              {summaryExAuthOpen ? (
                <div className="max-h-72 space-y-0.5 overflow-y-auto border-t bg-rose-50/30 px-2 py-1.5 text-xs">
                  {queueSummary.exAuthGapMembers.length === 0 ? (
                    <p className="px-1 py-2 text-muted-foreground">
                      No non-Authorized members with recent gaps after their first claim.
                    </p>
                  ) : (
                    queueSummary.exAuthGapMembers.map((member) => (
                      <button
                        key={member.id}
                        type="button"
                        className="flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded px-1.5 py-1 text-left hover:bg-rose-100/70"
                        onClick={() =>
                          focusMemberInList({
                            id: member.id,
                            clientId2: member.clientId2,
                            name: member.name,
                            coverage: 'gaps_only',
                            status: 'all',
                            auth: 'all',
                          })
                        }
                      >
                        <span className="min-w-0 truncate font-medium">{member.name}</span>
                        <Badge variant="outline" className={`${STATUS_BLUE} font-normal`}>
                          {member.calaimStatus || 'No CalAIM_Status'}
                        </Badge>
                        <Badge variant="outline" className={`${STATUS_BLUE} font-normal`}>
                          Kaiser {member.kaiserStatus || '—'}
                        </Badge>
                        <span className="text-muted-foreground">
                          Auth {member.authorizationStart || '—'} → {member.authorizationEnd || '—'}
                        </span>
                        <span className="text-muted-foreground">
                          First {member.firstClaimDate || '—'} · Last {member.lastClaimDate || '—'}
                        </span>
                        <span className="ml-auto min-w-0 truncate text-rose-900">
                          Gaps: {member.months.map((month) => month.label).join(', ') || `${member.openGaps}`}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>
            Default shows open gaps after the first claim, plus new auths with no claims submitted yet.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-sm">
            <span className="text-xs text-muted-foreground">Last name</span>
            <Input
              value={lastNameFilter}
              onChange={(event) => setLastNameFilter(event.target.value)}
              placeholder="e.g. Davis"
              className="w-40"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs text-muted-foreground">MRN</span>
            <Input
              value={mrnFilter}
              onChange={(event) => setMrnFilter(event.target.value)}
              placeholder="Kaiser MRN"
              className="w-44"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs text-muted-foreground">Search</span>
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name, Client_ID2, auth #"
              className="w-56"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs text-muted-foreground">Claim coverage</span>
            <select
              className="block h-10 rounded-md border bg-white px-3 text-sm"
              value={coverageFilter}
              onChange={(event) => setCoverageFilter(event.target.value as CoverageFilter)}
            >
              <option value="incomplete">Gaps + claimable + no claims yet</option>
              <option value="gaps_only">Gaps only</option>
              <option value="claimable">Claimable (notes that month)</option>
              <option value="no_work">Not claimable (no notes / no work)</option>
              <option value="no_claims_yet">No claims only</option>
              <option value="next_claim_due">Next claim due (≥30d since last DOS)</option>
              <option value="complete">Complete / justified</option>
              <option value="all">All members</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs text-muted-foreground">Authorization</span>
            <select
              className="block h-10 rounded-md border bg-white px-3 text-sm"
              value={authFilter}
              onChange={(event) => setAuthFilter(event.target.value as AuthFilter)}
            >
              <option value="all">Open + ended</option>
              <option value="open">Open auth only</option>
              <option value="ended">Auth ended only</option>
              <option value="missing_dates">Missing auth dates</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs text-muted-foreground">CalAIM_Status</span>
            <select
              className="block h-10 min-w-[12rem] rounded-md border bg-white px-3 text-sm"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            >
              <option value="all">All statuses</option>
              <option value="Authorized">Authorized + H2022</option>
              {statusOptions
                .filter(([label]) => {
                  const n = normalizeStatus(label);
                  return n !== 'authorized' && n !== 'h2022';
                })
                .map(([label, count]) => (
                  <option key={label} value={label}>
                    {label}
                    {count ? ` (${count})` : ''}
                  </option>
                ))}
            </select>
          </label>
          <div className="text-sm text-muted-foreground pb-2">
            Showing {filteredRows.length} of {rows.length}
            {statusFilter !== 'all' ? ` · ${statusFilter}` : ''}
          </div>
        </CardContent>
      </Card>

      <Card id="kaiser-t2038-members">
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            Expand a row for the month grid (claimed / not claimed + DOS) and No claim / Claimable checkoffs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading && rows.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading Kaiser members and T2038 claims…
            </div>
          ) : null}
          {!isLoading && filteredRows.length === 0 ? (
            <div className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground">
              No members match these filters.
            </div>
          ) : null}
          {filteredRows.map((row) => {
            const badge = windowBadge(row);
            const calaimBadge = calaimStatusBadge(row.calaimStatus);
            const kaiserBadge = kaiserStatusBadge(row.kaiserStatus);
            const expanded = expandedId === row.id;
            const gapMonths = (row.months || []).filter((month) => month.status === 'missing');
            const gapMonthLabels = gapMonths.map((month) => month.label || month.monthKey);
            const claimableMonths = (row.months || []).filter((month) => isUnpushedClaimableMonth(month));
            const claimableMonthLabels = claimableMonths.map((month) => month.label || month.monthKey);
            const noWorkMonths = (row.months || []).filter(
              (month) => month.status === 'justified' && isNoWorkJustification(month.justificationReason)
            );
            const isCompactQueueRow =
              row.noClaimsYet || gapMonthLabels.length > 0 || claimableMonthLabels.length > 0;
            return (
              <div key={row.id} className="rounded border">
                <div
                  className={`flex w-full items-stretch gap-1 px-1 ${
                    isCompactQueueRow && !expanded ? 'py-1' : 'py-1.5'
                  }`}
                >
                  <button
                    type="button"
                    className={`flex min-w-0 flex-1 items-center gap-3 rounded px-2 text-left hover:bg-muted/40 ${
                      isCompactQueueRow && !expanded ? 'py-1.5' : 'items-start py-2'
                    }`}
                    onClick={() => setExpandedId(expanded ? '' : row.id)}
                  >
                    <span className="shrink-0 text-muted-foreground">
                      {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </span>
                    <div className={`min-w-0 flex-1 ${isCompactQueueRow && !expanded ? '' : 'space-y-1'}`}>
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="truncate font-medium">{row.memberName || row.clientId2}</span>
                        <Badge variant="outline" className={badge.className}>
                          {badge.label}
                        </Badge>
                        <Badge variant="outline" className={calaimBadge.className} title="CalAIM_Status">
                          {calaimBadge.label}
                        </Badge>
                        {row.kaiserStatus ? (
                          <Badge variant="outline" className={kaiserBadge.className} title="Kaiser_Status">
                            {kaiserBadge.label}
                          </Badge>
                        ) : null}
                        {row.noClaimsYet ? (
                          <Badge variant="outline" className="bg-sky-50 text-sky-950 border-sky-300">
                            No claims yet
                          </Badge>
                        ) : row.openMissingMonthCount > 0 ? (
                          <Badge variant="outline" className="bg-amber-50 text-amber-950 border-amber-300">
                            {row.openMissingMonthCount} gap month{row.openMissingMonthCount === 1 ? '' : 's'}
                          </Badge>
                        ) : null}
                        {claimableMonthLabels.length > 0 ? (
                          <Badge variant="outline" className="bg-violet-50 text-violet-950 border-violet-300">
                            {claimableMonthLabels.length} claimable
                          </Badge>
                        ) : null}
                        {row.futureClaimDue ? (
                          <Badge variant="outline" className="bg-sky-50 text-sky-950 border-sky-300">
                            Next claim due
                          </Badge>
                        ) : null}
                        {!row.noClaimsYet &&
                        row.openMissingMonthCount <= 0 &&
                        claimableMonthLabels.length === 0 &&
                        row.claimsComplete &&
                        !row.futureClaimDue ? (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-900 border-emerald-300">
                            Claims complete
                          </Badge>
                        ) : null}
                        {isCompactQueueRow && !expanded ? (
                          <>
                            <span className="hidden text-xs text-muted-foreground md:inline">
                              {row.clientId2 || '—'}
                            </span>
                            <span className="min-w-0 truncate text-xs text-muted-foreground">
                              Auth {row.authorizationStart || '—'} → {row.authorizationEnd || '—'}
                            </span>
                            <span className="min-w-0 truncate text-xs text-muted-foreground">
                              {row.noClaimsYet
                                ? 'First claim —'
                                : `First claim ${row.firstClaimDate || '—'}`}
                            </span>
                            {row.noClaimsYet ? (
                              <span className="truncate text-xs text-sky-900/80">
                                {row.unsubmittedClaimCount
                                  ? `No clearinghouse claims · ${row.unsubmittedClaimCount} Caspio-only (blank Claim_Status)`
                                  : 'No claims on file'}
                              </span>
                            ) : gapMonthLabels.length > 0 || claimableMonthLabels.length > 0 ? (
                              <span className="min-w-0 truncate text-xs">
                                {gapMonthLabels.length > 0 ? (
                                  <span className="text-amber-900">Gaps {gapMonthLabels.join(' · ')}</span>
                                ) : null}
                                {gapMonthLabels.length > 0 && claimableMonthLabels.length > 0 ? ' · ' : ''}
                                {claimableMonthLabels.length > 0 ? (
                                  <span className="text-violet-900">
                                    Claimable {claimableMonthLabels.join(' · ')}
                                  </span>
                                ) : null}
                              </span>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                      {(!isCompactQueueRow || expanded) && (
                        <>
                          <div className="text-xs text-muted-foreground">
                            Client_ID2 {row.clientId2 || '—'}
                            {row.mrn ? ` · MRN ${row.mrn}` : ''} · Auth {row.authorizationStart || '—'} →{' '}
                            {row.authorizationEnd || '—'}
                            {row.authorizationNumber ? ` · #${row.authorizationNumber}` : ''} · CalAIM_Status{' '}
                            <span className="font-medium text-blue-700">{row.calaimStatus || '—'}</span>
                            {row.kaiserStatus ? (
                              <>
                                {' · Kaiser_Status '}
                                <span className="font-medium text-blue-700">{row.kaiserStatus}</span>
                              </>
                            ) : null}
                          </div>
                        <div className="text-xs">
                          {row.noClaimsYet
                            ? row.unsubmittedClaimCount
                              ? `No clearinghouse claims on file — ${row.unsubmittedClaimCount} Caspio-only row(s) with blank Claim_Status (not sent to clearinghouse; DOS ${
                                  (row.unsubmittedClaimDates || []).join(', ') || '—'
                                })`
                              : 'No CalAIM_Claim_Submit_T2038 rows on file (Authorized / H2022)'
                            : `First ${row.firstClaimDate || '—'} · Last DOS ${
                                lastClaimDateFor(row) || '—'
                              }${
                                row.daysSinceLastClaim != null ? ` (${row.daysSinceLastClaim}d ago)` : ''
                              }${
                                row.nextClaimEligibleDate
                                  ? ` · Next eligible ${row.nextClaimEligibleDate}`
                                  : ''
                              } · Gap window ${row.gapStartMonthKey || '—'} → auth end/today · Claimed ${
                                row.claimedMonthCount
                              } · Justified ${row.justifiedMonthCount} · Open gaps ${row.openMissingMonthCount}`}
                        </div>
                        {row.futureClaimDue && row.nextClaimMonthKey ? (
                          <div className="flex flex-wrap items-center gap-2 pt-0.5">
                            <span className="text-[11px] font-medium text-sky-950">
                              Future claim ready · {row.nextClaimMonthKey} (last DOS{' '}
                              {lastClaimDateFor(row) || '—'}, ≥30 days)
                            </span>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-[11px]"
                              onClick={() =>
                                openClaimableSubmit(undefined, {
                                  single: {
                                    clientId2: row.clientId2,
                                    monthKey: row.nextClaimMonthKey!,
                                    memberName: row.memberName,
                                  },
                                })
                              }
                            >
                              Preview / Push
                            </Button>
                          </div>
                        ) : null}
                        {!row.noClaimsYet &&
                        (gapMonthLabels.length > 0 || claimableMonthLabels.length > 0) ? (
                          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                            {gapMonthLabels.length > 0 ? (
                              <>
                                <span className="text-[11px] font-medium text-amber-900">Gaps:</span>
                                {gapMonthLabels.map((label) => (
                                  <Badge
                                    key={`${row.id}-gap-${label}`}
                                    variant="outline"
                                    className="bg-amber-50 text-amber-950 border-amber-300 text-[11px] font-normal"
                                  >
                                    {label}
                                  </Badge>
                                ))}
                              </>
                            ) : null}
                            {claimableMonthLabels.length > 0 ? (
                              <>
                                <span className="text-[11px] font-medium text-violet-900">Claimable:</span>
                                {claimableMonthLabels.map((label) => (
                                  <Badge
                                    key={`${row.id}-claimable-${label}`}
                                    variant="outline"
                                    className="bg-violet-50 text-violet-950 border-violet-300 text-[11px] font-normal"
                                  >
                                    {label}
                                  </Badge>
                                ))}
                              </>
                            ) : null}
                          </div>
                        ) : null}
                        </>
                      )}
                    </div>
                  </button>
                  <div className="flex shrink-0 flex-col justify-center gap-1 py-1 pr-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8"
                      disabled={!String(row.clientId2 || '').trim()}
                      onClick={(e) => {
                        e.stopPropagation();
                        void openMemberNotes(row);
                      }}
                      title="View member notes (same as Kaiser Tracker)"
                    >
                      <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
                      Notes
                    </Button>
                  </div>
                </div>

                {expanded ? (
                  <div className="space-y-4 border-t bg-slate-50/60 px-3 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-medium">
                        {row.noClaimsYet
                          ? 'No claim months yet'
                          : 'Months — check No claim or Claimable'}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={!String(row.clientId2 || '').trim()}
                          onClick={() => void openMemberNotes(row)}
                          title="View member notes (same as Kaiser Tracker)"
                        >
                          <MessageSquare className="mr-2 h-3.5 w-3.5" />
                          Notes
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={isLoading || refreshingMemberId === row.id}
                          onClick={() => void refreshMemberClaims(row)}
                        >
                          {refreshingMemberId === row.id ? (
                            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="mr-2 h-3.5 w-3.5" />
                          )}
                          Refresh claims
                        </Button>
                        {(row.months || []).some((month) => month.caspioPushedAt) ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={isBuildingEdi}
                            onClick={() => void downloadPushedClaimsEdi()}
                            title="Download SDS EDI for all pushed claimable months"
                          >
                            <Download className="mr-2 h-3.5 w-3.5" />
                            SDS EDI
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <div>
                      {row.noClaimsYet ? (
                        <div className="rounded border border-sky-200 bg-sky-50/80 p-3 text-xs text-muted-foreground">
                          No clearinghouse-submitted claims on file for this Client_ID2 / MRN
                          {row.unsubmittedClaimCount
                            ? ` — ${row.unsubmittedClaimCount} row(s) exist in Caspio with blank Claim_Status (not sent to clearinghouse yet)`
                            : ''}
                          . Use <span className="font-medium">Refresh claims</span> to live-check Caspio (covers older
                          Payment Received rows below the incremental PK cursor).
                        </div>
                      ) : null}
                      {!row.noClaimsYet && row.months.length === 0 ? (
                        <div className="text-xs text-muted-foreground">
                          No gap months to show — add T2038 authorization dates or confirm claim DOS fields.
                        </div>
                      ) : null}
                      {!row.noClaimsYet && row.months.length > 0 ? (
                        <div className="overflow-x-auto rounded border bg-white">
                          <div className="min-w-[40rem]">
                            <div className="flex h-8 items-center gap-3 border-b bg-muted/40 px-3 text-[11px] font-medium text-muted-foreground">
                              <span className="w-24 shrink-0">Month</span>
                              <span className="w-20 shrink-0">Status</span>
                              <span className="ml-auto flex shrink-0 items-center gap-3">
                                <span className="w-[4.25rem] text-center">No claim</span>
                                <span className="w-[4.75rem] text-center">Claimable</span>
                                <span className="w-[7.25rem] text-right">Preview / Push</span>
                              </span>
                            </div>
                            {row.months.map((month) => {
                              const draftKey = `${row.clientId2}__${month.monthKey}`;
                              const isSaving = savingKey === draftKey;
                              const isClaimed = month.status === 'claimed';
                              const isNoWork =
                                month.status === 'justified' && isNoWorkJustification(month.justificationReason);
                              const isJustified = month.status === 'justified';
                              const isStaffNoClaim = isJustified && !isNoWork;
                              const isClaimable = month.status === 'claimable';
                              const isPushed = Boolean(month.caspioPushedAt);
                              const noNotes = month.noteEvidence === 'no_notes';
                              const canPush = isClaimable && !isPushed && !isClaimed && Boolean(row.clientId2);
                              const statusLabel = isClaimed
                                ? 'claimed'
                                : isPushed
                                  ? 'pushed'
                                  : isNoWork
                                    ? 'not claimable'
                                    : isJustified
                                      ? 'no claim'
                                      : isClaimable
                                        ? 'claimable'
                                        : 'not claimed';
                              return (
                                <div
                                  key={month.monthKey}
                                  className={`flex min-h-9 flex-col gap-0.5 border-t px-3 py-1.5 text-sm ${
                                    isPushed
                                      ? 'bg-emerald-50/50'
                                      : month.status === 'missing'
                                        ? 'bg-amber-50/40'
                                        : isClaimable
                                          ? 'bg-violet-50/50'
                                          : isNoWork
                                            ? 'bg-slate-50/70'
                                            : isJustified
                                              ? 'bg-sky-50/40'
                                              : ''
                                  }`}
                                >
                                  <div className="flex items-center gap-3">
                                  <span className="w-24 shrink-0 truncate font-medium">{month.label}</span>
                                  <Badge
                                    variant="outline"
                                    className={`w-20 shrink-0 justify-center text-[10px] ${
                                      isClaimed || isPushed
                                        ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                                        : isClaimable
                                          ? 'bg-violet-50 text-violet-900 border-violet-300'
                                          : isNoWork
                                            ? 'bg-slate-100 text-slate-800'
                                            : isJustified
                                              ? 'bg-sky-50 text-sky-900'
                                              : 'bg-amber-50 text-amber-950 border-amber-300'
                                    }`}
                                  >
                                    {statusLabel}
                                  </Badge>
                                  <span className="ml-auto flex shrink-0 items-center gap-3">
                                    <label
                                      className="flex w-[4.25rem] cursor-pointer items-center justify-center gap-1 text-[11px]"
                                      title="Staff: no claim this month"
                                    >
                                      <Checkbox
                                        checked={isStaffNoClaim && !isPushed}
                                        disabled={isSaving || isClaimed || isPushed}
                                        onCheckedChange={(checked) => {
                                          if (checked === true) {
                                            void saveMonthDisposition(row, month.monthKey, {
                                              disposition: 'justified',
                                            });
                                          } else if (isJustified) {
                                            void saveMonthDisposition(row, month.monthKey, { clear: true });
                                          }
                                        }}
                                      />
                                    </label>
                                    <label
                                      className="flex w-[4.75rem] cursor-pointer items-center justify-center gap-1 text-[11px]"
                                      title={
                                        noNotes && !isClaimable
                                          ? 'No member notes that month — check to mark claimable as staff override'
                                          : undefined
                                      }
                                    >
                                      <Checkbox
                                        checked={isClaimable}
                                        disabled={isSaving || isClaimed || isPushed}
                                        onCheckedChange={(checked) => {
                                          if (checked === true) {
                                            if (noNotes) {
                                              const ok = window.confirm(
                                                `${month.label || month.monthKey} has no member notes, so it is not claimable by default.\n\nOverride and mark claimable anyway?`
                                              );
                                              if (!ok) return;
                                            }
                                            void saveMonthDisposition(row, month.monthKey, {
                                              disposition: 'claimable',
                                            });
                                          } else if (isClaimable) {
                                            void saveMonthDisposition(row, month.monthKey, { clear: true });
                                          }
                                        }}
                                      />
                                    </label>
                                    <span className="flex w-[7.25rem] items-center justify-end gap-1">
                                      {isPushed ? (
                                        <span className="text-[11px] text-emerald-800">Pushed</span>
                                      ) : canPush ? (
                                        <>
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className="h-7 px-2 text-[11px]"
                                            title="Preview Caspio claim fields"
                                            onClick={() =>
                                              openClaimableSubmit(undefined, {
                                                single: {
                                                  clientId2: row.clientId2,
                                                  monthKey: month.monthKey,
                                                  memberName: row.memberName,
                                                },
                                              })
                                            }
                                          >
                                            Preview
                                          </Button>
                                          <Button
                                            type="button"
                                            size="sm"
                                            className="h-7 px-2 text-[11px]"
                                            title="Push this month to Caspio"
                                            onClick={() =>
                                              openClaimableSubmit(undefined, {
                                                single: {
                                                  clientId2: row.clientId2,
                                                  monthKey: month.monthKey,
                                                  memberName: row.memberName,
                                                },
                                              })
                                            }
                                          >
                                            Push
                                          </Button>
                                        </>
                                      ) : (
                                        <span className="text-[11px] text-muted-foreground">—</span>
                                      )}
                                    </span>
                                  </span>
                                  </div>
                                  {isNoWork || (noNotes && !isClaimed && !isPushed && !isClaimable) ? (
                                    <div className="pl-0 text-[10px] leading-snug text-slate-600 sm:pl-[7.5rem]">
                                      <span className="font-medium text-slate-800">Why not claimable:</span>{' '}
                                      no member notes were entered in {month.label || month.monthKey}, so
                                      there is no work evidence to bill that month. Stays not claimable
                                      unless staff confirms an override.
                                    </div>
                                  ) : null}
                                  {isClaimable &&
                                  noNotes &&
                                  !isPushed &&
                                  isClaimableStaffOverride(month.justificationReason) ? (
                                    <div className="pl-0 text-[10px] leading-snug text-amber-900 sm:pl-[7.5rem]">
                                      <span className="font-medium">Staff override:</span> claimable despite
                                      no member notes in {month.label || month.monthKey}.
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                      <div className="mt-2 border-t pt-2">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-[12px] font-medium text-sky-800 hover:underline"
                          onClick={() => toggleMemberActivity(row.clientId2)}
                        >
                          {activityOpenId === clean(row.clientId2) ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                          Activity log
                          {activityByClient[clean(row.clientId2)]
                            ? ` (${activityByClient[clean(row.clientId2)].length})`
                            : ''}
                        </button>
                        {activityOpenId === clean(row.clientId2) ? (
                          <div className="mt-1.5 max-h-48 overflow-auto rounded border bg-white px-2 py-1.5 text-[11px]">
                            {activityLoadingId === clean(row.clientId2) ? (
                              <div className="flex items-center gap-1.5 text-muted-foreground py-1">
                                <Loader2 className="h-3 w-3 animate-spin" /> Loading activity…
                              </div>
                            ) : (activityByClient[clean(row.clientId2)] || []).length === 0 ? (
                              <div className="py-1 text-muted-foreground">
                                No logged activity yet for this member (pushes and disposition changes appear here).
                              </div>
                            ) : (
                              <ul className="divide-y">
                                {(activityByClient[clean(row.clientId2)] || []).map((entry) => (
                                  <li key={entry.id} className="py-1.5">
                                    <div className="font-medium text-slate-900">{entry.summary || entry.action}</div>
                                    <div className="text-muted-foreground">
                                      {[
                                        entry.createdAt
                                          ? new Date(entry.createdAt).toLocaleString()
                                          : '',
                                        entry.actorName || entry.actorEmail || '',
                                        entry.monthKey || '',
                                      ]
                                        .filter(Boolean)
                                        .join(' · ')}
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        ) : null}
                      </div>
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        Claimable months: Preview / Push next to the checkbox opens the Caspio field list, then submit.
                        After push the month shows <span className="font-medium">pushed</span> and cannot be pushed
                        again. Use <span className="font-medium">SDS EDI for pushed</span> for Smart Data Solutions
                        upload. Rate ${T2038_CLAIM_AUDIT_RATE_USD}/claim.
                        {noWorkMonths.length > 0
                          ? ` · ${noWorkMonths.length} month${
                              noWorkMonths.length === 1 ? '' : 's'
                            } not claimable because no member notes that month.`
                          : ''}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <MemberNotesModal
        isOpen={memberNotesModal.isOpen}
        onClose={() => setMemberNotesModal(EMPTY_NOTES_MODAL)}
        member={memberNotesModal.member}
        notes={memberNotesModal.notes}
        isLoadingNotes={memberNotesModal.isLoadingNotes}
        lastSyncAt={memberNotesModal.lastSyncAt}
        existingNotesCount={memberNotesModal.existingNotesCount}
        newNotesCount={memberNotesModal.newNotesCount}
        didSync={memberNotesModal.didSync}
        onSyncNotes={() => void syncMemberNotes()}
      />

      <ClaimableClaimSubmitModal
        open={claimSubmitOpen}
        onOpenChange={setClaimSubmitOpen}
        targets={claimSubmitTargets}
        onPushed={markMonthsPushed}
        getIdToken={async () => {
          const user = auth.currentUser;
          if (!user) throw new Error('Not signed in');
          return user.getIdToken();
        }}
      />
    </div>
  );
}
