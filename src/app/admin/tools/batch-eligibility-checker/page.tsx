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
  FileUp,
  History,
  Loader2,
  RefreshCw,
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
  MEMBER_FIELD_LABELS,
  buildCsv,
  RECHECK_STORAGE_KEY,
  buildRow,
  formatDate,
  parseTemplateSheet,
  type BatchEligibilityMember,
  type BatchEligibilityPlan,
  type BatchEligibilityTemplate,
  type ColumnSource,
  type DateFormat,
  type MemberFieldKey,
} from '@/lib/batch-eligibility';
import { EligibilityResultsCard } from './eligibility-results-card';
import { KaiserBatchEligibility } from './kaiser-batch-eligibility';

const DATE_FORMATS: DateFormat[] = ['MM/DD/YYYY', 'YYYYMMDD', 'YYYY-MM-DD'];
type MemberList = 'authorized' | 'not-authorized' | 'recheck';
const MEMBER_LISTS: Record<MemberList, { label: string; purpose: string }> = {
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
const isAuthorizedStatus = (status: string) => status.trim().toLowerCase() === 'authorized';
const isInactiveStatus = (status: string) => /^(non[\s_-]?active|inactive)$/i.test(status.trim());

const sourceToSelectValue = (source: ColumnSource | undefined) => {
  if (!source || source.kind === 'blank') return 'blank';
  if (source.kind === 'member') return `member:${source.field}`;
  return source.kind;
};

function HealthNetBatchEligibility({ getIdToken }: { getIdToken: () => Promise<string> }) {
  const plan: BatchEligibilityPlan = 'healthnet';
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [template, setTemplate] = useState<BatchEligibilityTemplate | null>(null);
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(false);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [mappingDirty, setMappingDirty] = useState(false);
  const [members, setMembers] = useState<BatchEligibilityMember[]>([]);
  const [membersSyncedIso, setMembersSyncedIso] = useState<string | null>(null);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [includedStatuses, setIncludedStatuses] = useState<Set<string> | null>(null);
  const [skipIncomplete, setSkipIncomplete] = useState(true);
  const [list, setList] = useState<MemberList>('authorized');
  const [isSavingRun, setIsSavingRun] = useState(false);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [recheckIds, setRecheckIds] = useState<string[]>([]);
  const [isPullingCaspio, setIsPullingCaspio] = useState(false);
  const step3Ref = useRef<HTMLDivElement>(null);

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
      setTemplate(data.template || null);
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
      const data = await authedFetch(`/api/admin/batch-eligibility/members?plan=${plan}`);
      const loaded: BatchEligibilityMember[] = data.members || [];
      setMembers(loaded);
      setMembersSyncedIso(data.lastSyncedIso || null);
      setIncludedStatuses(
        (prev) =>
          prev ||
          new Set(loaded.map((m) => m.calaimStatus).filter(isInactiveStatus))
      );
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Could not load Health Net members', description: error?.message });
    } finally {
      setIsLoadingMembers(false);
    }
  }, [authedFetch, plan, toast]);

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
    const authorized = members.filter((m) => isAuthorizedStatus(m.calaimStatus));
    const notAuthorized = members.filter((m) => isInactiveStatus(m.calaimStatus));
    const recheck = members.filter((m) => recheckIds.includes(m.clientId2));
    return { authorized, 'not-authorized': notAuthorized, recheck } as Record<MemberList, BatchEligibilityMember[]>;
  }, [members, recheckIds]);

  const startRecheck = useCallback(
    (clientIds: string[]) => {
      const unique = [...new Set(clientIds.filter(Boolean))];
      setRecheckIds(unique);
      setList('recheck');
      try {
        sessionStorage.setItem(RECHECK_STORAGE_KEY, JSON.stringify(unique));
      } catch {
        // sessionStorage unavailable; the list still works for this page view
      }
      toast({
        title: `Re-check list: ${unique.length} member${unique.length === 1 ? '' : 's'}`,
        description: 'Fix them in Caspio, click "Pull latest from Caspio" in step 3, then download the re-check CSV.',
      });
      setTimeout(() => step3Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    },
    [toast]
  );

  const clearRecheck = () => {
    setRecheckIds([]);
    setList('authorized');
    try {
      sessionStorage.removeItem(RECHECK_STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(RECHECK_STORAGE_KEY) || '[]');
      if (Array.isArray(saved) && saved.length) {
        setRecheckIds(saved.map(String));
        setList('recheck');
      }
    } catch {
      // ignore
    }
  }, []);

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
    const complete = byStatus.filter((m) => m.medicalId && m.birthDate && m.lastName && m.firstName);
    return {
      selectedMembers: skipIncomplete ? complete : byStatus,
      skippedIncomplete: skipIncomplete ? byStatus.length - complete.length : 0,
    };
  }, [listMembers, list, includedStatuses, skipIncomplete]);

  const missingRequiredColumns = useMemo(() => {
    if (!template?.columnInfo) return [];
    return template.columns.filter((column) => {
      if (!template.columnInfo?.[column]?.required) return false;
      const source = template.mapping[column];
      return !source || source.kind === 'blank' || (source.kind === 'constant' && !source.value.trim());
    });
  }, [template]);

  const showMapping = mappingOpen || mappingDirty || missingRequiredColumns.length > 0;

  const mappingSummary = useMemo(() => {
    if (!template) return '';
    const fixed = template.columns
      .map((column) => [column, template.mapping[column]] as const)
      .filter(([, source]) => source?.kind === 'constant')
      .map(([column, source]) => `${column} ${(source as { value: string }).value}`);
    return `Saved mapping · dates ${template.dateFormat}${fixed.length ? ` · ${fixed.join(', ')}` : ''}. Click to view or change.`;
  }, [template]);

  const previewRows = useMemo(
    () => (template ? selectedMembers.slice(0, 10).map((m) => buildRow(m, template)) : []),
    [template, selectedMembers]
  );

  const downloadCsv = async () => {
    if (!template) return;
    const csv = buildCsv(template.columns, selectedMembers.map((m) => buildRow(m, template)));
    const fileName = `Health Net batch eligibility - ${MEMBER_LISTS[list].label} - ${format(new Date(), 'yyyy-MM-dd')}.csv`;
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
          ? ['Authorized']
          : list === 'recheck'
            ? [...new Set(selectedMembers.map((m) => m.calaimStatus))]
            : [...(includedStatuses || [])].filter(isInactiveStatus);
      const form = new FormData();
      form.append('kind', 'batch');
      form.append('plan', plan);
      form.append('list', list);
      form.append(
        'summary',
        JSON.stringify({
          memberCount: selectedMembers.length,
          listLabel: MEMBER_LISTS[list].label,
          statuses,
          skippedIncomplete,
          membersSyncedIso,
          templateFileName: template.fileName,
        })
      );
      form.append('files', new File([blob], fileName, { type: 'text/csv' }));
      await authedFetch('/api/admin/batch-eligibility/runs', { method: 'POST', body: form });
      toast({ title: 'Batch file saved to the Batch Eligibility Log' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Downloaded, but could not save to the log', description: error?.message });
    } finally {
      setIsSavingRun(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>1. Claim.MD spreadsheet format</CardTitle>
          <CardDescription>
            Upload Claim.MD&apos;s &quot;Supported Column Definitions&quot; sheet (one row per field) or their Batch
            Eligibility CSV example (first row = column names, second row = example values). The format is saved for
            next time.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
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
              {isSavingTemplate ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
              {template ? 'Upload a new Claim.MD format' : 'Upload Claim.MD format (CSV or Excel)'}
            </Button>
            {isLoadingTemplate ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
            {template ? (
              <span className="text-sm text-muted-foreground">
                Using <span className="font-medium text-foreground">{template.fileName}</span> · {template.columns.length}{' '}
                columns
                {template.uploadedAtIso ? ` · uploaded ${format(new Date(template.uploadedAtIso), 'MMM d, yyyy')}` : ''}
                {template.uploadedByEmail ? ` by ${template.uploadedByEmail}` : ''}
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {template ? (
        <Card>
          <CardHeader className="cursor-pointer select-none" onClick={() => setMappingOpen((open) => !open)}>
            <CardTitle className="flex items-center gap-2">
              {showMapping ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
              2. What goes in each column
              {!showMapping ? (
                <Badge variant="secondary" className="font-normal">
                  {template.columns.length} columns set
                </Badge>
              ) : null}
            </CardTitle>
            <CardDescription>
              {showMapping
                ? "Each Claim.MD column is filled from the member's Caspio record, a fixed value (same for every row), or today's date."
                : mappingSummary}
            </CardDescription>
          </CardHeader>
          <CardContent className={`space-y-3 ${showMapping ? '' : 'hidden'}`}>
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
                                } else if (v === 'constant') {
                                  updateMapping(column, { kind: 'constant', value: template.exampleRow[i] || '' });
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
                                onChange={(e) => updateMapping(column, { kind: 'constant', value: e.target.value })}
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
          </CardContent>
        </Card>
      ) : null}

      <Card ref={step3Ref}>
        <CardHeader>
          <CardTitle>3. Choose a member list</CardTitle>
          <CardDescription>
            Health Net members from the synced Caspio members cache
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
            <span className="text-sm text-muted-foreground">{members.length.toLocaleString()} Health Net members</span>
          </div>
          <div className={`grid gap-2 ${recheckIds.length ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
            {(Object.keys(MEMBER_LISTS) as MemberList[])
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
                  <span className="font-medium">{MEMBER_LISTS[key].label}</span>
                  <Badge variant={list === key ? 'default' : 'secondary'}>
                    {listMembers[key].length.toLocaleString()}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{MEMBER_LISTS[key].purpose}</div>
              </button>
              ))}
          </div>
          {list === 'recheck' ? (
            <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm">
                  <span className="font-medium">Re-check list.</span> Fix these members in Caspio (Medi-Cal CIN, name,
                  birth date, status), click <span className="font-medium">Pull latest from Caspio</span>, then download
                  the re-check CSV in step 4, submit it to Claim.MD, and decode the new 271 in step 5.
                </div>
                <Button size="sm" variant="ghost" onClick={clearRecheck}>
                  <X className="mr-1 h-4 w-4" /> Clear re-check list
                </Button>
              </div>
              {recheckIds.length > listMembers.recheck.length ? (
                <div className="text-xs text-amber-700">
                  {recheckIds.length - listMembers.recheck.length} selected member(s) are no longer in the Health Net
                  cache (deleted or plan changed).
                </div>
              ) : null}
              <div className="max-h-64 overflow-y-auto rounded border bg-background">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Member</TableHead>
                      <TableHead>Medi-Cal CIN</TableHead>
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
                          {m.medicalId || <span className="text-destructive">missing</span>}
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
              Caspio has both spellings of Non_Active; untick either to leave it out:
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
            Leave out members missing a Medi-Cal CIN, birth date, or name
            {skippedIncomplete ? <Badge variant="outline">{skippedIncomplete} left out</Badge> : null}
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>4. Download for Claim.MD</CardTitle>
          <CardDescription>
            Upload the downloaded CSV to Claim.MD as a Batch Eligibility (CSV) file. Results come back in Claim.MD as
            271 responses per patient, not as a spreadsheet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => void downloadCsv()}
              disabled={
                !template || !selectedMembers.length || mappingDirty || missingRequiredColumns.length > 0 || isSavingRun
              }
            >
              {isSavingRun ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Download {MEMBER_LISTS[list].label} CSV ({selectedMembers.length.toLocaleString()} members)
            </Button>
            {!template ? (
              <span className="text-sm text-muted-foreground">Upload the Claim.MD format first.</span>
            ) : missingRequiredColumns.length ? (
              <span className="text-sm text-destructive">
                Fill the required column{missingRequiredColumns.length > 1 ? 's' : ''}{' '}
                {missingRequiredColumns.join(', ')} in step 2 first.
              </span>
            ) : mappingDirty ? (
              <span className="text-sm text-muted-foreground">Save the column mapping first.</span>
            ) : null}
          </div>
          {template && previewRows.length ? (
            <div className="overflow-x-auto">
              <div className="mb-1 text-xs text-muted-foreground">First {previewRows.length} rows</div>
              <Table>
                <TableHeader>
                  <TableRow>
                    {template.columns.map((column) => (
                      <TableHead key={column} className="whitespace-nowrap font-mono text-xs">
                        {column}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((row, r) => (
                    <TableRow key={r}>
                      {row.map((cell, c) => (
                        <TableCell key={c} className="whitespace-nowrap text-xs">
                          {cell}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <EligibilityResultsCard members={members} plan={plan} getIdToken={getIdToken} onRecheck={startRecheck} />
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
            Build batch eligibility files from our members — Health Net as a Claim.MD CSV, Kaiser as an X12 270 for
            Smart Data Solutions — and decode the 271 results.
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
          <HealthNetBatchEligibility getIdToken={getIdToken} />
        </TabsContent>
        <TabsContent value="kaiser" className="mt-4">
          <KaiserBatchEligibility getIdToken={getIdToken} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
