'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { User } from 'firebase/auth';
import { Download, Loader2, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { adminFetch } from '@/lib/admin-fetch';
import { formatDateTime } from '@/lib/format-date';

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
  return lines.length ? lines : [entry.summary];
}

const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;

export function CaspioUpdateLog({ user, refreshKey }: { user: User | null | undefined; refreshKey: number }) {
  const [entries, setEntries] = useState<CaspioUpdateLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState<'all' | Outcome>('all');

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
          <div className="max-h-[360px] overflow-auto rounded border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Date/time</th>
                  <th className="px-2 py-1.5 font-medium">Member</th>
                  <th className="px-2 py-1.5 font-medium">Update</th>
                  <th className="px-2 py-1.5 font-medium">Change</th>
                  <th className="px-2 py-1.5 font-medium">Result</th>
                  <th className="px-2 py-1.5 font-medium">Staff</th>
                  <th className="px-2 py-1.5 font-medium">MIF file</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visible.map((entry) => (
                  <tr key={entry.id} className="align-top hover:bg-slate-50">
                    <td className="whitespace-nowrap px-2 py-1.5">{formatDateTime(entry.atIso, '—')}</td>
                    <td className="px-2 py-1.5">
                      {entry.clientId2 ? (
                        <Link href={`/admin/members/${entry.clientId2}`} className="text-blue-700 hover:underline">
                          {entry.memberName || entry.clientId2}
                        </Link>
                      ) : (
                        entry.memberName || '—'
                      )}
                      <div className="text-[11px] text-muted-foreground">
                        {[entry.memberMrn && `MRN ${entry.memberMrn}`, entry.clientId2 && `ID ${entry.clientId2}`]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5">{ACTION_LABELS[entry.action] || entry.action}</td>
                    <td className="px-2 py-1.5">
                      {describeChange(entry).map((line, index) => (
                        <div key={index}>{line}</div>
                      ))}
                    </td>
                    <td className="px-2 py-1.5">
                      <Badge variant="outline" className={OUTCOME_BADGE[entry.outcome]}>
                        {entry.outcome}
                      </Badge>
                    </td>
                    <td className="px-2 py-1.5">{entry.staff || '—'}</td>
                    <td className="max-w-[180px] truncate px-2 py-1.5" title={text(entry.details?.sourceFileName)}>
                      {text(entry.details?.sourceFileName) || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
