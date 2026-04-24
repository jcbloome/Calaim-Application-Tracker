'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/firebase';
import { useSocialWorker } from '@/hooks/use-social-worker';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ExternalLink, RefreshCw } from 'lucide-react';
import { computeSwVisitStatusFlags } from '@/lib/sw-visit-status';

type RosterMember = {
  id: string;
  name: string;
  isNewAssignment?: boolean;
  isHoldRemoved?: boolean;
};

type RosterFacility = {
  id: string;
  name: string;
  address: string;
  city?: string;
  zip?: string;
  county?: string;
  administrator?: string | null;
  administratorPhone?: string | null;
  members: RosterMember[];
};

type MonthVisitStatus = {
  visitId: string;
  visitDay?: string;
  signedOff: boolean;
  claimStatus: string;
  claimSubmitted: boolean;
  claimPaid: boolean;
  claimId?: string;
  claimNumber?: string;
};

type MonthExportRow = {
  date: string;
  memberId: string;
  memberName: string;
  rcfeName: string;
  rcfeAddress: string;
  visitId: string;
  signedOff: boolean;
  claimId: string;
  claimNumber: string;
  claimStatus: string;
  claimSubmitted: boolean;
  claimPaid: boolean;
};

type DraftVisit = {
  visitId: string;
  memberId: string;
  memberName: string;
  memberRoomNumber?: string;
  rcfeId: string;
  rcfeName: string;
  rcfeAddress?: string;
  flagged?: boolean;
  updatedAt?: string;
};

type ClaimRow = {
  claimId: string;
  claimNumber?: string;
  status: string;
  reviewStatus?: string;
  paymentStatus?: string;
  claimDay?: string;
  claimMonth?: string;
  rcfeName?: string;
  totalAmount?: number;
  visitCount?: number;
  memberName?: string;
  submittedAtMs?: number;
  updatedAtMs?: number;
};

const todayLocalKey = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const normalize = (v: unknown) =>
  String(v ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

export default function SWQueuePage() {
  const { user, isSocialWorker, isLoading } = useSocialWorker();
  const auth = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Redirect to the new Home dashboard; queue is kept for backward compatibility.
  useEffect(() => {
    const q = searchParams?.get('q');
    router.replace(q ? `/sw-portal/home?q=${encodeURIComponent(q)}` : '/sw-portal/home');
  }, [router, searchParams]);

  const swEmail = String((user as any)?.email || '').trim();

  const [loadingRoster, setLoadingRoster] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [facilities, setFacilities] = useState<RosterFacility[]>([]);

  const [statusMonth, setStatusMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [loadingMonthStatuses, setLoadingMonthStatuses] = useState(false);
  const [monthStatuses, setMonthStatuses] = useState<Record<string, MonthVisitStatus>>({});
  const [monthRows, setMonthRows] = useState<MonthExportRow[]>([]);

  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [draftsToday, setDraftsToday] = useState<DraftVisit[]>([]);

  const [loadingClaims, setLoadingClaims] = useState(false);
  const [claims, setClaims] = useState<ClaimRow[]>([]);

  const [query, setQuery] = useState('');

  // Hydrate query from URL (header global search).
  useEffect(() => {
    const q = String(searchParams?.get('q') || '').trim();
    if (!q) return;
    setQuery(q);
  }, [searchParams]);

  const monthOptions = useMemo(() => {
    const start = new Date(2026, 1, 1); // Feb 2026 (local)
    const now = new Date();
    const opts: Array<{ value: string; label: string }> = [];
    const cursor = new Date(now.getFullYear(), now.getMonth(), 1);
    while (cursor >= start) {
      const value = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
      const label = cursor.toLocaleString(undefined, { month: 'long', year: 'numeric' });
      opts.push({ value, label });
      cursor.setMonth(cursor.getMonth() - 1);
    }
    return opts;
  }, []);

  const refreshRoster = useCallback(async () => {
    if (!swEmail) return;
    setLoadingRoster(true);
    setRosterError(null);
    try {
      const res = await fetch(`/api/sw-visits?socialWorkerId=${encodeURIComponent(swEmail)}`);
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) throw new Error(data?.error || `Failed to load roster (HTTP ${res.status})`);
      const list = Array.isArray(data?.rcfeList) ? (data.rcfeList as RosterFacility[]) : [];
      setFacilities(list);
    } catch (e: any) {
      setRosterError(e?.message || 'Failed to load roster.');
      setFacilities([]);
    } finally {
      setLoadingRoster(false);
    }
  }, [swEmail]);

  const refreshMonthStatuses = useCallback(async () => {
    if (!auth?.currentUser) return;
    setLoadingMonthStatuses(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/sw-visits/monthly-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ month: statusMonth, dedupeByMemberMonth: true }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) throw new Error(data?.error || `Failed to load month (HTTP ${res.status})`);
      const rows: MonthExportRow[] = Array.isArray(data?.rows) ? (data.rows as MonthExportRow[]) : [];
      setMonthRows(rows);
      const map: Record<string, MonthVisitStatus> = {};
      rows.forEach((r) => {
        const memberId = String(r?.memberId || '').trim();
        const memberNameKey = normalize(r?.memberName);
        const statusRow: MonthVisitStatus = {
          visitId: String(r?.visitId || '').trim(),
          visitDay: String(r?.date || '').trim() || undefined,
          signedOff: Boolean(r?.signedOff),
          claimStatus: String(r?.claimStatus || 'draft').trim(),
          claimSubmitted: Boolean(r?.claimSubmitted),
          claimPaid: Boolean(r?.claimPaid),
          claimId: String(r?.claimId || '').trim() || undefined,
          claimNumber: String(r?.claimNumber || '').trim() || undefined,
        };
        if (memberId) map[memberId] = statusRow;
        if (memberNameKey) map[`name:${memberNameKey}`] = statusRow;
      });
      setMonthStatuses(map);
    } catch (e: any) {
      setMonthStatuses({});
      setMonthRows([]);
      toast({
        title: 'Couldn’t load month statuses',
        description: e?.message || 'Status icons failed to load.',
        variant: 'destructive',
      });
    } finally {
      setLoadingMonthStatuses(false);
    }
  }, [auth, statusMonth, toast]);

  const refreshDraftsToday = useCallback(async () => {
    if (!auth?.currentUser) return;
    setLoadingDrafts(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const month = String(statusMonth || '').trim();
      const res = await fetch(`/api/sw-visits/drafts?month=${encodeURIComponent(month)}`, {
        headers: { authorization: `Bearer ${idToken}` },
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) throw new Error(data?.error || `Failed to load drafts (HTTP ${res.status})`);
      setDraftsToday(Array.isArray(data?.visits) ? (data.visits as DraftVisit[]) : []);
    } catch (e: any) {
      setDraftsToday([]);
    } finally {
      setLoadingDrafts(false);
    }
  }, [auth, statusMonth]);

  const refreshClaims = useCallback(async () => {
    if (!auth?.currentUser) return;
    setLoadingClaims(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const qs = new URLSearchParams();
      qs.set('month', statusMonth);
      qs.set('includeDrafts', '1');
      qs.set('limit', '1000');
      const res = await fetch(`/api/sw-claims/list?${qs.toString()}`, {
        headers: { authorization: `Bearer ${idToken}` },
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) throw new Error(data?.error || `Failed to load claims (HTTP ${res.status})`);
      setClaims(Array.isArray(data?.claims) ? (data.claims as ClaimRow[]) : []);
    } catch {
      setClaims([]);
    } finally {
      setLoadingClaims(false);
    }
  }, [auth, statusMonth]);

  useEffect(() => {
    if (isLoading) return;
    if (!isSocialWorker) return;
    void refreshRoster();
  }, [isLoading, isSocialWorker, refreshRoster]);

  useEffect(() => {
    if (isLoading) return;
    if (!isSocialWorker) return;
    void refreshMonthStatuses();
    void refreshClaims();
  }, [isLoading, isSocialWorker, refreshClaims, refreshMonthStatuses]);

  useEffect(() => {
    if (isLoading) return;
    if (!isSocialWorker) return;
    void refreshDraftsToday();
  }, [isLoading, isSocialWorker, refreshDraftsToday]);

  const filteredFacilities = useMemo(() => {
    const q = normalize(query);
    if (!q) return facilities;
    return facilities
      .map((f) => {
        const members = (f.members || []).filter((m) => normalize([m.name].join(' ')).includes(q));
        const facilityMatch = normalize([f.name, f.address, f.city, f.county].filter(Boolean).join(' ')).includes(q);
        if (facilityMatch) return f;
        return { ...f, members };
      })
      .filter((f) => (f.members || []).length > 0 || normalize([f.name, f.address].join(' ')).includes(q));
  }, [facilities, query]);

  const needsLists = useMemo(() => {
    const needsQuestionnaire: Array<{ memberId: string; memberName: string; rcfeId: string; rcfeName: string; rcfeAddress: string }> = [];
    const needsSignoff: Array<{ memberId: string; memberName: string; rcfeId: string; rcfeName: string; rcfeAddress: string; visitDay?: string }> = [];
    const needsClaim: Array<{ memberId: string; memberName: string; rcfeId: string; rcfeName: string; rcfeAddress: string; claimId?: string; claimNumber?: string }> = [];

    filteredFacilities.forEach((f) => {
      (f.members || []).forEach((m) => {
        const memberId = String(m.id || '').trim();
        const memberNameKey = normalize(m.name);
        const s = (memberId ? monthStatuses[memberId] : null) || (memberNameKey ? monthStatuses[`name:${memberNameKey}`] : null);
        const flags = computeSwVisitStatusFlags(s);
        const base = {
          memberId,
          memberName: String(m.name || '').trim() || 'Member',
          rcfeId: String(f.id || '').trim(),
          rcfeName: String(f.name || '').trim() || 'RCFE',
          rcfeAddress: String(f.address || '').trim() || '',
        };

        if (flags.nextAction === 'questionnaire') needsQuestionnaire.push(base);
        if (flags.nextAction === 'signoff') needsSignoff.push({ ...base, visitDay: s?.visitDay });
        if (flags.nextAction === 'submit-claim')
          needsClaim.push({ ...base, claimId: flags.claimId, claimNumber: flags.claimNumber });
      });
    });

    const byName = (a: any, b: any) => String(a.memberName).localeCompare(String(b.memberName));
    needsQuestionnaire.sort(byName);
    needsSignoff.sort(byName);
    needsClaim.sort(byName);

    const needsQuestionnaireByRcfe = Array.from(
      needsQuestionnaire.reduce((acc, member) => {
        const key = String(member.rcfeId || '').trim();
        if (!key) return acc;
        const existing = acc.get(key);
        if (existing) {
          existing.members.push(member);
        } else {
          acc.set(key, {
            rcfeId: member.rcfeId,
            rcfeName: member.rcfeName,
            rcfeAddress: member.rcfeAddress,
            members: [member],
          });
        }
        return acc;
      }, new Map<string, { rcfeId: string; rcfeName: string; rcfeAddress: string; members: typeof needsQuestionnaire }>())
        .values()
    )
      .map((group) => ({
        ...group,
        members: group.members.slice().sort(byName),
      }))
      .sort((a, b) => String(a.rcfeName || '').localeCompare(String(b.rcfeName || '')));

    return { needsQuestionnaire, needsQuestionnaireByRcfe, needsSignoff, needsClaim };
  }, [filteredFacilities, monthStatuses]);

  const needsCorrectionClaims = useMemo(() => {
    return claims
      .filter((c) => normalize(c.status) === 'needs_correction')
      .slice()
      .sort((a, b) => (b.updatedAtMs || b.submittedAtMs || 0) - (a.updatedAtMs || a.submittedAtMs || 0));
  }, [claims]);
  const assignedMembersCount = useMemo(
    () => facilities.reduce((acc, f) => acc + (Array.isArray(f.members) ? f.members.length : 0), 0),
    [facilities]
  );
  const membersRequiringVisitsCount = useMemo(
    () => needsLists.needsQuestionnaire.length + needsLists.needsSignoff.length + needsLists.needsClaim.length,
    [needsLists.needsClaim.length, needsLists.needsQuestionnaire.length, needsLists.needsSignoff.length]
  );
  const membersStillNeedVisitedCount = useMemo(
    () => needsLists.needsQuestionnaire.length,
    [needsLists.needsQuestionnaire.length]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <div className="text-muted-foreground">Loading queue…</div>
        </div>
      </div>
    );
  }

  if (!isSocialWorker) {
    return (
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Queue</CardTitle>
            <CardDescription>Sign in as a social worker to view your queue.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Queue</h1>
          <p className="text-muted-foreground">Your next actions for {statusMonth}.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="secondary">{assignedMembersCount} assigned members</Badge>
            <Badge variant="secondary">{membersRequiringVisitsCount} members require visits</Badge>
            <Badge variant="secondary">{membersStillNeedVisitedCount} still need to be visited</Badge>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Month</span>
            <Select value={statusMonth} onValueChange={(v) => setStatusMonth(String(v || '').trim())}>
              <SelectTrigger className="w-[190px]" aria-label="Queue month">
                <SelectValue placeholder="Select month" />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by member / RCFE…" className="w-full sm:w-[260px]" />
            <Button
              variant="outline"
              onClick={() => {
                void refreshRoster();
                void refreshMonthStatuses();
                void refreshDraftsToday();
                void refreshClaims();
              }}
              disabled={loadingRoster || loadingMonthStatuses}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loadingRoster || loadingMonthStatuses ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {rosterError ? (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-base">Roster unavailable</CardTitle>
            <CardDescription className="text-destructive">{rosterError}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resume draft questionnaires</CardTitle>
            <CardDescription>
              {loadingDrafts ? 'Loading…' : `${draftsToday.length} draft${draftsToday.length === 1 ? '' : 's'} found for ${statusMonth}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {draftsToday.length === 0 ? (
              <div className="text-sm text-muted-foreground">No drafts saved for this month.</div>
            ) : (
              draftsToday.slice(0, 10).map((v) => (
                <div key={v.visitId} className="flex items-center justify-between gap-3 rounded border p-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{v.memberName || 'Member'}</div>
                    <div className="text-xs text-muted-foreground truncate">{v.rcfeName}</div>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/sw-visit-verification?rcfeId=${encodeURIComponent(v.rcfeId)}&memberId=${encodeURIComponent(v.memberId)}`}>
                      Open <ExternalLink className="h-3.5 w-3.5 ml-2" />
                    </Link>
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Claims needing correction</CardTitle>
            <CardDescription>
              {loadingClaims ? 'Loading…' : `${needsCorrectionClaims.length} claim${needsCorrectionClaims.length === 1 ? '' : 's'} need correction`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {needsCorrectionClaims.length === 0 ? (
              <div className="text-sm text-muted-foreground">No correction requests found this month.</div>
            ) : (
              needsCorrectionClaims.slice(0, 8).map((c) => (
                <div key={c.claimId} className="flex items-center justify-between gap-3 rounded border p-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{c.memberName || 'Claim'}</div>
                    <div className="text-xs text-muted-foreground truncate">{c.rcfeName || ''}</div>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/sw-portal/claims">
                      Open <ExternalLink className="h-3.5 w-3.5 ml-2" />
                    </Link>
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Members needing questionnaire</CardTitle>
            <CardDescription>
              {needsLists.needsQuestionnaire.length} member(s) across {needsLists.needsQuestionnaireByRcfe.length} RCFE(s)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {needsLists.needsQuestionnaireByRcfe.length === 0 ? (
              <div className="text-sm text-muted-foreground">All caught up.</div>
            ) : (
              needsLists.needsQuestionnaireByRcfe.slice(0, 12).map((group) => (
                <div key={group.rcfeId} className="rounded border p-2 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{group.rcfeName}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {group.members.length} member{group.members.length === 1 ? '' : 's'} need questionnaire
                      </div>
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <Link
                        href={`/sw-visit-verification?rcfeId=${encodeURIComponent(group.rcfeId)}`}
                      >
                        Open RCFE <ExternalLink className="h-3.5 w-3.5 ml-2" />
                      </Link>
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {group.members.slice(0, 4).map((m) => m.memberName).join(' • ')}
                    {group.members.length > 4 ? ` • +${group.members.length - 4} more` : ''}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Members needing sign-off</CardTitle>
            <CardDescription>{needsLists.needsSignoff.length} member(s)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {needsLists.needsSignoff.length === 0 ? (
              <div className="text-sm text-muted-foreground">No sign-offs pending.</div>
            ) : (
              needsLists.needsSignoff.slice(0, 12).map((m) => (
                <div key={m.memberId} className="flex items-center justify-between gap-3 rounded border p-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{m.memberName}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {m.rcfeName}
                      {m.visitDay ? ` • ${m.visitDay}` : ''}
                    </div>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link
                      href={`/sw-portal/sign-off?rcfeId=${encodeURIComponent(m.rcfeId)}${
                        m.visitDay ? `&claimDay=${encodeURIComponent(m.visitDay)}` : ''
                      }`}
                    >
                      Sign off <ExternalLink className="h-3.5 w-3.5 ml-2" />
                    </Link>
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Members needing claim submission</CardTitle>
            <CardDescription>{needsLists.needsClaim.length} member(s)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {needsLists.needsClaim.length === 0 ? (
              <div className="text-sm text-muted-foreground">No claims pending submission.</div>
            ) : (
              needsLists.needsClaim.slice(0, 12).map((m) => (
                <div key={m.memberId} className="flex items-center justify-between gap-3 rounded border p-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{m.memberName}</div>
                    <div className="text-xs text-muted-foreground truncate">{m.rcfeName}</div>
                    {m.claimNumber ? (
                      <div className="mt-1">
                        <Badge variant="secondary" className="font-mono text-[10px]">{m.claimNumber}</Badge>
                      </div>
                    ) : null}
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/sw-portal/claims">
                      Claims <ExternalLink className="h-3.5 w-3.5 ml-2" />
                    </Link>
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">At a glance</CardTitle>
          <CardDescription>Quick totals for {statusMonth}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant="secondary">{assignedMembersCount} assigned</Badge>
          <Badge variant="secondary">{needsLists.needsQuestionnaire.length} need questionnaire</Badge>
          <Badge variant="secondary">{needsLists.needsSignoff.length} need sign-off</Badge>
          <Badge variant="secondary">{needsLists.needsClaim.length} need claim</Badge>
          <Badge variant="secondary">{draftsToday.length} drafts today</Badge>
          <Badge variant="secondary">{needsCorrectionClaims.length} claims need correction</Badge>
        </CardContent>
      </Card>
    </div>
  );
}

