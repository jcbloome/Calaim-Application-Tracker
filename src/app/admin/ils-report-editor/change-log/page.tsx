'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { useAdmin } from '@/hooks/use-admin';
import { useAuth } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

interface IlsChangeLogRow {
  id: string;
  memberName: string;
  clientId2?: string;
  queue: string;
  changes?: Record<string, any>;
  changedByEmail?: string;
  createdAtIso?: string;
  dateKey?: string;
}

export default function IlsChangeLogPage() {
  const { isAdmin, isLoading: isAdminLoading } = useAdmin();
  const auth = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [rows, setRows] = useState<IlsChangeLogRow[]>([]);
  const [search, setSearch] = useState('');

  const loadAllChanges = async () => {
    try {
      if (!auth?.currentUser) return;
      setIsLoading(true);
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/ils-change-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, action: 'list', limit: 1000 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Failed to load ILS changes');
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (e: any) {
      toast({
        title: 'Load failed',
        description: e?.message || 'Could not load ILS change log.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAllChanges().catch(() => {});
  }, [auth?.currentUser?.uid]);

  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const name = String(r.memberName || '').toLowerCase();
      const client = String(r.clientId2 || '').toLowerCase();
      const queue = String(r.queue || '').toLowerCase();
      const changedBy = String(r.changedByEmail || '').toLowerCase();
      return name.includes(q) || client.includes(q) || queue.includes(q) || changedBy.includes(q);
    });
  }, [rows, search]);

  const todayRows = filtered.filter((r) => String(r.dateKey || '').trim() === todayKey);

  if (isAdminLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>You need administrator access to view the ILS change log.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">ILS Change Log</h1>
          <p className="text-sm text-muted-foreground">Track daily and historical ILS updates for Tier and RCFE contract milestones.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button variant="outline" asChild className="w-full sm:w-auto">
            <Link href="/admin/ils-report-editor">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to ILS Member Requests
            </Link>
          </Button>
          <Button variant="outline" onClick={() => void loadAllChanges()} disabled={isLoading} className="w-full sm:w-auto">
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Search by member name, client ID, queue, or updated-by email.</CardDescription>
        </CardHeader>
        <CardContent>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search change log..." />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Today</CardTitle>
            <CardDescription>{todayRows.length} change(s) on {todayKey}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{todayRows.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>All Time</CardTitle>
            <CardDescription>Total historical ILS changes tracked</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filtered.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Changes</CardTitle>
          <CardDescription>Newest first. Includes daily updates and full history.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading changes...</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-muted-foreground">No changes found.</div>
          ) : (
            <div className="space-y-2">
              {filtered.map((row) => {
                const queueLabel =
                  row.queue === 'tier_level_requested'
                    ? 'Tier Level Requested'
                    : row.queue === 'rb_sent_pending_ils_contract'
                      ? 'R & B Sent Pending ILS Contract'
                      : row.queue || 'Unknown';
                const changedAt = row.createdAtIso ? new Date(row.createdAtIso) : null;
                return (
                  <div key={row.id} className="rounded-md border p-2">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-sm font-medium truncate">
                        {row.memberName || 'Member'} {row.clientId2 ? <span className="text-muted-foreground">({row.clientId2})</span> : null}
                      </div>
                      <div className="text-xs text-muted-foreground">{changedAt ? changedAt.toLocaleString() : '—'}</div>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Queue: {queueLabel}</div>
                    <div className="text-xs mt-1">
                      {Object.entries(row.changes || {}).map(([k, v]) => (
                        <span key={`${row.id}-${k}`} className="mr-3 inline-block">
                          <span className="text-muted-foreground">{k}:</span> <span className="font-mono">{String(v || 'cleared')}</span>
                        </span>
                      ))}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">By: {row.changedByEmail || 'Unknown'}</div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

