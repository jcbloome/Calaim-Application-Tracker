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
  const [deletingLogId, setDeletingLogId] = useState('');
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

  const handleRedownloadArchivedCopy = async (entry: DownloadLogEntry) => {
    if (!entry?.id) return;
    if (!entry.archived) {
      toast({
        title: 'Archive pending',
        description: 'This form has not finished archiving yet.',
      });
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      toast({
        title: 'Sign-in required',
        description: 'Please sign in again before re-downloading.',
        variant: 'destructive',
      });
      return;
    }

    setRedownloadingLogId(entry.id);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch(
        `/api/forms/kaiser-isp-cover-sheet/download-log/redownload?logId=${encodeURIComponent(entry.id)}`,
        {
          headers: { Authorization: `Bearer ${idToken}` },
          cache: 'no-store',
        }
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.success || !clean(body?.url)) {
        throw new Error(String(body?.error || 'Failed to create archived download link'));
      }
      const anchor = document.createElement('a');
      anchor.href = String(body.url);
      if (clean(body?.fileName)) {
        anchor.download = clean(body.fileName);
      }
      anchor.rel = 'noopener noreferrer';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      toast({
        title: 'Archive download started',
        description: 'The archived ISP cover file is downloading now.',
      });
    } catch (error: any) {
      toast({
        title: 'Re-download failed',
        description: String(error?.message || 'Could not open archived copy.'),
        variant: 'destructive',
      });
    } finally {
      setRedownloadingLogId('');
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
    const confirmed = window.confirm(
      `Delete this download record?\n\n${entry.downloadName || entry.memberName || 'Selected record'}`
    );
    if (!confirmed) return;
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
          <CardTitle>ISP Cover Downloads Page</CardTitle>
          <CardDescription>
            Search downloaded ISP cover sheets by member, date, and staff. Archived copy downloads now start directly from this page (no new tab required).
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
                        onClick={() => void handleRedownloadArchivedCopy(entry)}
                        disabled={!entry.archived || redownloadingLogId === entry.id}
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
                    onClick={() => handleRedownloadArchivedCopy(selectedEntry)}
                    disabled={!selectedEntry.archived || redownloadingLogId === selectedEntry.id}
                  >
                    {redownloadingLogId === selectedEntry.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Re-download archived copy
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
    </div>
  );
}

