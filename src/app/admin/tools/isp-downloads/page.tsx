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

  const closeViewer = () => {
    setViewerOpen(false);
    setViewerTitle('');
    setViewerUrl('');
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
      const hay = [
        entry.downloadName,
        entry.memberName,
        entry.memberMrn,
        entry.memberClientId,
        entry.intakeId,
        entry.staffName,
        entry.staffEmail,
      ]
        .map((v) => clean(v).toLowerCase())
        .join(' ');
      if (searchQ && !hay.includes(searchQ)) return false;
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
      if (fromMs && createdMs && createdMs < fromMs) return false;
      if (toMs && createdMs && createdMs > toMs) return false;
      return true;
    });
  }, [logs, search, staff, member, fromDate, toDate]);

  const visibleLogs = useMemo(
    () => (showAllLogs ? filteredLogs : filteredLogs.slice(0, 10)),
    [filteredLogs, showAllLogs]
  );

  const handleView = async (entry: DownloadLogEntry) => {
    const intake = clean(entry.intakeId);
    if (!intake) {
      toast({
        title: 'View failed',
        description: 'This download log is missing its intake link.',
        variant: 'destructive',
      });
      return;
    }
    const dateLabel = (() => {
      const d = entry.createdAt ? new Date(entry.createdAt) : new Date();
      if (Number.isNaN(d.getTime())) {
        const now = new Date();
        return `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${now.getFullYear()}`;
      }
      return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${d.getFullYear()}`;
    })();
    const title =
      clean(entry.memberName) || clean(entry.downloadName)
        ? `ISP, ${clean(entry.memberName) || 'Member'}, ${clean(entry.memberMrn) || 'N/A'}, ${dateLabel}`
        : 'ISP';
    setViewerTitle(title);
    setViewerUrl(`/admin/alft-tracker/dummy-preview?view=print&intakeId=${encodeURIComponent(intake)}&embed=1`);
    setViewerOpen(true);
  };

  const handleDownload = async (entry: DownloadLogEntry) => {
    const intake = clean(entry.intakeId);
    if (!intake) {
      toast({
        title: 'Download failed',
        description: 'This download log is missing its intake link.',
        variant: 'destructive',
      });
      return;
    }
    setBusyLogId(`${entry.id}:download`);
    try {
      // Use the Kaiser printable ALFT layout PDF (same as in-app View/Print), then re-archive.
      const params = new URLSearchParams();
      params.set('view', 'pdf');
      params.set('intakeId', intake);
      params.set('autoDownload', '1');
      params.set('archive', '1');
      params.set('returnTo', '/admin/tools/isp-downloads');
      window.location.assign(`/admin/alft-tracker/dummy-preview?${params.toString()}`);
    } catch (error: any) {
      toast({
        title: 'Download failed',
        description: String(error?.message || 'Could not open Kaiser ALFT PDF download.'),
        variant: 'destructive',
      });
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
                Logged ISP / ALFT packet downloads from ISP Workflow. View or re-download archived PDFs.
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
                      <div className="mt-1 text-xs text-muted-foreground leading-tight">
                        {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : 'N/A'} ·{' '}
                        {entry.staffName || entry.staffEmail || 'Unknown staff'}
                        {entry.memberMrn ? ` · MRN ${entry.memberMrn}` : ''}
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
                            <Link href={`/admin/tools/isp-tracker`}>
                              View in ISP Tracker
                            </Link>
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
                        onClick={() => void handleDownload(entry)}
                        disabled={busyLogId.startsWith(entry.id)}
                      >
                        {busyLogId === `${entry.id}:download` ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        Download
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
                <DialogDescription>Kaiser ALFT printable form preview</DialogDescription>
              </div>
              <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={closeViewer} title="Close">
                <X className="h-4 w-4" />
              </Button>
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
    </div>
  );
}
