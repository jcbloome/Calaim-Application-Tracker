'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ArrowLeft, Download, Eye, Loader2, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useAuth, useUser } from '@/firebase';
import {
  BATCH_ELIGIBILITY_PLAN_LABELS,
  RECHECK_STORAGE_KEY,
  type BatchEligibilityMember,
  type BatchEligibilityPlan,
  type BatchEligibilityRun,
} from '@/lib/batch-eligibility';
import { EligibilityResultsCard } from '../batch-eligibility-checker/eligibility-results-card';

type KindFilter = 'all' | 'batch' | 'decode';

const LIST_LABELS: Record<string, string> = {
  authorized: 'Authorized',
  'not-authorized': 'Inactive',
  recheck: 'Re-check',
  statuses: 'Kaiser statuses',
};

const formatBytes = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

function RunDetails({ run }: { run: BatchEligibilityRun }) {
  const s = run.summary || {};
  if (run.kind === 'batch') {
    return (
      <div className="space-y-0.5 text-xs">
        <div>
          <span className="font-medium">{Number(s.memberCount || 0).toLocaleString()}</span> members
          {s.listLabel ? ` · ${s.listLabel} list` : ''}
        </div>
        {Array.isArray(s.statuses) && run.list === 'not-authorized' ? (
          <div className="text-muted-foreground">Statuses: {s.statuses.join(', ')}</div>
        ) : null}
        {s.skippedIncomplete ? (
          <div className="text-muted-foreground">{s.skippedIncomplete} left out for missing data</div>
        ) : null}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-1 text-xs">
      <Badge variant="secondary">{Number(s.responses || 0).toLocaleString()} responses</Badge>
      <Badge variant="outline" className="border-green-200 bg-green-50 text-green-800">
        {Number(s.active || 0).toLocaleString()} active
      </Badge>
      <Badge variant="outline" className="border-red-200 bg-red-50 text-red-800">
        {Number(s.inactive || 0).toLocaleString()} inactive
      </Badge>
      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
        {Number(s.rejected || 0).toLocaleString()} rejected / not found
      </Badge>
      {s.unknown ? <Badge variant="outline">{s.unknown} unclear</Badge> : null}
      {s.membersLoaded !== false ? (
        <Badge variant={s.flagged ? 'destructive' : 'outline'}>{Number(s.flagged || 0).toLocaleString()} need review</Badge>
      ) : null}
    </div>
  );
}

export default function BatchEligibilityLogPage() {
  const auth = useAuth();
  const { user } = useUser();
  const { toast } = useToast();
  const router = useRouter();
  const [plan, setPlan] = useState<BatchEligibilityPlan>('healthnet');
  const [runs, setRuns] = useState<BatchEligibilityRun[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [members, setMembers] = useState<BatchEligibilityMember[]>([]);
  const [openRun, setOpenRun] = useState<BatchEligibilityRun | null>(null);
  const [openFiles, setOpenFiles] = useState<Array<{ name: string; text: string }> | undefined>(undefined);
  const [loadingRunId, setLoadingRunId] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const getIdToken = useCallback(async () => {
    const tokenUser = user || auth.currentUser;
    if (!tokenUser) throw new Error('Sign in required');
    return tokenUser.getIdToken();
  }, [user, auth]);

  const authedFetch = useCallback(
    async (url: string) => {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${await getIdToken()}` }, cache: 'no-store' });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      return res;
    },
    [getIdToken]
  );

  const loadRuns = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await (await authedFetch(`/api/admin/batch-eligibility/runs?plan=${plan}`)).json();
      setRuns(data.runs || []);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Could not load the log', description: error?.message });
    } finally {
      setIsLoading(false);
    }
  }, [authedFetch, plan, toast]);

  useEffect(() => {
    if (!user) return;
    void loadRuns();
    authedFetch(`/api/admin/batch-eligibility/members?plan=${plan}`)
      .then((res) => res.json())
      .then((data) => setMembers(data.members || []))
      .catch(() => setMembers([]));
  }, [user, loadRuns, authedFetch, plan]);

  const visibleRuns = useMemo(
    () => runs.filter((run) => kindFilter === 'all' || run.kind === kindFilter),
    [runs, kindFilter]
  );

  const downloadFile = async (run: BatchEligibilityRun, index: number) => {
    try {
      const blob = await (await authedFetch(`/api/admin/batch-eligibility/runs/${run.id}?file=${index}`)).blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = run.files[index].name;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Download failed', description: error?.message });
    }
  };

  const openResults = async (run: BatchEligibilityRun) => {
    setLoadingRunId(run.id);
    try {
      const files = await Promise.all(
        run.files.map(async (file, index) => ({
          name: file.name,
          text: await (await authedFetch(`/api/admin/batch-eligibility/runs/${run.id}?file=${index}`)).text(),
        }))
      );
      setOpenRun(run);
      setOpenFiles(files);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Could not open results', description: error?.message });
    } finally {
      setLoadingRunId(null);
    }
  };

  const kindCount = (kind: KindFilter) => (kind === 'all' ? runs.length : runs.filter((r) => r.kind === kind).length);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Batch Eligibility Log</h1>
          <p className="text-muted-foreground">
            Every batch file created (Health Net CSV for Claim.MD, Kaiser 270 for Smart Data Solutions) and every 271
            result file decoded. Re-download any file or reopen decoded results.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/tools/batch-eligibility-checker">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Batch Eligibility Checker
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Runs</CardTitle>
          <CardDescription>Newest first.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {(['healthnet', 'kaiser'] as BatchEligibilityPlan[]).map((value) => (
              <Button
                key={value}
                size="sm"
                variant={plan === value ? 'default' : 'outline'}
                onClick={() => {
                  setPlan(value);
                  setOpenRun(null);
                  setOpenFiles(undefined);
                }}
              >
                {BATCH_ELIGIBILITY_PLAN_LABELS[value]}
              </Button>
            ))}
            <span className="mx-1 h-6 w-px bg-border" />
            {(
              [
                ['all', 'All'],
                ['batch', 'Batch files created'],
                ['decode', '271 results decoded'],
              ] as Array<[KindFilter, string]>
            ).map(([value, text]) => (
              <Button
                key={value}
                size="sm"
                variant={kindFilter === value ? 'default' : 'outline'}
                onClick={() => setKindFilter(value)}
              >
                {text} <Badge variant="secondary" className="ml-2">{kindCount(value)}</Badge>
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => void loadRuns()} disabled={isLoading}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Refresh
            </Button>
          </div>

          {!isLoading && !visibleRuns.length ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nothing logged yet. Batch files are saved when you download them from the checker, and 271 files are
              saved when you decode them.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>Files</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRuns.map((run) => (
                    <TableRow key={run.id} className={openRun?.id === run.id ? 'bg-primary/5' : undefined}>
                      <TableCell className="whitespace-nowrap align-top text-sm">
                        <div>{format(new Date(run.createdAtIso), 'MMM d, yyyy h:mm a')}</div>
                        <div className="text-xs text-muted-foreground">{run.createdByName || run.createdByEmail}</div>
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge variant={run.kind === 'batch' ? 'secondary' : 'default'}>
                          {run.kind === 'batch' ? 'Batch file' : '271 decoded'}
                        </Badge>
                        {run.list ? (
                          <div className="mt-1 text-xs text-muted-foreground">{LIST_LABELS[run.list] || run.list}</div>
                        ) : null}
                      </TableCell>
                      <TableCell className="align-top">
                        <RunDetails run={run} />
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="space-y-1">
                          {run.files.map((file, index) => (
                            <button
                              key={file.storagePath}
                              type="button"
                              onClick={() => void downloadFile(run, index)}
                              className="flex items-center gap-1 text-left text-xs text-primary hover:underline"
                            >
                              <Download className="h-3 w-3 shrink-0" />
                              {file.name}
                              <span className="text-muted-foreground">({formatBytes(file.size)})</span>
                            </button>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        {run.kind === 'decode' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void openResults(run)}
                            disabled={loadingRunId === run.id}
                          >
                            {loadingRunId === run.id ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Eye className="mr-2 h-4 w-4" />
                            )}
                            Open results
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div ref={resultsRef}>
        {openRun && openFiles ? (
          <EligibilityResultsCard
            key={openRun.id}
            members={members}
            plan={plan}
            preloaded={openFiles}
            title={`Results decoded ${format(new Date(openRun.createdAtIso), 'MMM d, yyyy h:mm a')}`}
            onRecheck={
              plan === 'healthnet'
                ? (clientIds) => {
                    try {
                      sessionStorage.setItem(RECHECK_STORAGE_KEY, JSON.stringify(clientIds));
                    } catch {
                      // ignore
                    }
                    router.push('/admin/tools/batch-eligibility-checker');
                  }
                : undefined
            }
          />
        ) : null}
      </div>
    </div>
  );
}
