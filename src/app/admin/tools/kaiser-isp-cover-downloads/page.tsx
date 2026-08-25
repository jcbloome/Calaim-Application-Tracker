'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
  deleted?: boolean;
};

const clean = (value: unknown) => String(value || '').trim();
const toCoverTypeLabel = (coverPageType: string) =>
  coverPageType === 'reauthorization' ? 'Reauthorization' : 'Initial Authorization';

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
  const [search, setSearch] = useState('');
  const [staff, setStaff] = useState('');
  const [member, setMember] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showAllLogs, setShowAllLogs] = useState(false);

  const loadLogs = async () => {
    const user = auth.currentUser;
    if (!user) return;
    setLoading(true);
    try {
      const idToken = await user.getIdToken();
      const params = new URLSearchParams();
      params.set('limit', '200');
      if (clean(search)) params.set('search', clean(search));
      if (clean(staff)) params.set('staff', clean(staff));
      if (clean(member)) params.set('member', clean(member));
      if (clean(fromDate)) params.set('from', clean(fromDate));
      if (clean(toDate)) params.set('to', clean(toDate));
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

  const fetchArchiveBlob = async (entry: DownloadLogEntry, format: 'file' | 'view') => {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('Please sign in again before opening this file.');
    }
    if (!canAccessArchive(entry)) {
      throw new Error('This form has not finished archiving yet. Re-generate the ALFT cover sheet first.');
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
      `${clean(entry.downloadName) || clean(entry.memberName) || 'ALFT Cover Sheet'}.pdf`;

    return { blob, fileName };
  };

  const handleRedownloadArchivedCopy = async (entry: DownloadLogEntry) => {
    if (!entry?.id) return;
    setRedownloadingLogId(entry.id);
    try {
      const { blob, fileName } = await fetchArchiveBlob(entry, 'file');
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = fileName;
      anchor.rel = 'noopener noreferrer';
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

  const handleViewArchivedCopy = async (entry: DownloadLogEntry) => {
    if (!entry?.id) return;
    setViewingLogId(entry.id);
    try {
      const { blob, fileName } = await fetchArchiveBlob(entry, 'view');
      const objectUrl = URL.createObjectURL(blob);
      const opened = window.open(objectUrl, '_blank', 'noopener,noreferrer');
      if (!opened) {
        // Popup blocked — fall back to download.
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        toast({
          title: 'Popup blocked',
          description: 'Opened as a download instead so you can still view the PDF.',
        });
      } else {
        toast({
          title: 'Opening PDF',
          description: fileName,
        });
      }
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 120_000);
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

  const resultsLabel = useMemo(() => `${logs.length} matching downloads`, [logs.length]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>ALFT Cover Downloads Page</CardTitle>
          <CardDescription>
            Search downloaded ALFT cover sheets by member, date, and staff. Use View to open the archived PDF or Download to save it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
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
              }}
              disabled={loading}
            >
              Clear Filters
            </Button>
            <span className="text-sm text-muted-foreground">{resultsLabel}</span>
          </div>

          <div className="space-y-2">
            {logs.length === 0 ? (
              <div className="rounded border border-dashed p-4 text-sm text-muted-foreground">
                No matching download records.
              </div>
            ) : (
              visibleLogs.map((entry) => (
                <div
                  key={entry.id}
                  className={`w-full rounded border p-3 text-left text-sm ${
                    selectedLogId === entry.id ? 'border-blue-500 bg-blue-50' : 'hover:bg-muted/30'
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
                      <div className="mt-1 text-xs text-muted-foreground leading-tight">
                        {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : 'N/A'} ·{' '}
                        {toCoverTypeLabel(clean(entry.coverPageType))} ·{' '}
                        {entry.staffName || entry.staffEmail || 'Unknown staff'}
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
                {showAllLogs ? 'Show Last 10' : 'More (Open Entire Listing)'}
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
                <div className="text-xs text-muted-foreground">
                  Client_ID2: {selectedEntry.memberClientId || 'N/A'} ·{' '}
                  {toCoverTypeLabel(clean(selectedEntry.coverPageType))}
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
    </div>
  );
}

