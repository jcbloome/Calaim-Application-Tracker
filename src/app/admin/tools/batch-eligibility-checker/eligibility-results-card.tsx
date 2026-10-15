'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { ChevronDown, ChevronRight, Download, FileUp, Loader2, RotateCcw, X } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import {
  BATCH_ELIGIBILITY_PLAN_LABELS,
  buildCsv,
  formatDate,
  type BatchEligibilityMember,
  type BatchEligibilityPlan,
} from '@/lib/batch-eligibility';
import {
  coverageDates,
  decode271,
  otherEntities,
  summarizeCoverage,
  type EligibilityOutcome,
  type EligibilityResult,
} from '@/lib/x12-271';

type Flag = 'lost' | 'gained' | 'unmatched' | 'none';

type Row = {
  key: string;
  result: EligibilityResult;
  member: BatchEligibilityMember | null;
  flag: Flag;
  coverage: string;
  dates: string[];
  entities: string[];
};

const OUTCOME_LABELS: Record<EligibilityOutcome, string> = {
  active: 'Active',
  inactive: 'Inactive',
  rejected: 'Rejected / not found',
  unknown: 'Unclear',
};

const OUTCOME_CLASSES: Record<EligibilityOutcome, string> = {
  active: 'bg-green-100 text-green-800 border-green-200',
  inactive: 'bg-red-100 text-red-800 border-red-200',
  rejected: 'bg-amber-100 text-amber-800 border-amber-200',
  unknown: 'bg-slate-100 text-slate-700 border-slate-200',
};

const FLAG_LABELS: Record<Exclude<Flag, 'none'>, string> = {
  lost: 'Authorized in Caspio, not active',
  gained: 'Not authorized in Caspio, now active',
  unmatched: 'Not matched to one of our members',
};

const normId = (value: string) => String(value || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
const dobKey = (value: string) => formatDate(value, 'YYYYMMDD');
const isFlagged = (row: Row) => row.flag === 'lost' || row.flag === 'gained';
const isAuthorized = (member: BatchEligibilityMember | null) =>
  member?.calaimStatus.trim().toLowerCase() === 'authorized';

function buildRows(results: EligibilityResult[], members: BatchEligibilityMember[]): Row[] {
  const byId = new Map<string, BatchEligibilityMember>();
  const byClientId = new Map<string, BatchEligibilityMember>();
  const byNameDob = new Map<string, BatchEligibilityMember>();
  for (const m of members) {
    if (m.medicalId) byId.set(normId(m.medicalId), m);
    if (m.mrn && !byId.has(normId(m.mrn))) byId.set(normId(m.mrn), m);
    if (m.clientId2) byClientId.set(String(m.clientId2).trim(), m);
    byNameDob.set(`${m.lastName.trim().toUpperCase()}|${dobKey(m.birthDate)}`, m);
  }
  return results.map((result, i) => {
    const member =
      result.traceNumbers.map((t) => byClientId.get(t.trim())).find(Boolean) ||
      byId.get(normId(result.memberId)) ||
      (result.birthDate ? byNameDob.get(`${result.lastName.trim().toUpperCase()}|${dobKey(result.birthDate)}`) : undefined) ||
      null;
    let flag: Flag = 'none';
    if (!member) flag = 'unmatched';
    else if (isAuthorized(member) && result.outcome !== 'active') flag = 'lost';
    else if (!isAuthorized(member) && result.outcome === 'active') flag = 'gained';
    return {
      key: `${i}-${result.memberId}`,
      result,
      member,
      flag,
      coverage: summarizeCoverage(result),
      dates: coverageDates(result),
      entities: otherEntities(result),
    };
  });
}

function countRows(rows: Row[]) {
  const c: Record<EligibilityOutcome, number> = { active: 0, inactive: 0, rejected: 0, unknown: 0 };
  let lost = 0;
  let gained = 0;
  let unmatched = 0;
  for (const row of rows) {
    c[row.result.outcome]++;
    if (row.flag === 'lost') lost++;
    else if (row.flag === 'gained') gained++;
    else if (row.flag === 'unmatched') unmatched++;
  }
  return { ...c, lost, gained, unmatched, flagged: lost + gained };
}

type DecodedFile = { name: string; text: string };

export function EligibilityResultsCard({
  members,
  plan = 'healthnet',
  getIdToken,
  preloaded,
  title = '5. Decode Claim.MD 271 results',
  onRecheck,
}: {
  members: BatchEligibilityMember[];
  plan?: BatchEligibilityPlan;
  /** When provided, uploaded 271 files are saved to the Batch Eligibility Log. */
  getIdToken?: () => Promise<string>;
  /** Saved 271 files to show instead of an upload button (log page). */
  preloaded?: DecodedFile[];
  title?: string;
  /** Called with the Client_ID2s of selected members to build a re-check batch. */
  onRecheck?: (clientIds: string[]) => void;
}) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [results, setResults] = useState<EligibilityResult[]>([]);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [outcomeFilter, setOutcomeFilter] = useState<EligibilityOutcome | 'all' | 'flagged'>('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const decodeFiles = useCallback(
    (files: DecodedFile[]) => {
      const decoded: EligibilityResult[] = [];
      const names: string[] = [];
      for (const file of files) {
        try {
          const found = decode271(file.text);
          decoded.push(...found);
          names.push(`${file.name} (${found.length})`);
        } catch (error: any) {
          toast({ variant: 'destructive', title: `Could not decode ${file.name}`, description: error?.message });
        }
      }
      setResults(decoded);
      setFileNames(names);
      setOutcomeFilter('all');
      setExpanded(new Set());
      setSelected(new Set());
      return decoded;
    },
    [toast]
  );

  useEffect(() => {
    if (preloaded?.length) decodeFiles(preloaded);
  }, [preloaded, decodeFiles]);

  const saveToLog = async (files: File[], decoded: EligibilityResult[]) => {
    if (!getIdToken) return;
    setIsSaving(true);
    try {
      const counts = countRows(buildRows(decoded, members));
      const form = new FormData();
      form.append('kind', 'decode');
      form.append('plan', plan);
      form.append(
        'summary',
        JSON.stringify({ responses: decoded.length, ...counts, membersLoaded: members.length > 0 })
      );
      files.forEach((file) => form.append('files', file));
      const res = await fetch('/api/admin/batch-eligibility/runs', {
        method: 'POST',
        headers: { Authorization: `Bearer ${await getIdToken()}` },
        body: form,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || `HTTP ${res.status}`);
      toast({ title: 'Saved to the Batch Eligibility Log' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Decoded, but could not save to the log', description: error?.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleFiles = async (files: File[]) => {
    const texts = await Promise.all(files.map(async (file) => ({ name: file.name, text: await file.text() })));
    if (fileInputRef.current) fileInputRef.current.value = '';
    const decoded = decodeFiles(texts);
    if (!decoded.length) return;
    toast({ title: `Decoded ${decoded.length.toLocaleString()} eligibility responses` });
    await saveToLog(files, decoded);
  };

  const rows = useMemo(() => buildRows(results, members), [results, members]);
  const counts = useMemo(() => countRows(rows), [rows]);

  const selectWhere = (predicate: (row: Row) => boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      rows.filter(predicate).forEach((row) => next.add(row.key));
      return next;
    });

  const { selectedMembers, selectedUnmatched } = useMemo(() => {
    const byClientId = new Map<string, BatchEligibilityMember>();
    let unmatched = 0;
    for (const row of rows) {
      if (!selected.has(row.key)) continue;
      if (row.member) byClientId.set(row.member.clientId2, row.member);
      else unmatched++;
    }
    return { selectedMembers: [...byClientId.values()], selectedUnmatched: unmatched };
  }, [rows, selected]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (outcomeFilter === 'flagged' && row.flag !== 'lost' && row.flag !== 'gained') return false;
      if (outcomeFilter !== 'all' && outcomeFilter !== 'flagged' && row.result.outcome !== outcomeFilter) return false;
      if (!q) return true;
      return `${row.result.lastName} ${row.result.firstName} ${row.result.memberId} ${row.member?.clientId2 || ''}`
        .toLowerCase()
        .includes(q);
    });
  }, [rows, outcomeFilter, search]);

  const downloadResults = () => {
    const columns = [
      'Last name',
      'First name',
      'Medi-Cal ID',
      'DOB',
      'Eligibility result',
      'Coverage',
      'Coverage dates',
      'Plans / entities',
      'Messages',
      'Client_ID2',
      'Caspio CalAIM status',
      'Needs review',
    ];
    const data = visibleRows.map((row) => [
      row.result.lastName,
      row.result.firstName,
      row.result.memberId,
      row.result.birthDate,
      OUTCOME_LABELS[row.result.outcome],
      row.coverage,
      row.dates.join('; '),
      row.entities.join('; '),
      [...new Set(row.result.benefits.flatMap((b) => b.messages))].join('; '),
      row.member?.clientId2 || '',
      row.member?.calaimStatus || '',
      row.flag === 'none' ? '' : FLAG_LABELS[row.flag],
    ]);
    const blob = new Blob([buildCsv(columns, data)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${BATCH_ELIGIBILITY_PLAN_LABELS[plan]} eligibility results ${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const filterButton = (value: typeof outcomeFilter, text: string, count: number) => (
    <Button
      key={value}
      size="sm"
      variant={outcomeFilter === value ? 'default' : 'outline'}
      onClick={() => setOutcomeFilter(value)}
    >
      {text} <Badge variant="secondary" className="ml-2">{count.toLocaleString()}</Badge>
    </Button>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {preloaded
            ? 'Decoded from the saved 271 file(s) and matched to current Caspio status.'
            : `Upload the 271 eligibility response file(s) downloaded from ${
                plan === 'kaiser' ? 'Smart Data Solutions' : 'Claim.MD'
              }. They are decoded and matched to ${BATCH_ELIGIBILITY_PLAN_LABELS[plan]} members by trace number, member ID (or last name + birth date), and the files are saved to the Batch Eligibility Log.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={`flex flex-wrap items-center gap-2 ${preloaded ? 'hidden' : ''}`}>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (files.length) void handleFiles(files);
            }}
          />
          <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={isSaving}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
            {isSaving ? 'Saving to log…' : 'Upload 271 file(s)'}
          </Button>
          {fileNames.length ? (
            <>
              <span className="text-sm text-muted-foreground">{fileNames.join(', ')}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setResults([]);
                  setFileNames([]);
                }}
              >
                <X className="mr-1 h-4 w-4" /> Clear
              </Button>
            </>
          ) : null}
        </div>

        {rows.length ? (
          <>
            {!members.length ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
                {BATCH_ELIGIBILITY_PLAN_LABELS[plan]} members haven&apos;t loaded yet, so results can&apos;t be compared
                with Caspio status.
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {filterButton('all', 'All', rows.length)}
              {filterButton('flagged', 'Needs review', counts.flagged)}
              {filterButton('active', 'Active', counts.active)}
              {filterButton('inactive', 'Inactive', counts.inactive)}
              {filterButton('rejected', 'Rejected / not found', counts.rejected)}
              {counts.unknown ? filterButton('unknown', 'Unclear', counts.unknown) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="h-9 w-64"
                placeholder="Search name, Medi-Cal ID, Client ID"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Button size="sm" variant="outline" onClick={downloadResults}>
                <Download className="mr-2 h-4 w-4" />
                Download these results (CSV)
              </Button>
            </div>
            {onRecheck ? (
              <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                <div className="text-sm font-medium">Re-check members after fixing them in Caspio</div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">Select:</span>
                  <Button size="sm" variant="outline" onClick={() => selectWhere((r) => isFlagged(r))}>
                    Needs review ({counts.flagged})
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => selectWhere((r) => r.result.outcome === 'unknown')}>
                    Unclear ({counts.unknown})
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => selectWhere((r) => r.result.outcome === 'rejected')}>
                    Rejected / not found ({counts.rejected})
                  </Button>
                  {selected.size ? (
                    <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                      Clear selection
                    </Button>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    disabled={!selectedMembers.length}
                    onClick={() => onRecheck(selectedMembers.map((m) => m.clientId2))}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Make re-check batch from {selectedMembers.length.toLocaleString()} selected
                  </Button>
                  {selectedUnmatched ? (
                    <span className="text-xs text-amber-700">
                      {selectedUnmatched} selected response{selectedUnmatched === 1 ? ' is' : 's are'} not matched to a
                      {BATCH_ELIGIBILITY_PLAN_LABELS[plan]} member and can&apos;t be included.
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {onRecheck ? (
                      <TableHead className="w-8">
                        <Checkbox
                          checked={visibleRows.length > 0 && visibleRows.every((r) => selected.has(r.key))}
                          onCheckedChange={(value) =>
                            setSelected((prev) => {
                              const next = new Set(prev);
                              visibleRows.forEach((r) => (value ? next.add(r.key) : next.delete(r.key)));
                              return next;
                            })
                          }
                        />
                      </TableHead>
                    ) : null}
                    <TableHead className="w-6" />
                    <TableHead>Member</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead>Coverage</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead>Caspio status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map((row) => {
                    const isOpen = expanded.has(row.key);
                    return (
                      <Fragment key={row.key}>
                        <TableRow
                          className={`cursor-pointer ${row.flag === 'lost' || row.flag === 'gained' ? 'bg-amber-50/60' : ''}`}
                          onClick={() =>
                            setExpanded((prev) => {
                              const next = new Set(prev);
                              if (next.has(row.key)) next.delete(row.key);
                              else next.add(row.key);
                              return next;
                            })
                          }
                        >
                          {onRecheck ? (
                            <TableCell className="align-top" onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={selected.has(row.key)}
                                onCheckedChange={(value) =>
                                  setSelected((prev) => {
                                    const next = new Set(prev);
                                    if (value) next.add(row.key);
                                    else next.delete(row.key);
                                    return next;
                                  })
                                }
                              />
                            </TableCell>
                          ) : null}
                          <TableCell className="align-top">
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="font-medium">
                              {row.result.lastName}, {row.result.firstName}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {row.result.memberId || 'no ID'}
                              {row.result.birthDate ? ` · DOB ${row.result.birthDate}` : ''}
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <Badge variant="outline" className={OUTCOME_CLASSES[row.result.outcome]}>
                              {OUTCOME_LABELS[row.result.outcome]}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[22rem] align-top text-xs">
                            {row.coverage || '—'}
                            {row.entities.length ? (
                              <div className="text-muted-foreground">{row.entities.join('; ')}</div>
                            ) : null}
                          </TableCell>
                          <TableCell className="align-top text-xs">
                            {row.dates.length ? row.dates.map((d) => <div key={d}>{d}</div>) : '—'}
                          </TableCell>
                          <TableCell className="align-top text-xs">
                            {row.member ? (
                              <>
                                <div>{row.member.calaimStatus}</div>
                                <div className="text-muted-foreground">Client ID {row.member.clientId2}</div>
                              </>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                            {row.flag !== 'none' ? (
                              <Badge
                                variant={row.flag === 'unmatched' ? 'outline' : 'destructive'}
                                className="mt-1 whitespace-normal"
                              >
                                {FLAG_LABELS[row.flag]}
                              </Badge>
                            ) : null}
                          </TableCell>
                        </TableRow>
                        {isOpen ? (
                          <TableRow>
                            <TableCell colSpan={onRecheck ? 2 : 1} />
                            <TableCell colSpan={5} className="space-y-2 bg-muted/30 text-xs">
                              {row.result.rejections.length ? (
                                <div>
                                  <span className="font-medium">Rejection:</span>{' '}
                                  {row.result.rejections.map((r) => `${r.label} (code ${r.code})`).join('; ')}
                                </div>
                              ) : null}
                              {row.result.references.length ? (
                                <div>
                                  <span className="font-medium">References:</span> {row.result.references.join('; ')}
                                </div>
                              ) : null}
                              {row.result.benefits.length ? (
                                <div className="space-y-1">
                                  <div className="font-medium">Benefit lines</div>
                                  {row.result.benefits.map((b, i) => (
                                    <div key={i} className="rounded border bg-background p-2">
                                      <div>
                                        {b.label}
                                        {b.insuranceType ? ` · ${b.insuranceType}` : ''}
                                        {b.planDescription ? ` · ${b.planDescription}` : ''}
                                        {b.coverageLevel ? ` · ${b.coverageLevel}` : ''}
                                      </div>
                                      {b.serviceTypes.length ? (
                                        <div className="text-muted-foreground">{b.serviceTypes.join(', ')}</div>
                                      ) : null}
                                      {[...b.dates, ...b.entities, ...b.messages].map((line, j) => (
                                        <div key={j} className="text-muted-foreground">
                                          {line}
                                        </div>
                                      ))}
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                              <details>
                                <summary className="cursor-pointer text-muted-foreground">Raw 271 segments</summary>
                                <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-[11px]">
                                  {row.result.segments.join('\n')}
                                </pre>
                              </details>
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
