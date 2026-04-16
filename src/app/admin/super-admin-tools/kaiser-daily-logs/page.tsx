'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdmin } from '@/hooks/use-admin';
import { useAuth } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type DailyLogRow = {
  id: string;
  dateKey: string;
  staffName: string;
  submittedByName?: string;
  submittedByEmail?: string;
  submittedAt?: string;
  metrics?: {
    totalAssigned: number;
    activeAssigned: number;
    passiveAssigned: number;
    noActionTotal: number;
    noActionCritical: number;
    noActionPriority: number;
    notesTodayCount: number;
  };
  dayComparison?: {
    startOfDay?: Record<string, number>;
    endOfDay?: Record<string, number>;
    delta?: Record<string, number>;
  };
  todayNotes?: Array<{
    id: string;
    memberName: string;
    clientId2: string;
    createdAt: string;
    createdByName: string;
    noteText: string;
    source: string;
  }>;
  kaiserStatusChangesToday?: Array<{
    id: string;
    memberName: string;
    clientId2: string;
    oldStatus: string;
    newStatus: string;
    timestamp: string;
    changedByName: string;
  }>;
  noActionChangesToday?: Array<{
    type: string;
    memberName: string;
    clientId2: string;
    fromStatus?: string;
    toStatus?: string;
    timestamp: string;
    changedByName?: string;
  }>;
};

const ET_DATE_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const ET_DATE_TIME_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
  timeZoneName: 'short',
});

const todayEt = () => ET_DATE_FMT.format(new Date());
const formatEt = (value: string) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return ET_DATE_TIME_FMT.format(parsed);
};

export default function KaiserDailyLogsPage() {
  const { isSuperAdmin, isKaiserManager, isLoading: isAdminLoading } = useAdmin();
  const auth = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isPullingAll, setIsPullingAll] = useState(false);
  const [dateKey, setDateKey] = useState(todayEt());
  const [staffNameFilter, setStaffNameFilter] = useState('');
  const [rows, setRows] = useState<DailyLogRow[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAdminLoading && !isSuperAdmin && !isKaiserManager) {
      router.push('/admin');
    }
  }, [isAdminLoading, isSuperAdmin, isKaiserManager, router]);

  const loadRows = async () => {
    if (!auth?.currentUser) return;
    setIsLoading(true);
    setError('');
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/kaiser-tracker-daily-log/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          dateKey,
          staffName: staffNameFilter.trim(),
          limit: 500,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to load daily logs');
      }
      const nextRows = Array.isArray(data?.rows) ? data.rows : [];
      setRows(nextRows);
    } catch (err: any) {
      setRows([]);
      setError(err?.message || 'Failed to load daily logs');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdminLoading && (isSuperAdmin || isKaiserManager)) {
      void loadRows();
    }
  }, [isAdminLoading, isSuperAdmin, isKaiserManager]); // eslint-disable-line react-hooks/exhaustive-deps

  const pullAllDailyLogs = async () => {
    if (!auth?.currentUser || isPullingAll) return;
    setIsPullingAll(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/kaiser-tracker-daily-log/pull-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to pull all daily logs');
      }
      const success = Number(data?.success || 0);
      const failed = Number(data?.failed || 0);
      toast({
        title: 'Pulled all daily logs',
        description: `Completed ${success} staff logs${failed > 0 ? `, failed ${failed}` : ''}.`,
      });
      await loadRows();
    } catch (err: any) {
      toast({
        title: 'Pull all failed',
        description: err?.message || 'Could not pull all daily logs.',
        variant: 'destructive',
      });
    } finally {
      setIsPullingAll(false);
    }
  };

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.reports += 1;
        acc.notes += Number(row?.metrics?.notesTodayCount || 0);
        acc.noAction += Number(row?.metrics?.noActionTotal || 0);
        return acc;
      },
      { reports: 0, notes: 0, noAction: 0 }
    );
  }, [rows]);

  if (isAdminLoading || isLoading) {
    return (
      <div className="container mx-auto py-8 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isSuperAdmin && !isKaiserManager) return null;

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Kaiser Daily Logs</h1>
          <p className="text-sm text-muted-foreground">
            Staff end-of-day productivity logs with today notes, status changes, and no-action movement.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={() => void pullAllDailyLogs()}
            disabled={isPullingAll}
          >
            {isPullingAll ? 'Pulling Daily Logs...' : 'Pull All Daily Logs'}
          </Button>
          <Button variant="outline" onClick={() => router.push('/admin/super-admin-tools')}>
            Back to Super Admin Tools
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Date (ET)</div>
            <Input value={dateKey} onChange={(e) => setDateKey(e.target.value)} placeholder="YYYY-MM-DD" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Staff Name (optional)</div>
            <Input value={staffNameFilter} onChange={(e) => setStaffNameFilter(e.target.value)} placeholder="e.g. Jane Doe" />
          </div>
          <div className="flex items-end">
            <Button onClick={() => void loadRows()} className="w-full">
              Refresh Logs
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily Totals</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Reports: <span className="font-semibold text-foreground">{totals.reports}</span> | Notes Today:{' '}
          <span className="font-semibold text-foreground">{totals.notes}</span> | No Action Total:{' '}
          <span className="font-semibold text-foreground">{totals.noAction}</span>
        </CardContent>
      </Card>

      {error ? (
        <Card>
          <CardContent className="py-4 text-sm text-red-600">{error}</CardContent>
        </Card>
      ) : null}

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">No daily logs found for the selected filters.</CardContent>
        </Card>
      ) : null}

      {rows.map((row) => (
        <Card key={row.id}>
          <CardHeader>
            <CardTitle className="text-base">
              {row.staffName} - {row.dateKey}
            </CardTitle>
            <div className="text-xs text-muted-foreground">
              Submitted by {row.submittedByName || row.submittedByEmail || 'Unknown'} at {formatEt(String(row.submittedAt || ''))}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-xs">
              Assigned: {Number(row?.metrics?.totalAssigned || 0)} | Active: {Number(row?.metrics?.activeAssigned || 0)} | Passive:{' '}
              {Number(row?.metrics?.passiveAssigned || 0)} | No Action: {Number(row?.metrics?.noActionTotal || 0)} (Critical:{' '}
              {Number(row?.metrics?.noActionCritical || 0)}, Priority: {Number(row?.metrics?.noActionPriority || 0)}) | Notes Today:{' '}
              {Number(row?.metrics?.notesTodayCount || 0)}
            </div>

            <details>
              <summary className="cursor-pointer text-sm font-medium">Start vs End Day Delta</summary>
              <div className="mt-2 text-xs space-y-1">
                <div>Active: {Number(row?.dayComparison?.startOfDay?.activeAssigned || 0)} -> {Number(row?.dayComparison?.endOfDay?.activeAssigned || 0)} (Δ {Number(row?.dayComparison?.delta?.activeAssigned || 0)})</div>
                <div>Passive: {Number(row?.dayComparison?.startOfDay?.passiveAssigned || 0)} -> {Number(row?.dayComparison?.endOfDay?.passiveAssigned || 0)} (Δ {Number(row?.dayComparison?.delta?.passiveAssigned || 0)})</div>
                <div>No Action Total: {Number(row?.dayComparison?.startOfDay?.noActionTotal || 0)} -> {Number(row?.dayComparison?.endOfDay?.noActionTotal || 0)} (Δ {Number(row?.dayComparison?.delta?.noActionTotal || 0)})</div>
                <div>No Action Critical: {Number(row?.dayComparison?.startOfDay?.noActionCritical || 0)} -> {Number(row?.dayComparison?.endOfDay?.noActionCritical || 0)} (Δ {Number(row?.dayComparison?.delta?.noActionCritical || 0)})</div>
                <div>No Action Priority: {Number(row?.dayComparison?.startOfDay?.noActionPriority || 0)} -> {Number(row?.dayComparison?.endOfDay?.noActionPriority || 0)} (Δ {Number(row?.dayComparison?.delta?.noActionPriority || 0)})</div>
              </div>
            </details>

            <details>
              <summary className="cursor-pointer text-sm font-medium">
                Today's Notes ({Array.isArray(row.todayNotes) ? row.todayNotes.length : 0})
              </summary>
              <div className="mt-2 space-y-2">
                {(row.todayNotes || []).map((note) => (
                  <div key={note.id} className="rounded border p-2 text-xs">
                    <div className="font-medium">
                      {note.memberName} ({note.clientId2}) - {formatEt(note.createdAt)}
                    </div>
                    <div className="text-muted-foreground">By {note.createdByName} via {note.source}</div>
                    <div className="mt-1 whitespace-pre-wrap">{note.noteText || 'No note text'}</div>
                  </div>
                ))}
              </div>
            </details>

            <details>
              <summary className="cursor-pointer text-sm font-medium">
                Kaiser Status Changes ({Array.isArray(row.kaiserStatusChangesToday) ? row.kaiserStatusChangesToday.length : 0})
              </summary>
              <div className="mt-2 space-y-1 text-xs">
                {(row.kaiserStatusChangesToday || []).map((change) => (
                  <div key={change.id} className="rounded border p-2">
                    <div className="font-medium">
                      {change.memberName} ({change.clientId2}) - {formatEt(change.timestamp)}
                    </div>
                    <div>
                      {change.oldStatus || 'None'} -> {change.newStatus || 'None'}
                    </div>
                    <div className="text-muted-foreground">Changed by {change.changedByName || 'Unknown'}</div>
                  </div>
                ))}
              </div>
            </details>

            <details>
              <summary className="cursor-pointer text-sm font-medium">
                No Action Changes ({Array.isArray(row.noActionChangesToday) ? row.noActionChangesToday.length : 0})
              </summary>
              <div className="mt-2 space-y-1 text-xs">
                {(row.noActionChangesToday || []).map((change, idx) => (
                  <div key={`${change.clientId2}-${change.timestamp}-${idx}`} className="rounded border p-2">
                    <div className="font-medium">
                      {change.memberName} ({change.clientId2}) - {formatEt(change.timestamp)}
                    </div>
                    <div>
                      {change.type}: {change.fromStatus || 'None'} -> {change.toStatus || 'None'}
                    </div>
                    <div className="text-muted-foreground">Changed by {change.changedByName || 'Unknown'}</div>
                  </div>
                ))}
              </div>
            </details>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

