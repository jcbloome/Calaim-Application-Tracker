'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { ChevronDown, ChevronRight, Loader2, RotateCcw, Search } from 'lucide-react';
import { useAuth, useFirestore } from '@/firebase';
import { useAdmin } from '@/hooks/use-admin';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  formatIspWorkflowActivityLabel,
  type IspWorkflowActivityEntry,
} from '@/lib/isp-workflow-activity';

type SortKey = 'member' | 'date' | 'mrn' | 'status';
type SortDir = 'asc' | 'desc';

type ActivityItem = {
  key: string;
  atMs: number;
  atLabel: string;
  label: string;
  byName: string;
  noteSentToSw: boolean;
};

type ActivityMemberRow = {
  key: string;
  memberId: string;
  memberName: string;
  memberMrn: string;
  statusLabel: string;
  source: 'intake' | 'invite';
  rowId: string;
  deleted: boolean;
  latestAtMs: number;
  items: ActivityItem[];
};

const clean = (v: unknown) => String(v ?? '').trim();

const toMs = (v: unknown): number => {
  if (!v) return 0;
  if (typeof (v as any)?.toDate === 'function') {
    const d = (v as any).toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d.getTime() : 0;
  }
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
};

const formatWhen = (ms: number) => {
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return '';
  }
};

const parseActivityLog = (raw: unknown): IspWorkflowActivityEntry[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const e = entry as Record<string, unknown>;
      const event = clean(e.event);
      if (!event) return null;
      return {
        event,
        atIso: clean(e.atIso) || new Date(toMs(e.atIso) || Date.now()).toISOString(),
        byName: clean(e.byName) || null,
        byEmail: clean(e.byEmail) || null,
        details: clean(e.details) || null,
        fileName: clean(e.fileName) || null,
        fileLabel: clean(e.fileLabel) || null,
        recipientEmail: clean(e.recipientEmail) || null,
        noteSentToSw: Boolean(e.noteSentToSw),
        isResend: Boolean(e.isResend),
      } as IspWorkflowActivityEntry;
    })
    .filter(Boolean) as IspWorkflowActivityEntry[];
};

const pushSynthetic = (
  items: ActivityItem[],
  key: string,
  atMs: number,
  label: string,
  byName: string
) => {
  if (!atMs || !label) return;
  items.push({
    key,
    atMs,
    atLabel: formatWhen(atMs) || '—',
    label,
    byName: byName || 'Staff',
    noteSentToSw: false,
  });
};

const statusFromRow = (ws: string, deleted: boolean, reviewStatus: string, rejectionReason: string) => {
  if (deleted) return 'Deleted';
  const s = ws.toLowerCase();
  const review = reviewStatus.toLowerCase();
  if (s.includes('returned_to_sw') || review.includes('rejected_returned')) return 'Sent back to SW';
  if (s.includes('completed') || s.includes('ready_to_send') || s.includes('manager_review_complete')) {
    return 'Completed / ready';
  }
  if (s.includes('awaiting_rn')) return 'Awaiting RN';
  if (s.includes('awaiting_kaiser_manager_final')) return 'Awaiting final review';
  if (s.includes('awaiting_manager_review_pre_rn')) return 'Admin review';
  if (s.includes('sw_invited') || s.includes('sw_form')) return 'Invite / SW in progress';
  if (rejectionReason) return 'Sent back to SW';
  if (!ws) return 'Not started';
  return ws.replace(/_/g, ' ');
};

export default function IspActivityLogPage() {
  const firestore = useFirestore();
  const auth = useAuth();
  const { toast } = useToast();
  const { isAdmin, isLoading: isAdminLoading } = useAdmin();
  const [rows, setRows] = useState<ActivityMemberRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [showDeletedOnly, setShowDeletedOnly] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [restoringId, setRestoringId] = useState('');

  const loadRows = useCallback(async () => {
    if (!firestore || !isAdmin) return;
    setLoading(true);
    setError('');
    try {
      let snap;
      try {
        snap = await getDocs(
          query(
            collection(firestore, 'standalone_upload_submissions'),
            where('toolCode', '==', 'ALFT'),
            orderBy('updatedAt', 'desc'),
            limit(400)
          )
        );
      } catch {
        snap = await getDocs(
          query(collection(firestore, 'standalone_upload_submissions'), orderBy('updatedAt', 'desc'), limit(500))
        );
      }

      const byMember = new Map<string, ActivityMemberRow>();

      const upsert = (partial: Omit<ActivityMemberRow, 'items' | 'latestAtMs'> & { items: ActivityItem[] }) => {
        const existing = byMember.get(partial.key);
        const items = [...(existing?.items || []), ...partial.items].sort((a, b) => b.atMs - a.atMs);
        const deduped: ActivityItem[] = [];
        const seen = new Set<string>();
        for (const item of items) {
          const sig = `${item.label}|${item.atMs}|${item.byName}`;
          if (seen.has(sig)) continue;
          seen.add(sig);
          deduped.push(item);
        }
        byMember.set(partial.key, {
          ...partial,
          memberName: partial.memberName || existing?.memberName || 'Member',
          memberMrn: partial.memberMrn || existing?.memberMrn || '—',
          statusLabel: partial.deleted
            ? 'Deleted'
            : partial.statusLabel || existing?.statusLabel || 'In review',
          deleted: Boolean(partial.deleted || existing?.deleted),
          source: partial.source === 'intake' || existing?.source === 'intake' ? 'intake' : 'invite',
          rowId: partial.source === 'intake' ? partial.rowId : existing?.rowId || partial.rowId,
          items: deduped,
          latestAtMs: deduped[0]?.atMs || 0,
        });
      };

      for (const docSnap of snap.docs) {
        const data = docSnap.data() || {};
        const toolCode = clean(data.toolCode).toUpperCase();
        const docType = clean(data.documentType).toLowerCase();
        const isAlft = toolCode === 'ALFT' || docType.includes('alft');
        if (!isAlft) continue;

        const memberId = clean(data.memberId);
        const memberKey = memberId || docSnap.id;
        const deleted =
          Boolean(data.removedFromIspTrackerAt) ||
          Boolean(data.ispTrackerSoftDeleted) ||
          clean(data.workflowStatus).toLowerCase().includes('removed_from_isp_tracker');
        const final = (data.alftManagerReview || {}) as Record<string, unknown>;
        const sig = (data.alftSignature || {}) as Record<string, unknown>;
        const activityLog = parseActivityLog(data.ispWorkflowActivityLog);
        const items: ActivityItem[] = [];

        for (const entry of activityLog) {
          const atMs = toMs(entry.atIso);
          items.push({
            key: `${docSnap.id}:${entry.event}:${entry.atIso}:${entry.fileName || entry.details || ''}`,
            atMs,
            atLabel: atMs ? formatWhen(atMs) : '—',
            label: formatIspWorkflowActivityLabel(entry),
            byName: clean(entry.byName || entry.byEmail) || 'Staff',
            noteSentToSw: Boolean(entry.noteSentToSw),
          });
        }

        pushSynthetic(
          items,
          `${docSnap.id}:sw-signed`,
          toMs(sig.mswSignedAt) || toMs(data?.alftForm?.swSignedAt),
          'SW submitted & signed',
          clean(data.uploaderName || data.uploaderEmail) || 'MSW'
        );
        pushSynthetic(
          items,
          `${docSnap.id}:returned`,
          toMs(final.rejectedAt),
          clean(final.rejectionReason)
            ? `Sent back to SW for resubmission — ${clean(final.rejectionReason)}`
            : 'Sent back to SW for resubmission',
          clean(final.rejectedByName || final.rejectedByEmail) || 'Admin'
        );
        pushSynthetic(
          items,
          `${docSnap.id}:approved`,
          toMs((data.alftManagerPreReview || {}).approvedAt) || toMs(sig.requestedAt),
          'Admin approved → sent to RN',
          clean(data.alftStaffName || data.alftStaffEmail) || 'Admin'
        );
        pushSynthetic(
          items,
          `${docSnap.id}:rn-signed`,
          toMs(sig.rnSignedAt),
          'RN signed & returned to admin',
          clean(data.alftRnName || data.alftRnEmail) || 'RN'
        );
        pushSynthetic(
          items,
          `${docSnap.id}:final`,
          toMs(final.approvedAt) || toMs(data.alftManagerFinalReviewedAt),
          'Final manager review complete',
          clean(final.approvedByName || final.approvedByEmail) || 'Manager'
        );
        pushSynthetic(
          items,
          `${docSnap.id}:sent`,
          toMs(data.alftCompletedSentAt) || toMs(data.alftStaffDownloadedAt),
          'Final packet sent / submitted',
          clean(data.alftLastDownloadByName || data.alftStaffName) || 'Staff'
        );
        pushSynthetic(
          items,
          `${docSnap.id}:deleted`,
          toMs(data.removedFromIspTrackerAt),
          'Removed from ISP Tracker',
          clean(data.removedFromIspTrackerByEmail) || 'Admin'
        );

        upsert({
          key: memberKey,
          memberId,
          memberName: clean(data.memberName) || 'Member',
          memberMrn: clean(data.medicalRecordNumber || data.kaiserMrn) || '—',
          statusLabel: statusFromRow(
            clean(data.workflowStatus),
            deleted,
            clean(final.status),
            clean(final.rejectionReason)
          ),
          source: 'intake',
          rowId: docSnap.id,
          deleted,
          items,
        });
      }

      let assignmentSnap;
      try {
        assignmentSnap = await getDocs(
          query(collection(firestore, 'alft_assignments'), orderBy('updatedAt', 'desc'), limit(500))
        );
      } catch {
        assignmentSnap = await getDocs(query(collection(firestore, 'alft_assignments'), limit(500)));
      }

      for (const docSnap of assignmentSnap.docs) {
        const data = docSnap.data() || {};
        const memberId = clean(data.memberId || docSnap.id);
        if (!memberId) continue;
        const activityLog = parseActivityLog(data.ispWorkflowActivityLog);
        if (!activityLog.length && !data.removedFromIspTrackerAt) continue;

        const deleted =
          Boolean(data.removedFromIspTrackerAt) ||
          clean(data.workflowStatus).toLowerCase().includes('removed_from_isp_tracker');
        const items: ActivityItem[] = activityLog.map((entry) => {
          const atMs = toMs(entry.atIso);
          return {
            key: `${docSnap.id}:${entry.event}:${entry.atIso}:${entry.fileName || entry.details || ''}`,
            atMs,
            atLabel: atMs ? formatWhen(atMs) : '—',
            label: formatIspWorkflowActivityLabel(entry),
            byName: clean(entry.byName || entry.byEmail) || 'Staff',
            noteSentToSw: Boolean(entry.noteSentToSw),
          };
        });
        pushSynthetic(
          items,
          `${docSnap.id}:deleted`,
          toMs(data.removedFromIspTrackerAt),
          'Removed from ISP Tracker',
          clean(data.removedFromIspTrackerByEmail) || 'Admin'
        );

        upsert({
          key: memberId,
          memberId,
          memberName:
            clean(data.memberName) ||
            `${clean(data.memberFirstName)} ${clean(data.memberLastName)}`.trim() ||
            'Member',
          memberMrn: clean(data.memberMrn || data.medicalRecordNumber) || '—',
          statusLabel: statusFromRow(clean(data.workflowStatus), deleted, '', ''),
          source: byMember.get(memberId)?.source === 'intake' ? 'intake' : 'invite',
          rowId: byMember.get(memberId)?.rowId || `invite:${memberId}`,
          deleted,
          items,
        });
      }

      setRows(
        Array.from(byMember.values()).filter((row) => row.items.length > 0 || row.deleted)
      );
    } catch (e: any) {
      setError(String(e?.message || 'Failed to load ISP activity'));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [firestore, isAdmin]);

  useEffect(() => {
    if (!isAdmin || isAdminLoading) return;
    void loadRows();
  }, [isAdmin, isAdminLoading, loadRows]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir(key === 'date' ? 'desc' : 'asc');
  };

  const filteredRows = useMemo(() => {
    const q = clean(search).toLowerCase();
    const list = rows.filter((row) => {
      if (showDeletedOnly && !row.deleted) return false;
      if (!q) return true;
      const hay = `${row.memberName} ${row.memberMrn} ${row.statusLabel} ${row.items.map((i) => i.label).join(' ')}`.toLowerCase();
      return hay.includes(q);
    });

    const dir = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      if (sortKey === 'member') return dir * a.memberName.localeCompare(b.memberName);
      if (sortKey === 'mrn') return dir * a.memberMrn.localeCompare(b.memberMrn);
      if (sortKey === 'status') return dir * a.statusLabel.localeCompare(b.statusLabel);
      return dir * ((a.latestAtMs || 0) - (b.latestAtMs || 0));
    });
    return list;
  }, [rows, search, showDeletedOnly, sortKey, sortDir]);

  const undeleteRow = async (row: ActivityMemberRow) => {
    const user = auth.currentUser;
    if (!user) {
      toast({ title: 'Sign-in required', description: 'Please sign in again.', variant: 'destructive' });
      return;
    }
    setRestoringId(row.key);
    try {
      const idToken = await user.getIdToken();
      if (row.source === 'intake' && row.rowId && !row.rowId.startsWith('invite:')) {
        const res = await fetch('/api/alft/intake/restore', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ intakeId: row.rowId }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body?.success) throw new Error(String(body?.error || 'Restore failed'));
      } else {
        const memberId = clean(row.memberId);
        if (!memberId) throw new Error('Missing member id');
        const res = await fetch('/api/alft/assignment/restore-to-tracker', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ memberId }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body?.success) throw new Error(String(body?.error || 'Restore failed'));
      }
      toast({
        title: 'Restored to ISP Tracker',
        description: `${row.memberName} was undeleted and is visible on the tracker again.`,
      });
      await loadRows();
    } catch (e: any) {
      toast({
        title: 'Could not undelete',
        description: String(e?.message || e),
        variant: 'destructive',
      });
    } finally {
      setRestoringId('');
    }
  };

  if (!isAdminLoading && !isAdmin) {
    return (
      <div className="container mx-auto max-w-5xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>ISP Activity Log</CardTitle>
            <CardDescription>Admin access is required.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const sortMark = (key: SortKey) => (sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '');

  return (
    <div className="container mx-auto max-w-[1100px] space-y-4 p-4 sm:p-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>ISP Activity Log</CardTitle>
                <Badge variant="outline">Member timeline</Badge>
              </div>
              <CardDescription className="mt-1.5">
                Expand Details for invites, uploads, rejections, approvals, RN sign-off, final submission, and
                deletes. Sort by member, date, MRN, or status.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href="/admin/tools/isp-tracker">ISP Tracker</Link>
              </Button>
              <Button variant="outline" size="sm" onClick={() => void loadRows()} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[220px] flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search member, MRN, status, activity…"
                className="pl-9"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={showDeletedOnly}
                onChange={(e) => setShowDeletedOnly(e.target.checked)}
                className="h-4 w-4 rounded border"
              />
              Show deleted only
            </label>
            <span className="text-sm text-muted-foreground">{filteredRows.length} members</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {(
              [
                ['member', 'Member'],
                ['date', 'Date'],
                ['mrn', 'MRN'],
                ['status', 'Status'],
              ] as Array<[SortKey, string]>
            ).map(([key, label]) => (
              <Button
                key={key}
                type="button"
                size="sm"
                variant={sortKey === key ? 'default' : 'outline'}
                onClick={() => toggleSort(key)}
              >
                Sort: {label}
                {sortMark(key)}
              </Button>
            ))}
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {loading || isAdminLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-4">Loading activity…</p>
            </div>
          ) : filteredRows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No activity found yet. Invites, submits, rejections, and approvals will appear here.
            </p>
          ) : (
            <ul className="space-y-2">
              {filteredRows.map((row) => {
                const open = Boolean(expanded[row.key]);
                const latest = row.items[0];
                const extra = Math.max(0, row.items.length - 1);
                return (
                  <li
                    key={row.key}
                    className={`rounded-md border px-3 py-2 ${row.deleted ? 'border-orange-200 bg-orange-50/40' : ''}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => setExpanded((prev) => ({ ...prev, [row.key]: !prev[row.key] }))}
                      >
                        <div className="flex items-start gap-1">
                          {open ? (
                            <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          )}
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{row.memberName}</span>
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${
                                  row.deleted
                                    ? 'border-orange-300 bg-orange-50 text-orange-950'
                                    : 'border-slate-200 bg-slate-50 text-slate-800'
                                }`}
                              >
                                {row.statusLabel}
                              </Badge>
                              {row.memberMrn && row.memberMrn !== '—' ? (
                                <span className="text-xs text-muted-foreground">MRN {row.memberMrn}</span>
                              ) : null}
                            </div>
                            <div className="mt-0.5 line-clamp-2 text-sm text-slate-800">
                              {latest?.label || 'No activity yet'}
                              {latest?.atLabel ? (
                                <span className="text-muted-foreground"> · {latest.atLabel}</span>
                              ) : null}
                              {!open && extra > 0 ? (
                                <span className="text-muted-foreground"> · +{extra} more</span>
                              ) : null}
                              <span className="ml-1 text-blue-700">{open ? 'Hide' : 'Details'}</span>
                            </div>
                          </div>
                        </div>
                      </button>
                      {row.deleted ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={restoringId === row.key}
                          onClick={() => void undeleteRow(row)}
                        >
                          {restoringId === row.key ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="mr-1 h-3.5 w-3.5" />
                          )}
                          Undelete
                        </Button>
                      ) : null}
                    </div>
                    {open ? (
                      <ul className="mt-2 space-y-1.5 border-l border-slate-200 pl-3 text-xs text-slate-700">
                        {row.items.length ? (
                          row.items.map((item) => (
                            <li key={item.key}>
                              <span className="font-medium text-slate-800">{item.label}</span>
                              <span className="text-muted-foreground">
                                {' '}
                                · {item.atLabel} · by {item.byName}
                                {item.noteSentToSw ? ' · Note sent to SW' : ''}
                              </span>
                            </li>
                          ))
                        ) : (
                          <li className="text-muted-foreground">No detailed timeline entries yet.</li>
                        )}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
