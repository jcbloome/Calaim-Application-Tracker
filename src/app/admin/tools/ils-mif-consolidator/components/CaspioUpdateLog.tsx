'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { User } from 'firebase/auth';
import { ChevronRight, Download, Loader2, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { adminFetch } from '@/lib/admin-fetch';
import { formatDateTime } from '@/lib/format-date';
import { cn } from '@/lib/utils';

type Outcome = 'updated' | 'skipped' | 'failed';

type CaspioUpdateLogEntry = {
  id: string;
  atIso: string;
  action: string;
  outcome: Outcome;
  summary: string;
  memberName: string;
  memberMrn: string;
  clientId2: string;
  staff: string;
  details: Record<string, unknown>;
};

const OUTCOME_FILTERS: Array<{ value: 'all' | Outcome; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'updated', label: 'Updated' },
  { value: 'skipped', label: 'Skipped' },
  { value: 'failed', label: 'Failed' },
];

const OUTCOME_BADGE: Record<Outcome, string> = {
  updated: 'bg-green-100 text-green-800 border-green-200',
  skipped: 'bg-amber-100 text-amber-800 border-amber-200',
  failed: 'bg-red-100 text-red-800 border-red-200',
};

const text = (value: unknown) => String(value ?? '').trim();

const ACTION_LABELS: Record<string, string> = {
  mif_auth_fields_pushed: 'Auth # / dates',
  mif_auth_fields_push_skipped: 'Auth # / dates',
  mif_auth_fields_push_failed: 'Auth # / dates',
  mif_pending_to_authorized_push: 'Pending → Authorized (old tool)',
  mif_t2038_requested_to_received_push: 'Kaiser_Status (old tool)',
};

/** Human-readable "field: before → after" lines for one entry. */
function describeChange(entry: CaspioUpdateLogEntry): string[] {
  const d = entry.details || {};
  if (entry.outcome !== 'updated') {
    const attempted = [
      text(d.mifAuthorizationNumberT2038) && `#${text(d.mifAuthorizationNumberT2038)}`,
      text(d.mifAuthorizationStartT2038) &&
        `${text(d.mifAuthorizationStartT2038)} – ${text(d.mifAuthorizationEndT2038)}`,
    ]
      .filter(Boolean)
      .join(' ');
    return [text(d.reason) || entry.summary, attempted ? `Tried: ${attempted}` : ''].filter(Boolean);
  }
  if (entry.action === 'mif_t2038_requested_to_received_push') {
    return [`Kaiser_Status: ${text(d.previousKaiserStatus) || '(blank)'} → ${text(d.kaiserStatus) || '(blank)'}`];
  }
  const hasPrevious = ['previousAuthorizationNumberT2038', 'previousAuthorizationStartT2038', 'previousAuthorizationEndT2038'].some(
    (key) => key in d
  );
  const line = (label: string, prevKey: string, nextKey: string) => {
    const next = text(d[nextKey]);
    if (!next) return '';
    if (!hasPrevious) return `${label}: ${next}`;
    const prev = text(d[prevKey]);
    return prev === next ? `${label}: ${next} (unchanged)` : `${label}: ${prev || '(blank)'} → ${next}`;
  };
  const lines = [
    line('Auth #', 'previousAuthorizationNumberT2038', 'newAuthorizationNumberT2038'),
    line('Start', 'previousAuthorizationStartT2038', 'newAuthorizationStartT2038'),
    line('End', 'previousAuthorizationEndT2038', 'newAuthorizationEndT2038'),
    text(d.warning),
  ].filter(Boolean);
  return lines.length ? lines : [entry.summary.replace(/^T2038 auth pushed to Caspio:\s*/i, 'Auth ')];
}

const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;

export function CaspioUpdateLog({ user, refreshKey }: { user: User | null | undefined; refreshKey: number }) {
  const [entries, setEntries] = useState<CaspioUpdateLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState<'all' | Outcome>('all');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const toggleExpanded = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const body = await adminFetch<{ entries?: CaspioUpdateLogEntry[] }>(
        '/api/admin/ils-mif/caspio-update-log?limit=500',
        { user }
      );
      setEntries(Array.isArray(body.entries) ? body.entries : []);
    } catch (err: any) {
      setError(err?.message || 'Could not load the Caspio update log.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const counts = useMemo(
    () =>
      entries.reduce(
        (acc, entry) => {
          acc[entry.outcome] += 1;
          return acc;
        },
        { updated: 0, skipped: 0, failed: 0 } as Record<Outcome, number>
      ),
    [entries]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (outcomeFilter !== 'all' && entry.outcome !== outcomeFilter) return false;
      if (!q) return true;
      return [entry.memberName, entry.memberMrn, entry.clientId2, entry.staff, text(entry.details?.sourceFileName)]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [entries, search, outcomeFilter]);

  const exportCsv = () => {
    const header = ['Date/time', 'Member', 'MRN', 'Client_ID2', 'Update', 'Result', 'Change', 'Staff', 'MIF file'];
    const lines = visible.map((entry) =>
      [
        formatDateTime(entry.atIso),
        entry.memberName,
        entry.memberMrn,
        entry.clientId2,
        ACTION_LABELS[entry.action] || entry.action,
        entry.outcome,
        describeChange(entry).join('; '),
        entry.staff,
        text(entry.details?.sourceFileName),
      ]
        .map((value) => csvCell(text(value)))
        .join(',')
    );
    const blob = new Blob([[header.map(csvCell).join(','), ...lines].join('\r\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mif-caspio-update-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card id="mif-caspio-update-log">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Caspio update log</CardTitle>
            <CardDescription>
              Every Caspio member update made from the MIF consolidator, with before → after values and who made it.
              {entries.length
                ? ` ${counts.updated} updated · ${counts.skipped} skipped · ${counts.failed} failed.`
                : ''}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={!visible.length}>
              <Download className="mr-1 h-3.5 w-3.5" />
              CSV
            </Button>
            <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading || !user}>
              {loading ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-3.5 w-3.5" />
              )}
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="h-8 max-w-xs text-xs"
            placeholder="Search member, MRN, Client_ID2, staff, file…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="flex gap-1">
            {OUTCOME_FILTERS.map((option) => (
              <Button
                key={option.value}
                size="sm"
                variant={outcomeFilter === option.value ? 'default' : 'outline'}
                className="h-8 px-2 text-xs"
                onClick={() => setOutcomeFilter(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        {error ? <div className="text-sm text-red-600">{error}</div> : null}

        {!error && !loading && visible.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            {entries.length ? 'No entries match the filter.' : 'No Caspio updates logged yet.'}
          </div>
        ) : null}

        {visible.length ? (
          <ul className="max-h-[280px] divide-y overflow-auto rounded border text-xs">
            {visible.map((entry) => {
              const isOpen = expandedIds.has(entry.id);
              const changeLines = describeChange(entry);
              const sourceFileName = text(entry.details?.sourceFileName);
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => toggleExpanded(entry.id)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none"
                  >
                    <ChevronRight
                      className={cn('h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform', isOpen && 'rotate-90')}
                      aria-hidden
                    />
                    <span className="w-[120px] shrink-0 whitespace-nowrap text-muted-foreground">
                      {formatDateTime(entry.atIso, '—')}
                    </span>
                    <span className="w-[150px] shrink-0 truncate font-medium">
                      {entry.memberName || (entry.clientId2 ? `ID ${entry.clientId2}` : 'Batch')}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-slate-600">{changeLines[0]}</span>
                    <Badge
                      variant="outline"
                      className={cn('shrink-0 whitespace-nowrap px-1.5 py-0 text-[11px]', OUTCOME_BADGE[entry.outcome])}
                    >
                      {entry.outcome}
                    </Badge>
                    <span className="hidden w-[120px] shrink-0 truncate text-right text-muted-foreground md:inline">
                      {entry.staff || '—'}
                    </span>
                  </button>
                  {isOpen ? (
                    <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1 bg-slate-50 px-8 py-2">
                      <dt className="text-slate-500">Member</dt>
                      <dd>
                        {entry.clientId2 ? (
                          <Link href={`/admin/members/${entry.clientId2}`} className="text-blue-700 hover:underline">
                            {entry.memberName || entry.clientId2}
                          </Link>
                        ) : (
                          entry.memberName || '—'
                        )}
                        {entry.memberMrn || entry.clientId2 ? (
                          <span className="text-muted-foreground">
                            {' '}
                            ·{' '}
                            {[entry.memberMrn && `MRN ${entry.memberMrn}`, entry.clientId2 && `ID ${entry.clientId2}`]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        ) : null}
                      </dd>
                      <dt className="text-slate-500">Update</dt>
                      <dd>{ACTION_LABELS[entry.action] || entry.action}</dd>
                      <dt className="text-slate-500">Change</dt>
                      <dd>
                        {changeLines.map((line, index) => (
                          <div key={index}>{line}</div>
                        ))}
                      </dd>
                      {entry.summary && !changeLines.includes(entry.summary) ? (
                        <>
                          <dt className="text-slate-500">Summary</dt>
                          <dd>{entry.summary}</dd>
                        </>
                      ) : null}
                      <dt className="text-slate-500">Staff</dt>
                      <dd>{entry.staff || '—'}</dd>
                      <dt className="text-slate-500">MIF file</dt>
                      <dd className="break-all">{sourceFileName || '—'}</dd>
                    </dl>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}
