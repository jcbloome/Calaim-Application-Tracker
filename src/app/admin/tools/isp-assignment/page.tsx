'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from 'firebase/firestore';
import { ArrowDown, ArrowUp, ArrowUpDown, ClipboardList, ExternalLink, Loader2, RefreshCw, Search, User, X } from 'lucide-react';
import { useFirestore } from '@/firebase';
import { useAdmin } from '@/hooks/use-admin';
import { IspLayoutModeToggle } from '@/components/alft/IspLayoutModeToggle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  type IspLayoutMode,
  readIspLayoutMode,
  writeIspLayoutMode,
} from '@/lib/isp-layout-mode';
import { cn } from '@/lib/utils';
import { isAppAssignedAlft } from '@/lib/sw-alft-assignments';

type AssignmentRow = {
  id: string;
  memberId: string;
  memberName: string;
  memberMrn: string;
  assignedSwName: string;
  assignedSwEmail: string;
  assignedAtMs: number;
  assignedAtLabel: string;
  assignedAtDateKey: string;
  workflowStatus: string;
  statusLabel: string;
};

type SortKey = 'member' | 'sw' | 'date' | 'status';
type SortDir = 'asc' | 'desc';

const ALL = '__all__';

const clean = (value: unknown) => String(value || '').trim();

const toMs = (value: unknown): number => {
  try {
    const withToDate = value as { toDate?: () => Date; toMillis?: () => number };
    if (typeof withToDate?.toMillis === 'function') {
      const ms = withToDate.toMillis();
      return Number.isFinite(ms) ? ms : 0;
    }
    if (typeof withToDate?.toDate === 'function') {
      const d = withToDate.toDate();
      return Number.isNaN(d.getTime()) ? 0 : d.getTime();
    }
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const d = new Date(String(value || ''));
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  } catch {
    return 0;
  }
};

const formatWhen = (ms: number) => {
  if (!ms) return '—';
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return '—';
  }
};

const toDateKey = (ms: number) => {
  if (!ms) return '';
  try {
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch {
    return '';
  }
};

const startOfDayMs = (yyyyMmDd: string) => {
  const key = clean(yyyyMmDd);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return 0;
  const d = new Date(`${key}T00:00:00`);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
};

const endOfDayMs = (yyyyMmDd: string) => {
  const key = clean(yyyyMmDd);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return 0;
  const d = new Date(`${key}T23:59:59.999`);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
};

const statusLabelFor = (ws: string, status: string) => {
  const raw = `${ws} ${status}`.toLowerCase();
  if (raw.includes('removed_from_isp_tracker')) return 'Removed from tracker';
  if (raw.includes('returned_to_sw')) return 'Returned to SW';
  if (raw.includes('completed') || raw.includes('manager_review_complete') || raw.includes('ready_to_send')) {
    return 'Completed';
  }
  if (raw.includes('awaiting_rn')) return 'Awaiting RN';
  if (raw.includes('awaiting_kaiser_manager_final')) return 'Awaiting final review';
  if (raw.includes('awaiting_manager') || raw.includes('awaiting_sw_signature')) return 'In review';
  if (raw.includes('sw_invited') || raw.includes('sw_form') || raw.includes('prefill')) return 'Sent to SW';
  if (raw.includes('assigned')) return 'Assigned';
  if (!ws && !status) return 'Assigned';
  return ws.replace(/_/g, ' ') || status.replace(/_/g, ' ') || 'Assigned';
};

function IspAssignmentPageInner() {
  const firestore = useFirestore();
  const searchParams = useSearchParams();
  const { isAdmin, isLoading: isAdminLoading } = useAdmin();
  const [rows, setRows] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [memberFilter, setMemberFilter] = useState(ALL);
  const [swFilter, setSwFilter] = useState(ALL);
  const [assignedFrom, setAssignedFrom] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [layoutMode, setLayoutMode] = useState<IspLayoutMode>('desktop');
  const focusMemberId = clean(searchParams.get('memberId'));

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir(key === 'date' ? 'desc' : 'asc');
  };

  useEffect(() => {
    setLayoutMode(readIspLayoutMode());
  }, []);

  useEffect(() => {
    if (focusMemberId) setMemberFilter(focusMemberId);
  }, [focusMemberId]);

  const onLayoutModeChange = (mode: IspLayoutMode) => {
    setLayoutMode(mode);
    writeIspLayoutMode(mode);
  };

  const loadRows = useCallback(async () => {
    if (!firestore || !isAdmin) return;
    setLoading(true);
    setError('');
    try {
      let snap;
      try {
        snap = await getDocs(
          query(collection(firestore, 'alft_assignments'), orderBy('updatedAt', 'desc'), limit(2000))
        );
      } catch {
        snap = await getDocs(query(collection(firestore, 'alft_assignments'), limit(2000)));
      }

      const next: AssignmentRow[] = [];
      for (const docSnap of snap.docs) {
        const data = (docSnap.data() || {}) as Record<string, unknown>;
        // App ALFT assignments only (ISP Workflow invite / routing / tracker) — not Caspio-only shells.
        if (!isAppAssignedAlft(data)) continue;

        const memberId = clean(data.memberId || docSnap.id);
        const swName = clean(data.assignedSwName);
        const swEmail = clean(data.assignedSwEmail).toLowerCase();
        if (!swName && !swEmail.includes('@')) continue;

        const ws = clean(data.workflowStatus);
        const status = clean(data.status);
        if (
          ws.toLowerCase().includes('removed_from_isp_tracker') ||
          status.toLowerCase().includes('removed_from_isp_tracker') ||
          Boolean(data.removedFromIspTrackerAt)
        ) {
          continue;
        }

        const assignedAtMs = Math.max(
          toMs(data.ispAssignmentTrackedAt),
          toMs(data.assignedAt),
          toMs((data as any)?.workflowInvites?.invitedAt),
          toMs((data as any)?.workflowStepsAt?.swInviteSentAt),
          toMs(data.trackerPushedAt),
          toMs(data.createdAt),
          toMs(data.updatedAt)
        );

        next.push({
          id: docSnap.id,
          memberId,
          memberName:
            clean(data.memberName) ||
            `${clean(data.memberFirstName)} ${clean(data.memberLastName)}`.trim() ||
            'Member',
          memberMrn: clean(data.memberMrn || data.medicalRecordNumber) || '—',
          assignedSwName: swName || swEmail || 'Social Worker',
          assignedSwEmail: swEmail,
          assignedAtMs,
          assignedAtLabel: formatWhen(assignedAtMs),
          assignedAtDateKey: toDateKey(assignedAtMs),
          workflowStatus: ws,
          statusLabel: statusLabelFor(ws, status),
        });
      }

      next.sort((a, b) => b.assignedAtMs - a.assignedAtMs || a.memberName.localeCompare(b.memberName));
      setRows(next);
    } catch (e: any) {
      setError(String(e?.message || 'Failed to load ISP assignments'));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [firestore, isAdmin]);

  useEffect(() => {
    if (!isAdmin || isAdminLoading) return;
    void loadRows();
  }, [isAdmin, isAdminLoading, loadRows]);

  const memberOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) {
      if (!row.memberId) continue;
      const label = `${row.memberName} · MRN ${row.memberMrn}`;
      if (!map.has(row.memberId)) map.set(row.memberId, label);
    }
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  }, [rows]);

  const swOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) {
      const key = row.assignedSwEmail || row.assignedSwName.toLowerCase();
      if (!key) continue;
      const label = row.assignedSwEmail
        ? `${row.assignedSwName} (${row.assignedSwEmail})`
        : row.assignedSwName;
      if (!map.has(key)) map.set(key, label);
    }
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  }, [rows]);

  const hasActiveFilters = Boolean(
    memberFilter !== ALL || swFilter !== ALL || assignedFrom || assignedTo || clean(search)
  );

  const clearFilters = () => {
    setMemberFilter(ALL);
    setSwFilter(ALL);
    setAssignedFrom('');
    setAssignedTo('');
    setSearch('');
  };

  const filteredRows = useMemo(() => {
    const q = clean(search).toLowerCase();
    const fromMs = assignedFrom ? startOfDayMs(assignedFrom) : 0;
    const toMsBound = assignedTo ? endOfDayMs(assignedTo) : 0;

    const list = rows.filter((row) => {
      if (memberFilter !== ALL && row.memberId !== memberFilter) return false;
      if (swFilter !== ALL) {
        const key = row.assignedSwEmail || row.assignedSwName.toLowerCase();
        if (key !== swFilter) return false;
      }
      if (fromMs && (!row.assignedAtMs || row.assignedAtMs < fromMs)) return false;
      if (toMsBound && (!row.assignedAtMs || row.assignedAtMs > toMsBound)) return false;
      if (q) {
        const hay =
          `${row.memberName} ${row.memberMrn} ${row.assignedSwName} ${row.assignedSwEmail} ${row.statusLabel}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const dir = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      if (sortKey === 'member') {
        return (
          dir * a.memberName.localeCompare(b.memberName, undefined, { sensitivity: 'base' }) ||
          a.memberMrn.localeCompare(b.memberMrn)
        );
      }
      if (sortKey === 'sw') {
        return (
          dir * a.assignedSwName.localeCompare(b.assignedSwName, undefined, { sensitivity: 'base' }) ||
          a.assignedSwEmail.localeCompare(b.assignedSwEmail) ||
          a.memberName.localeCompare(b.memberName)
        );
      }
      if (sortKey === 'status') {
        return (
          dir * a.statusLabel.localeCompare(b.statusLabel, undefined, { sensitivity: 'base' }) ||
          b.assignedAtMs - a.assignedAtMs
        );
      }
      return dir * (a.assignedAtMs - b.assignedAtMs) || a.memberName.localeCompare(b.memberName);
    });
    return list;
  }, [rows, search, sortKey, sortDir, memberFilter, swFilter, assignedFrom, assignedTo]);

  const SortHeader = ({
    label,
    column,
    className,
  }: {
    label: string;
    column: SortKey;
    className?: string;
  }) => {
    const active = sortKey === column;
    const Icon = !active ? ArrowUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown;
    return (
      <TableHead className={className}>
        <button
          type="button"
          onClick={() => toggleSort(column)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-sm text-left font-medium hover:text-foreground',
            active ? 'text-foreground' : 'text-muted-foreground'
          )}
          aria-label={`Sort by ${label}`}
        >
          {label}
          <Icon className={cn('h-3.5 w-3.5', active ? 'opacity-100' : 'opacity-50')} />
        </button>
      </TableHead>
    );
  };

  if (!isAdminLoading && !isAdmin) {
    return (
      <div className="container mx-auto max-w-5xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>SW ISP Assignments</CardTitle>
            <CardDescription>Admin access is required.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div
      className={`container mx-auto space-y-4 p-4 sm:p-6 ${
        layoutMode === 'mobile' ? 'max-w-xl' : 'max-w-[1100px]'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <IspLayoutModeToggle mode={layoutMode} onChange={onLayoutModeChange} />
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/tools/isp-workflow">
            <ClipboardList className="mr-2 h-4 w-4" />
            ISP Workflow
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/tools/isp-tracker">ISP Tracker</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/tools/isp-activity-log">ISP Activity Log</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/tools/datapage-tools">DataPage Tools</Link>
        </Button>
        <Button variant="outline" size="sm" onClick={() => void loadRows()} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>SW ISP Assignments</CardTitle>
            <Badge variant="outline">App datapage</Badge>
          </div>
          <CardDescription className="mt-1.5">
            Members assigned to social workers through the app (ISP Workflow invite / routing). Caspio-only contact
            shells are excluded. Filter by member, social worker, or assigned date.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="sw-app-assign-member">Member</Label>
              <Select value={memberFilter} onValueChange={setMemberFilter}>
                <SelectTrigger id="sw-app-assign-member">
                  <SelectValue placeholder="All members" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All members</SelectItem>
                  {memberOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sw-app-assign-sw">Social worker</Label>
              <Select value={swFilter} onValueChange={setSwFilter}>
                <SelectTrigger id="sw-app-assign-sw">
                  <SelectValue placeholder="All social workers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All social workers</SelectItem>
                  {swOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sw-app-assign-from">Assigned from</Label>
              <Input
                id="sw-app-assign-from"
                type="date"
                value={assignedFrom}
                onChange={(e) => setAssignedFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sw-app-assign-to">Assigned to</Label>
              <Input
                id="sw-app-assign-to"
                type="date"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[220px] flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Quick search name, MRN, email…"
                className="pl-9"
              />
            </div>
            {hasActiveFilters ? (
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                <X className="mr-1.5 h-4 w-4" />
                Clear filters
              </Button>
            ) : null}
            <span className="text-sm text-muted-foreground">
              {filteredRows.length} of {rows.length} app assignment{rows.length === 1 ? '' : 's'}
            </span>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {loading || isAdminLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-4">Loading app assignments…</p>
            </div>
          ) : filteredRows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {rows.length === 0
                ? 'No app ALFT assignments found yet. Assign and invite from ISP Workflow to start tracking here.'
                : 'No assignments match the current filters.'}
            </p>
          ) : layoutMode === 'mobile' ? (
            <ul className="space-y-2">
              {filteredRows.map((row) => {
                const focused = focusMemberId && row.memberId === focusMemberId;
                return (
                  <li
                    key={row.id}
                    className={`rounded-md border bg-white px-3 py-2.5 ${
                      focused ? 'border-blue-400 ring-1 ring-blue-200' : ''
                    }`}
                  >
                    <div className="font-medium">{row.memberName}</div>
                    <div className="mt-1 text-xs text-muted-foreground">MRN {row.memberMrn}</div>
                    <div className="mt-2 flex items-start gap-2 text-sm">
                      <User className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                      <div>
                        <div>{row.assignedSwName}</div>
                        {row.assignedSwEmail ? (
                          <div className="text-xs text-muted-foreground">{row.assignedSwEmail}</div>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary" className="text-[10px]">
                        {row.statusLabel}
                      </Badge>
                      <span>Assigned {row.assignedAtLabel}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button asChild variant="outline" size="sm" className="h-8">
                        <Link
                          href={`/admin/tools/isp-workflow?memberId=${encodeURIComponent(row.memberId)}`}
                        >
                          <ClipboardList className="mr-1.5 h-3.5 w-3.5" />
                          Workflow
                        </Link>
                      </Button>
                      <Button asChild variant="outline" size="sm" className="h-8">
                        <Link href={`/admin/alft-tracker?memberId=${encodeURIComponent(row.memberId)}`}>
                          <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                          ALFT
                        </Link>
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortHeader label="Member" column="member" className="min-w-[220px]" />
                    <SortHeader label="Assigned SW" column="sw" className="min-w-[200px]" />
                    <SortHeader label="Date assigned" column="date" className="min-w-[160px]" />
                    <SortHeader label="Status" column="status" className="min-w-[140px]" />
                    <TableHead className="w-[120px] text-right">Open</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => {
                    const focused = focusMemberId && row.memberId === focusMemberId;
                    return (
                      <TableRow
                        key={row.id}
                        className={focused ? 'bg-blue-50/70' : undefined}
                        data-member-id={row.memberId}
                      >
                        <TableCell className="align-middle py-2">
                          <div className="font-medium">{row.memberName}</div>
                          <div className="text-xs text-muted-foreground">MRN {row.memberMrn}</div>
                        </TableCell>
                        <TableCell className="align-middle py-2">
                          <div>{row.assignedSwName}</div>
                          {row.assignedSwEmail ? (
                            <div className="text-xs text-muted-foreground">{row.assignedSwEmail}</div>
                          ) : null}
                        </TableCell>
                        <TableCell className="align-middle py-2 text-sm">{row.assignedAtLabel}</TableCell>
                        <TableCell className="align-middle py-2">
                          <Badge variant="secondary" className="text-[10px]">
                            {row.statusLabel}
                          </Badge>
                        </TableCell>
                        <TableCell className="align-middle py-2 text-right">
                          <div className="inline-flex items-center justify-end gap-1">
                            <Button asChild variant="outline" size="sm" className="h-8 w-8 p-0">
                              <Link
                                href={`/admin/tools/isp-workflow?memberId=${encodeURIComponent(row.memberId)}`}
                                aria-label="Open ISP Workflow"
                              >
                                <ClipboardList className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button asChild variant="outline" size="sm" className="h-8 w-8 p-0">
                              <Link
                                href={`/admin/alft-tracker?memberId=${encodeURIComponent(row.memberId)}`}
                                aria-label="Open ALFT tracker"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Link>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function IspAssignmentPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto flex h-48 max-w-5xl items-center justify-center p-6">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-4">Loading SW ISP Assignments…</p>
        </div>
      }
    >
      <IspAssignmentPageInner />
    </Suspense>
  );
}
