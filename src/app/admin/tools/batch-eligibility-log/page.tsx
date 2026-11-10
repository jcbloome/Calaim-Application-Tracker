'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Download,
  ExternalLink,
  Eye,
  Loader2,
  Mail,
  RefreshCw,
  Send,
  TestTube2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useAuth, useUser } from '@/firebase';
import {
  BATCH_ELIGIBILITY_PLAN_LABELS,
  recheckStorageKeyForPlan,
  resolveBatchEligibilityRunPlan,
  type BatchEligibilityMember,
  type BatchEligibilityPlan,
  type BatchEligibilityRun,
} from '@/lib/batch-eligibility';
import {
  decodeEligibilityFilesToRows,
  downloadEligibilityRowsCsv,
  type EligibilityResultRow,
} from '@/lib/batch-eligibility-results';
import type { EligibilityOutcome } from '@/lib/x12-271';
import {
  buildKaiserInactiveNoticePlainText,
  groupKaiserInactiveByRcfe,
  KAISER_ELIGIBILITY_CHECK_NCAL_URL,
  KAISER_ELIGIBILITY_CHECK_SCAL_URL,
  KAISER_INACTIVE_NOTICE_CC,
  KAISER_INACTIVE_NOTICE_SUBJECT,
  type KaiserInactiveRcfeGroup,
} from '@/lib/kaiser-inactive-rcfe-notice';
import {
  CaspioMemberStatusCell,
  EligibilityResultsCard,
} from '../batch-eligibility-checker/eligibility-results-card';

type KindFilter = 'all' | 'batch' | 'decode';

const LIST_LABELS: Record<string, string> = {
  authorized: 'All living / Authorized',
  'not-authorized': 'Inactive / Non-Active',
  recheck: 'Re-check',
  statuses: 'Kaiser all living statuses',
};

const formatBytes = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** Kaiser guest Medi-Cal eligibility site for a member's North/South region. */
function kaiserEligibilityCheckForRegion(region: unknown): {
  label: 'NCAL' | 'SCAL' | null;
  url: string | null;
} {
  const raw = String(region || '').toLowerCase();
  if (raw.includes('north')) return { label: 'NCAL', url: KAISER_ELIGIBILITY_CHECK_NCAL_URL };
  if (raw.includes('south')) return { label: 'SCAL', url: KAISER_ELIGIBILITY_CHECK_SCAL_URL };
  return { label: null, url: null };
}

const openKaiserEligibilityWindow = (url: string) => {
  window.open(url, '_blank', 'noopener,noreferrer');
};

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
  const [csvDownloadKey, setCsvDownloadKey] = useState<string | null>(null);
  const [notEligibleRun, setNotEligibleRun] = useState<BatchEligibilityRun | null>(null);
  const [notEligibleRows, setNotEligibleRows] = useState<EligibilityResultRow[]>([]);
  const [notEligibleLoadingId, setNotEligibleLoadingId] = useState<string | null>(null);
  const [selectedRcfeKeys, setSelectedRcfeKeys] = useState<Set<string>>(new Set());
  const [testEmail, setTestEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [lastSendResults, setLastSendResults] = useState<
    Array<{ rcfeName: string; to: string[]; ok: boolean; error?: string }> | null
  >(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const notEligibleRef = useRef<HTMLDivElement>(null);

  const getIdToken = useCallback(async () => {
    const tokenUser = user || auth.currentUser;
    if (!tokenUser) throw new Error('Sign in required');
    return tokenUser.getIdToken();
  }, [user, auth]);

  const authedFetch = useCallback(
    async (url: string, init?: RequestInit) => {
      const res = await fetch(url, {
        ...init,
        headers: {
          ...(init?.headers || {}),
          Authorization: `Bearer ${await getIdToken()}`,
        },
        cache: 'no-store',
      });
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
    authedFetch(`/api/admin/batch-eligibility/members?plan=all`)
      .then((res) => res.json())
      .then((data) => setMembers(data.members || []))
      .catch(() => setMembers([]));
  }, [user, loadRuns, authedFetch, plan]);

  const visibleRuns = useMemo(
    () => runs.filter((run) => kindFilter === 'all' || run.kind === kindFilter),
    [runs, kindFilter]
  );

  const noticePreview = useMemo(() => buildKaiserInactiveNoticePlainText({ memberCount: 0 }), []);

  const inactiveRcfeGroups = useMemo(
    () => groupKaiserInactiveByRcfe(notEligibleRows),
    [notEligibleRows]
  );

  const emailableGroups = useMemo(
    () => inactiveRcfeGroups.filter((g) => (g.emails || []).length > 0),
    [inactiveRcfeGroups]
  );

  const selectedGroups = useMemo(
    () => emailableGroups.filter((g) => selectedRcfeKeys.has(g.key)),
    [emailableGroups, selectedRcfeKeys]
  );

  const notEligibleRunPlan = notEligibleRun ? resolveBatchEligibilityRunPlan(notEligibleRun) : plan;

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

  const loadRunFiles = async (run: BatchEligibilityRun) =>
    Promise.all(
      run.files.map(async (file, index) => ({
        name: file.name,
        text: await (await authedFetch(`/api/admin/batch-eligibility/runs/${run.id}?file=${index}`)).text(),
      }))
    );

  const openResults = async (run: BatchEligibilityRun) => {
    setLoadingRunId(run.id);
    try {
      const files = await loadRunFiles(run);
      setOpenRun(run);
      setOpenFiles(files);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Could not open results', description: error?.message });
    } finally {
      setLoadingRunId(null);
    }
  };

  const downloadOutcomeCsv = async (
    run: BatchEligibilityRun,
    outcome: Extract<EligibilityOutcome, 'active' | 'inactive'>
  ) => {
    const key = `${run.id}:${outcome}`;
    setCsvDownloadKey(key);
    try {
      const files = await loadRunFiles(run);
      const runPlan = resolveBatchEligibilityRunPlan(run);
      const rows = decodeEligibilityFilesToRows(files, members, { plan: runPlan }).filter(
        (row) => row.result.outcome === outcome
      );
      if (!rows.length) {
        toast({
          title: outcome === 'active' ? 'No eligible results in this run' : 'No not-eligible results in this run',
        });
        return;
      }
      downloadEligibilityRowsCsv(rows, runPlan, outcome === 'active' ? 'eligible' : 'not-eligible', {
        createdAtIso: run.createdAtIso,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: outcome === 'active' ? 'Eligible download failed' : 'Not eligible download failed',
        description: error?.message,
      });
    } finally {
      setCsvDownloadKey(null);
    }
  };

  const openNotEligible = async (run: BatchEligibilityRun) => {
    setNotEligibleLoadingId(run.id);
    setLastSendResults(null);
    try {
      const files = await loadRunFiles(run);
      const runPlan = resolveBatchEligibilityRunPlan(run);
      const rows = decodeEligibilityFilesToRows(files, members, { plan: runPlan }).filter(
        (row) => row.result.outcome === 'inactive'
      );
      if (!rows.length) {
        toast({ title: 'No not-eligible results in this run' });
        setNotEligibleRun(null);
        setNotEligibleRows([]);
        setSelectedRcfeKeys(new Set());
        return;
      }
      setNotEligibleRun(run);
      setNotEligibleRows(rows);
      const groups = groupKaiserInactiveByRcfe(rows);
      setSelectedRcfeKeys(new Set(groups.filter((g) => g.emails.length > 0).map((g) => g.key)));
      setTimeout(() => notEligibleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Could not load not-eligible list', description: error?.message });
    } finally {
      setNotEligibleLoadingId(null);
    }
  };

  const sendKaiserInactiveNotices = async (opts?: { test?: boolean; resend?: boolean }) => {
    if (!notEligibleRun) return;
    if (!selectedGroups.length) {
      toast({
        variant: 'destructive',
        title: 'Select at least one RCFE with an email',
      });
      return;
    }
    if (opts?.test && !String(testEmail || '').trim()) {
      toast({ variant: 'destructive', title: 'Enter a test email address' });
      return;
    }
    const setBusy = opts?.test ? setIsSendingTest : setIsSending;
    setBusy(true);
    try {
      const body = await (
        await authedFetch('/api/admin/batch-eligibility/kaiser-inactive-notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            groups: selectedGroups,
            testEmail: opts?.test ? testEmail : undefined,
            runId: notEligibleRun.id,
            subject: opts?.resend
              ? `[Resend] ${KAISER_INACTIVE_NOTICE_SUBJECT}`
              : KAISER_INACTIVE_NOTICE_SUBJECT,
          }),
        })
      ).json();
      setLastSendResults(body.results || []);
      toast({
        title: opts?.test
          ? 'Test email sent'
          : opts?.resend
            ? 'Resend complete'
            : 'Kaiser inactive notices sent',
        description: opts?.test
          ? `Sample for ${selectedGroups[0]?.rcfeName} sent to ${testEmail} (CC ${KAISER_INACTIVE_NOTICE_CC}).`
          : `Sent ${body.sent || 0} · failed ${body.failed || 0}. Each email CC's ${KAISER_INACTIVE_NOTICE_CC}.`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: opts?.test ? 'Test send failed' : 'Send failed',
        description: error?.message,
      });
    } finally {
      setBusy(false);
    }
  };

  const kindCount = (kind: KindFilter) => (kind === 'all' ? runs.length : runs.filter((r) => r.kind === kind).length);

  const toggleRcfeKey = (key: string, checked: boolean) => {
    setSelectedRcfeKeys((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Batch Eligibility Log</h1>
          <p className="text-muted-foreground">
            Every batch file created (Health Net CSV for Claim.MD, Kaiser 270 for Smart Data Solutions) and every 271
            result file decoded. Re-download any file, export eligible / not eligible CSVs, or reopen decoded results.
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
          <CardDescription>Newest first. Each run shows its MCP (Health Net or Kaiser).</CardDescription>
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
                  setNotEligibleRun(null);
                  setNotEligibleRows([]);
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
                    <TableHead>MCP</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>Files</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRuns.map((run) => {
                    const runPlan = resolveBatchEligibilityRunPlan(run);
                    return (
                      <TableRow
                        key={run.id}
                        className={
                          openRun?.id === run.id || notEligibleRun?.id === run.id ? 'bg-primary/5' : undefined
                        }
                      >
                        <TableCell className="whitespace-nowrap align-top text-sm">
                          <div>{format(new Date(run.createdAtIso), 'MMM d, yyyy h:mm a')}</div>
                          <div className="text-xs text-muted-foreground">{run.createdByName || run.createdByEmail}</div>
                        </TableCell>
                        <TableCell className="align-top">
                          <Badge variant="outline">{BATCH_ELIGIBILITY_PLAN_LABELS[runPlan]}</Badge>
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
                            <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
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
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-green-200 text-green-800 hover:bg-green-50"
                                disabled={csvDownloadKey === `${run.id}:active` || !Number(run.summary?.active || 0)}
                                onClick={() => void downloadOutcomeCsv(run, 'active')}
                                title="CSV of Active / eligible responses from this run"
                              >
                                {csvDownloadKey === `${run.id}:active` ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <Download className="mr-2 h-4 w-4" />
                                )}
                                Eligible ({Number(run.summary?.active || 0).toLocaleString()})
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-red-200 text-red-800 hover:bg-red-50"
                                disabled={
                                  notEligibleLoadingId === run.id ||
                                  !Number(run.summary?.inactive || 0)
                                }
                                onClick={() => void openNotEligible(run)}
                                title="View inactive / not eligible members with RCFE name and admin email"
                              >
                                {notEligibleLoadingId === run.id ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <Eye className="mr-2 h-4 w-4" />
                                )}
                                Not eligible ({Number(run.summary?.inactive || 0).toLocaleString()})
                              </Button>
                            </div>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div ref={notEligibleRef}>
        {notEligibleRun && notEligibleRows.length ? (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  Not eligible
                  <Badge variant="outline">{BATCH_ELIGIBILITY_PLAN_LABELS[notEligibleRunPlan]}</Badge>
                  <Badge variant="outline" className="border-red-200 bg-red-50 text-red-800">
                    {notEligibleRows.length.toLocaleString()} inactive
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Decoded {format(new Date(notEligibleRun.createdAtIso), 'MMM d, yyyy h:mm a')}. Name from Caspio{' '}
                  <span className="font-medium">RCFE_Name</span>. Emails from{' '}
                  <span className="font-medium">RCFE_Admin_Email</span> (may list more than one), plus owner /
                  registration contacts — same sources as RCFE Bulk Email.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={csvDownloadKey === `${notEligibleRun.id}:inactive`}
                    onClick={() => void downloadOutcomeCsv(notEligibleRun, 'inactive')}
                  >
                    {csvDownloadKey === `${notEligibleRun.id}:inactive` ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="mr-2 h-4 w-4" />
                    )}
                    Download CSV (with RCFE + owner email)
                  </Button>
                  {notEligibleRunPlan === 'kaiser' ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openKaiserEligibilityWindow(KAISER_ELIGIBILITY_CHECK_NCAL_URL)}
                        title={KAISER_ELIGIBILITY_CHECK_NCAL_URL}
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Open NCAL eligibility
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openKaiserEligibilityWindow(KAISER_ELIGIBILITY_CHECK_SCAL_URL)}
                        title={KAISER_ELIGIBILITY_CHECK_SCAL_URL}
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Open SCAL eligibility
                      </Button>
                    </>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setNotEligibleRun(null);
                      setNotEligibleRows([]);
                      setSelectedRcfeKeys(new Set());
                      setLastSendResults(null);
                    }}
                  >
                    Close list
                  </Button>
                </div>
                {notEligibleRunPlan === 'kaiser' ? (
                  <div className="rounded-md border border-sky-200 bg-sky-50/70 px-3 py-2 text-xs text-sky-950">
                    <div className="font-medium">Kaiser guest Medi-Cal eligibility check (opens in a new window)</div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                      <a
                        className="inline-flex items-center gap-1 font-medium text-primary underline"
                        href={KAISER_ELIGIBILITY_CHECK_NCAL_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        NCAL <ExternalLink className="h-3 w-3" />
                      </a>
                      <a
                        className="inline-flex items-center gap-1 font-medium text-primary underline"
                        href={KAISER_ELIGIBILITY_CHECK_SCAL_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        SCAL <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                    <div className="mt-1 text-muted-foreground">
                      Use each row&apos;s Check link (by Kaiser region) to confirm inactive status for that member.
                    </div>
                  </div>
                ) : null}
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Member</TableHead>
                        <TableHead>Medi-Cal / MRN</TableHead>
                        <TableHead>Caspio / Kaiser status</TableHead>
                        <TableHead>RCFE name</TableHead>
                        <TableHead>RCFE owner email</TableHead>
                        {notEligibleRunPlan === 'kaiser' ? <TableHead>Check eligibility</TableHead> : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {notEligibleRows.map((row) => {
                        const regionCheck = kaiserEligibilityCheckForRegion(row.member?.region);
                        return (
                          <TableRow key={row.key}>
                            <TableCell className="align-top text-sm">
                              <div className="font-medium">
                                {row.result.lastName}, {row.result.firstName}
                              </div>
                              {row.result.birthDate ? (
                                <div className="text-xs text-muted-foreground">DOB {row.result.birthDate}</div>
                              ) : null}
                              {row.member?.region ? (
                                <div className="text-xs text-muted-foreground">{row.member.region}</div>
                              ) : null}
                            </TableCell>
                            <TableCell className="align-top text-xs">
                              {row.result.memberId || '-'}
                              {row.member?.medicalId && row.member.medicalId !== row.result.memberId ? (
                                <div className="text-muted-foreground">CIN {row.member.medicalId}</div>
                              ) : null}
                            </TableCell>
                            <TableCell className="align-top text-xs">
                              <CaspioMemberStatusCell member={row.member} />
                            </TableCell>
                            <TableCell className="align-top text-sm">
                              {row.member?.rcfeName || (
                                <span className="text-muted-foreground">No RCFE on file</span>
                              )}
                            </TableCell>
                            <TableCell className="align-top text-sm">
                              {row.member?.rcfeAdminEmail ? (
                                <div className="space-y-0.5">
                                  {row.member.rcfeAdminEmail.split(/[;,/]+/).map((part) => {
                                    const email = part.trim();
                                    if (!email) return null;
                                    return (
                                      <a
                                        key={email}
                                        className="block text-primary hover:underline"
                                        href={`mailto:${email}`}
                                      >
                                        {email}
                                      </a>
                                    );
                                  })}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">No email</span>
                              )}
                            </TableCell>
                            {notEligibleRunPlan === 'kaiser' ? (
                              <TableCell className="align-top">
                                {regionCheck.url ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7"
                                    onClick={() => openKaiserEligibilityWindow(regionCheck.url!)}
                                    title={`Open ${regionCheck.label} guest eligibility`}
                                  >
                                    <ExternalLink className="mr-1 h-3.5 w-3.5" />
                                    {regionCheck.label}
                                  </Button>
                                ) : (
                                  <div className="flex flex-col gap-1">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7"
                                      onClick={() => openKaiserEligibilityWindow(KAISER_ELIGIBILITY_CHECK_NCAL_URL)}
                                    >
                                      <ExternalLink className="mr-1 h-3.5 w-3.5" />
                                      NCAL
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7"
                                      onClick={() => openKaiserEligibilityWindow(KAISER_ELIGIBILITY_CHECK_SCAL_URL)}
                                    >
                                      <ExternalLink className="mr-1 h-3.5 w-3.5" />
                                      SCAL
                                    </Button>
                                  </div>
                                )}
                              </TableCell>
                            ) : null}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {notEligibleRunPlan === 'kaiser' ? (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>RCFEs to notify (Kaiser inactive)</CardTitle>
                    <CardDescription>
                      Grouped by facility using Caspio RCFE_Name and the same owner/registration emails as RCFE Bulk
                      Email. Select RCFEs with email, then send the Kaiser Medi-Cal inactive notice. Each email is
                      CC&apos;d to {KAISER_INACTIVE_NOTICE_CC}.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>
                        {inactiveRcfeGroups.length.toLocaleString()} RCFE
                        {inactiveRcfeGroups.length === 1 ? '' : 's'} · {emailableGroups.length.toLocaleString()} with
                        email · {selectedGroups.length.toLocaleString()} selected
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7"
                        onClick={() => setSelectedRcfeKeys(new Set(emailableGroups.map((g) => g.key)))}
                      >
                        Select all with email
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7"
                        onClick={() => setSelectedRcfeKeys(new Set())}
                      >
                        Clear
                      </Button>
                    </div>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10" />
                            <TableHead>RCFE</TableHead>
                            <TableHead>Admin email</TableHead>
                            <TableHead>Members</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {inactiveRcfeGroups.map((group: KaiserInactiveRcfeGroup) => {
                            const hasEmail = group.emails.length > 0;
                            return (
                              <TableRow key={group.key}>
                                <TableCell>
                                  <Checkbox
                                    checked={selectedRcfeKeys.has(group.key)}
                                    disabled={!hasEmail}
                                    onCheckedChange={(v) => toggleRcfeKey(group.key, Boolean(v))}
                                  />
                                </TableCell>
                                <TableCell className="font-medium">{group.rcfeName}</TableCell>
                                <TableCell className="text-sm">
                                  {hasEmail ? (
                                    group.emails.join(', ')
                                  ) : (
                                    <span className="text-muted-foreground">No email on file</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-sm">{group.members.length}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Mail className="h-5 w-5" />
                      Email Kaiser inactive notice
                    </CardTitle>
                    <CardDescription>
                      Member/POA should call Kaiser to reinstate Medi-Cal. Guest eligibility check sites:{' '}
                      <a
                        className="text-primary underline"
                        href={KAISER_ELIGIBILITY_CHECK_NCAL_URL}
                        target="_blank"
                        rel="noreferrer"
                      >
                        NCAL
                      </a>{' '}
                      ·{' '}
                      <a
                        className="text-primary underline"
                        href={KAISER_ELIGIBILITY_CHECK_SCAL_URL}
                        target="_blank"
                        rel="noreferrer"
                      >
                        SCAL
                      </a>
                      . Always CC {KAISER_INACTIVE_NOTICE_CC}.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-sm font-medium">Subject</div>
                    <Input value={KAISER_INACTIVE_NOTICE_SUBJECT} readOnly />
                    <div className="text-sm font-medium">Message preview</div>
                    <Textarea value={noticePreview} readOnly className="min-h-[260px] font-mono text-xs" />
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">Test email address</div>
                        <Input
                          className="w-72"
                          placeholder="you@carehomefinders.com"
                          value={testEmail}
                          onChange={(e) => setTestEmail(e.target.value)}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={isSendingTest || !selectedGroups.length}
                        onClick={() => void sendKaiserInactiveNotices({ test: true })}
                      >
                        {isSendingTest ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <TestTube2 className="mr-2 h-4 w-4" />
                        )}
                        Send test (1 RCFE sample)
                      </Button>
                      <Button
                        type="button"
                        disabled={isSending || !selectedGroups.length}
                        onClick={() => void sendKaiserInactiveNotices()}
                      >
                        {isSending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="mr-2 h-4 w-4" />
                        )}
                        Email {selectedGroups.length || 0} selected RCFE
                        {selectedGroups.length === 1 ? '' : 's'}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={isSending || !selectedGroups.length}
                        onClick={() => void sendKaiserInactiveNotices({ resend: true })}
                        title="Resend the same notice to the selected RCFEs (subject prefixed with [Resend])"
                      >
                        {isSending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-2 h-4 w-4" />
                        )}
                        Resend to selected
                      </Button>
                    </div>
                    {lastSendResults?.length ? (
                      <div className="rounded-md border bg-muted/30 p-3 text-xs">
                        <div className="mb-1 font-medium">Last send results</div>
                        <ul className="space-y-1">
                          {lastSendResults.map((r, i) => (
                            <li key={`${r.rcfeName}-${i}`}>
                              {r.ok ? 'OK' : 'X'} {r.rcfeName}
                              {r.to?.length ? ` -> ${r.to.join(', ')}` : ''}
                              {r.error ? ` - ${r.error}` : ''}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      <div ref={resultsRef}>
        {openRun && openFiles ? (
          <EligibilityResultsCard
            key={openRun.id}
            members={members}
            plan={resolveBatchEligibilityRunPlan(openRun)}
            preloaded={openFiles}
            title={`Results decoded ${format(new Date(openRun.createdAtIso), 'MMM d, yyyy h:mm a')} · ${
              BATCH_ELIGIBILITY_PLAN_LABELS[resolveBatchEligibilityRunPlan(openRun)]
            }`}
            onRecheck={(clientIds) => {
              const runPlan = resolveBatchEligibilityRunPlan(openRun);
              try {
                sessionStorage.setItem(recheckStorageKeyForPlan(runPlan), JSON.stringify(clientIds));
              } catch {
                // ignore
              }
              router.push('/admin/tools/batch-eligibility-checker');
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
