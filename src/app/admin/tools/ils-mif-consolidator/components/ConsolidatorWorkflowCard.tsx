'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import {
  FileSpreadsheet,
  Loader2,
  Upload,
  Mail,
  ExternalLink,
  Download,
  History,
  Trash2,
  Users,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Search,
  MapPin,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ILS_DECISION_TO, ILS_DECISION_CC } from '@/lib/ils-decision-email';
import {
  extractMifGeneratedDateKey,
  formatMifGeneratedDateLabel,
  CS_MIF_EXPORT_HEADERS,
  ILS_MIF_TARGET_T2038_RECEIVED_STATUS,
  type IlsMifMasterRow,
  type IlsMifUploadParsePreview,
  type IlsMifCompanionSheet,
} from '@/lib/ils-mif-parse';
import { Input } from '@/components/ui/input';
import {
  FilterMode,
  type ConsolidationRunSummary,
  type DeclinedMemberRecord,
  type NorthernDeclineBatchRecord,
} from './consolidator-types';
import { type RefObject, type Dispatch, type SetStateAction, type JSX } from 'react';

export interface ConsolidatorWorkflowCardProps {
  fileInputRef: RefObject<HTMLInputElement>;
  handleUploadFiles: (fileList: FileList | null) => Promise<void>;
  isParsing: boolean;
  isMatching: boolean;
  isSaving: boolean;
  isSendingDeclines: boolean;
  isCheckingDeclineCaspio: boolean;
  rows: IlsMifMasterRow[];
  hasCheckedCaspio: boolean;
  openNorthernDeclineComposer: () => void;
  remainingNewForCreateApp: IlsMifMasterRow[];
  sendSelectedToCreateApplication: (runId?: string | undefined, options?: { rows?: IlsMifMasterRow[] | undefined; autoParseRowId?: string | undefined; } | undefined) => Promise<void>;
  isDownloading: boolean;
  downloadMasterAsCsMif: (mode?: "all" | "new" | "filtered") => Promise<void>;
  totals: { total: number; unique: number; createApp: number; caspio: number; notInCaspioAll: number; alreadyHaveSkeleton: number; caspioPending: number; needsAuthorized: number; needsT2038Received: number; statusUpdates: number; duplicateSpreadsheetLines: number; incomplete: number; northern: number; northernNeedingDenial: number; declined: number; };
  visibleRows: IlsMifMasterRow[];
  filter: FilterMode;
  isComparingRuns: boolean;
  runs: ConsolidationRunSummary[];
  compareActiveRunToPrevious: () => Promise<void>;
  sourceFiles: string[];
  clearSessionList: () => Promise<void>;
  isLoadingSaved: boolean;
  loadSavedMasterList: (runId?: string | undefined, options?: { ignoreRemoved?: boolean | undefined; } | undefined) => Promise<void>;
  masterListCreatedAtIso: string;
  lastMifUploadedAtIso: string;
  masterListUpdatedLabel: string;
  lastMifUploadedSummary: string;
  lastMifUploadedFileName: string;
  lastMifUploadedLabel: string;
  lastMifUploadedRowCount: number;
  mifDateSortDesc: boolean;
  sortedSessionFiles: string[];
  setSessionFilesExpanded: Dispatch<SetStateAction<boolean>>;
  sessionFilesExpanded: boolean;
  toggleMifDateSort: () => void;
  lastMatchedLabel: string;
  activeRunId: string;
  uploadDateWarnings: string[];
  setUploadDateWarningsExpanded: Dispatch<SetStateAction<boolean>>;
  uploadDateWarningsExpanded: boolean;
  lastUploadParsePreview: IlsMifUploadParsePreview | null;
  setParsePreviewExpanded: Dispatch<SetStateAction<boolean>>;
  parsePreviewExpanded: boolean;
  recheckCaspioAndSaveMaster: () => Promise<void>;
  saveMasterListAndRun: (options?: { quiet?: boolean | undefined; skipPartialConfirm?: boolean | undefined; rowsOverride?: IlsMifMasterRow[] | undefined; sourceFilesOverride?: string[] | undefined; companionSheetsOverride?: IlsMifCompanionSheet[] | undefined; } | undefined) => Promise<string>;
  sessionNetNewFromUploads: number;
  lastUploadStats: { netNew: number; parsedRows: number; uniqueParsed: number; duplicateParsed: number; fileCount: number; } | null;
  rawMembersAcrossUploadedMifs: number;
  clickableStat: (mode: FilterMode, label: string, value: string | number, className: string, options?: { disabled?: boolean | undefined; hint?: string | undefined; } | undefined) => JSX.Element;
  declinedMembers: DeclinedMemberRecord[];
  northernDeclineBatches: NorthernDeclineBatchRecord[];
  queryText: string;
  setQueryText: Dispatch<SetStateAction<string>>;
  scrollToMasterList: () => void;
  northernOnly: boolean;
  setNorthernOnly: Dispatch<SetStateAction<boolean>>;
  setFilter: Dispatch<SetStateAction<FilterMode>>;
  pendingAuthorizeCandidates: IlsMifMasterRow[];
  pendingT2038ReceivedCandidates: IlsMifMasterRow[];
}

export function ConsolidatorWorkflowCard({
  fileInputRef,
  handleUploadFiles,
  isParsing,
  isMatching,
  isSaving,
  isSendingDeclines,
  isCheckingDeclineCaspio,
  rows,
  hasCheckedCaspio,
  openNorthernDeclineComposer,
  remainingNewForCreateApp,
  sendSelectedToCreateApplication,
  isDownloading,
  downloadMasterAsCsMif,
  totals,
  visibleRows,
  filter,
  isComparingRuns,
  runs,
  compareActiveRunToPrevious,
  sourceFiles,
  clearSessionList,
  isLoadingSaved,
  loadSavedMasterList,
  masterListCreatedAtIso,
  lastMifUploadedAtIso,
  masterListUpdatedLabel,
  lastMifUploadedSummary,
  lastMifUploadedFileName,
  lastMifUploadedLabel,
  lastMifUploadedRowCount,
  mifDateSortDesc,
  sortedSessionFiles,
  setSessionFilesExpanded,
  sessionFilesExpanded,
  toggleMifDateSort,
  lastMatchedLabel,
  activeRunId,
  uploadDateWarnings,
  setUploadDateWarningsExpanded,
  uploadDateWarningsExpanded,
  lastUploadParsePreview,
  setParsePreviewExpanded,
  parsePreviewExpanded,
  recheckCaspioAndSaveMaster,
  saveMasterListAndRun,
  sessionNetNewFromUploads,
  lastUploadStats,
  rawMembersAcrossUploadedMifs,
  clickableStat,
  declinedMembers,
  northernDeclineBatches,
  queryText,
  setQueryText,
  scrollToMasterList,
  northernOnly,
  setNorthernOnly,
  setFilter,
  pendingAuthorizeCandidates,
  pendingT2038ReceivedCandidates,
}: ConsolidatorWorkflowCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          ILS MIF Consolidator
        </CardTitle>
        <CardDescription>
          Upload MIFs to grow the shared master list (deduped). Same-day or same-filename files are compared by
          member (MRN/CIN/name). After Caspio check, new members are saved to the master automatically. Then send
          remaining new members to Create Application anytime.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded border border-blue-200 bg-blue-50/70 px-3 py-2 text-xs text-blue-950 space-y-1">
          <div className="font-medium">Recommended workflow</div>
          <ol className="list-decimal pl-4 space-y-0.5">
            <li>
              <span className="font-medium">1) Upload MIFs</span> — merges into the master (deduped), saves file
              history, checks Caspio, and auto-saves the shared master. Same filename / same day is OK: we
              compare members and only add people who are not already on the list.
            </li>
            <li>
              <span className="font-medium">Single Auth PDFs</span> — use{' '}
              <Link href="/admin/applications/create#kaiser-ils-datapage" className="underline underline-offset-2">
                Create Application
              </Link>{' '}
              instead. Single auths are not added to the MIF master (MIF/RFT export lacks full auth fields). Create
              App parses the PDF, checks MIF master and Caspio, and creates the application directly.
            </li>
            <li>
              <span className="font-medium">2) Bulk Email Denial</span> — northern not-in-Caspio members (optional).
            </li>
            <li>
              <span className="font-medium">3) Send New Members to Create Application</span> — opens Create App
              with members who are not in Caspio, not declined, and <span className="font-medium">do not already
              have a skeleton</span>. You can return here anytime and send remaining new members again.
            </li>
            <li>
              <span className="font-medium">Later MIFs / Re-check</span> — upload more files or Re-check Caspio;
              both auto-save the master + dated run to Firestore. Use Save master now if you changed the list without
              re-checking.
            </li>
            <li>
              <span className="font-medium">Service Request Form</span> — for one member (e.g. already in Caspio):
              search the master list and click the row <span className="font-medium">PDF</span> button, or use{' '}
              <span className="font-medium">One member from Caspio</span> below. You do not need to select 20 rows or
              batch-create applications.
            </li>
          </ol>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            multiple
            className="hidden"
            onChange={(event) => void handleUploadFiles(event.target.files)}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={isParsing || isMatching || isSaving}
            onClick={() => fileInputRef.current?.click()}
          >
            {isParsing || isMatching || isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            {isParsing
              ? 'Uploading into master list…'
              : isMatching
                ? 'Checking Caspio…'
                : isSaving
                  ? 'Saving master…'
                  : '1) Upload MIFs → Consolidate + Check Caspio'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isSendingDeclines || isCheckingDeclineCaspio || !rows.length || !hasCheckedCaspio}
            onClick={() => openNorthernDeclineComposer()}
          >
            {isSendingDeclines || isCheckingDeclineCaspio ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Mail className="mr-2 h-4 w-4" />
            )}
            {isCheckingDeclineCaspio ? 'Checking Caspio…' : '2) Bulk Email Denial'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={
              !rows.length ||
              isSaving ||
              isParsing ||
              isMatching ||
              !hasCheckedCaspio ||
              remainingNewForCreateApp.length === 0
            }
            onClick={() => void sendSelectedToCreateApplication()}
            title={
              remainingNewForCreateApp.length
                ? `${remainingNewForCreateApp.length} member(s) still need a skeleton (not in Caspio, not declined). Selected rows are preferred; otherwise all remaining new members are sent.`
                : 'No remaining new members without a skeleton.'
            }
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            3) Send New Members to Create Application
            {hasCheckedCaspio && remainingNewForCreateApp.length
              ? ` (${remainingNewForCreateApp.length})`
              : ''}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isDownloading || !rows.length}
            title="Every member on the master list once — same list used for Download Full Master"
            onClick={() => void downloadMasterAsCsMif('all')}
          >
            {isDownloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Download Full Master ({totals.total})
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isDownloading || !visibleRows.length || filter === 'all' || filter === 'duplicates'}
            title="Download members matching the active master-list filter (non-duplicates only)"
            onClick={() => void downloadMasterAsCsMif('filtered')}
          >
            <Download className="mr-2 h-4 w-4" />
            Download Filtered View
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isDownloading || !rows.length || !hasCheckedCaspio}
            onClick={() => void downloadMasterAsCsMif('new')}
          >
            <Download className="mr-2 h-4 w-4" />
            Export Not in Caspio
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isComparingRuns || runs.length < 2}
            onClick={() => void compareActiveRunToPrevious()}
          >
            {isComparingRuns ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <History className="mr-2 h-4 w-4" />}
            Compare to Previous Run
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!rows.length && !sourceFiles.length}
            onClick={() => clearSessionList()}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Clear Session List
          </Button>
          <Button
            size="sm"
            className="bg-emerald-700 text-white hover:bg-emerald-800"
            disabled={isLoadingSaved}
            onClick={() => void loadSavedMasterList()}
          >
            {isLoadingSaved ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
            Load Latest Master List
          </Button>
        </div>

        {masterListCreatedAtIso || lastMifUploadedAtIso ? (
          <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-950 space-y-1">
            {masterListUpdatedLabel ? (
              <div>
                <span className="font-semibold">Master list last updated:</span>{' '}
                <span className="font-mono tabular-nums">{masterListUpdatedLabel}</span>
                <span className="ml-2 text-xs text-emerald-800">
                  (saved master in Firestore)
                </span>
              </div>
            ) : null}
            {lastMifUploadedSummary ? (
              <div>
                <span className="font-semibold">Last MIF uploaded:</span>{' '}
                <span className="break-all font-medium text-emerald-950">{lastMifUploadedFileName || 'Unknown MIF file'}</span>
                <span className="ml-1 font-mono tabular-nums text-emerald-900">
                  · {lastMifUploadedLabel}
                </span>
                {lastMifUploadedRowCount > 0 ? (
                  <span className="ml-1 text-xs text-emerald-800">
                    ({lastMifUploadedRowCount} member{lastMifUploadedRowCount === 1 ? '' : 's'})
                  </span>
                ) : null}
              </div>
            ) : null}
            <div className="text-xs text-emerald-800">
              Load Latest Master List refreshes from Firestore and re-checks Kaiser Caspio for status changes.
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            Master list last-updated time is not available yet. Use{' '}
            <span className="font-medium">Load Latest Master List</span> after a save, or upload/re-check Caspio to
            create the master timestamp.
          </div>
        )}

        <div className="rounded border bg-slate-50 px-3 py-2 text-xs text-slate-700">
          Decline emails go <span className="font-medium">To</span> {ILS_DECISION_TO[0]} and always{' '}
          <span className="font-medium">CC</span> {ILS_DECISION_CC[0]}. Subject uses member name + MRN.
        </div>

        <div className="space-y-1 text-sm text-muted-foreground">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex flex-wrap items-center gap-1">
              Session files ({mifDateSortDesc ? 'newest first' : 'oldest first'}):{' '}
              <span className="font-medium text-slate-800">
                {sortedSessionFiles.length ? `${sortedSessionFiles.length} MIF file(s)` : 'None yet'}
              </span>
              {sortedSessionFiles.length ? (
                <>
                  <button
                    type="button"
                    className="inline-flex items-center gap-0.5 text-blue-700 underline-offset-2 hover:underline"
                    onClick={() => setSessionFilesExpanded((prev) => !prev)}
                  >
                    {sessionFilesExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                    {sessionFilesExpanded ? 'Hide MIFs' : 'Show MIFs'}
                  </button>
                  <button
                    type="button"
                    className="text-blue-700 underline-offset-2 hover:underline"
                    onClick={() => toggleMifDateSort()}
                  >
                    reverse
                  </button>
                </>
              ) : null}
            </span>
            {lastMatchedLabel ? <span>Last Caspio check: {lastMatchedLabel}</span> : null}
            {masterListCreatedAtIso ? (
              <span>
                Master list last updated:{' '}
                <span className="font-medium text-slate-800">{masterListUpdatedLabel}</span>
              </span>
            ) : null}
            {lastMifUploadedSummary ? (
              <span>
                Last MIF uploaded:{' '}
                <span className="font-medium text-slate-800">{lastMifUploadedSummary}</span>
              </span>
            ) : null}
            {activeRunId ? <span>Active run: {activeRunId}</span> : null}
          </div>
          {sessionFilesExpanded && sortedSessionFiles.length ? (
            <ul className="max-h-[180px] overflow-auto rounded border bg-white divide-y text-xs text-slate-800">
              {sortedSessionFiles.map((fileName) => {
                const dateKey = extractMifGeneratedDateKey(fileName);
                return (
                  <li
                    key={`session-mif-${fileName}`}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5"
                  >
                    <span className="font-medium">{fileName}</span>
                    <span className="text-muted-foreground">
                      {formatMifGeneratedDateLabel(dateKey) || dateKey || 'No date in name'}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>

        {uploadDateWarnings.length ? (
          <div className="rounded border border-amber-300 bg-amber-50 text-xs text-amber-950">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
              onClick={() => setUploadDateWarningsExpanded((prev) => !prev)}
              aria-expanded={uploadDateWarningsExpanded}
            >
              <span className="inline-flex min-w-0 items-center gap-2 font-medium">
                {uploadDateWarningsExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                )}
                <span className="truncate">
                  MIF date overlap warnings
                  <span className="ml-1 font-normal text-amber-800">
                    · {uploadDateWarnings.length} notice{uploadDateWarnings.length === 1 ? '' : 's'}
                  </span>
                </span>
              </span>
              <span className="shrink-0 text-[11px] font-medium text-amber-800">
                {uploadDateWarningsExpanded ? 'Hide' : 'Show'}
              </span>
            </button>
            {uploadDateWarningsExpanded ? (
              <div className="space-y-1 border-t border-amber-200 px-3 py-2">
                {uploadDateWarnings.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {lastUploadParsePreview ? (
          <div className="rounded border border-emerald-300 bg-emerald-50 text-xs text-emerald-950">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
              onClick={() => setParsePreviewExpanded((prev) => !prev)}
              aria-expanded={parsePreviewExpanded}
            >
              <span className="inline-flex min-w-0 items-center gap-2 font-medium">
                {parsePreviewExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                )}
                <span className="truncate">
                  Parse preview — sample member
                  <span className="ml-1 font-normal text-emerald-800">
                    · {lastUploadParsePreview.sampleMemberLabel || '—'}
                    {' · '}
                    {lastUploadParsePreview.populatedHeaderCount}/{CS_MIF_EXPORT_HEADERS.length} ILS columns
                    {lastUploadParsePreview.emptyHeaders.length
                      ? ` · ${lastUploadParsePreview.emptyHeaders.length} empty`
                      : ''}
                  </span>
                </span>
              </span>
              <span className="shrink-0 text-[11px] font-medium text-emerald-800">
                {parsePreviewExpanded ? 'Hide' : 'Show'}
              </span>
            </button>
            {parsePreviewExpanded ? (
              <div className="space-y-3 border-t border-emerald-200 px-3 py-3">
                <p className="text-emerald-900">
                  One sample row from the latest upload batch. Values below are what we parsed and will use for master
                  download / Create App notes. Empty fields are highlighted.
                </p>
                <div className="rounded border border-emerald-200 bg-white/70 p-3 space-y-2">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 font-medium text-emerald-950">
                    <span>{lastUploadParsePreview.sourceFileName}</span>
                    <span>{lastUploadParsePreview.memberCount} member(s) in upload</span>
                    <span>Sample: {lastUploadParsePreview.sampleMemberLabel || '—'}</span>
                    <span>
                      {lastUploadParsePreview.populatedHeaderCount}/{CS_MIF_EXPORT_HEADERS.length} ILS columns
                      populated
                    </span>
                    <span>
                      {lastUploadParsePreview.sheetHeaderCount} sheet headers ·{' '}
                      {lastUploadParsePreview.originalColumnCount} raw columns captured
                    </span>
                  </div>
                  {lastUploadParsePreview.emptyHeaders.length ? (
                    <div className="text-amber-800">
                      Empty on sample row: {lastUploadParsePreview.emptyHeaders.slice(0, 8).join(', ')}
                      {lastUploadParsePreview.emptyHeaders.length > 8
                        ? ` (+${lastUploadParsePreview.emptyHeaders.length - 8} more)`
                        : ''}
                    </div>
                  ) : (
                    <div className="text-emerald-800">All standard ILS CS MIF columns populated on sample row.</div>
                  )}
                  <div className="max-h-64 overflow-auto rounded border border-emerald-100">
                    <table className="w-full text-left">
                      <thead className="sticky top-0 bg-emerald-100/90">
                        <tr>
                          <th className="px-2 py-1 font-semibold">ILS column</th>
                          <th className="px-2 py-1 font-semibold">Parsed value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {CS_MIF_EXPORT_HEADERS.map((header) => {
                          const value = String(lastUploadParsePreview.sampleByHeader[header] || '').trim();
                          return (
                            <tr
                              key={`${lastUploadParsePreview.sourceFileName}-${header}`}
                              className={
                                value ? 'border-t border-emerald-50' : 'border-t border-amber-100 bg-amber-50/80'
                              }
                            >
                              <td className="px-2 py-1 align-top font-medium whitespace-nowrap">{header}</td>
                              <td className="px-2 py-1 align-top break-all">{value || '— empty —'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <Button
            size="default"
            className="h-10 px-5 font-semibold"
            disabled={isMatching || isSaving || isParsing || !rows.length}
            onClick={() => void recheckCaspioAndSaveMaster()}
          >
            {isMatching || isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {isMatching ? 'Checking Caspio…' : isSaving ? 'Saving master…' : 'Re-check Caspio'}
          </Button>
          <Button
            size="default"
            variant="outline"
            className="h-10 px-4 font-semibold"
            disabled={isSaving || isParsing || isMatching || !rows.length || !hasCheckedCaspio}
            onClick={() =>
              void saveMasterListAndRun({ quiet: false, skipPartialConfirm: true })
            }
          >
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <History className="mr-2 h-4 w-4" />
            )}
            Save master now
          </Button>
          <div className="min-w-0 flex-1 text-right space-y-0.5">
            <div className="text-sm font-semibold text-slate-900">
              {hasCheckedCaspio ? 'Kaiser Caspio status for summary cards' : 'Re-check Caspio required'}
            </div>
            <div className="text-xs text-muted-foreground">
              {hasCheckedCaspio
                ? lastMatchedLabel
                  ? `${lastMatchedLabel}. Re-check auto-saves the master. Not in Caspio = same members Create Application loads (no skeleton yet).`
                  : 'Re-check refreshes Caspio status and auto-saves the master. Not in Caspio = same members Create Application loads (no skeleton yet).'
                : 'Not in Caspio / Already in Caspio / Northern counts stay blank until you re-check (Kaiser only). Upload or Re-check auto-saves the master.'}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm text-blue-950">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-semibold">Running master consolidator total</span>
            <span className="text-2xl font-bold tabular-nums">{totals.total}</span>
            <span className="text-blue-800">
              unique member{totals.total === 1 ? '' : 's'} across all MIFs
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-blue-900/90">
            <span>
              New from uploads (this session):{' '}
              <span className="font-semibold tabular-nums">{sessionNetNewFromUploads}</span>
            </span>
            {lastUploadStats ? (
              <span>
                Latest upload:{' '}
                <span className="font-semibold tabular-nums">{lastUploadStats.parsedRows}</span> spreadsheet row
                {lastUploadStats.parsedRows === 1 ? '' : 's'} parsed
                {' → '}
                <span className="font-semibold tabular-nums">{lastUploadStats.uniqueParsed}</span> unique people
                {lastUploadStats.duplicateParsed > 0 ? (
                  <>
                    {' · '}
                    <span className="tabular-nums">{lastUploadStats.duplicateParsed}</span> repeat line
                    {lastUploadStats.duplicateParsed === 1 ? '' : 's'} (same person on multiple spreadsheet lines — not added again to master)
                  </>
                ) : null}
                {' · '}
                <span className="font-semibold tabular-nums">+{lastUploadStats.netNew}</span> new to master
                {' · '}
                <span className="tabular-nums">{lastUploadStats.fileCount}</span> file
                {lastUploadStats.fileCount === 1 ? '' : 's'}
              </span>
            ) : null}
            <span>
              Member rows across all uploaded MIF files:{' '}
              <span className="font-semibold tabular-nums">{rawMembersAcrossUploadedMifs}</span>
              <span className="text-blue-800/80"> (before unique merge)</span>
            </span>
            {totals.duplicateSpreadsheetLines > 0 ? (
              <span>
                {totals.duplicateSpreadsheetLines} extra spreadsheet line
                {totals.duplicateSpreadsheetLines === 1 ? '' : 's'} from last merge (same person already on master)
              </span>
            ) : null}
            {sortedSessionFiles.length ? (
              <span>
                {sortedSessionFiles.length} MIF file{sortedSessionFiles.length === 1 ? '' : 's'} in
                this session
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-blue-800/90">
            <span className="font-medium">Master list</span> = every member once (full list for download). Some MIFs
            include the full roster — uploading another full file updates existing people and only adds net-new
            members. The same MRN/CIN/Client ID never appears twice.
            New from uploads = people added to the master when you upload. Monthly stats on{' '}
            <Link href="/admin/tools/kaiser-statistics" className="underline underline-offset-2">
              Kaiser Statistics
            </Link>
            .
          </p>
          {rawMembersAcrossUploadedMifs > totals.total * 5 && totals.total > 0 ? (
            <p className="mt-2 rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-950">
              <span className="font-semibold">Spreadsheet rows exceed unique master total (expected when full MIFs overlap).</span>{' '}
              {rawMembersAcrossUploadedMifs.toLocaleString()} spreadsheet rows were logged across uploaded files, and{' '}
              {totals.total} unique people are on the master. That is normal when monthly/full MIFs repeat the same
              members — duplicates are merged by MRN/CIN/Client ID, not listed twice. If unique people looks far too
              low for one file alone, check Excel MRN/CIN formatting, then hard-refresh and re-upload.
            </p>
          ) : null}
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {clickableStat(
            'all',
            'Master list total',
            totals.total,
            '',
            {
              hint:
                `Every member once · Download Full Master exports all ${totals.total}` +
                (sessionNetNewFromUploads
                  ? ` · +${sessionNetNewFromUploads} new this session`
                  : ''),
            }
          )}
          {clickableStat(
            'new',
            'Not in Caspio',
            hasCheckedCaspio ? totals.notInCaspioAll : '—',
            hasCheckedCaspio ? 'text-emerald-700' : 'text-muted-foreground',
            {
              disabled: !hasCheckedCaspio,
              hint: hasCheckedCaspio
                ? totals.alreadyHaveSkeleton > 0
                  ? `Create App candidates · ${totals.alreadyHaveSkeleton} already have skeleton · denials are under Northern not in Caspio`
                  : 'Create App candidates · denials are under Northern not in Caspio'
                : 'Re-check Caspio first',
            }
          )}
          {clickableStat(
            'caspio',
            'In Caspio (Kaiser)',
            hasCheckedCaspio ? totals.caspio : '—',
            hasCheckedCaspio ? 'text-amber-700' : 'text-muted-foreground',
            {
              disabled: !hasCheckedCaspio,
              hint: hasCheckedCaspio ? 'CalAIM Authorized in Caspio' : 'Re-check Caspio first',
            }
          )}
          {clickableStat(
            'caspio-pending',
            'CalAIM Pending',
            hasCheckedCaspio ? totals.caspioPending : '—',
            hasCheckedCaspio ? 'text-violet-700' : 'text-muted-foreground',
            {
              disabled: !hasCheckedCaspio,
              hint: hasCheckedCaspio
                ? 'In Caspio · Pending with MIF auth end after Caspio auth end'
                : 'Re-check Caspio first',
            }
          )}
          {clickableStat(
            'status-updates',
            'Caspio updates needed',
            hasCheckedCaspio ? totals.statusUpdates : '—',
            hasCheckedCaspio ? 'text-fuchsia-700' : 'text-muted-foreground',
            {
              disabled: !hasCheckedCaspio,
              hint: hasCheckedCaspio
                ? `${totals.needsAuthorized} new/extended auth → Authorized · ${totals.needsT2038Received} T2038 updates`
                : 'Re-check Caspio first',
            }
          )}
          {clickableStat('incomplete', 'Incomplete', totals.incomplete, 'text-red-700')}
          {clickableStat(
            'northern',
            'Northern not in Caspio',
            hasCheckedCaspio ? totals.northern : '—',
            hasCheckedCaspio ? 'text-indigo-700' : 'text-muted-foreground',
            {
              disabled: !hasCheckedCaspio,
              hint: hasCheckedCaspio
                ? totals.northernNeedingDenial < totals.northern
                  ? `${totals.northernNeedingDenial} still need denial · ${
                      totals.northern - totals.northernNeedingDenial
                    } already denied (kept on list)`
                  : 'Still need denial email'
                : 'Re-check Caspio first',
            }
          )}
          {clickableStat(
            'declined',
            'Declined list',
            Math.max(totals.declined || 0, declinedMembers.length),
            'text-rose-700',
            {
              hint:
                northernDeclineBatches.length > 0
                  ? `${northernDeclineBatches.length} bulk send(s) logged · denied stay on monthly MIF`
                  : 'Denied service + date · stay on monthly MIF updates',
            }
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px] max-w-lg flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={queryText}
              onChange={(event) => {
                setQueryText(event.target.value);
                scrollToMasterList();
              }}
              placeholder="Search member by name, MRN, CIN, DOB, county…"
              className="pl-9"
              aria-label="Search master MIF members"
            />
          </div>
          {queryText.trim() ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setQueryText('')}
            >
              Clear search
            </Button>
          ) : null}
          <Button
            size="sm"
            variant={northernOnly || filter === 'northern' ? 'default' : 'outline'}
            disabled={!hasCheckedCaspio}
            onClick={() => {
              setNorthernOnly((prev) => !prev);
              setFilter('northern');
              scrollToMasterList();
            }}
          >
            <MapPin className="mr-1 h-4 w-4" />
            Northern not in Caspio
          </Button>
          {(
            [
              ['new', 'Not in Caspio'],
              ['caspio', 'In Caspio'],
              ['status-updates', 'Status updates'],
              ['duplicates', 'Duplicates'],
              ['incomplete', 'Incomplete'],
              ['declined', 'Declined'],
              ['all', 'All'],
            ] as Array<[FilterMode, string]>
          ).map(([value, label]) => (
            <Button
              key={value}
              size="sm"
              variant={filter === value ? 'default' : 'outline'}
              disabled={
                (value === 'new' || value === 'caspio' || value === 'status-updates') &&
                !hasCheckedCaspio
              }
              onClick={() => {
                setFilter(value);
                if (value !== 'northern') setNorthernOnly(false);
                scrollToMasterList();
              }}
            >
              {label}
            </Button>
          ))}
        </div>

        {hasCheckedCaspio && pendingAuthorizeCandidates.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3">
            <div className="min-w-0 space-y-1">
              <div className="text-sm font-semibold text-violet-950">
                Pending → Authorized — update manually in Caspio ({pendingAuthorizeCandidates.length})
              </div>
              <div className="text-xs text-violet-900/90">
                These members are still Pending in Caspio but the MIF shows a T2038 authorization. Staff set
                Authorized in Caspio directly so the assigned staff are informed. Open a row&apos;s auth details to
                copy the auth number and dates, then use Refresh Caspio on the row to clear it from this list.
              </div>
            </div>
          </div>
        ) : null}

        {hasCheckedCaspio && pendingT2038ReceivedCandidates.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-fuchsia-200 bg-fuchsia-50 px-4 py-3">
            <div className="min-w-0 space-y-1">
              <div className="text-sm font-semibold text-fuchsia-950">
                T2038 Requested → Received — update manually in Caspio ({pendingT2038ReceivedCandidates.length})
              </div>
              <div className="text-xs text-fuchsia-900/90">
                These members are on a MIF with a T2038 auth but Caspio still shows T2038 Requested. Set
                Kaiser_Status to “{ILS_MIF_TARGET_T2038_RECEIVED_STATUS}” in Caspio, then use Refresh Caspio on
                the row to clear it from this list.
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
