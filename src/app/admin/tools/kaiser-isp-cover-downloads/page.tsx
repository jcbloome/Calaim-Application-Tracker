'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

type DownloadLogEntry = {
  id: string;
  downloadName?: string;
  memberName: string;
  memberMrn?: string;
  memberClientId: string;
  coverPageType: string;
  staffName: string;
  staffEmail: string;
  createdAt: string;
  verified: boolean;
  archived?: boolean;
  archivedAt?: string;
  archivedStoragePath?: string;
  totalCostsFormat?: string;
  upgradedAt?: string;
  deleted?: boolean;
};

const clean = (value: unknown) => String(value || '').trim();
type CoverTypeFilter = 'all' | 'authorization' | 'reauthorization';

const normalizeCoverType = (coverPageType: string): Exclude<CoverTypeFilter, 'all'> =>
  clean(coverPageType).toLowerCase().includes('reauth') ? 'reauthorization' : 'authorization';

const toCoverTypeLabel = (coverPageType: string) =>
  normalizeCoverType(coverPageType) === 'reauthorization' ? 'Reauthorization' : 'Initial Authorization';

const coverTypeBadgeClass = (coverPageType: string) =>
  normalizeCoverType(coverPageType) === 'reauthorization'
    ? 'border-amber-300 bg-amber-100 text-amber-950'
    : 'border-sky-300 bg-sky-100 text-sky-950';

/** Local calendar date YYYY-MM-DD (for “today” filters). */
const localDateInputValue = (date = new Date()) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export default function KaiserIspCoverDownloadsPage() {
  const auth = useAuth();
  const { toast } = useToast();
  const [logs, setLogs] = useState<DownloadLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLogId, setSelectedLogId] = useState('');
  const [redownloadingLogId, setRedownloadingLogId] = useState('');
  const [viewingLogId, setViewingLogId] = useState('');
  const [deletingLogId, setDeletingLogId] = useState('');
  const [confirmDeleteEntry, setConfirmDeleteEntry] = useState<DownloadLogEntry | null>(null);
  /** In-page PDF viewer — avoids Chrome turning blob: URLs into a Google search. */
  const [viewerUrl, setViewerUrl] = useState('');
  const [viewerTitle, setViewerTitle] = useState('');
  const [viewerLogId, setViewerLogId] = useState('');
  const [search, setSearch] = useState('');
  const [staff, setStaff] = useState('');
  const [member, setMember] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [coverType, setCoverType] = useState<CoverTypeFilter>('all');
  const [showAllLogs, setShowAllLogs] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [isZipping, setIsZipping] = useState(false);

  const loadLogs = async (filterOverrides?: {
    search?: string;
    staff?: string;
    member?: string;
    fromDate?: string;
    toDate?: string;
    coverType?: CoverTypeFilter;
  }) => {
    const user = auth.currentUser;
    if (!user) return;
    setLoading(true);
    try {
      const idToken = await user.getIdToken();
      const params = new URLSearchParams();
      params.set('limit', '200');
      const nextSearch = clean(filterOverrides?.search ?? search);
      const nextStaff = clean(filterOverrides?.staff ?? staff);
      const nextMember = clean(filterOverrides?.member ?? member);
      const nextFrom = clean(filterOverrides?.fromDate ?? fromDate);
      const nextTo = clean(filterOverrides?.toDate ?? toDate);
      const nextCoverType = filterOverrides?.coverType ?? coverType;
      // Deep history scan when looking up a specific member / date (older reauths like Alcantar).
      if (nextSearch) params.set('search', nextSearch);
      if (nextStaff) params.set('staff', nextStaff);
      if (nextMember) params.set('member', nextMember);
      if (nextFrom) params.set('from', nextFrom);
      if (nextTo) params.set('to', nextTo);
      if (nextCoverType === 'authorization' || nextCoverType === 'reauthorization') {
        params.set('coverType', nextCoverType);
      }
      const response = await fetch(`/api/forms/kaiser-isp-cover-sheet/download-log?${params.toString()}`, {
        headers: { Authorization: `Bearer ${idToken}` },
        cache: 'no-store',
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.success) {
        throw new Error(String(body?.error || 'Failed to load download logs'));
      }
      setLogs(Array.isArray(body.logs) ? (body.logs as DownloadLogEntry[]) : []);
      setShowAllLogs(false);
    } catch (error: any) {
      toast({
        title: 'Could not load download logs',
        description: String(error?.message || 'Unknown error'),
        variant: 'destructive',
      });
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!auth.currentUser) return;
    void loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.currentUser?.uid]);

  useEffect(() => {
    if (!selectedLogId) return;
    if (!logs.some((entry) => entry.id === selectedLogId)) {
      setSelectedLogId('');
    }
  }, [logs, selectedLogId]);

  const selectedEntry = useMemo(
    () => logs.find((entry) => entry.id === selectedLogId) || null,
    [logs, selectedLogId]
  );
  const visibleLogs = useMemo(() => (showAllLogs ? logs : logs.slice(0, 10)), [logs, showAllLogs]);

  const canAccessArchive = (entry: DownloadLogEntry) =>
    Boolean(entry.archived) || Boolean(clean(entry.archivedStoragePath));

  const hasDateFilter = Boolean(clean(fromDate) || clean(toDate));
  const archivedMatchingLogs = useMemo(
    () => (hasDateFilter ? logs.filter((entry) => canAccessArchive(entry)) : []),
    [logs, hasDateFilter]
  );
  const needsUpgradeCount = useMemo(
    () =>
      archivedMatchingLogs.filter(
        (entry) => clean(entry.totalCostsFormat) !== 'room-board-then-kp-tier'
      ).length,
    [archivedMatchingLogs]
  );

  const applyTodayFilter = () => {
    const today = localDateInputValue();
    setFromDate(today);
    setToDate(today);
    setShowAllLogs(true);
    void loadLogs({ fromDate: today, toDate: today });
  };

  const runUpgrade = async (payload: Record<string, unknown>, emptyMessage: string) => {
    const user = auth.currentUser;
    if (!user) {
      toast({
        title: 'Sign-in required',
        description: 'Please sign in again before upgrading.',
        variant: 'destructive',
      });
      return;
    }
    setIsUpgrading(true);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/forms/kaiser-isp-cover-sheet/download-log/upgrade', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.success) {
        throw new Error(String(body?.error || `Upgrade failed (HTTP ${response.status})`));
      }
      const upgraded = Number(body.upgraded || 0);
      const failed = Number(body.failed || 0);
      const stillZero = Number(body.stillZero || 0);
      const total = Number(body.total || 0);
      if (!total) {
        toast({ title: 'Nothing to upgrade', description: emptyMessage });
        return;
      }
      const sample = Array.isArray(body.results)
        ? body.results.find((row: any) => row?.ok && row?.authTotal && row.authTotal !== '$0.00')
        : null;
      toast({
        title: `Upgraded ${upgraded} cover sheet${upgraded === 1 ? '' : 's'}`,
        description: [
          failed > 0 ? `${failed} failed.` : null,
          stillZero > 0
            ? `${stillZero} still show $0.00 (no room & board on PDF or in Caspio).`
            : sample?.authTotal
              ? `Example Total Costs: ${sample.authTotal}. Re-download or ZIP to get the updated files.`
              : 'Re-download or ZIP to get the updated files.',
        ]
          .filter(Boolean)
          .join(' '),
      });
      await loadLogs();
    } catch (error: any) {
      toast({
        title: 'Upgrade failed',
        description: String(error?.message || 'Could not upgrade cover sheets'),
        variant: 'destructive',
      });
    } finally {
      setIsUpgrading(false);
    }
  };

  const handleUpgradeMatching = async () => {
    if (!archivedMatchingLogs.length) {
      toast({
        title: 'Nothing to upgrade',
        description: 'Load matching archived downloads first (try Today).',
        variant: 'destructive',
      });
      return;
    }
    await runUpgrade(
      { logIds: archivedMatchingLogs.map((entry) => entry.id) },
      'No archived cover sheets in this date range need the room & board Total Costs format.'
    );
  };

  const handleUpgradeAllFinished = async () => {
    const confirmed = window.confirm(
      'Upgrade all finished (archived) Kaiser cover sheets so Auto Calculated Total Costs includes room & board?\n\nAlready-upgraded files are skipped. This may take a few minutes.'
    );
    if (!confirmed) return;
    await runUpgrade(
      // force: rewrite even previously upgraded files so older-template fields (Text10/Text3) get room & board totals.
      { allFinished: true, force: true, limit: 2000 },
      'All finished cover sheets already use the room & board Total Costs format.'
    );
  };

  const handleDownloadZipForIls = async () => {
    const user = auth.currentUser;
    if (!user) {
      toast({
        title: 'Sign-in required',
        description: 'Please sign in again before downloading.',
        variant: 'destructive',
      });
      return;
    }
    if (!archivedMatchingLogs.length) {
      toast({
        title: 'Nothing to zip',
        description: 'Load matching archived downloads first (try Today).',
        variant: 'destructive',
      });
      return;
    }
    setIsZipping(true);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/forms/kaiser-isp-cover-sheet/download-log/zip', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          logIds: archivedMatchingLogs.map((entry) => entry.id),
          from: clean(fromDate) || undefined,
          to: clean(toDate) || undefined,
        }),
      });
      const contentType = String(response.headers.get('content-type') || '');
      if (!response.ok) {
        const body = contentType.includes('application/json')
          ? await response.json().catch(() => ({}))
          : {};
        throw new Error(String((body as any)?.error || `ZIP failed (HTTP ${response.status})`));
      }
      const blob = await response.blob();
      const headerName = response.headers.get('content-disposition') || '';
      const match = headerName.match(/filename="([^"]+)"/i);
      const fileName =
        clean(match?.[1]) ||
        `Kaiser Cover Sheets for ILS ${clean(fromDate) || localDateInputValue()}.zip`;
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
      toast({
        title: 'ZIP download started',
        description: `${archivedMatchingLogs.length} cover sheet${archivedMatchingLogs.length === 1 ? '' : 's'} for ILS`,
      });
    } catch (error: any) {
      toast({
        title: 'ZIP download failed',
        description: String(error?.message || 'Could not build ZIP'),
        variant: 'destructive',
      });
    } finally {
      setIsZipping(false);
    }
  };

  const fetchArchiveBlob = async (entry: DownloadLogEntry, format: 'file' | 'view') => {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('Please sign in again before opening this file.');
    }
    if (!canAccessArchive(entry)) {
      throw new Error('This form has not finished archiving yet. Re-generate the Kaiser cover sheet first.');
    }

    const idToken = await user.getIdToken();
    const response = await fetch(
      `/api/forms/kaiser-isp-cover-sheet/download-log/redownload?logId=${encodeURIComponent(entry.id)}&format=${format}`,
      {
        headers: { Authorization: `Bearer ${idToken}` },
        cache: 'no-store',
      }
    );

    const contentType = String(response.headers.get('content-type') || '');
    if (!response.ok) {
      const body = contentType.includes('application/json')
        ? await response.json().catch(() => ({}))
        : {};
      throw new Error(String((body as any)?.error || `Failed to open archived file (HTTP ${response.status})`));
    }

    const blob = await response.blob();
    if (!blob || blob.size === 0) {
      throw new Error('Archived file was empty.');
    }

    const headerName = response.headers.get('content-disposition') || '';
    const match = headerName.match(/filename="([^"]+)"/i);
    const fileName =
      clean(match?.[1]) ||
      `${clean(entry.downloadName) || clean(entry.memberName) || 'Kaiser Cover Sheet'}.pdf`;

    return { blob, fileName };
  };

  useEffect(() => {
    return () => {
      setViewerUrl((prev) => {
        if (prev.startsWith('blob:')) URL.revokeObjectURL(prev);
        return '';
      });
    };
  }, []);

  const handleRedownloadArchivedCopy = async (entry: DownloadLogEntry) => {
    if (!entry?.id) return;
    setRedownloadingLogId(entry.id);
    try {
      const { blob, fileName } = await fetchArchiveBlob(entry, 'file');
      const pdfBlob =
        blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' });
      const objectUrl = URL.createObjectURL(pdfBlob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
      toast({
        title: 'Download started',
        description: fileName,
      });
    } catch (error: any) {
      toast({
        title: 'Download failed',
        description: String(error?.message || 'Could not download archived copy.'),
        variant: 'destructive',
      });
    } finally {
      setRedownloadingLogId('');
    }
  };

  const closePdfViewer = () => {
    setViewerUrl((prev) => {
      if (prev.startsWith('blob:')) URL.revokeObjectURL(prev);
      return '';
    });
    setViewerTitle('');
    setViewerLogId('');
  };

  const handleViewArchivedCopy = async (entry: DownloadLogEntry) => {
    if (!entry?.id) return;
    setViewingLogId(entry.id);
    try {
      const { blob, fileName } = await fetchArchiveBlob(entry, 'view');
      // Force PDF MIME so the browser viewer opens the cover sheet, not a search/download guess.
      const pdfBlob =
        blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' });
      const objectUrl = URL.createObjectURL(pdfBlob);
      setViewerUrl((prev) => {
        if (prev.startsWith('blob:')) URL.revokeObjectURL(prev);
        return objectUrl;
      });
      setViewerTitle(fileName);
      setViewerLogId(entry.id);
      toast({
        title: 'Opening cover sheet',
        description: fileName,
      });
    } catch (error: any) {
      toast({
        title: 'View failed',
        description: String(error?.message || 'Could not open archived copy.'),
        variant: 'destructive',
      });
    } finally {
      setViewingLogId('');
    }
  };

  const deleteLogById = async (logId: string, idToken: string) => {
    const response = await fetch(
      `/api/forms/kaiser-isp-cover-sheet/download-log?logId=${encodeURIComponent(logId)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${idToken}` },
        cache: 'no-store',
      }
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body?.success) {
      throw new Error(String(body?.error || 'Failed to delete download record'));
    }
  };

  const handleDeleteLogEntry = async (entry: DownloadLogEntry) => {
    if (!entry?.id) return;
    setConfirmDeleteEntry(entry);
  };

  const confirmDeleteLogEntry = async () => {
    const entry = confirmDeleteEntry;
    if (!entry?.id) return;
    const user = auth.currentUser;
    if (!user) {
      toast({
        title: 'Sign-in required',
        description: 'Please sign in again before deleting.',
        variant: 'destructive',
      });
      return;
    }

    setDeletingLogId(entry.id);
    try {
      const idToken = await user.getIdToken();
      await deleteLogById(entry.id, idToken);
      setLogs((prev) => prev.filter((log) => log.id !== entry.id));
      if (selectedLogId === entry.id) setSelectedLogId('');
      setConfirmDeleteEntry(null);
      toast({
        title: 'Download record deleted',
        description: 'The delete action was logged in global activity.',
      });
    } catch (error: any) {
      toast({
        title: 'Delete failed',
        description: String(error?.message || 'Could not delete selected download record'),
        variant: 'destructive',
      });
    } finally {
      setDeletingLogId('');
    }
  };

  const hasActiveFilters = Boolean(
    clean(search) ||
      clean(staff) ||
      clean(member) ||
      clean(fromDate) ||
      clean(toDate) ||
      coverType !== 'all'
  );
  const resultsLabel = useMemo(() => {
    if (loading) return 'Loading…';
    if (!logs.length) return 'No downloads found';
    if (!hasActiveFilters && !showAllLogs) {
      return `Last ${Math.min(10, logs.length)} downloads`;
    }
    if (!showAllLogs && logs.length > 10) {
      return `Showing last 10 of ${logs.length} matching downloads`;
    }
    return `${logs.length} matching download${logs.length === 1 ? '' : 's'}`;
  }, [loading, logs.length, hasActiveFilters, showAllLogs]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Kaiser Cover Sheet Downloads</CardTitle>
          <CardDescription>
            Recent Kaiser cover sheet downloads appear below (last 10). Search by member, date, staff, or cover
            type (Initial vs Reauthorization). Use View / Download for one PDF, or upgrade matching results and
            ZIP them for ILS.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-3 space-y-2">
            <div className="text-sm font-medium text-emerald-950">Send cover sheets to ILS</div>
            <p className="text-xs text-emerald-900/80">
              Upgrade finished/archived PDFs so KP Tier Level is{' '}
              <span className="font-medium">Select from drop down + Tier 1–5</span> (never Yes/No), and{' '}
              <span className="font-medium">Auto Calculated Total Costs</span> starts with member room &amp; board
              (KP tier adds in Acrobat). Use date range for a batch + ZIP, or upgrade every finished cover sheet
              that still needs it.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={applyTodayFilter} disabled={loading}>
                Today&apos;s covers
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void handleUpgradeAllFinished()}
                disabled={loading || isUpgrading}
                title="Upgrade all archived cover sheets that are not yet on room & board Total Costs"
              >
                {isUpgrading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Upgrade all finished cover sheets
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleUpgradeMatching()}
                disabled={loading || isUpgrading || !hasDateFilter || !archivedMatchingLogs.length}
                title={
                  !hasDateFilter
                    ? 'Set a date range (or click Today’s covers) first'
                    : 'Rewrite Total Costs on archived PDFs to room & board first'
                }
              >
                {isUpgrading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Upgrade matching dates
                {needsUpgradeCount ? ` (${needsUpgradeCount})` : ''}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void handleDownloadZipForIls()}
                disabled={loading || isZipping || !hasDateFilter || !archivedMatchingLogs.length}
                title={
                  !hasDateFilter
                    ? 'Set a date range (or click Today’s covers) first'
                    : 'Download all matching archived cover sheets as one ZIP'
                }
              >
                {isZipping ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Download all as ZIP for ILS
                {archivedMatchingLogs.length ? ` (${archivedMatchingLogs.length})` : ''}
              </Button>
            </div>
            {hasDateFilter && !loading ? (
              <div className="text-xs text-emerald-900/70">
                {archivedMatchingLogs.length
                  ? `${archivedMatchingLogs.length} archived cover sheet${archivedMatchingLogs.length === 1 ? '' : 's'} in this date range ready for upgrade / ZIP.`
                  : 'No archived cover sheets in this date range yet.'}
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            <Input
              placeholder="Search all fields"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Input
              placeholder="Member name or Client_ID2"
              value={member}
              onChange={(event) => setMember(event.target.value)}
            />
            <Input
              placeholder="Staff name or email"
              value={staff}
              onChange={(event) => setStaff(event.target.value)}
            />
            <select
              aria-label="Cover type"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={coverType}
              onChange={(event) => setCoverType(event.target.value as CoverTypeFilter)}
            >
              <option value="all">All cover types</option>
              <option value="authorization">Initial Authorization</option>
              <option value="reauthorization">Reauthorization</option>
            </select>
            <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
            <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={() => void loadLogs()} disabled={loading}>
              {loading ? 'Loading...' : 'Search'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSearch('');
                setStaff('');
                setMember('');
                setFromDate('');
                setToDate('');
                setCoverType('all');
                setShowAllLogs(false);
                void loadLogs({
                  search: '',
                  staff: '',
                  member: '',
                  fromDate: '',
                  toDate: '',
                  coverType: 'all',
                });
              }}
              disabled={loading}
            >
              Clear Filters
            </Button>
            <span className="text-sm text-muted-foreground">{resultsLabel}</span>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium text-slate-800">
              {!hasActiveFilters && !showAllLogs ? 'Last 10 downloads' : 'Download results'}
            </div>
            {logs.length === 0 ? (
              <div className="rounded border border-dashed p-4 text-sm text-muted-foreground">
                No matching download records.
              </div>
            ) : (
              visibleLogs.map((entry) => (
                <div
                  key={entry.id}
                  className={`w-full rounded border p-3 text-left text-sm ${
                    selectedLogId === entry.id
                      ? 'border-blue-500 bg-blue-50'
                      : normalizeCoverType(clean(entry.coverPageType)) === 'reauthorization'
                        ? 'border-amber-200 hover:bg-amber-50/40'
                        : 'border-sky-200 hover:bg-sky-50/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedLogId(entry.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="font-medium leading-tight">
                        {entry.downloadName || entry.memberName || 'Unknown member'}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground leading-tight">
                        <span>
                          {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : 'N/A'}
                        </span>
                        <Badge
                          variant="outline"
                          className={coverTypeBadgeClass(clean(entry.coverPageType))}
                        >
                          {toCoverTypeLabel(clean(entry.coverPageType))}
                        </Badge>
                        <span>{entry.staffName || entry.staffEmail || 'Unknown staff'}</span>
                      </div>
                    </button>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void handleViewArchivedCopy(entry)}
                        disabled={viewingLogId === entry.id || redownloadingLogId === entry.id}
                      >
                        {viewingLogId === entry.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        View
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void handleRedownloadArchivedCopy(entry)}
                        disabled={redownloadingLogId === entry.id || viewingLogId === entry.id}
                      >
                        {redownloadingLogId === entry.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Download
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => void handleDeleteLogEntry(entry)}
                        disabled={deletingLogId === entry.id}
                      >
                        {deletingLogId === entry.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          {logs.length > 10 ? (
            <div className="flex items-center justify-between rounded border bg-muted/20 px-3 py-2 text-sm">
              <span className="text-muted-foreground">
                Showing {visibleLogs.length} of {logs.length} downloads
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowAllLogs((prev) => !prev)}
              >
                {showAllLogs ? 'Show last 10' : 'Show all matching'}
              </Button>
            </div>
          ) : null}

          {selectedEntry ? (
            <Card className="border-blue-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Selected Download</CardTitle>
                <CardDescription>Open details or re-download archived copy.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="font-medium">
                  {selectedEntry.downloadName || selectedEntry.memberName || 'Unknown member'}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>Client_ID2: {selectedEntry.memberClientId || 'N/A'}</span>
                  <Badge
                    variant="outline"
                    className={coverTypeBadgeClass(clean(selectedEntry.coverPageType))}
                  >
                    {toCoverTypeLabel(clean(selectedEntry.coverPageType))}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  Staff: {selectedEntry.staffName || selectedEntry.staffEmail || 'Unknown'} ·{' '}
                  {selectedEntry.createdAt ? new Date(selectedEntry.createdAt).toLocaleString() : 'N/A'}
                </div>
                <div className="text-xs text-muted-foreground">
                  Verified: {selectedEntry.verified ? 'Yes' : 'No'} · Archived: {selectedEntry.archived ? 'Yes' : 'No'}
                  {selectedEntry.archivedAt
                    ? ` · Archived at ${new Date(selectedEntry.archivedAt).toLocaleString()}`
                    : ''}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleViewArchivedCopy(selectedEntry)}
                    disabled={viewingLogId === selectedEntry.id || redownloadingLogId === selectedEntry.id}
                  >
                    {viewingLogId === selectedEntry.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    View PDF
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleRedownloadArchivedCopy(selectedEntry)}
                    disabled={redownloadingLogId === selectedEntry.id || viewingLogId === selectedEntry.id}
                  >
                    {redownloadingLogId === selectedEntry.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Download PDF
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => void handleDeleteLogEntry(selectedEntry)}
                    disabled={deletingLogId === selectedEntry.id}
                  >
                    {deletingLogId === selectedEntry.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Delete record
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </CardContent>
      </Card>

      {confirmDeleteEntry ? (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-lg border bg-background p-6 shadow-2xl">
            <h2 className="text-lg font-semibold">Delete download record?</h2>
            <p className="mt-2 text-sm text-muted-foreground break-words">
              {confirmDeleteEntry.downloadName || confirmDeleteEntry.memberName || 'Selected record'}
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={Boolean(deletingLogId)}
                onClick={() => setConfirmDeleteEntry(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={Boolean(deletingLogId)}
                onClick={() => void confirmDeleteLogEntry()}
              >
                {deletingLogId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Delete
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {viewerUrl ? (
        <div className="fixed inset-0 z-[280] flex flex-col bg-black/70 p-3 sm:p-6">
          <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-lg border bg-background shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{viewerTitle || 'Kaiser cover sheet'}</div>
                <div className="text-xs text-muted-foreground">Cover sheet PDF preview</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!viewerLogId || redownloadingLogId === viewerLogId}
                  onClick={() => {
                    const entry = logs.find((row) => row.id === viewerLogId);
                    if (entry) void handleRedownloadArchivedCopy(entry);
                  }}
                >
                  {redownloadingLogId === viewerLogId ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Download
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={closePdfViewer}>
                  Close
                </Button>
              </div>
            </div>
            <iframe
              title={viewerTitle || 'Kaiser cover sheet PDF'}
              src={viewerUrl}
              className="h-full w-full flex-1 bg-slate-100"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

