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
import { ClipboardList, ExternalLink, Loader2, RefreshCw, Search, User } from 'lucide-react';
import { useFirestore } from '@/firebase';
import { useAdmin } from '@/hooks/use-admin';
import { IspLayoutModeToggle } from '@/components/alft/IspLayoutModeToggle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  type IspLayoutMode,
  readIspLayoutMode,
  writeIspLayoutMode,
} from '@/lib/isp-layout-mode';

type AssignmentRow = {
  id: string;
  memberId: string;
  memberName: string;
  memberMrn: string;
  assignedSwName: string;
  assignedSwEmail: string;
  assignedAtMs: number;
  assignedAtLabel: string;
  workflowStatus: string;
  statusLabel: string;
};

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

/** App ALFT assignments: invite/routing/tracker in the app (not Caspio-only SW hydration). */
const isAppAssignedAlft = (data: Record<string, unknown>) => {
  if (data.ispAssignmentTracked === true) return true;
  if (Boolean((data as any)?.workflowSteps?.swInviteSent)) return true;
  if (toMs((data as any)?.workflowInvites?.invitedAt) > 0) return true;
  if (toMs((data as any)?.workflowStepsAt?.swInviteSentAt) > 0) return true;
  if (toMs((data as any)?.trackerPushedAt) > 0) return true;
  const ws = clean(data.workflowStatus).toLowerCase();
  const status = clean(data.status).toLowerCase();
  if (
    ws.includes('sw_invited') ||
    ws.includes('sw_form') ||
    ws.includes('awaiting') ||
    ws.includes('returned_to_sw') ||
    ws.includes('prefill') ||
    ws.includes('completed') ||
    ws.includes('manager_review') ||
    ws.includes('ready_to_send')
  ) {
    return true;
  }
  if (
    status.includes('sw_invited') ||
    status.includes('sw_form') ||
    status.includes('in_progress') ||
    status.includes('submitted') ||
    status.includes('completed')
  ) {
    return true;
  }
  const emailLog = Array.isArray((data as any)?.swEmailDeliveryLog)
    ? ((data as any).swEmailDeliveryLog as any[])
    : [];
  if (emailLog.some((entry) => clean(entry?.status).toLowerCase() === 'sent')) return true;
  const activity = Array.isArray((data as any)?.ispWorkflowActivityLog)
    ? ((data as any).ispWorkflowActivityLog as any[])
    : [];
  if (activity.some((entry) => clean(entry?.event) === 'sw_invite_sent')) return true;
  return false;
};

function IspAssignmentPageInner() {
  const firestore = useFirestore();
  const searchParams = useSearchParams();
  const { isAdmin, isLoading: isAdminLoading } = useAdmin();
  const [rows, setRows] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [layoutMode, setLayoutMode] = useState<IspLayoutMode>('desktop');
  const focusMemberId = clean(searchParams.get('memberId'));

  useEffect(() => {
    setLayoutMode(readIspLayoutMode());
  }, []);

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
          query(collection(firestore, 'alft_assignments'), orderBy('updatedAt', 'desc'), limit(800))
        );
      } catch {
        snap = await getDocs(query(collection(firestore, 'alft_assignments'), limit(800)));
      }

      const next: AssignmentRow[] = [];
      for (const docSnap of snap.docs) {
        const data = (docSnap.data() || {}) as Record<string, unknown>;
        // Autoload app ALFT assignments (invite / routing / tracker), including historical.
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

  const filteredRows = useMemo(() => {
    const q = clean(search).toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const hay =
        `${row.memberName} ${row.memberMrn} ${row.assignedSwName} ${row.assignedSwEmail} ${row.statusLabel}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);

  if (!isAdminLoading && !isAdmin) {
    return (
      <div className="container mx-auto max-w-5xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>ISP Assignment</CardTitle>
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
        <Button variant="outline" size="sm" onClick={() => void loadRows()} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>ISP Assignment</CardTitle>
            <Badge variant="outline">App roster</Badge>
          </div>
          <CardDescription className="mt-1.5">
            Autoloads Kaiser members already assigned to a social worker through the ALFT / ISP app (invite, routing, or
            tracker). New Workflow assignments are included automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[220px] flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search member, MRN, SW…"
                className="pl-9"
              />
            </div>
            <span className="text-sm text-muted-foreground">
              {filteredRows.length} assigned{filteredRows.length === 1 ? ' member' : ' members'}
            </span>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {loading || isAdminLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-4">Loading ISP assignments from the app…</p>
            </div>
          ) : filteredRows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No app ALFT assignments found yet. Assign and invite from ISP Workflow to start tracking here.
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
                    <TableHead className="min-w-[220px]">Member</TableHead>
                    <TableHead className="min-w-[200px]">Assigned SW</TableHead>
                    <TableHead className="min-w-[160px]">Date assigned</TableHead>
                    <TableHead className="min-w-[140px]">Status</TableHead>
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
          <p className="ml-4">Loading ISP Assignment…</p>
        </div>
      }
    >
      <IspAssignmentPageInner />
    </Suspense>
  );
}
