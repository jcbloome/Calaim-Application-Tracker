'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDownAZ,
  ArrowUpAZ,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  XCircle,
} from 'lucide-react';
import { useAuth } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';

type DocStatus = {
  key: string;
  label: string;
  present: boolean;
  source: string | null;
  fileName: string | null;
  pathwayAvailable: boolean;
};

type TrackerRow = {
  id: string;
  memberClientId: string;
  memberName: string;
  memberMrn: string;
  packageType: 'initial' | 'reassessment';
  placementType: 'rcfe' | 'home';
  status: string;
  homeVettedByIls: boolean;
  managerVerified: boolean;
  missingLabels: string[];
  missingCount: number;
  docsComplete: boolean;
  readyToSend: boolean;
  presentCount: number;
  docStatuses: DocStatus[];
  kaiserUserAssignment: string;
  staffName: string;
  staffEmail: string;
  applicationId: string | null;
  pathwayDocCount: number;
  fromPathwayCount: number;
  fromManualCount: number;
  fromAppDownloadCount: number;
  sentAt: string;
  updatedAt: string;
  checklistHref: string;
};

type ListSort =
  | 'name_asc'
  | 'name_desc'
  | 'missing_most'
  | 'missing_least'
  | 'updated_newest'
  | 'updated_oldest'
  | 'assignment_asc';

const clean = (value: unknown) => String(value || '').trim();

const lastNameKey = (name: string) => {
  const n = clean(name);
  if (!n) return '';
  if (n.includes(',')) return n.split(',')[0].trim().toLowerCase();
  const parts = n.split(/\s+/).filter(Boolean);
  return (parts[parts.length - 1] || '').toLowerCase();
};

const formatWhen = (iso: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
};

export default function IlsPackageTrackerPage() {
  const auth = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<TrackerRow[]>([]);
  const [counts, setCounts] = useState({ total: 0, missing: 0, ready: 0, sent: 0 });
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'open' | 'missing' | 'ready' | 'sent' | 'all'>('open');
  const [listSort, setListSort] = useState<ListSort>('missing_most');

  const loadRows = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return;
    setLoading(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/alft/cover-sheet-package/tracker?limit=200&status=all', {
        headers: { Authorization: `Bearer ${idToken}` },
        cache: 'no-store',
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.success) {
        throw new Error(String(body?.error || 'Failed to load tracker'));
      }
      setRows(Array.isArray(body.rows) ? (body.rows as TrackerRow[]) : []);
      setCounts(body.counts || { total: 0, missing: 0, ready: 0, sent: 0 });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Could not load ILS package tracker',
        description: String(error?.message || error),
      });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [auth.currentUser, toast]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const filteredRows = useMemo(() => {
    const q = clean(search).toLowerCase();
    let list = rows.filter((row) => {
      if (statusFilter === 'open' && row.status === 'sent') return false;
      if (statusFilter === 'missing' && row.missingCount <= 0) return false;
      if (statusFilter === 'ready' && !(row.readyToSend && row.status !== 'sent')) return false;
      if (statusFilter === 'sent' && row.status !== 'sent') return false;
      if (!q) return true;
      const hay = [
        row.memberName,
        row.memberMrn,
        row.memberClientId,
        row.kaiserUserAssignment,
        row.staffName,
        row.staffEmail,
        row.packageType,
        row.placementType,
        ...(row.missingLabels || []),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });

    const sorted = [...list];
    if (listSort === 'name_asc' || listSort === 'name_desc') {
      const dir = listSort === 'name_asc' ? 1 : -1;
      sorted.sort(
        (a, b) =>
          lastNameKey(a.memberName).localeCompare(lastNameKey(b.memberName)) * dir ||
          clean(a.memberName).localeCompare(clean(b.memberName)) * dir
      );
    } else if (listSort === 'missing_most' || listSort === 'missing_least') {
      const dir = listSort === 'missing_most' ? -1 : 1;
      sorted.sort(
        (a, b) =>
          (a.missingCount - b.missingCount) * dir ||
          lastNameKey(a.memberName).localeCompare(lastNameKey(b.memberName))
      );
    } else if (listSort === 'updated_newest' || listSort === 'updated_oldest') {
      const dir = listSort === 'updated_newest' ? -1 : 1;
      sorted.sort((a, b) => {
        const aMs = Date.parse(a.updatedAt) || 0;
        const bMs = Date.parse(b.updatedAt) || 0;
        if (aMs !== bMs) return (aMs - bMs) * dir;
        return lastNameKey(a.memberName).localeCompare(lastNameKey(b.memberName));
      });
    } else if (listSort === 'assignment_asc') {
      sorted.sort(
        (a, b) =>
          clean(a.kaiserUserAssignment).localeCompare(clean(b.kaiserUserAssignment)) ||
          lastNameKey(a.memberName).localeCompare(lastNameKey(b.memberName))
      );
    }
    return sorted;
  }, [rows, search, statusFilter, listSort]);

  return (
    <div className="container mx-auto max-w-[1200px] space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/tools/alft-cover-sheet-package">
            <FileText className="mr-2 h-4 w-4" />
            ILS Package Checklist
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/tools/isp-tracker">
            <ClipboardList className="mr-2 h-4 w-4" />
            ISP Tracker
          </Link>
        </Button>
        <Button variant="outline" size="sm" onClick={() => void loadRows()} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>ILS Package Checklist Tracker</CardTitle>
            <Badge variant="outline">Veronica send readiness</Badge>
          </div>
          <CardDescription className="mt-1.5">
            Shows what is still needed for each member package. Documents come from the application pathway when
            already uploaded, or from manual uploads on the ILS Package Checklist page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-700">
            <button
              type="button"
              onClick={() => setStatusFilter('open')}
              className={`rounded px-1.5 py-0.5 hover:bg-slate-100 ${
                statusFilter === 'open' ? 'bg-slate-100 font-semibold' : ''
              }`}
            >
              Open <span className="tabular-nums">{counts.total - counts.sent}</span>
            </button>
            <span className="text-slate-300">·</span>
            <button
              type="button"
              onClick={() => setStatusFilter('missing')}
              className={`rounded px-1.5 py-0.5 hover:bg-amber-50 ${
                statusFilter === 'missing' ? 'bg-amber-50 font-semibold text-amber-950' : ''
              }`}
            >
              Missing items <span className="tabular-nums">{counts.missing}</span>
            </button>
            <span className="text-slate-300">·</span>
            <button
              type="button"
              onClick={() => setStatusFilter('ready')}
              className={`rounded px-1.5 py-0.5 hover:bg-emerald-50 ${
                statusFilter === 'ready' ? 'bg-emerald-50 font-semibold text-emerald-950' : ''
              }`}
            >
              Ready <span className="tabular-nums">{counts.ready}</span>
            </button>
            <span className="text-slate-300">·</span>
            <button
              type="button"
              onClick={() => setStatusFilter('sent')}
              className={`rounded px-1.5 py-0.5 hover:bg-teal-50 ${
                statusFilter === 'sent' ? 'bg-teal-50 font-semibold text-teal-950' : ''
              }`}
            >
              Sent <span className="tabular-nums">{counts.sent}</span>
            </button>
            <span className="text-slate-300">·</span>
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`rounded px-1.5 py-0.5 hover:bg-slate-100 ${
                statusFilter === 'all' ? 'bg-slate-100 font-semibold' : ''
              }`}
            >
              All <span className="tabular-nums">{counts.total}</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[220px] flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search member, MRN, Kaiser_User_Assignment…"
                className="pl-9"
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5">
                  {listSort.includes('desc') || listSort === 'missing_most' || listSort === 'updated_newest' ? (
                    <ArrowUpAZ className="h-3.5 w-3.5" />
                  ) : (
                    <ArrowDownAZ className="h-3.5 w-3.5" />
                  )}
                  Sort
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>Sort list</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setListSort('missing_most')}>
                  Most items missing
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setListSort('missing_least')}>
                  Fewest items missing
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setListSort('name_asc')}>Name A–Z</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setListSort('name_desc')}>Name Z–A</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setListSort('assignment_asc')}>
                  Kaiser_User_Assignment A–Z
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setListSort('updated_newest')}>
                  Updated newest
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setListSort('updated_oldest')}>
                  Updated oldest
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <span className="text-sm text-muted-foreground">{filteredRows.length} packages</span>
          </div>

          {loading ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading packages…
            </div>
          ) : filteredRows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No packages match this filter. Open ILS Package Checklist to start one for a member.
            </p>
          ) : (
            <ul className="space-y-2">
              {filteredRows.map((row) => (
                <li key={row.id} className="rounded-md border bg-white px-3 py-3">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        {row.readyToSend ? (
                          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-label="Ready" />
                        ) : (
                          <XCircle className="h-5 w-5 shrink-0 text-amber-500" aria-label="Missing items" />
                        )}
                        <Link
                          href={row.checklistHref}
                          className="truncate text-base font-semibold text-slate-900 hover:underline"
                        >
                          {row.memberName}
                        </Link>
                        <Badge variant="outline" className="text-xs">
                          {row.packageType === 'initial' ? 'Initial' : 'Reauth'}
                        </Badge>
                        <Badge variant="outline" className="text-xs capitalize">
                          {row.placementType}
                        </Badge>
                        {row.status === 'sent' ? (
                          <Badge className="bg-teal-700 text-xs">Sent</Badge>
                        ) : row.readyToSend ? (
                          <Badge className="bg-emerald-700 text-xs">Ready</Badge>
                        ) : (
                          <Badge variant="outline" className="border-amber-400 bg-amber-50 text-xs text-amber-950">
                            {row.missingCount} needed
                          </Badge>
                        )}
                        <span className="text-sm text-muted-foreground">MRN {row.memberMrn || '—'}</span>
                      </div>

                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                        <span>
                          <span className="font-medium text-slate-700">Kaiser_User_Assignment:</span>{' '}
                          {row.kaiserUserAssignment || '—'}
                        </span>
                        {row.staffName ? <span>Prepared by {row.staffName}</span> : null}
                        {row.applicationId ? (
                          <Link
                            href={`/admin/applications/${encodeURIComponent(row.applicationId)}`}
                            className="text-blue-700 hover:underline"
                          >
                            Application pathway
                          </Link>
                        ) : null}
                        <span>Updated {formatWhen(row.updatedAt)}</span>
                      </div>

                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {row.docStatuses.map((doc) => (
                          <span
                            key={`${row.id}-${doc.key}`}
                            title={
                              doc.present
                                ? `${doc.label}: ${doc.fileName || 'on file'} (${doc.source || 'upload'})`
                                : doc.pathwayAvailable
                                  ? `${doc.label}: available on application pathway — open checklist to pull`
                                  : `${doc.label}: missing`
                            }
                            className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] ${
                              doc.present
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-950'
                                : doc.pathwayAvailable
                                  ? 'border-sky-300 bg-sky-50 text-sky-950'
                                  : 'border-amber-300 bg-amber-50 text-amber-950'
                            }`}
                          >
                            {doc.present ? (
                              <CheckCircle2 className="h-3 w-3" />
                            ) : (
                              <XCircle className="h-3 w-3" />
                            )}
                            {doc.label}
                          </span>
                        ))}
                        {row.placementType === 'home' ? (
                          <span
                            className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] ${
                              row.homeVettedByIls
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-950'
                                : 'border-amber-300 bg-amber-50 text-amber-950'
                            }`}
                          >
                            {row.homeVettedByIls ? (
                              <CheckCircle2 className="h-3 w-3" />
                            ) : (
                              <XCircle className="h-3 w-3" />
                            )}
                            Home vetted
                          </span>
                        ) : null}
                        <span
                          className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] ${
                            row.managerVerified
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-950'
                              : 'border-amber-300 bg-amber-50 text-amber-950'
                          }`}
                        >
                          {row.managerVerified ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : (
                            <XCircle className="h-3 w-3" />
                          )}
                          Manager verified
                        </span>
                      </div>

                      {row.missingLabels.length ? (
                        <div className="text-xs text-amber-900">
                          Still needed: {row.missingLabels.join(', ')}
                        </div>
                      ) : null}
                      <div className="text-[11px] text-muted-foreground">
                        Sources on file: pathway {row.fromPathwayCount} · app download {row.fromAppDownloadCount} ·
                        manual {row.fromManualCount}
                        {row.pathwayDocCount > 0
                          ? ` · ${row.pathwayDocCount} pathway upload(s) available to pull`
                          : ''}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" asChild>
                      <Link href={row.checklistHref}>
                        Open checklist
                        <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
