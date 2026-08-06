'use client';

import { useEffect, useMemo, useState } from 'react';
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
};

const clean = (value: unknown) => String(value || '').trim();

export default function KaiserIspCoverDownloadsPage() {
  const auth = useAuth();
  const { toast } = useToast();
  const [logs, setLogs] = useState<DownloadLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [staff, setStaff] = useState('');
  const [member, setMember] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

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

  const resultsLabel = useMemo(() => `${logs.length} matching downloads`, [logs.length]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>ISP Cover Downloads Page</CardTitle>
          <CardDescription>Search downloaded ISP cover sheets by member, date, and staff.</CardDescription>
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
              logs.map((entry) => (
                <div key={entry.id} className="rounded border p-3 text-sm">
                  <div className="font-medium">{entry.downloadName || entry.memberName || 'Unknown member'}</div>
                  <div className="text-xs text-muted-foreground">
                    Client_ID2: {entry.memberClientId || 'N/A'} ·{' '}
                    {entry.coverPageType === 'reauthorization' ? 'Reauthorization' : 'Authorization'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Staff: {entry.staffName || entry.staffEmail || 'Unknown'} ·{' '}
                    {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : 'N/A'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Verified: {entry.verified ? 'Yes' : 'No'} · Archived: {entry.archived ? 'Yes' : 'No'}
                    {entry.archivedAt ? ` · Archived at ${new Date(entry.archivedAt).toLocaleString()}` : ''}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

