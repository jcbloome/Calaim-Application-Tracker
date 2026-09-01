'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth, useFirestore } from '@/firebase';
import { useSocialWorker } from '@/hooks/use-social-worker';
import { useToast } from '@/hooks/use-toast';
import { computeSwVisitStatusFlags } from '@/lib/sw-visit-status';
import { SW_HN_MONTHLY_QUESTIONNAIRES_ENABLED } from '@/lib/sw-portal-flags';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  FileSignature,
  Loader2,
  MapPin,
  RefreshCw,
  User,
  Circle,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

type RosterMember = {
  id: string;
  name: string;
  isNewAssignment?: boolean;
};

type RosterFacility = {
  id: string;
  name: string;
  address: string;
  city?: string;
  members: RosterMember[];
};

type MonthVisitStatus = {
  visitId: string;
  signedOff: boolean;
  claimStatus: string;
  claimSubmitted: boolean;
  claimPaid: boolean;
  claimId?: string;
};

type MonthExportRow = {
  date: string;
  memberId: string;
  memberName: string;
  rcfeId?: string;
  rcfeName?: string;
  visitId: string;
  signedOff: boolean;
  claimStatus: string;
  claimSubmitted: boolean;
  claimPaid: boolean;
  claimId: string;
};

type DraftVisit = {
  visitId: string;
  memberId: string;
  memberName: string;
  rcfeId: string;
  rcfeName: string;
  updatedAt?: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const todayLocalKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const currentMonthKey = () => new Date().toISOString().slice(0, 7);

const greetingWord = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

const formatDate = (iso: string) =>
  new Date(iso + 'T12:00:00').toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

const parseAssignmentTimestamp = (raw: unknown): string | null => {
  if (!raw) return null;
  try {
    if (typeof (raw as { toDate?: () => Date }).toDate === 'function') {
      return (raw as { toDate: () => Date }).toDate().toISOString();
    }
    const text = String(raw).trim();
    if (!text) return null;
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  } catch {
    return null;
  }
};

const formatShortDate = (iso: string | null | undefined) => {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

type AlftAssignmentRow = {
  id: string;
  memberName: string;
  memberMrn?: string;
  location?: string;
  status: string;
  submittedAtIso?: string | null;
};

const isSubmittedAssignment = (status: string) => {
  const normalized = String(status || '').trim().toLowerCase();
  return normalized === 'submitted' || normalized.includes('awaiting_manager') || normalized.includes('manager_review');
};

// ── Main page ──────────────────────────────────────────────────────────────────

export default function SWHomePage() {
  const auth = useAuth();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const { user, socialWorkerData, isSocialWorker, isLoading: swLoading } = useSocialWorker();

  const swEmail = useMemo(
    () => String((user as any)?.email || auth?.currentUser?.email || '').trim().toLowerCase(),
    [auth?.currentUser?.email, user]
  );
  const swName = useMemo(
    () => String((user as any)?.displayName || (user as any)?.email || 'Social Worker').split('@')[0].trim(),
    [user]
  );

  const today = useMemo(() => todayLocalKey(), []);
  const month = useMemo(() => currentMonthKey(), []);

  // ── State ────────────────────────────────────────────────────────────────────

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facilities, setFacilities] = useState<RosterFacility[]>([]);
  const [monthStatuses, setMonthStatuses] = useState<Record<string, MonthVisitStatus>>({});
  const [drafts, setDrafts] = useState<DraftVisit[]>([]);
  const [expandedRcfes, setExpandedRcfes] = useState<Set<string>>(new Set());
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [alftAssignments, setAlftAssignments] = useState<AlftAssignmentRow[]>([]);
  const [alftLoading, setAlftLoading] = useState(false);

  // ── Data loading ─────────────────────────────────────────────────────────────

  const loadAll = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!swEmail || !auth?.currentUser) return;
      if (!SW_HN_MONTHLY_QUESTIONNAIRES_ENABLED) {
        setHasLoadedOnce(true);
        setLoading(false);
        return;
      }
      if (!opts?.silent) setLoading(true);
      setError(null);

      try {
        const idToken = await auth.currentUser.getIdToken();

        // Parallel fetch: roster, monthly statuses, drafts
        const [rosterRes, statusRes, draftsRes] = await Promise.all([
          fetch(`/api/sw-visits?socialWorkerId=${encodeURIComponent(swEmail)}&month=${month}&_ts=${Date.now()}`, {
            cache: 'no-store',
          }),
          fetch('/api/sw-visits/monthly-export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
            body: JSON.stringify({ month, dedupeByMemberMonth: true }),
          }),
          fetch(`/api/sw-visits/drafts?month=${month}`, {
            headers: { Authorization: `Bearer ${idToken}` },
            cache: 'no-store',
          }),
        ]);

        // Roster
        const rosterData = await rosterRes.json().catch(() => ({} as any));
        const nextFacilities: RosterFacility[] = Array.isArray(rosterData?.rcfeList) ? rosterData.rcfeList : [];
        setFacilities(nextFacilities);

        // Default all RCFEs to expanded on first load
        if (!hasLoadedOnce) {
          setExpandedRcfes(new Set(nextFacilities.map((f) => f.id)));
        }

        // Monthly statuses
        if (statusRes.ok) {
          const statusData = await statusRes.json().catch(() => ({} as any));
          const rows: MonthExportRow[] = Array.isArray(statusData?.rows) ? statusData.rows : [];
          const map: Record<string, MonthVisitStatus> = {};
          rows.forEach((r) => {
            const memberId = String(r?.memberId || '').trim();
            const nameKey = `name:${String(r?.memberName || '').trim().toLowerCase().replace(/\s+/g, ' ')}`;
            const status: MonthVisitStatus = {
              visitId: String(r?.visitId || '').trim(),
              signedOff: Boolean(r?.signedOff),
              claimStatus: String(r?.claimStatus || 'draft'),
              claimSubmitted: Boolean(r?.claimSubmitted),
              claimPaid: Boolean(r?.claimPaid),
              claimId: String(r?.claimId || '').trim() || undefined,
            };
            if (memberId) map[memberId] = status;
            if (r?.memberName) map[nameKey] = status;
          });
          setMonthStatuses(map);
        }

        // Drafts
        if (draftsRes.ok) {
          const draftsData = await draftsRes.json().catch(() => ({} as any));
          setDrafts(Array.isArray(draftsData?.drafts) ? draftsData.drafts : []);
        }

        setHasLoadedOnce(true);
      } catch (e: any) {
        const msg = e?.message || 'Failed to load your roster. Please try again.';
        setError(msg);
        if (!opts?.silent) toast({ title: 'Load failed', description: msg, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    },
    [auth, hasLoadedOnce, month, swEmail, toast]
  );

  useEffect(() => {
    if (swLoading || !isSocialWorker || hasLoadedOnce) return;
    void loadAll({ silent: true });
  }, [hasLoadedOnce, isSocialWorker, loadAll, swLoading]);

  const loadAlftAssignments = useCallback(async () => {
    if (!firestore || !isSocialWorker || !swEmail) return;
    setAlftLoading(true);
    try {
      const swId = String((socialWorkerData as any)?.sw_id || (socialWorkerData as any)?.SW_ID || '')
        .trim()
        .toLowerCase();
      const snaps = await Promise.all([
        getDocs(query(collection(firestore, 'alft_assignments'), where('assignedSwEmail', '==', swEmail))),
        swId
          ? getDocs(query(collection(firestore, 'alft_assignments'), where('assignedSwId', '==', swId)))
          : Promise.resolve(null as any),
      ]);
      const docs = [...(snaps[0]?.docs || []), ...(snaps[1]?.docs || [])];
      const byId = new Map<string, AlftAssignmentRow>();
      docs.forEach((d: any) => {
        const row = d.data() as any;
        const status = String(row?.status || 'assigned').trim().toLowerCase();
        if (status === 'completed') return;
        const id = String(row?.memberId || d.id || '').trim();
        if (!id) return;
        byId.set(id, {
          id,
          memberName: String(row?.memberName || 'Member').trim(),
          memberMrn: String(row?.memberMrn || '').trim() || undefined,
          location:
            String(row?.ispCurrentLocation || row?.ispFacilityName || row?.prefillVerification?.resolvedFields?.p2_facility_name || '').trim() ||
            undefined,
          status,
          submittedAtIso:
            parseAssignmentTimestamp(row?.submittedAt) ||
            parseAssignmentTimestamp(row?.workflowStepsAt?.swSubmittedAt) ||
            parseAssignmentTimestamp(row?.workflowStepsAt?.swSubmittedSignedAt),
        });
      });
      const rows = Array.from(byId.values()).sort((a, b) => {
        const aSubmitted = isSubmittedAssignment(a.status) ? 1 : 0;
        const bSubmitted = isSubmittedAssignment(b.status) ? 1 : 0;
        if (aSubmitted !== bSubmitted) return aSubmitted - bSubmitted;
        return a.memberName.localeCompare(b.memberName);
      });
      setAlftAssignments(rows);
    } catch {
      setAlftAssignments([]);
    } finally {
      setAlftLoading(false);
    }
  }, [firestore, isSocialWorker, socialWorkerData, swEmail]);

  useEffect(() => {
    if (swLoading || !isSocialWorker) return;
    void loadAlftAssignments();
  }, [isSocialWorker, loadAlftAssignments, swLoading]);

  // ── Derived state ─────────────────────────────────────────────────────────────

  const draftsByMemberId = useMemo(() => {
    const map: Record<string, DraftVisit> = {};
    drafts.forEach((d) => {
      if (d.memberId) map[d.memberId] = d;
    });
    return map;
  }, [drafts]);

  const memberStatusMap = useMemo(() => {
    // Returns the best status for a given member (by id or name key)
    return (memberId: string, memberName: string): MonthVisitStatus | undefined =>
      monthStatuses[memberId] ||
      monthStatuses[`name:${memberName.trim().toLowerCase().replace(/\s+/g, ' ')}`];
  }, [monthStatuses]);

  const totalMembers = useMemo(() => facilities.reduce((sum, f) => sum + f.members.length, 0), [facilities]);

  const completedMembers = useMemo(
    () =>
      facilities.reduce((sum, f) => {
        return (
          sum +
          f.members.filter((m) => {
            const s = memberStatusMap(m.id, m.name);
            return computeSwVisitStatusFlags(s).nextAction === 'none';
          }).length
        );
      }, 0),
    [facilities, memberStatusMap]
  );

  const allDone = completedMembers === totalMembers && totalMembers > 0;

  const alftPending = useMemo(
    () => alftAssignments.filter((row) => !isSubmittedAssignment(row.status)),
    [alftAssignments]
  );
  const alftSubmitted = useMemo(
    () => alftAssignments.filter((row) => isSubmittedAssignment(row.status)),
    [alftAssignments]
  );

  // ── Interactions ──────────────────────────────────────────────────────────────

  const toggleRcfe = (rcfeId: string) => {
    setExpandedRcfes((prev) => {
      const next = new Set(prev);
      if (next.has(rcfeId)) next.delete(rcfeId);
      else next.add(rcfeId);
      return next;
    });
  };

  // ── Auth guard ────────────────────────────────────────────────────────────────

  if (swLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isSocialWorker) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertDescription>You must be logged in as a Social Worker to view this page.</AlertDescription>
        </Alert>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-3xl px-4 pb-32 pt-6">
      {/* ── Header ── */}
      <div className="mb-6 overflow-hidden rounded-2xl border bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 p-5 text-white shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-blue-200/90">Social Worker Portal</p>
            <h1 className="mt-1 text-2xl font-bold leading-tight">
              {greetingWord()}, {swName}
            </h1>
            <p className="mt-1 text-sm text-slate-200">{formatDate(today)}</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void loadAll();
              void loadAlftAssignments();
            }}
            disabled={loading || alftLoading}
            className="mt-0.5 shrink-0 bg-white/10 text-white hover:bg-white/20"
          >
            {loading || alftLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-1.5 hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pending assessments</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{alftLoading ? '…' : alftPending.length}</div>
        </div>
        <div className="rounded-xl border bg-emerald-50 p-4 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-emerald-700">Submitted</div>
          <div className="mt-1 text-2xl font-bold text-emerald-900">{alftLoading ? '…' : alftSubmitted.length}</div>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total active</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{alftLoading ? '…' : alftAssignments.length}</div>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-base font-semibold">
              <ClipboardCheck className="h-5 w-5 text-blue-600" />
              ISP / ALFT assessments
            </div>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              {SW_HN_MONTHLY_QUESTIONNAIRES_ENABLED
                ? 'Access ALFT assessments for your specifically assigned members.'
                : 'Complete Kaiser ISP / ALFT assessments for assigned members. Submitted forms move to staff review automatically.'}
            </p>
          </div>
          <Button asChild size="sm" className="h-9 shrink-0">
            <Link href="/sw-portal/alft-upload">Open ALFT queue</Link>
          </Button>
        </div>

        {alftLoading ? (
          <div className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading your assignments…
          </div>
        ) : alftAssignments.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed bg-slate-50 px-4 py-6 text-sm text-muted-foreground">
            No ALFT assessments are assigned to you right now. Check back after your ALFT manager assigns members.
          </div>
        ) : (
          <div className="mt-5 space-y-2">
            {alftAssignments.map((row) => {
              const submitted = isSubmittedAssignment(row.status);
              const submittedLabel = formatShortDate(row.submittedAtIso);
              return (
                <div
                  key={row.id}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
                    submitted ? 'border-emerald-200 bg-emerald-50/70' : 'bg-white'
                  }`}
                >
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                      submitted ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {row.memberName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm">{row.memberName}</span>
                      {submitted ? (
                        <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                          Submitted{submittedLabel ? ` · ${submittedLabel}` : ''}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-amber-300 text-amber-800">
                          Ready to complete
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {[row.memberMrn ? `MRN ${row.memberMrn}` : null, row.location].filter(Boolean).join(' · ') ||
                        (submitted ? 'Sent to staff for review' : 'Assessment not yet submitted')}
                    </p>
                  </div>
                  {!submitted ? (
                    <Button asChild size="sm" variant="outline" className="shrink-0">
                      <Link href="/sw-portal/alft-upload">Start</Link>
                    </Button>
                  ) : (
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" />
                      Done
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {!SW_HN_MONTHLY_QUESTIONNAIRES_ENABLED ? (
        <div className="mb-6 rounded-xl border bg-gradient-to-r from-slate-50 to-blue-50 p-5 text-sm text-slate-700">
          <p className="font-medium text-slate-900">ISP Tools &amp; guides</p>
          <p className="mt-1 text-muted-foreground">
            Use the <span className="font-medium">ISP Tools</span> menu in the header for assessments and uploaded guides.
          </p>
        </div>
      ) : null}

      {/* ── Progress bar ── */}
      {SW_HN_MONTHLY_QUESTIONNAIRES_ENABLED && hasLoadedOnce && totalMembers > 0 && (
        <div className="mb-6 rounded-xl border bg-card p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between text-sm font-medium">
            <span>Today's progress</span>
            <span className="text-muted-foreground">
              {completedMembers} of {totalMembers} members complete
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-green-500 transition-all duration-500"
              style={{ width: `${totalMembers > 0 ? (completedMembers / totalMembers) * 100 : 0}%` }}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
            {allDone && (
              <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                All done — ready to wrap up!
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <Alert variant="destructive" className="mb-5">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* ── Loading skeleton ── */}
      {SW_HN_MONTHLY_QUESTIONNAIRES_ENABLED && loading && !hasLoadedOnce && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      )}

      {/* ── Empty state ── */}
      {SW_HN_MONTHLY_QUESTIONNAIRES_ENABLED && hasLoadedOnce && !loading && facilities.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
          <User className="h-10 w-10" />
          <p className="font-medium">No members assigned</p>
          <p className="max-w-xs text-sm">
            You have no assigned members for {month}. Contact your administrator if this seems incorrect.
          </p>
        </div>
      )}

      {/* ── RCFE facility cards ── */}
      {SW_HN_MONTHLY_QUESTIONNAIRES_ENABLED ? (
      <div className="space-y-4">
        {facilities.map((facility) => {
          const isExpanded = expandedRcfes.has(facility.id);

          const facilityMemberCount = facility.members.length;
          const facilityDoneCount = facility.members.filter((m) => {
            const s = memberStatusMap(m.id, m.name);
            return computeSwVisitStatusFlags(s).nextAction === 'none';
          }).length;
          const facilityAllDone = facilityDoneCount === facilityMemberCount;

          return (
            <div
              key={facility.id}
              className="overflow-hidden rounded-xl border bg-card shadow-sm"
            >
              {/* Facility header — tap to expand/collapse */}
              <button
                type="button"
                onClick={() => toggleRcfe(facility.id)}
                className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-muted/40 active:bg-muted/60"
              >
                <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold leading-snug">{facility.name}</span>
                    {facilityAllDone ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                    ) : (
                      <Circle className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                    )}
                  </div>
                  {facility.address && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{facility.address}</span>
                    </p>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-muted-foreground">
                      {facilityDoneCount}/{facilityMemberCount} members
                    </span>
                  </div>
                </div>
                {isExpanded ? (
                  <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                )}
              </button>

              {/* Member rows */}
              {isExpanded && (
                <div className="divide-y border-t">
                  {facility.members.map((member) => {
                    const status = memberStatusMap(member.id, member.name);
                    const flags = computeSwVisitStatusFlags(status);
                    const draft = draftsByMemberId[member.id];

                    return (
                      <MemberRow
                        key={member.id}
                        member={member}
                        facility={facility}
                        flags={flags}
                        hasDraft={Boolean(draft)}
                        isNewAssignment={member.isNewAssignment}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      ) : null}

      {/* ── Sticky wrap-up CTA ── */}
      {SW_HN_MONTHLY_QUESTIONNAIRES_ENABLED && hasLoadedOnce && totalMembers > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-20 border-t bg-background/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {allDone ? 'All tasks complete.' : `${totalMembers - completedMembers} member(s) remaining.`}
            </p>
            <Button asChild size="sm" className={allDone ? 'bg-green-600 hover:bg-green-700' : ''}>
              <Link href="/sw-portal/wrap-up">
                {allDone ? 'Wrap Up Day' : 'Wrap Up'}
              </Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── MemberRow ─────────────────────────────────────────────────────────────────

type MemberRowProps = {
  member: RosterMember;
  facility: RosterFacility;
  flags: ReturnType<typeof computeSwVisitStatusFlags>;
  hasDraft: boolean;
  isNewAssignment?: boolean;
};

function MemberRow({ member, facility, flags, hasDraft, isNewAssignment }: MemberRowProps) {
  const questUrl = `/sw-visit-verification?memberId=${encodeURIComponent(member.id)}&memberName=${encodeURIComponent(member.name)}&rcfeId=${encodeURIComponent(facility.id)}&rcfeName=${encodeURIComponent(facility.name)}&rcfeAddress=${encodeURIComponent(facility.address || '')}`;
  const signOffUrl = `/sw-portal/sign-off?memberId=${encodeURIComponent(member.id)}&rcfeId=${encodeURIComponent(facility.id)}`;

  const { nextAction, completed, signedOff, claimSubmitted } = flags;

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {/* Status dot */}
      <div className="mt-0.5 shrink-0">
        {nextAction === 'none' ? (
          <CheckCircle2 className="h-5 w-5 text-green-500" />
        ) : (
          <Circle className="h-5 w-5 text-muted-foreground/30" />
        )}
      </div>

      {/* Name + labels */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate font-medium text-sm">{member.name}</span>
          {isNewAssignment && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              New
            </Badge>
          )}
          {hasDraft && nextAction === 'questionnaire' && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              Draft saved
            </Badge>
          )}
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {nextAction === 'none'
            ? claimSubmitted
              ? 'Claim submitted'
              : signedOff
                ? 'Signed off'
                : 'Visit complete'
            : nextAction === 'questionnaire'
              ? hasDraft
                ? 'Questionnaire in progress'
                : 'Questionnaire not started'
              : nextAction === 'signoff'
                ? 'Needs sign-off'
                : 'Claim not yet submitted'}
        </p>
      </div>

      {/* Action button */}
      <div className="shrink-0">
        {nextAction === 'questionnaire' && (
          <Button asChild size="sm" className="h-9 gap-1.5 text-xs">
            <Link href={questUrl}>
              <ClipboardCheck className="h-3.5 w-3.5" />
              {hasDraft ? 'Resume' : 'Start'}
            </Link>
          </Button>
        )}
        {nextAction === 'signoff' && (
          <Button asChild size="sm" variant="outline" className="h-9 gap-1.5 text-xs">
            <Link href={signOffUrl}>
              <FileSignature className="h-3.5 w-3.5" />
              Sign Off
            </Link>
          </Button>
        )}
        {nextAction === 'submit-claim' && (
          <Button asChild size="sm" variant="outline" className="h-9 gap-1.5 text-xs">
            <Link href="/sw-portal/wrap-up">
              Submit
            </Link>
          </Button>
        )}
        {nextAction === 'none' && (
          <span className="inline-flex h-9 items-center rounded-md px-2 text-xs text-muted-foreground">
            Done
          </span>
        )}
      </div>
    </div>
  );
}
