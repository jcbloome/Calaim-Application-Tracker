'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { Download, FileUp, Loader2, RefreshCw, Save } from 'lucide-react';
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
  buildRow,
  parseTemplateSheet,
  type BatchEligibilityMember,
  type BatchEligibilityPlan,
  type BatchEligibilityTemplate,
  type ColumnSource,
  type DateFormat,
  type MemberFieldKey,
} from '@/lib/batch-eligibility';

const DATE_FORMATS: DateFormat[] = ['MM/DD/YYYY', 'YYYYMMDD', 'YYYY-MM-DD'];
const EXCLUDED_BY_DEFAULT = /died|deceased/i;

type MemberList = 'authorized' | 'not-authorized';
const MEMBER_LISTS: Record<MemberList, { label: string; purpose: string }> = {
  authorized: {
    label: 'Authorized',
    purpose: 'Caspio status Authorized — check whether any have lost eligibility.',
  },
  'not-authorized': {
    label: 'Not authorized',
    purpose: 'Every other Caspio status — check whether any are now eligible.',
  },
};
const isAuthorizedStatus = (status: string) => status.trim().toLowerCase() === 'authorized';

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
          new Set(loaded.map((m) => m.calaimStatus).filter((status) => !EXCLUDED_BY_DEFAULT.test(status)))
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
    const notAuthorized = members.filter((m) => !isAuthorizedStatus(m.calaimStatus));
    return { authorized, 'not-authorized': notAuthorized } as Record<MemberList, BatchEligibilityMember[]>;
  }, [members]);

  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of listMembers[list]) counts.set(m.calaimStatus, (counts.get(m.calaimStatus) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [listMembers, list]);

  const { selectedMembers, skippedIncomplete } = useMemo(() => {
    const byStatus =
      list === 'authorized'
        ? listMembers.authorized
        : listMembers['not-authorized'].filter((m) => includedStatuses?.has(m.calaimStatus));
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

  const previewRows = useMemo(
    () => (template ? selectedMembers.slice(0, 10).map((m) => buildRow(m, template)) : []),
    [template, selectedMembers]
  );

  const downloadCsv = () => {
    if (!template) return;
    const csv = buildCsv(template.columns, selectedMembers.map((m) => buildRow(m, template)));
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Health Net batch eligibility - ${MEMBER_LISTS[list].label} - ${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
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
          <CardHeader>
            <CardTitle>2. What goes in each column</CardTitle>
            <CardDescription>
              Each Claim.MD column is filled from the member&apos;s Caspio record, a fixed value (same for every row), or
              today&apos;s date. Check fixed values like payer ID, provider NPI, and tax ID before downloading.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
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

      <Card>
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
            <span className="text-sm text-muted-foreground">{members.length.toLocaleString()} Health Net members</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(MEMBER_LISTS) as MemberList[]).map((key) => (
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
          {list === 'not-authorized' ? (
            <div className="text-xs text-muted-foreground">
              Statuses to include (deceased members are left out by default):
            </div>
          ) : null}
          <div className={`flex flex-wrap gap-2 ${list === 'authorized' ? 'hidden' : ''}`}>
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
              onClick={downloadCsv}
              disabled={!template || !selectedMembers.length || mappingDirty || missingRequiredColumns.length > 0}
            >
              <Download className="mr-2 h-4 w-4" />
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
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Batch Eligibility Checker</h1>
        <p className="text-muted-foreground">
          Build a Claim.MD Batch Eligibility (CSV) file from our members to check Medi-Cal eligibility in one upload.
        </p>
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
          <Card>
            <CardHeader>
              <CardTitle>Kaiser — coming soon</CardTitle>
              <CardDescription>The Kaiser batch eligibility file will be added after Health Net is working.</CardDescription>
            </CardHeader>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
