'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock, Loader2, Play, RefreshCw, XCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAdmin } from '@/hooks/use-admin';
import { useToast } from '@/hooks/use-toast';
import { adminFetch } from '@/lib/admin-fetch';
import type { DailyUpdateJob } from '@/lib/daily-updates';

type JobRun = {
  ok: boolean;
  trigger?: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  summary?: Record<string, unknown>;
  error?: string;
};

type JobRow = DailyUpdateJob & {
  lastRun: JobRun | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  currentRun: Record<string, unknown> | null;
};

const formatWhen = (value?: string | null) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
};

const formatDuration = (ms?: number) => {
  if (!ms || !Number.isFinite(ms)) return '';
  const seconds = Math.round(ms / 1000);
  return seconds < 90 ? `${seconds}s` : `${Math.round(seconds / 60)}m`;
};

const summaryText = (summary?: Record<string, unknown>) => {
  if (!summary) return '';
  return Object.entries(summary)
    .filter(([, value]) => value !== null && value !== undefined && typeof value !== 'object')
    .map(([key, value]) => `${key}: ${typeof value === 'number' ? value.toLocaleString() : String(value)}`)
    .join(' · ');
};

export default function DailyUpdatesPage() {
  const { user, isLoading: adminLoading } = useAdmin();
  const { toast } = useToast();
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [runningJobId, setRunningJobId] = useState<string | null>(null);
  const [runProgress, setRunProgress] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const data = await adminFetch<{ jobs: JobRow[] }>('/api/admin/daily-updates', { user });
      setJobs(data.jobs || []);
    } catch (e: any) {
      setError(String(e?.message || 'Could not load daily updates'));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!adminLoading) void load();
  }, [adminLoading, load]);

  const runNow = async (job: JobRow) => {
    if (!user || runningJobId) return;
    setRunningJobId(job.id);
    setRunProgress('Starting…');
    try {
      let offset: number | null = 0;
      let batches = 0;
      while (offset !== null) {
        const result: { nextOffset: number | null; summary?: Record<string, any> } = await adminFetch(
          '/api/admin/daily-updates',
          { method: 'POST', user, json: { jobId: job.id, offset } }
        );
        batches += 1;
        offset = job.batched ? result.nextOffset ?? null : null;
        if (job.batched) {
          const total = Number(result.summary?.kaiserMembersInCache || 0);
          setRunProgress(offset !== null && total ? `Batch ${batches}: ${offset.toLocaleString()} / ${total.toLocaleString()} members` : `Batch ${batches} done`);
        }
      }
      toast({ title: `${job.name} finished` });
    } catch (e: any) {
      toast({ variant: 'destructive', title: `${job.name} failed`, description: String(e?.message || e) });
    } finally {
      setRunningJobId(null);
      setRunProgress('');
      void load();
    }
  };

  return (
    <div className="container mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Daily Updates</h1>
          <p className="max-w-3xl text-muted-foreground">
            Every scheduled job the app runs: when it runs, what it updates, and how the last run went. Cache and status
            jobs can be run on demand; email reminder jobs are listed for reference only.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Refresh
        </Button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {loading && jobs.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : null}

      <div className="space-y-3">
        {jobs.map((job) => {
          const run = job.lastRun;
          const isRunning = runningJobId === job.id;
          return (
            <Card key={job.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <CardTitle className="text-base">{job.name}</CardTitle>
                    <CardDescription className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {job.schedule}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {job.runner === 'github-actions' ? 'GitHub Actions' : 'Firebase scheduler'}
                      </Badge>
                      <span className="font-mono text-[11px]">{job.scheduledBy}</span>
                    </CardDescription>
                  </div>
                  {job.canRunNow ? (
                    <Button size="sm" onClick={() => void runNow(job)} disabled={Boolean(runningJobId)}>
                      {isRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                      {isRunning ? 'Running…' : 'Run now'}
                    </Button>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-muted-foreground">{job.description}</p>
                {isRunning && runProgress ? <p className="text-xs text-sky-700">{runProgress}</p> : null}
                {run ? (
                  <div className="rounded-md border bg-muted/30 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {run.ok ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive" />
                      )}
                      <span className="font-medium">{run.ok ? 'Last run succeeded' : 'Last run failed'}</span>
                      <span className="text-muted-foreground">{formatWhen(run.finishedAt)}</span>
                      {run.trigger ? (
                        <Badge variant="secondary" className="text-[10px]">
                          {run.trigger === 'manual' ? 'Run manually' : 'Scheduled'}
                        </Badge>
                      ) : null}
                      {formatDuration(run.durationMs) ? (
                        <span className="text-xs text-muted-foreground">{formatDuration(run.durationMs)}</span>
                      ) : null}
                    </div>
                    {run.error ? <p className="mt-1 text-xs text-destructive">{run.error}</p> : null}
                    {summaryText(run.summary) ? (
                      <p className="mt-1 text-xs text-muted-foreground">{summaryText(run.summary)}</p>
                    ) : null}
                    {!run.ok && job.lastSuccessAt ? (
                      <p className="mt-1 text-xs text-muted-foreground">Last success: {formatWhen(job.lastSuccessAt)}</p>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {job.canRunNow ? 'No run recorded yet.' : 'Run history is not tracked for this job.'}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
