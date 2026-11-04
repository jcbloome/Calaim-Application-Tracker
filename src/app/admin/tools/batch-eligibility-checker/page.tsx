'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import Link from 'next/link';
import {
  ChevronDown,
  ChevronRight,
  CloudDownload,
  Download,
  Eye,
  FileUp,
  History,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  X,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useAuth, useUser } from '@/firebase';
import {
  BATCH_ELIGIBILITY_PLAN_LABELS,
  KAISER_CLAIMMD_PAYER_IDS,
  KAISER_ELIGIBILITY_STATUSES,
  MEMBER_FIELD_LABELS,
  PLAN_FIXED_VALUES,
  applyKaiserClaimMdDefaults,
  buildCsv,
  buildRow,
  formatDate,
  isKaiserEligibilityStatus,
  parseTemplateSheet,
  recheckStorageKeyForPlan,
  resolveBatchEligibilityRunPlan,
  type BatchEligibilityMember,
  type BatchEligibilityPlan,
  type BatchEligibilityRun,
  type BatchEligibilityTemplate,
  type ColumnSource,
  type DateFormat,
  type KaiserClaimMdPayerMode,
  type MemberFieldKey,
} from '@/lib/batch-eligibility';
import { EligibilityResultsCard } from './eligibility-results-card';
import { KaiserBatchEligibility } from './kaiser-batch-eligibility';

const DATE_FORMATS: DateFormat[] = ['MM/DD/YYYY', 'YYYYMMDD', 'YYYY-MM-DD'];
type MemberList = 'authorized' | 'not-authorized' | 'recheck';
const isAuthorizedStatus = (status: string) => status.trim().toLowerCase() === 'authorized';
const isInactiveStatus = (status: string) => /^(non[\s_-]?active|inactive)$/i.test(status.trim());

const memberListsForPlan = (plan: BatchEligibilityPlan): Record<MemberList, { label: string; purpose: string }> => {
  if (plan === 'kaiser') {
    return {
      authorized: {
        label: 'Authorized / H2022',
        purpose: 'CalAIM_Status Authorized or H2022 — check current Kaiser eligibility via Claim.MD.',
      },
      'not-authorized': {
        label: 'Other statuses',
        purpose: 'All other Caspio statuses — optional eligibility check.',
      },
      recheck: {
        label: 'Re-check',
        purpose: 'Members picked from decoded results — fix them in Caspio, pull the latest, then resubmit.',
      },
    };
  }
  return {
    authorized: {
      label: 'Authorized',
      purpose: 'Caspio status Authorized — check whether any have lost eligibility.',
    },
    'not-authorized': {
      label: 'Inactive',
      purpose: 'Caspio status Non_Active — check whether any are now eligible.',
    },
    recheck: {
      label: 'Re-check',
      purpose: 'Members picked from decoded results — fix them in Caspio, pull the latest, then resubmit.',
    },
  };
};

const sourceToSelectValue = (source: ColumnSource | undefined) => {
  if (!source || source.kind === 'blank') return 'blank';
  if (source.kind === 'member') return `member:${source.field}`;
  if (source.kind === 'kaiserPayer') return `kaiserPayer:${source.mode}`;
  return source.kind;
};

function ClaimMdBatchEligibility({
  getIdToken,
  plan,
}: {
  getIdToken: () => Promise<string>;
  plan: BatchEligibilityPlan;
}) {
  const planLabel = BATCH_ELIGIBILITY_PLAN_LABELS[plan];
  const memberLists = memberListsForPlan(plan);
  const recheckKey = recheckStorageKeyForPlan(plan);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [template, setTemplate] = useState<BatchEligibilityTemplate | null>(null);
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(false);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [mappingDirty, setMappingDirty] = useState(false);
  const [members, setMembers] = useState<BatchEligibilityMember[]>([]);
  /** Current plan + other plan — used only to match 271 rows to Caspio (avoids false "not matched"). */
  const [matchMembers, setMatchMembers] = useState<BatchEligibilityMember[]>([]);
  const [membersSyncedIso, setMembersSyncedIso] = useState<string | null>(null);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [includedStatuses, setIncludedStatuses] = useState<Set<string> | null>(null);
  const [skipIncomplete, setSkipIncomplete] = useState(true);
  const [list, setList] = useState<MemberList>('authorized');
  const [isSavingRun, setIsSavingRun] = useState(false);
  const [formatSetupOpen, setFormatSetupOpen] = useState(false);
  const [recheckIds, setRecheckIds] = useState<string[]>([]);
  const [isPullingCaspio, setIsPullingCaspio] = useState(false);
  const [kaiserPayerMode, setKaiserPayerMode] = useState<KaiserClaimMdPayerMode>('region');
  const [recentRuns, setRecentRuns] = useState<BatchEligibilityRun[]>([]);
  const [isLoadingRuns, setIsLoadingRuns] = useState(false);
  const [loadingRunId, setLoadingRunId] = useState<string | null>(null);
  const [expandedRunIds, setExpandedRunIds] = useState<Set<string>>(new Set());
  const [recentRunsOpen, setRecentRunsOpen] = useState(false);
  const [rerunPreload, setRerunPreload] = useState<{
    key: string;
    files: Array<{ name: string; text: string }>;
    title: string;
    plan: BatchEligibilityPlan;
  } | null>(null);
  const step3Ref = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const authedFetch = useCallback(
    async (url: string, init?: RequestInit) => {
      const idToken = await getIdToken();
      const res = await fetch(url, {
        ...init,
        headers: { ...(init?.headers || {}), Authorization: `Bearer ${idToken}` },
        cache: 'no-store',
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || `HTTP ${res.status}`);
      return data;
    },
    [getIdToken]
  );

  const loadTemplate = useCallback(async () => {
    setIsLoadingTemplate(true);
    try {
      const data = await authedFetch(`/api/admin/batch-eligibility/template?plan=${plan}`);
      let next: BatchEligibilityTemplate | null = data.template || null;

      // Kaiser uses the same Claim.MD CSV layout as Health Net — reuse HN format when Kaiser
      // has never had its own template saved (otherwise download stays disabled).
      if (!next && plan === 'kaiser') {
        const hn = await authedFetch('/api/admin/batch-eligibility/template?plan=healthnet');
        const source = hn.template as BatchEligibilityTemplate | null;
        if (source?.columns?.length) {
          let mapping: Record<string, ColumnSource> = { ...(source.mapping || {}) };
          for (const [column, value] of Object.entries(PLAN_FIXED_VALUES.kaiser)) {
            if (source.columns.includes(column)) mapping[column] = { kind: 'constant', value };
          }
          next = applyKaiserClaimMdDefaults(
            {
              ...source,
              plan: 'kaiser',
              fileName: source.fileName || 'Claim.MD format (from Health Net)',
              mapping,
              uploadedAtIso: new Date().toISOString(),
              uploadedByEmail: source.uploadedByEmail || '',
            },
            'region'
          );
          const saved = await authedFetch('/api/admin/batch-eligibility/template', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(next),
          });
          next = saved.template || next;
          toast({
            title: 'Copied Health Net Claim.MD format for Kaiser',
            description: `Subscriber ID uses Kaiser MRN. Payerid: North ${KAISER_CLAIMMD_PAYER_IDS.north} / South ${KAISER_CLAIMMD_PAYER_IDS.south} (or ILS ${KAISER_CLAIMMD_PAYER_IDS.ils}).`,
          });
        }
      }

      if (next && plan === 'kaiser') {
        const payerSrc = next.columns.map((c) => next!.mapping[c]).find((src) => src?.kind === 'kaiserPayer');
        const mode = payerSrc?.kind === 'kaiserPayer' ? payerSrc.mode : 'region';
        setKaiserPayerMode(mode);
        const before = JSON.stringify(next.mapping);
        next = applyKaiserClaimMdDefaults(next, mode);
        if (JSON.stringify(next.mapping) !== before) {
          const saved = await authedFetch('/api/admin/batch-eligibility/template', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(next),
          });
          next = saved.template || next;
          toast({
            title: 'Kaiser Claim.MD mapping updated',
            description: 'Subscriber / member ID columns now use Kaiser MRN (not Medi-Cal CIN).',
          });
        }
      }

      setTemplate(next);
      setMappingDirty(false);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Could not load saved format', description: error?.message });
    } finally {
      setIsLoadingTemplate(false);
    }
  }, [authedFetch, plan, toast]);

  const loadMembers = useCallback(async () => {
    setIsLoadingMembers(true);
    try {
      const [data, allForMatch] = await Promise.all([
        authedFetch(`/api/admin/batch-eligibility/members?plan=${plan}`),
        authedFetch(`/api/admin/batch-eligibility/members?plan=all`).catch(() => ({ members: [] })),
      ]);
      const loaded: BatchEligibilityMember[] = data.members || [];
      setMembers(loaded);
      // Match 271 rows against the full Caspio cache (both plans) so Kaiser files
      // decoded on either tab still resolve — not only the current-plan list.
      const matchList: BatchEligibilityMember[] = allForMatch.members?.length
        ? allForMatch.members
        : loaded;
      setMatchMembers(matchList);
      setMembersSyncedIso(data.lastSyncedIso || null);
      setIncludedStatuses((prev) => {
        if (prev) return prev;
        if (plan === 'kaiser') {
          return new Set(loaded.map((m) => m.calaimStatus).filter((s) => !isKaiserEligibilityStatus(s)));
        }
        return new Set(loaded.map((m) => m.calaimStatus).filter(isInactiveStatus));
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: `Could not load ${planLabel} members`,
        description: error?.message,
      });
    } finally {
      setIsLoadingMembers(false);
    }
  }, [authedFetch, plan, planLabel, toast]);

  const loadRecentRuns = useCallback(async () => {
    setIsLoadingRuns(true);
    try {
      // Newest first by run time; API corrects MCP from Claim.MD payer IDs in saved 271s.
      const data = await authedFetch(`/api/admin/batch-eligibility/runs?limit=15`);
      setRecentRuns(data.runs || []);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Could not load recent runs', description: error?.message });
    } finally {
      setIsLoadingRuns(false);
    }
  }, [authedFetch, toast]);

  const downloadRunFile = async (run: BatchEligibilityRun, index: number) => {
    try {
      const idToken = await getIdToken();
      const res = await fetch(`/api/admin/batch-eligibility/runs/${run.id}?file=${index}`, {
        headers: { Authorization: `Bearer ${idToken}` },
        cache: 'no-store',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = run.files[index]?.name || 'batch-eligibility-file';
      link.click();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Download failed', description: error?.message });
    }
  };

  const reopenDecodeRun = async (run: BatchEligibilityRun) => {
    if (run.kind !== 'decode') return;
    setLoadingRunId(run.id);
    try {
      const idToken = await getIdToken();
      const files = await Promise.all(
        run.files.map(async (file, index) => {
          const res = await fetch(`/api/admin/batch-eligibility/runs/${run.id}?file=${index}`, {
            headers: { Authorization: `Bearer ${idToken}` },
            cache: 'no-store',
          });
          if (!res.ok) {
            const data = await res.json().catch(() => null);
            throw new Error(data?.error || `HTTP ${res.status}`);
          }
          return { name: file.name, text: await res.text() };
        })
      );
      const runPlan = resolveBatchEligibilityRunPlan(run);
      setRerunPreload({
        key: `${run.id}-${Date.now()}`,
        files,
        title: `Reopened ${BATCH_ELIGIBILITY_PLAN_LABELS[runPlan]} 271 · ${format(new Date(run.createdAtIso), 'MMM d, yyyy h:mm a')}`,
        plan: runPlan,
      });
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Could not reopen run', description: error?.message });
    } finally {
      setLoadingRunId(null);
    }
  };

  useEffect(() => {
    void loadTemplate();
    void loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveTemplate = async (next: BatchEligibilityTemplate, successTitle: string) => {
    setIsSavingTemplate(true);
    try {
      const data = await authedFetch('/api/admin/batch-eligibility/template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      setTemplate(data.template);
      setMappingDirty(false);
      toast({ title: successTitle });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Could not save format', description: error?.message });
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const handleTemplateFile = async (file: File) => {
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' });
      const parsed = parseTemplateSheet(rows, plan);
      await saveTemplate(
        { plan, fileName: file.name, ...parsed },
        `Saved Claim.MD format: ${parsed.columns.length} columns`
      );
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Could not read that file', description: error?.message });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const updateMapping = (column: string, source: ColumnSource) => {
    setTemplate((prev) => (prev ? { ...prev, mapping: { ...prev.mapping, [column]: source } } : prev));
    setMappingDirty(true);
  };

  const listMembers = useMemo(() => {
    const authorized =
      plan === 'kaiser'
        ? members.filter((m) => isKaiserEligibilityStatus(m.calaimStatus))
        : members.filter((m) => isAuthorizedStatus(m.calaimStatus));
    const notAuthorized =
      plan === 'kaiser'
        ? members.filter((m) => !isKaiserEligibilityStatus(m.calaimStatus))
        : members.filter((m) => isInactiveStatus(m.calaimStatus));
    const recheck = members.filter((m) => recheckIds.includes(m.clientId2));
    return { authorized, 'not-authorized': notAuthorized, recheck } as Record<MemberList, BatchEligibilityMember[]>;
  }, [members, recheckIds, plan]);

  const setKaiserPayerModeAndMapping = (mode: KaiserClaimMdPayerMode) => {
    setKaiserPayerMode(mode);
    setTemplate((prev) => (prev ? applyKaiserClaimMdDefaults(prev, mode) : prev));
    setMappingDirty(true);
  };

  const startRecheck = useCallback(
    (clientIds: string[]) => {
      const unique = [...new Set(clientIds.filter(Boolean))];
      setRecheckIds(unique);
      setList('recheck');
      try {
        sessionStorage.setItem(recheckKey, JSON.stringify(unique));
      } catch {
        // sessionStorage unavailable; the list still works for this page view
      }
      toast({
        title: `Re-check list: ${unique.length} member${unique.length === 1 ? '' : 's'}`,
        description: 'Fix them in Caspio, click "Pull latest from Caspio" in step 3, then download the re-check CSV.',
      });
      setTimeout(() => step3Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    },
    [toast, recheckKey]
  );

  const clearRecheck = () => {
    setRecheckIds([]);
    setList('authorized');
    try {
      sessionStorage.removeItem(recheckKey);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(recheckKey) || '[]');
      if (Array.isArray(saved) && saved.length) {
        setRecheckIds(saved.map(String));
        setList('recheck');
      }
    } catch {
      // ignore
    }
  }, [recheckKey]);

  const pullLatestFromCaspio = async () => {
    setIsPullingCaspio(true);
    try {
      const res = await fetch('/api/caspio/members-cache/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: await getIdToken(), mode: 'incremental' }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || `HTTP ${res.status}`);
      await loadMembers();
      toast({
        title: 'Pulled latest from Caspio',
        description: `${Number(data?.upserted || 0).toLocaleString()} changed member record(s) updated.`,
      });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Caspio sync failed', description: error?.message });
    } finally {
      setIsPullingCaspio(false);
    }
  };

  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of listMembers[list]) counts.set(m.calaimStatus, (counts.get(m.calaimStatus) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [listMembers, list]);

  const { selectedMembers, skippedIncomplete } = useMemo(() => {
    const byStatus =
      list === 'not-authorized'
        ? listMembers['not-authorized'].filter((m) => includedStatuses?.has(m.calaimStatus))
        : listMembers[list];
    // Claim.MD Kaiser eligibility needs Kaiser MRN as subscriber ID; Medi-Cal CIN is rejected.
    const complete = byStatus.filter((m) =>
      plan === 'kaiser'
        ? m.mrn && m.birthDate && m.lastName && m.firstName
        : m.medicalId && m.birthDate && m.lastName && m.firstName
    );
    return {
      selectedMembers: skipIncomplete ? complete : byStatus,
      skippedIncomplete: skipIncomplete ? byStatus.length - complete.length : 0,
    };
  }, [listMembers, list, includedStatuses, skipIncomplete, plan]);

  const missingRequiredColumns = useMemo(() => {
    if (!template?.columnInfo) return [];
    return template.columns.filter((column) => {
      if (!template.columnInfo?.[column]?.required) return false;
      const source = template.mapping[column];
      if (!source || source.kind === 'blank') return true;
      if (source.kind === 'constant' && !source.value.trim()) return true;
      return false;
    });
  }, [template]);

  const formatSetupForcedOpen = !template || mappingDirty || missingRequiredColumns.length > 0;
  const showFormatSetup = formatSetupOpen || formatSetupForcedOpen;

  const formatSetupSummary = useMemo(() => {
    if (!template) return `No Claim.MD format saved for ${planLabel} yet — expand to upload.`;
    const fixed = template.columns
      .map((column) => [column, template.mapping[column]] as const)
      .filter(([, source]) => source?.kind === 'constant' || source?.kind === 'kaiserPayer')
      .map(([column, source]) => {
        if (source?.kind === 'kaiserPayer') {
          return source.mode === 'ils'
            ? `${column} ILS ${KAISER_CLAIMMD_PAYER_IDS.ils}`
            : `${column} North ${KAISER_CLAIMMD_PAYER_IDS.north} / South ${KAISER_CLAIMMD_PAYER_IDS.south}`;
        }
        return `${column} ${(source as { value: string }).value}`;
      });
    return `${template.fileName} · ${template.columns.length} columns · dates ${template.dateFormat}${
      fixed.length ? ` · ${fixed.join(', ')}` : ''
    }`;
  }, [template, planLabel]);

  const downloadCsv = async () => {
    if (!template) return;
    const csv = buildCsv(template.columns, selectedMembers.map((m) => buildRow(m, template)));
    const fileName = `${planLabel} batch eligibility - ${memberLists[list].label} - ${format(new Date(), 'yyyy-MM-dd')}.csv`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);

    setIsSavingRun(true);
    try {
      const statuses =
        list === 'authorized'
          ? plan === 'kaiser'
            ? [...KAISER_ELIGIBILITY_STATUSES]
            : ['Authorized']
          : list === 'recheck'
            ? [...new Set(selectedMembers.map((m) => m.calaimStatus))]
            : [...(includedStatuses || [])];
      const form = new FormData();
      form.append('kind', 'batch');
      form.append('plan', plan);
      form.append('list', list);
      form.append(
        'summary',
        JSON.stringify({
          memberCount: selectedMembers.length,
          listLabel: memberLists[list].label,
          statuses,
          skippedIncomplete,
          membersSyncedIso,
          templateFileName: template.fileName,
          format: 'claimmd-csv',
          ...(plan === 'kaiser'
            ? {
                payerMode: kaiserPayerMode,
                payerIds:
                  kaiserPayerMode === 'ils'
                    ? { ils: KAISER_CLAIMMD_PAYER_IDS.ils }
                    : {
                        north: KAISER_CLAIMMD_PAYER_IDS.north,
                        south: KAISER_CLAIMMD_PAYER_IDS.south,
                      },
              }
            : {}),
        })
      );
      form.append('files', new File([blob], fileName, { type: 'text/csv' }));
      await authedFetch('/api/admin/batch-eligibility/runs', { method: 'POST', body: form });
      toast({ title: 'Batch file saved to the Batch Eligibility Log' });
      void loadRecentRuns();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Downloaded, but could not save to the log', description: error?.message });
    } finally {
      setIsSavingRun(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-md border bg-muted/20">
        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40"
          onClick={() => setFormatSetupOpen((open) => !open)}
        >
          {showFormatSetup ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <span className="shrink-0 font-medium">Claim.MD format &amp; mapping</span>
          {isLoadingTemplate ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
          {template && !formatSetupForcedOpen ? (
            <Badge variant="secondary" className="shrink-0 font-normal">
              Ready
            </Badge>
          ) : null}
          {missingRequiredColumns.length ? (
            <Badge variant="destructive" className="shrink-0 font-normal">
              {missingRequiredColumns.length} required
            </Badge>
          ) : null}
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{formatSetupSummary}</span>
        </button>
        {showFormatSetup ? (
          <div className="space-y-4 border-t bg-background p-3">
            <div className="space-y-2">
              <div className="text-sm font-medium">Spreadsheet format</div>
              <p className="text-xs text-muted-foreground">
                Upload Claim.MD&apos;s column definitions or Batch Eligibility CSV example. Saved per {planLabel}.
                {plan === 'kaiser'
                  ? ` Payerid: ILS ${KAISER_CLAIMMD_PAYER_IDS.ils}, North ${KAISER_CLAIMMD_PAYER_IDS.north}, South ${KAISER_CLAIMMD_PAYER_IDS.south}.`
                  : null}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleTemplateFile(file);
                  }}
                />
                <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={isSavingTemplate}>
                  {isSavingTemplate ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FileUp className="mr-2 h-4 w-4" />
                  )}
                  {template ? 'Upload a new format' : 'Upload Claim.MD format'}
                </Button>
                {template ? (
                  <span className="text-xs text-muted-foreground">
                    Using <span className="font-medium text-foreground">{template.fileName}</span>
                    {template.uploadedAtIso
                      ? ` · ${format(new Date(template.uploadedAtIso), 'MMM d, yyyy')}`
                      : ''}
                  </span>
                ) : null}
              </div>
            </div>

            {template ? (
              <div className="space-y-3">
                <div className="text-sm font-medium">Column mapping</div>
                <p className="text-xs text-muted-foreground">
                  Each Claim.MD column is filled from the member&apos;s Caspio record, a fixed value, or today&apos;s
                  date.
                </p>
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <label className="flex items-center gap-2">
                    Date format
                    <select
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                      value={template.dateFormat}
                      onChange={(e) => {
                        setTemplate({ ...template, dateFormat: e.target.value as DateFormat });
                        setMappingDirty(true);
                      }}
                    >
                      {DATE_FORMATS.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    size="sm"
                    variant={mappingDirty ? 'default' : 'outline'}
                    onClick={() => void saveTemplate(template, 'Column mapping saved')}
                    disabled={isSavingTemplate || !mappingDirty}
                  >
                    <Save className="mr-2 h-4 w-4" />
                    {mappingDirty ? 'Save mapping' : 'Mapping saved'}
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Claim.MD column</TableHead>
                        <TableHead>{template.columnInfo ? 'Claim.MD notes' : 'Example value'}</TableHead>
                        <TableHead>Fill with</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {template.columns.map((column, i) => {
                        const source = template.mapping[column];
                        const info = template.columnInfo?.[column];
                        const missingRequired = missingRequiredColumns.includes(column);
                        return (
                          <TableRow key={column} className={missingRequired ? 'bg-amber-50' : undefined}>
                            <TableCell className="align-top">
                              <div className="font-mono text-xs">{column}</div>
                              {info?.required ? (
                                <Badge variant={missingRequired ? 'destructive' : 'secondary'} className="mt-1">
                                  Required
                                </Badge>
                              ) : null}
                            </TableCell>
                            <TableCell className="align-top text-xs text-muted-foreground">
                              {info ? (
                                <div className="space-y-1">
                                  <div className="text-foreground">{info.description}</div>
                                  {info.dataType ? <div>{info.dataType}</div> : null}
                                  {info.allowedValues ? (
                                    <div className="whitespace-pre-line">{info.allowedValues}</div>
                                  ) : null}
                                </div>
                              ) : (
                                template.exampleRow[i] || '—'
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap items-center gap-2">
                                <select
                                  className="h-9 min-w-[14rem] rounded-md border border-input bg-background px-2 text-sm"
                                  value={sourceToSelectValue(source)}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    if (v.startsWith('member:')) {
                                      updateMapping(column, { kind: 'member', field: v.slice(7) as MemberFieldKey });
                                    } else if (v.startsWith('kaiserPayer:')) {
                                      const mode = v.slice('kaiserPayer:'.length) as KaiserClaimMdPayerMode;
                                      setKaiserPayerMode(mode);
                                      updateMapping(column, { kind: 'kaiserPayer', mode });
                                    } else if (v === 'constant') {
                                      updateMapping(column, {
                                        kind: 'constant',
                                        value: template.exampleRow[i] || '',
                                      });
                                    } else if (v === 'today') {
                                      updateMapping(column, { kind: 'today' });
                                    } else {
                                      updateMapping(column, { kind: 'blank' });
                                    }
                                  }}
                                >
                                  <option value="blank">Leave blank</option>
                                  <option value="constant">Fixed value…</option>
                                  <option value="today">Today&apos;s date</option>
                                  {plan === 'kaiser' ? (
                                    <>
                                      <option value="kaiserPayer:region">
                                        Kaiser by region (N {KAISER_CLAIMMD_PAYER_IDS.north} / S{' '}
                                        {KAISER_CLAIMMD_PAYER_IDS.south})
                                      </option>
                                      <option value="kaiserPayer:ils">
                                        ILS claims payer ({KAISER_CLAIMMD_PAYER_IDS.ils})
                                      </option>
                                    </>
                                  ) : null}
                                  {(Object.keys(MEMBER_FIELD_LABELS) as MemberFieldKey[]).map((field) => (
                                    <option key={field} value={`member:${field}`}>
                                      {MEMBER_FIELD_LABELS[field]}
                                    </option>
                                  ))}
                                </select>
                                {source?.kind === 'constant' ? (
                                  <Input
                                    className="h-9 w-48"
                                    value={source.value}
                                    onChange={(e) =>
                                      updateMapping(column, { kind: 'constant', value: e.target.value })
                                    }
                                  />
                                ) : null}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <Card ref={step3Ref}>
        <CardHeader>
          <CardTitle>1. Choose a member list</CardTitle>
          <CardDescription>
            {planLabel} members from the synced Caspio members cache
            {membersSyncedIso ? ` (last synced ${format(new Date(membersSyncedIso), 'MMM d, yyyy h:mm a')})` : ''}.
            Run each list as its own Claim.MD batch.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => void loadMembers()} disabled={isLoadingMembers}>
              {isLoadingMembers ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Reload members
            </Button>
            <Button size="sm" variant="outline" onClick={() => void pullLatestFromCaspio()} disabled={isPullingCaspio}>
              {isPullingCaspio ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CloudDownload className="mr-2 h-4 w-4" />
              )}
              Pull latest from Caspio
            </Button>
            <span className="text-sm text-muted-foreground">
              {members.length.toLocaleString()} {planLabel} members
            </span>
          </div>
          <div className={`grid gap-2 ${recheckIds.length ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
            {(Object.keys(memberLists) as MemberList[])
              .filter((key) => key !== 'recheck' || recheckIds.length > 0)
              .map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setList(key)}
                className={`rounded-md border p-3 text-left transition-colors ${
                  list === key ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{memberLists[key].label}</span>
                  <Badge variant={list === key ? 'default' : 'secondary'}>
                    {listMembers[key].length.toLocaleString()}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{memberLists[key].purpose}</div>
              </button>
              ))}
          </div>
          {list === 'recheck' ? (
            <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm">
                  <span className="font-medium">Re-check list.</span> Fix these members in Caspio (Medi-Cal CIN, name,
                  birth date, status), click <span className="font-medium">Pull latest from Caspio</span>, then download
                  the re-check CSV in step 2, submit it to Claim.MD, and decode the new 271 in step 3.
                </div>
                <Button size="sm" variant="ghost" onClick={clearRecheck}>
                  <X className="mr-1 h-4 w-4" /> Clear re-check list
                </Button>
              </div>
              {recheckIds.length > listMembers.recheck.length ? (
                <div className="text-xs text-amber-700">
                  {recheckIds.length - listMembers.recheck.length} selected member(s) are no longer in the {planLabel}{' '}
                  cache (deleted or plan changed).
                </div>
              ) : null}
              <div className="max-h-64 overflow-y-auto rounded border bg-background">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Member</TableHead>
                      <TableHead>{plan === 'kaiser' ? 'Kaiser MRN' : 'Medi-Cal CIN'}</TableHead>
                      <TableHead>DOB</TableHead>
                      <TableHead>Caspio status</TableHead>
                      <TableHead>Client ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {listMembers.recheck.map((m) => (
                      <TableRow key={m.clientId2}>
                        <TableCell className="text-xs">
                          {m.lastName || <span className="text-destructive">missing last name</span>},{' '}
                          {m.firstName || <span className="text-destructive">missing first name</span>}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {plan === 'kaiser' ? (
                            m.mrn || <span className="text-destructive">missing</span>
                          ) : (
                            m.medicalId || <span className="text-destructive">missing</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {m.birthDate ? (
                            formatDate(m.birthDate, 'MM/DD/YYYY')
                          ) : (
                            <span className="text-destructive">missing</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{m.calaimStatus}</TableCell>
                        <TableCell className="text-xs">{m.clientId2}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
          {list === 'not-authorized' ? (
            <div className="text-xs text-muted-foreground">
              {plan === 'kaiser'
                ? 'Untick any status to leave it out of this batch:'
                : 'Caspio has both spellings of Non_Active; untick either to leave it out:'}
            </div>
          ) : null}
          <div className={`flex flex-wrap gap-2 ${list !== 'not-authorized' ? 'hidden' : ''}`}>
            {statusCounts.map(([status, count]) => {
              const checked = Boolean(includedStatuses?.has(status));
              return (
                <label
                  key={status}
                  className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1 text-sm ${
                    checked ? 'border-primary bg-primary/5' : ''
                  }`}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(value) =>
                      setIncludedStatuses((prev) => {
                        const next = new Set(prev || []);
                        if (value) next.add(status);
                        else next.delete(status);
                        return next;
                      })
                    }
                  />
                  {status} <Badge variant="secondary">{count}</Badge>
                </label>
              );
            })}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={skipIncomplete} onCheckedChange={(value) => setSkipIncomplete(Boolean(value))} />
            {plan === 'kaiser'
              ? 'Leave out members missing a Kaiser MRN, birth date, or name'
              : 'Leave out members missing a Medi-Cal CIN, birth date, or name'}
            {skippedIncomplete ? <Badge variant="outline">{skippedIncomplete} left out</Badge> : null}
          </label>
          {plan === 'kaiser' ? (
            <div className="text-xs text-muted-foreground">
              Claim.MD Kaiser checks use the Kaiser MRN as subscriber ID. Medi-Cal CINs (e.g. 8 digits + letter) come
              back as Rejected / Invalid subscriber ID.
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Download for Claim.MD</CardTitle>
          <CardDescription>
            Upload the downloaded CSV to Claim.MD as a Batch Eligibility (CSV) file. Results come back in Claim.MD as
            271 responses per patient, not as a spreadsheet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {plan === 'kaiser' ? (
            <div className="space-y-2 rounded-md border p-3 text-sm">
              <div className="font-medium">Claim.MD payerid</div>
              <div className="flex flex-wrap gap-3">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="kaiser-payer-mode"
                    checked={kaiserPayerMode === 'region'}
                    onChange={() => setKaiserPayerModeAndMapping('region')}
                  />
                  By region — North {KAISER_CLAIMMD_PAYER_IDS.north} / South {KAISER_CLAIMMD_PAYER_IDS.south}
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="kaiser-payer-mode"
                    checked={kaiserPayerMode === 'ils'}
                    onChange={() => setKaiserPayerModeAndMapping('ils')}
                  />
                  ILS claims payer {KAISER_CLAIMMD_PAYER_IDS.ils} (all rows)
                </label>
              </div>
              <div className="text-xs text-muted-foreground">
                Unknown region defaults to North {KAISER_CLAIMMD_PAYER_IDS.north}. Save mapping after changing before
                download.
              </div>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => void downloadCsv()}
              disabled={
                !template || !selectedMembers.length || mappingDirty || missingRequiredColumns.length > 0 || isSavingRun
              }
            >
              {isSavingRun ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Download {memberLists[list].label} CSV ({selectedMembers.length.toLocaleString()} members)
            </Button>
            {!template ? (
              <span className="text-sm text-muted-foreground">
                {plan === 'kaiser'
                  ? 'No Claim.MD format yet — expand Claim.MD format & mapping above, or save Health Net’s format first so Kaiser can reuse it.'
                  : 'Expand Claim.MD format & mapping above to upload a format first.'}
              </span>
            ) : missingRequiredColumns.length ? (
              <span className="text-sm text-destructive">
                Fill the required column{missingRequiredColumns.length > 1 ? 's' : ''}{' '}
                {missingRequiredColumns.join(', ')} in Claim.MD format &amp; mapping first.
              </span>
            ) : mappingDirty ? (
              <span className="text-sm text-muted-foreground">Save the column mapping first.</span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            onClick={() => {
              setRecentRunsOpen((open) => {
                const next = !open;
                if (next && !recentRuns.length) void loadRecentRuns();
                return next;
              });
            }}
          >
            {recentRunsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            Recent runs
            {recentRuns.length ? (
              <Badge variant="secondary" className="ml-1">
                {recentRuns.length}
              </Badge>
            ) : null}
          </button>
          {recentRunsOpen ? (
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => void loadRecentRuns()} disabled={isLoadingRuns}>
              {isLoadingRuns ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </Button>
          ) : null}
          <Link href="/admin/tools/batch-eligibility-log" className="text-xs text-muted-foreground hover:underline">
            Full log
          </Link>
        </div>
        {recentRunsOpen ? (
          !isLoadingRuns && !recentRuns.length ? (
            <div className="rounded-md border border-dashed px-3 py-2 text-center text-xs text-muted-foreground">
              No saved runs yet. Batch CSVs and decoded 271s are stored when you download or upload them.
            </div>
          ) : (
            <div className="divide-y rounded-md border">
              {recentRuns.map((run) => {
                const isOpen = expandedRunIds.has(run.id);
                const runPlan = resolveBatchEligibilityRunPlan(run);
                const payerIds = Array.isArray(run.summary?.payerIds)
                  ? run.summary.payerIds.filter(Boolean).join(', ')
                  : '';
                const summaryText =
                  run.kind === 'batch'
                    ? `${Number(run.summary?.memberCount || 0).toLocaleString()} members${
                        run.summary?.listLabel ? ` · ${run.summary.listLabel}` : ''
                      }`
                    : [
                        `${Number(run.summary?.active || 0)} active`,
                        `${Number(run.summary?.inactive || 0)} inactive`,
                        `${Number(run.summary?.rejected || 0)} rejected`,
                        Number(run.summary?.flagged || 0) ? `${Number(run.summary.flagged)} review` : '',
                      ]
                        .filter(Boolean)
                        .join(' · ');
                return (
                  <div key={run.id} className={isOpen ? 'bg-muted/20' : undefined}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted/40"
                      onClick={() =>
                        setExpandedRunIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(run.id)) next.delete(run.id);
                          else next.add(run.id);
                          return next;
                        })
                      }
                    >
                      {isOpen ? (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="w-[9.5rem] shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                        {format(new Date(run.createdAtIso), 'MMM d, h:mm a')}
                      </span>
                      <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px]">
                        {BATCH_ELIGIBILITY_PLAN_LABELS[runPlan]}
                      </Badge>
                      <Badge
                        variant={run.kind === 'batch' ? 'secondary' : 'default'}
                        className="shrink-0 px-1.5 py-0 text-[10px]"
                      >
                        {run.kind === 'batch' ? 'Batch' : '271'}
                      </Badge>
                      <span className="min-w-0 flex-1 truncate text-xs">{summaryText}</span>
                    </button>
                    {isOpen ? (
                      <div className="flex flex-wrap items-center gap-2 border-t bg-background px-3 py-2 pl-9">
                        <span className="text-xs text-muted-foreground">
                          {BATCH_ELIGIBILITY_PLAN_LABELS[runPlan]}
                          {payerIds ? ` · payer ${payerIds}` : ''}
                          {` · ${run.createdByName || run.createdByEmail || 'Unknown'}`}
                          {run.list
                            ? ` · ${memberListsForPlan(runPlan)[run.list as MemberList]?.label || run.list}`
                            : ''}
                          {run.files[0] ? ` · ${run.files[0].name}` : ''}
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {run.files.map((file, index) => (
                            <button
                              key={file.storagePath}
                              type="button"
                              onClick={() => void downloadRunFile(run, index)}
                              className="flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              <Download className="h-3 w-3 shrink-0" />
                              {file.name}
                            </button>
                          ))}
                        </div>
                        {run.kind === 'decode' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="ml-auto h-7"
                            disabled={loadingRunId === run.id}
                            onClick={() => void reopenDecodeRun(run)}
                          >
                            {loadingRunId === run.id ? (
                              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Eye className="mr-1 h-3.5 w-3.5" />
                            )}
                            Open / re-check
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="ml-auto h-7"
                            disabled={!run.files.length}
                            onClick={() => void downloadRunFile(run, 0)}
                          >
                            <RotateCcw className="mr-1 h-3.5 w-3.5" />
                            Re-download CSV
                          </Button>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )
        ) : null}
      </div>

      <div ref={resultsRef}>
        <EligibilityResultsCard
          key={rerunPreload?.key || 'upload'}
          members={matchMembers.length ? matchMembers : members}
          plan={rerunPreload?.plan || plan}
          getIdToken={getIdToken}
          preloaded={rerunPreload?.files}
          title={rerunPreload?.title || '3. Decode Claim.MD 271 results'}
          allowUploadWhenPreloaded
          onRecheck={startRecheck}
          onSavedToLog={() => void loadRecentRuns()}
        />
      </div>
    </div>
  );
}

export default function BatchEligibilityCheckerPage() {
  const auth = useAuth();
  const { user } = useUser();
  const getIdToken = useCallback(async () => {
    const tokenUser = user || auth.currentUser;
    if (!tokenUser) throw new Error('Sign in required');
    return tokenUser.getIdToken();
  }, [user, auth]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Batch Eligibility Checker</h1>
          <p className="text-muted-foreground">
            Build Claim.MD batch eligibility CSVs for Health Net and Kaiser (same format), decode the 271 results, and
            optionally build a Kaiser X12 270 for Smart Data Solutions when that path is ready.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/tools/batch-eligibility-log">
            <History className="mr-2 h-4 w-4" />
            Batch &amp; decode log
          </Link>
        </Button>
      </div>
      <Tabs defaultValue="healthnet">
        <TabsList>
          <TabsTrigger value="healthnet">Health Net</TabsTrigger>
          <TabsTrigger value="kaiser">Kaiser</TabsTrigger>
        </TabsList>
        <TabsContent value="healthnet" className="mt-4">
          <ClaimMdBatchEligibility getIdToken={getIdToken} plan="healthnet" />
        </TabsContent>
        <TabsContent value="kaiser" className="mt-4 space-y-6">
          <ClaimMdBatchEligibility getIdToken={getIdToken} plan="kaiser" />
          <div className="rounded-md border border-dashed p-4">
            <div className="mb-3 text-sm text-muted-foreground">
              Optional — X12 270 for Smart Data Solutions (keep using Claim.MD above until SDS submission is figured
              out).
            </div>
            <KaiserBatchEligibility getIdToken={getIdToken} mode="sds-optional" />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
