'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import {
  ChevronDown,
  ChevronRight,
  History,
  Loader2,
  RefreshCw,
  Trash2,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
} from 'lucide-react';
import {
  sortMifFileNamesByGeneratedDate,
  extractMifGeneratedDateKey,
  formatMifGeneratedDateLabel,
  type IlsMifMasterRow,
} from '@/lib/ils-mif-parse';
import { Button } from '@/components/ui/button';
import { type Dispatch, type SetStateAction } from 'react';
import { type ConsolidationRunSummary } from './consolidator-types';

export interface ConsolidationRunsCardProps {
  setConsolidationRunsSectionExpanded: Dispatch<SetStateAction<boolean>>;
  consolidationRunsSectionExpanded: boolean;
  runs: ConsolidationRunSummary[];
  mifDateSortDirection: "asc" | "desc";
  expandedRunId: string;
  latestConsolidationRun: ConsolidationRunSummary;
  setExpandedRunId: Dispatch<SetStateAction<string>>;
  isLoadingSaved: boolean;
  isRestoringRemoved: boolean;
  deletingRunId: string;
  loadSavedMasterList: (runId?: string | undefined, options?: { ignoreRemoved?: boolean | undefined; } | undefined) => Promise<void>;
  restoreRemovedAndStartOver: (runId?: string | undefined) => Promise<void>;
  restoringRunId: string;
  sendSelectedToCreateApplication: (runId?: string | undefined, options?: { rows?: IlsMifMasterRow[] | undefined; autoParseRowId?: string | undefined; } | undefined) => Promise<void>;
  deleteConsolidationRun: (run: ConsolidationRunSummary) => Promise<void>;
  mifDateSortDesc: boolean;
  toggleMifDateSort: () => void;
}

export function ConsolidationRunsCard({
  setConsolidationRunsSectionExpanded,
  consolidationRunsSectionExpanded,
  runs,
  mifDateSortDirection,
  expandedRunId,
  latestConsolidationRun,
  setExpandedRunId,
  isLoadingSaved,
  isRestoringRemoved,
  deletingRunId,
  loadSavedMasterList,
  restoreRemovedAndStartOver,
  restoringRunId,
  sendSelectedToCreateApplication,
  deleteConsolidationRun,
  mifDateSortDesc,
  toggleMifDateSort,
}: ConsolidationRunsCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 text-left"
          onClick={() => setConsolidationRunsSectionExpanded((prev) => !prev)}
          aria-expanded={consolidationRunsSectionExpanded}
        >
          <CardTitle className="flex items-center gap-2 text-base">
            {consolidationRunsSectionExpanded ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <History className="h-4 w-4 shrink-0" />
            Consolidation Runs
            <span className="text-sm font-normal text-muted-foreground">
              · {runs.length} run{runs.length === 1 ? '' : 's'}
            </span>
          </CardTitle>
          <span className="shrink-0 text-xs font-medium text-blue-700">
            {consolidationRunsSectionExpanded ? 'Hide' : 'Show'}
          </span>
        </button>
        {consolidationRunsSectionExpanded ? (
          <CardDescription>
            Each MIF upload auto-saves a dated run. The latest run supports Open / Create App; older runs keep their
            MIF filenames for history (Show MIFs). Members stay on the shared master list.
          </CardDescription>
        ) : null}
      </CardHeader>
      {consolidationRunsSectionExpanded ? (
      <CardContent className="space-y-2">
        {runs.length === 0 ? (
          <div className="text-sm text-muted-foreground">No saved runs yet.</div>
        ) : (
          runs.map((run) => {
            const runMifs = sortMifFileNamesByGeneratedDate(run.sourceFiles || [], mifDateSortDirection);
            const isExpanded = expandedRunId === run.id;
            const isLatestRun = latestConsolidationRun?.id === run.id;
            const totalSaved = run.memberCount || run.totals.total || 0;
            return (
              <div key={run.id} className="rounded border px-3 py-2 text-sm space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    className="text-left"
                    onClick={() => setExpandedRunId(isExpanded ? '' : run.id)}
                  >
                    <div className="font-medium">
                      {run.label || run.createdAtIso}
                      {isLatestRun ? (
                        <span className="ml-2 text-xs font-normal text-blue-700">Latest</span>
                      ) : null}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Full list {totalSaved} · {run.newMemberCount} new ·{' '}
                      {run.caspioMemberCount ?? run.totals.caspio} in Caspio ·{' '}
                      {run.northernMemberCount ?? run.totals.northern} northern
                      {typeof run.declinedMemberCount === 'number'
                        ? ` · ${run.declinedMemberCount} declined`
                        : ''}
                      {runMifs.length ? ` · ${runMifs.length} MIF file(s)` : ''}
                      {' · '}
                      <span className="text-blue-700">{isExpanded ? 'Hide MIFs' : 'Show MIFs'}</span>
                    </div>
                  </button>
                  <div className="flex flex-wrap gap-2">
                    {isLatestRun ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isLoadingSaved || isRestoringRemoved || Boolean(deletingRunId)}
                          onClick={() => {
                            setExpandedRunId(run.id);
                            void loadSavedMasterList(run.id);
                          }}
                        >
                          Open Run
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isLoadingSaved || isRestoringRemoved || Boolean(deletingRunId)}
                          onClick={() => {
                            setExpandedRunId(run.id);
                            void restoreRemovedAndStartOver(run.id);
                          }}
                          title="Restore Northern CA / RCFE removals for this run and reload from scratch"
                        >
                          {isRestoringRemoved && restoringRunId === run.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="mr-2 h-4 w-4" />
                          )}
                          Start over
                        </Button>
                        <Button
                          size="sm"
                          disabled={Boolean(deletingRunId)}
                          onClick={() => void sendSelectedToCreateApplication(run.id)}
                        >
                          Send New to Create App
                        </Button>
                      </>
                    ) : null}
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-rose-700"
                      disabled={deletingRunId === run.id || Boolean(deletingRunId)}
                      onClick={() => void deleteConsolidationRun(run)}
                    >
                      {deletingRunId === run.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="mr-2 h-4 w-4" />
                      )}
                      Delete
                    </Button>
                  </div>
                </div>
                {isExpanded ? (
                  <div className="rounded border bg-slate-50 px-3 py-2">
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs font-medium text-slate-700">
                        MIFs in this run ({mifDateSortDesc ? 'newest → oldest' : 'oldest → newest'})
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => toggleMifDateSort()}
                      >
                        {mifDateSortDesc ? (
                          <ArrowDownWideNarrow className="mr-1 h-3.5 w-3.5" />
                        ) : (
                          <ArrowUpNarrowWide className="mr-1 h-3.5 w-3.5" />
                        )}
                        Reverse date order
                      </Button>
                    </div>
                    {runMifs.length === 0 ? (
                      <div className="text-xs text-muted-foreground">No source MIF filenames saved.</div>
                    ) : (
                      <ul className="divide-y rounded border bg-white">
                        {runMifs.map((fileName) => {
                          const dateKey = extractMifGeneratedDateKey(fileName);
                          return (
                            <li
                              key={`${run.id}-${fileName}`}
                              className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 text-xs"
                            >
                              <span className="font-medium text-slate-900">{fileName}</span>
                              <span className="text-muted-foreground">
                                {formatMifGeneratedDateLabel(dateKey) || dateKey || 'No date in name'}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </CardContent>
      ) : null}
    </Card>
  );
}
