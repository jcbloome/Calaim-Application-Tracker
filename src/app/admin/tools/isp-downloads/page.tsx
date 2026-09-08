'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ClipboardList, Loader2, X } from 'lucide-react';
import { useAuth } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

type DownloadLogEntry = {
  id: string;
  downloadName?: string;
  memberName: string;
  memberMrn?: string;
  memberClientId?: string;
  intakeId?: string;
  staffName: string;
  staffEmail: string;
  createdAt: string;
  archivedStoragePath?: string;
  packetPdfStoragePath?: string;
  rnRecommendedTier?: string;
  adminApprovedTier?: string;
  downloadCount?: number;
};

const clean = (value: unknown) => String(value || '').trim();

export default function IspDownloadsPage() {
  const auth = useAuth();
  const { toast } = useToast();
  const [logs, setLogs] = useState<DownloadLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyLogId, setBusyLogId] = useState('');
  const [search, setSearch] = useState('');
  const [staff, setStaff] = useState('');
  const [member, setMember] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showAllLogs, setShowAllLogs] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerTitle, setViewerTitle] = useState('');
  const [viewerUrl, setViewerUrl] = useState('');
  const [viewerLogId, setViewerLogId] = useState('');
  const [confirmDeleteEntry, setConfirmDeleteEntry] = useState<DownloadLogEntry | null>(null);

  const closeViewer = () => {
    setViewerOpen(false);
    setViewerTitle('');
    setViewerUrl((prev) => {
      if (prev.startsWith('blob:')) URL.revokeObjectURL(prev);
      return '';
    });
    setViewerLogId('');
  };

  const fileLabelForEntry = (entry: DownloadLogEntry) => {
    const name = clean(entry.downloadName);
    if (name) return name.endsWith('.pdf') ? name : `${name}.pdf`;
    const member = clean(entry.memberName) || 'Member';
    const mrn = clean(entry.memberMrn) || 'N/A';
    return `ISP, ${member}, ${mrn}.pdf`;
  };

  const fetchArchivedPdf = async (logId: string) => {
    const id = clean(logId);
    const user = auth.currentUser;
    if (!id) throw new Error('Missing download log id.');
    if (!user) throw new Error('You must be signed in.');
    const idToken = await user.getIdToken();
    const res = await fetch(`/api/alft/download-log?logId=${encodeURIComponent(id)}&format=file`, {
      headers: { Authorization: `Bearer ${idToken}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        String(
          body?.error ||
            'Archived ALFT download file not found. Download again from the ALFT tool to link it here.'
        )
      );
    }
    const blob = await res.blob();
    const headerName = clean(res.headers.get('X-Download-Name'));
    return { blob, headerName };
  };

  const loadLogs = async () => {
    const user = auth.currentUser;
    if (!user) return;
    setLoading(true);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/alft/download-log?limit=200', {
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
        title: 'Could not load ISP download logs',
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

  const filteredLogs = useMemo(() => {
    const searchQ = clean(search).toLowerCase();
    const staffQ = clean(staff).toLowerCase();
    const memberQ = clean(member).toLowerCase();
    const fromMs = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : 0;
    const toMs = toDate ? new Date(`${toDate}T23:59:59`).getTime() : 0;

    return logs.filter((entry) => {
      const haystack = [
        entry.downloadName,
        entry.memberName,
        entry.memberMrn,
        entry.memberClientId,
        entry.staffName,
        entry.staffEmail,
        entry.intakeId,
      ]
        .map((v) => clean(v).toLowerCase())
        .join(' ');
      if (searchQ && !haystack.includes(searchQ)) return false;
      if (staffQ && !`${clean(entry.staffName)} ${clean(entry.staffEmail)}`.toLowerCase().includes(staffQ)) {
        return false;
      }
      if (
        memberQ &&
        !`${clean(entry.memberName)} ${clean(entry.memberMrn)} ${clean(entry.memberClientId)}`
          .toLowerCase()
          .includes(memberQ)
      ) {
        return false;
      }
      const createdMs = entry.createdAt ? new Date(entry.createdAt).getTime() : 0;
      if (fromMs && (!createdMs || createdMs < fromMs)) return false;
      if (toMs && (!createdMs || createdMs > toMs)) return false;
      return true;
    });
  }, [logs, search, staff, member, fromDate, toDate]);

  const visibleLogs = useMemo(
    () => (showAllLogs ? filteredLogs : filteredLogs.slice(0, 10)),
    [filteredLogs, showAllLogs]
  );

  const handleView = async (entry: DownloadLogEntry) => {
    const id = clean(entry.id);
    if (!id) {
      toast({
        title: 'View failed',
        description: 'This download log is missing its id.',
        variant: 'destructive',
      });
      return;
    }
    setBusyLogId(`${id}:view`);
    try {
      const { blob, headerName } = await fetchArchivedPdf(id);
      const title = headerName || clean(entry.downloadName) || fileLabelForEntry(entry).replace(/\.pdf$/i, '');
      const url = URL.createObjectURL(blob);
      setViewerUrl((prev) => {
        if (prev.startsWith('blob:')) URL.revokeObjectURL(prev);
        return url;
      });
      setViewerTitle(title);
      setViewerLogId(id);
      setViewerOpen(true);
    } catch (error: any) {
      toast({
        title: 'View failed',
        description: String(
          error?.message || 'Could not open the archived ALFT download file linked to this record.'
        ),
        variant: 'destructive',
      });
    } finally {
      setBusyLogId('');
    }
  };

  /** Serve the original archived ALFT/Workflow download — does not create another log. */
  const handleDownloadExisting = async (logId: string, preferredName?: string) => {
    const id = clean(logId);
    if (!id) {
      toast({
        title: 'Download failed',
        description: 'Missing download log id.',
        variant: 'destructive',
      });
      return;
    }
    setBusyLogId(`${id}:download`);
    try {
      const { blob, headerName } = await fetchArchivedPdf(id);
      const fileBase = (preferredName || headerName || viewerTitle || 'ISP').replace(/\.pdf$/i, '');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileBase}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast({
        title: 'Download failed',
        description: String(
          error?.message || 'Could not download the archived ALFT file linked to this record.'
        ),
        variant: 'destructive',
      });
    } finally {
      setBusyLogId('');
    }
  };

  const confirmDeleteLogEntry = async () => {
    const entry = confirmDeleteEntry;
    if (!entry?.id) return;
    const user = auth.currentUser;
    if (!user) {
      toast({
        title: 'Delete failed',
        description: 'You must be signed in.',
        variant: 'destructive',
      });
      return;
    }
    setBusyLogId(`${entry.id}:delete`);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`/api/alft/download-log?logId=${encodeURIComponent(entry.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.success) {
        throw new Error(String(body?.error || 'Could not delete download record.'));
      }
      setConfirmDeleteEntry(null);
      if (viewerLogId === entry.id) closeViewer();
      toast({
        title: 'Download record deleted',
        description: entry.downloadName || entry.memberName || 'ISP download removed from the list.',
      });
      await loadLogs();
    } catch (error: any) {
      toast({
        title: 'Delete failed',
        description: String(error?.message || 'Could not delete download record.'),
        variant: 'destructive',
      });
    } finally {
      setBusyLogId('');
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>ISP Downloads Data Page</CardTitle>
              <CardDescription>
                Files archived from ALFT / ISP Workflow downloads. View and Download open that same linked PDF — they
                do not rebuild or create another log.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <Link href="/admin/tools/isp-workflow">ISP Workflow</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/admin/tools/isp-assignment">SW ISP Assignments</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/admin/tools/isp-tracker">
                  <ClipboardList className="mr-2 h-4 w-4" />
                  ISP Tracker
                </Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
            <Input placeholder="Search all fields" value={search} onChange={(e) => setSearch(e.target.value)} />
            <Input
              placeholder="Member name, MRN, or Client ID"
              value={member}
              onChange={(e) => setMember(e.target.value)}
            />
            <Input placeholder="Staff name or email" value={staff} onChange={(e) => setStaff(e.target.value)} />
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={() => void loadLogs()} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {loading ? 'Loading…' : 'Refresh'}
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
            <span className="text-sm text-muted-foreground">{filteredLogs.length} matching downloads</span>
          </div>

          <div className="space-y-2">
            {filteredLogs.length === 0 ? (
              <div className="rounded border border-dashed p-4 text-sm text-muted-foreground">
                No matching ISP download records.
              </div>
            ) : (
              visibleLogs.map((entry) => (
                <div key={entry.id} className="w-full rounded border p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium leading-tight">
                        {entry.downloadName || entry.memberName || 'Unknown member'}
                      </div>
                      <button
                        type="button"
                        className="mt-1 block max-w-full truncate text-left text-xs font-medium text-blue-700 underline-offset-2 hover:underline disabled:opacity-50"
                        title="Download the original ALFT archived PDF linked to this record"
                        disabled={busyLogId.startsWith(entry.id)}
                        onClick={() =>
                          void handleDownloadExisting(entry.id, clean(entry.downloadName) || fileLabelForEntry(entry))
                        }
                      >
                        {fileLabelForEntry(entry)}
                      </button>
                      <div className="mt-1 text-xs text-muted-foreground leading-tight">
                        {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : 'N/A'} ·{' '}
                        {entry.staffName || entry.staffEmail || 'Unknown staff'}
                        {entry.memberMrn ? ` · MRN ${entry.memberMrn}` : ''}
                        {Number(entry.downloadCount) > 1
                          ? ` · Downloaded ${Number(entry.downloadCount)} times`
                          : ''}
                      </div>
                      {entry.rnRecommendedTier || entry.adminApprovedTier ? (
                        <div className="mt-1 text-xs text-violet-900">
                          {entry.rnRecommendedTier ? `RN recommended: Tier ${entry.rnRecommendedTier}` : null}
                          {entry.rnRecommendedTier && entry.adminApprovedTier ? ' · ' : null}
                          {entry.adminApprovedTier ? `Admin approved: Tier ${entry.adminApprovedTier}` : null}
                          <span className="text-muted-foreground"> (log only — not in PDF)</span>
                        </div>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-2">
                        {entry.intakeId ? (
                          <Button size="sm" variant="link" className="h-auto p-0" asChild>
                            <Link href={`/admin/tools/isp-workflow?intakeId=${encodeURIComponent(entry.intakeId)}`}>
                              Open in Workflow
                            </Link>
                          </Button>
                        ) : null}
                        {entry.intakeId ? (
                          <Button size="sm" variant="link" className="h-auto p-0" asChild>
                            <Link href={`/admin/tools/isp-tracker`}>View in ISP Tracker</Link>
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void handleView(entry)}
                        disabled={busyLogId.startsWith(entry.id)}
                      >
                        {busyLogId === `${entry.id}:view` ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        View
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          void handleDownloadExisting(
                            entry.id,
                            clean(entry.downloadName) ||
                              `ISP, ${clean(entry.memberName) || 'Member'}, ${clean(entry.memberMrn) || 'N/A'}`
                          )
                        }
                        disabled={busyLogId.startsWith(entry.id)}
                        title="Download the archived file for this record (does not create a new log)"
                      >
                        {busyLogId === `${entry.id}:download` ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        Download
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setConfirmDeleteEntry(entry)}
                        disabled={busyLogId.startsWith(entry.id)}
                      >
                        {busyLogId === `${entry.id}:delete` ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {filteredLogs.length > 10 ? (
            <div className="flex items-center justify-between rounded border bg-muted/20 px-3 py-2 text-sm">
              <span className="text-muted-foreground">
                Showing {visibleLogs.length} of {filteredLogs.length} downloads
              </span>
              <Button type="button" variant="outline" size="sm" onClick={() => setShowAllLogs((prev) => !prev)}>
                {showAllLogs ? 'Show Last 10' : 'More (Open Entire Listing)'}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog
        open={viewerOpen}
        onOpenChange={(open) => {
          if (!open) closeViewer();
          else setViewerOpen(true);
        }}
      >
        <DialogContent className="max-w-5xl w-[95vw] h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-4 py-3 border-b shrink-0">
            <div className="flex items-start justify-between gap-3 pr-8">
              <div className="min-w-0">
                <DialogTitle className="truncate">{viewerTitle || 'ISP Packet'}</DialogTitle>
                <DialogDescription>Original archived PDF from ALFT / ISP Workflow download</DialogDescription>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {viewerLogId ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleDownloadExisting(viewerLogId, viewerTitle)}
                    disabled={busyLogId === `${viewerLogId}:download`}
                  >
                    {busyLogId === `${viewerLogId}:download` ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Download
                  </Button>
                ) : null}
                <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={closeViewer} title="Close">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>
          <div className="flex-1 min-h-0 bg-muted/30">
            {viewerUrl ? (
              <iframe title={viewerTitle || 'ISP Packet'} src={viewerUrl} className="h-full w-full border-0 bg-white" />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading form…</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {confirmDeleteEntry ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border bg-background p-4 shadow-lg">
            <h2 className="text-lg font-semibold">Delete download record?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This removes{' '}
              <span className="font-medium text-foreground">
                {confirmDeleteEntry.downloadName || confirmDeleteEntry.memberName || 'this ISP download'}
              </span>
              {confirmDeleteEntry.intakeId
                ? ' and any duplicate rows for the same form from the ISP Downloads list.'
                : ' from the ISP Downloads list.'}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmDeleteEntry(null)}
                disabled={busyLogId === `${confirmDeleteEntry.id}:delete`}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => void confirmDeleteLogEntry()}
                disabled={busyLogId === `${confirmDeleteEntry.id}:delete`}
              >
                {busyLogId === `${confirmDeleteEntry.id}:delete` ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Delete
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
