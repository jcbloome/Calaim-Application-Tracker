'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  inferBatchEligibilityPlanFrom271,
  isKaiserInactiveStatus,
  type BatchEligibilityMember,
  type BatchEligibilityPlan,
} from '@/lib/batch-eligibility';
import {
  buildEligibilityResultRows,
  countEligibilityRows,
  downloadEligibilityRowsCsv,
  ELIGIBILITY_FLAG_LABELS,
  ELIGIBILITY_OUTCOME_LABELS,
  isEligibilityFlagged,
  type EligibilityResultRow,
} from '@/lib/batch-eligibility-results';
import { decode271, type EligibilityOutcome, type EligibilityResult } from '@/lib/x12-271';

type Row = EligibilityResultRow;

const OUTCOME_CLASSES: Record<EligibilityOutcome, string> = {
  active: 'bg-green-100 text-green-800 border-green-200',
  inactive: 'bg-red-100 text-red-800 border-red-200',
  rejected: 'bg-amber-100 text-amber-800 border-amber-200',
  unknown: 'bg-slate-100 text-slate-700 border-slate-200',
};

type DecodedFile = { name: string; text: string };

/** CalAIM_Status + Kaiser_Status (highlight Inactive). */
export function CaspioMemberStatusCell({
  member,
  showClientId = true,
}: {
  member?: Pick<BatchEligibilityMember, 'calaimStatus' | 'kaiserStatus' | 'clientId2'> | null;
  showClientId?: boolean;
}) {
  if (!member) return <span className="text-muted-foreground">—</span>;
  const kaiserStatus = String(member.kaiserStatus || '').trim();
  const inactive = isKaiserInactiveStatus(kaiserStatus);
  return (
    <>
      <div>{member.calaimStatus || '-'}</div>
      {kaiserStatus ? (
        <div className={inactive ? 'mt-0.5' : 'mt-0.5 text-muted-foreground'}>
          {inactive ? (
            <Badge variant="destructive" className="font-semibold">
              Kaiser: Inactive
            </Badge>
          ) : (
            <>Kaiser: {kaiserStatus}</>
          )}
        </div>
      ) : null}
      {showClientId && member.clientId2 ? (
        <div className="text-muted-foreground">Client ID {member.clientId2}</div>
      ) : null}
    </>
  );
}

export function EligibilityResultsCard({
  members,
  plan = 'healthnet',
  getIdToken,
  preloaded,
  title = '3. Decode Claim.MD 271 results',
  onRecheck,
  onSavedToLog,
  allowUploadWhenPreloaded = false,
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
  /** After a new 271 upload is saved to Firestore. */
  onSavedToLog?: () => void;
  /** Keep the upload control visible even when showing a reopened run. */
  allowUploadWhenPreloaded?: boolean;
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
      const counts = countEligibilityRows(buildEligibilityResultRows(decoded, members, { plan }));
      const loggedPlan = inferBatchEligibilityPlanFrom271(decoded, plan);
      const payerIds = [...new Set(decoded.map((r) => String(r.payerId || '').replace(/\D/g, '')).filter(Boolean))];
      const form = new FormData();
      form.append('kind', 'decode');
      form.append('plan', loggedPlan);
      form.append(
        'summary',
        JSON.stringify({
          responses: decoded.length,
          ...counts,
          membersLoaded: members.length > 0,
          uiPlan: plan,
          detectedPlan: loggedPlan,
          mcp: loggedPlan,
          payerIds,
        })
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
      onSavedToLog?.();
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

  const rows = useMemo(
    () => buildEligibilityResultRows(results, members, { plan }),
    [results, members, plan]
  );
  const counts = useMemo(() => countEligibilityRows(rows), [rows]);

  /** Filter the table to a bucket and select only those visible rows (for re-check / download). */
  const filterAndSelect = (
    filter: typeof outcomeFilter,
    predicate: (row: Row) => boolean
  ) => {
    setOutcomeFilter(filter);
    setSelected(new Set(rows.filter(predicate).map((row) => row.key)));
  };

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
      if (outcomeFilter === 'flagged' && !isEligibilityFlagged(row)) return false;
      if (outcomeFilter !== 'all' && outcomeFilter !== 'flagged' && row.result.outcome !== outcomeFilter) return false;
      if (!q) return true;
      return `${row.result.lastName} ${row.result.firstName} ${row.result.memberId} ${row.member?.clientId2 || ''}`
        .toLowerCase()
        .includes(q);
    });
  }, [rows, outcomeFilter, search]);

  const reviewQueueRows = useMemo(() => {
    return rows.filter(
      (row) =>
        isEligibilityFlagged(row) || row.result.outcome === 'unknown' || row.result.outcome === 'rejected'
    );
  }, [rows]);

  const downloadResults = () => {
    downloadEligibilityRowsCsv(visibleRows, plan, 'eligibility results');
  };

  const downloadReviewQueue = () => {
    downloadEligibilityRowsCsv(reviewQueueRows, plan, 'needs-review-unclear-rejected', {
      includeReviewBucket: true,
    });
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
            : `Upload the 271 eligibility response file(s) downloaded from Claim.MD${
                plan === 'kaiser' ? ' (or Smart Data Solutions, if using the optional 270)' : ''
              }. They are decoded and matched to ${BATCH_ELIGIBILITY_PLAN_LABELS[plan]} members by trace number, member ID (or last name + birth date), and the files are saved to the Batch Eligibility Log.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={`flex flex-wrap items-center gap-2 ${preloaded && !allowUploadWhenPreloaded ? 'hidden' : ''}`}>
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
              <Button
                size="sm"
                variant="outline"
                disabled={!visibleRows.length}
                onClick={downloadResults}
                title="Downloads only the members currently shown by the filter above"
              >
                <Download className="mr-2 h-4 w-4" />
                Download filtered list ({visibleRows.length.toLocaleString()})
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!reviewQueueRows.length}
                onClick={downloadReviewQueue}
                title="One CSV of Needs review + Unclear + Rejected / not found, with status for each row"
              >
                <Download className="mr-2 h-4 w-4" />
                Download Needs review + Unclear + Rejected (
                {reviewQueueRows.length.toLocaleString()})
              </Button>
            </div>
            {onRecheck ? (
              <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                <div className="text-sm font-medium">Re-check members after fixing them in Caspio</div>
                <div className="text-xs text-muted-foreground">
                  Each button filters the table to that bucket and selects those members for a re-check batch.
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">Show &amp; select:</span>
                  <Button
                    size="sm"
                    variant={outcomeFilter === 'flagged' ? 'default' : 'outline'}
                    onClick={() => filterAndSelect('flagged', (r) => isEligibilityFlagged(r))}
                  >
                    Needs review ({counts.flagged})
                  </Button>
                  <Button
                    size="sm"
                    variant={outcomeFilter === 'unknown' ? 'default' : 'outline'}
                    onClick={() => filterAndSelect('unknown', (r) => r.result.outcome === 'unknown')}
                  >
                    Unclear ({counts.unknown})
                  </Button>
                  <Button
                    size="sm"
                    variant={outcomeFilter === 'rejected' ? 'default' : 'outline'}
                    onClick={() => filterAndSelect('rejected', (r) => r.result.outcome === 'rejected')}
                  >
                    Rejected / not found ({counts.rejected})
                  </Button>
                  {selected.size || outcomeFilter !== 'all' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setSelected(new Set());
                        setOutcomeFilter('all');
                      }}
                    >
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
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!visibleRows.length}
                    onClick={downloadResults}
                    title="CSV of only the members currently shown in the table"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download filtered list ({visibleRows.length.toLocaleString()})
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
            {outcomeFilter !== 'all' ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
                <span>
                  Showing{' '}
                  <span className="font-medium">{visibleRows.length.toLocaleString()}</span> of{' '}
                  {rows.length.toLocaleString()} —{' '}
                  {outcomeFilter === 'flagged'
                    ? 'Needs review'
                    : outcomeFilter === 'unknown'
                      ? 'Unclear'
                      : ELIGIBILITY_OUTCOME_LABELS[outcomeFilter]}
                </span>
                <Button size="sm" onClick={downloadResults} disabled={!visibleRows.length}>
                  <Download className="mr-2 h-4 w-4" />
                  Download this filtered list
                </Button>
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
                    <TableHead>Plan begin</TableHead>
                    <TableHead>Caspio / Kaiser status</TableHead>
                    <TableHead>RCFE</TableHead>
                    <TableHead>RCFE owner email</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map((row) => {
                    const isOpen = expanded.has(row.key);
                    return (
                      <Fragment key={row.key}>
                        <TableRow
                          className={`cursor-pointer ${
                            row.flag === 'lost' || row.flag === 'gained' || row.flag === 'active_again'
                              ? 'bg-amber-50/60'
                              : ''
                          }`}
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
                              {row.member?.healthPlan || row.member?.region || row.result.payerName ? (
                                <span className="ml-2 text-xs font-normal text-muted-foreground">
                                  {[row.member?.healthPlan, row.member?.region].filter(Boolean).join(' · ') ||
                                    row.result.payerName}
                                </span>
                              ) : null}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {row.result.memberId || 'no ID'}
                              {row.result.birthDate ? ` · DOB ${row.result.birthDate}` : ''}
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <Badge variant="outline" className={OUTCOME_CLASSES[row.result.outcome]}>
                              {ELIGIBILITY_OUTCOME_LABELS[row.result.outcome]}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[18rem] align-top text-xs">
                            {row.coverage || '—'}
                          </TableCell>
                          <TableCell className="align-top text-xs whitespace-nowrap">
                            {row.primaryDate || '—'}
                          </TableCell>
                          <TableCell className="align-top text-xs">
                            <CaspioMemberStatusCell member={row.member} />
                            {row.flag !== 'none' ? (
                              <Badge
                                variant={
                                  row.flag === 'unmatched'
                                    ? 'outline'
                                    : row.flag === 'active_again'
                                      ? 'default'
                                      : 'destructive'
                                }
                                className={
                                  row.flag === 'active_again'
                                    ? 'mt-1 whitespace-normal border-emerald-300 bg-emerald-100 text-emerald-900 hover:bg-emerald-100'
                                    : 'mt-1 whitespace-normal'
                                }
                              >
                                {ELIGIBILITY_FLAG_LABELS[row.flag]}
                              </Badge>
                            ) : null}
                            {row.flag === 'unmatched' ? (
                              <div className="mt-1 text-[11px] text-muted-foreground">
                                271 ID {row.result.memberId || '—'}
                                {row.result.birthDate ? ` · DOB ${row.result.birthDate}` : ''}
                                . Refresh the page (loads full Caspio cache) or Pull latest from Caspio.
                              </div>
                            ) : null}
                          </TableCell>
                          <TableCell className="align-top text-xs">
                            {row.member?.rcfeName || <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="align-top text-xs">
                            {row.member?.rcfeAdminEmail ? (
                              <a
                                className="text-primary hover:underline"
                                href={`mailto:${row.member.rcfeAdminEmail}`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {row.member.rcfeAdminEmail}
                              </a>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                        {isOpen ? (
                          <TableRow>
                            <TableCell colSpan={onRecheck ? 2 : 1} />
                            <TableCell colSpan={7} className="space-y-2 bg-muted/30 text-xs">
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
