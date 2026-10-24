'use client';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Search, Database, Upload, Users } from 'lucide-react';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import Link from 'next/link';
import { SpreadsheetMemberPicker } from './SpreadsheetMemberPicker';
import { type Dispatch, type SetStateAction, type MutableRefObject } from 'react';
import { type KaiserIlsImportRow } from './kaiser-ils-import-helpers';
import {
  type IlsMifConsolidationRunRecord,
  type IlsMifUploadedFileRecord,
} from '@/lib/ils-mif-parse';
import { type IlsDecisionLogState, type IlsDecisionPreviewDraft } from './create-application-types';
import { type IlsDecisionChoice } from '@/lib/ils-decision-email';

export interface MifPullPanelProps {
  kaiserIlsPath: "" | "single_auth" | "pull_from_mif";
  mifMasterSearchMrn: string;
  setMifMasterSearchMrn: Dispatch<SetStateAction<string>>;
  mifMasterSearchMediCal: string;
  setMifMasterSearchMediCal: Dispatch<SetStateAction<string>>;
  mifMasterSearchLastName: string;
  setMifMasterSearchLastName: Dispatch<SetStateAction<string>>;
  mifMasterSearchFirstName: string;
  setMifMasterSearchFirstName: Dispatch<SetStateAction<string>>;
  isSearchingMifMaster: boolean;
  searchMifMasterList: () => Promise<void>;
  memberData: { memberFirstName: string; memberLastName: string; memberMrn: string; memberMediCalNum: string; confirmMemberMediCalNum: string; memberSex: string; parsedSourceType: string; createServiceDeliveryFormPdf: boolean; memberDob: string; memberPhone: string; memberEmail: string; memberCustomaryLocation: string; memberCustomaryAddress: string; memberCustomaryCity: string; memberCustomaryState: string; memberCustomaryZip: string; memberCustomaryCounty: string; Authorization_Number_T038: string; Authorization_Start_T2038: string; Authorization_End_T2038: string; Diagnostic_Code: string; kaiserStatus: string; contactFirstName: string; contactLastName: string; contactPhone: string; contactEmail: string; careManagerName: string; careManagerPhone: string; careManagerEmail: string; contactRelationship: string; eligibilityCheckStatus: string; notes: string; };
  mifMasterSearchResult: { exists: boolean; matchLabel: string; matchedBy: string; queriedAs: string; runLabel?: string | undefined; createAppEligible?: boolean | undefined; createAppExcludeReason?: string | undefined; } | null;
  refreshCaspioBeforeSpreadsheetParse: () => Promise<void>;
  isCheckingCaspioExisting: boolean;
  isParsingIlsSpreadsheet: boolean;
  ilsSpreadsheetInputRef: MutableRefObject<HTMLInputElement | null>;
  parseIlsSpreadsheetFile: (file: File) => Promise<void>;
  hasMifCaspioRefresh: boolean;
  loadNewMembersFromMifMasterList: (runId?: string | undefined, options?: { silent?: boolean | undefined; preferLatest?: boolean | undefined; } | undefined) => Promise<KaiserIlsImportRow[]>;
  selectedConsolidatorRunId: string;
  isLoadingConsolidatorRuns: boolean;
  notInCaspioCardCount: number | null;
  ilsImportRows: KaiserIlsImportRow[];
  consolidatorRuns: IlsMifConsolidationRunRecord[];
  focusNotInCaspioMembers: () => Promise<void>;
  notInCaspioCardActive: boolean;
  notInCaspioCardHint: string;
  setSelectedConsolidatorRunId: Dispatch<SetStateAction<string>>;
  ilsPickerSearchMode: "all" | "lastName" | "mrn";
  setIlsPickerSearchMode: Dispatch<SetStateAction<"all" | "lastName" | "mrn">>;
  ilsPickerSearch: string;
  setIlsPickerSearch: Dispatch<SetStateAction<string>>;
  ilsPickerRows: KaiserIlsImportRow[];
  pickedIlsRowId: string;
  setPickedIlsRowId: Dispatch<SetStateAction<string>>;
  setIlsImportSelected: Dispatch<SetStateAction<Record<string, boolean>>>;
  createAppLoadedRunId: string;
  createAppLoadedAtIso: string;
  consolidatorUploadedFiles: IlsMifUploadedFileRecord[];
  parsePickedIlsRowToForm: () => void;
  clearIlsSpreadsheetImport: () => void;
  ilsSpreadsheetFileName: string;
  mifLastCaspioRefreshAtIso: string;
  selectedIlsRows: KaiserIlsImportRow[];
  selectedCreatedIlsRows: KaiserIlsImportRow[];
  nonCaspioRowCount: number;
  caspioExistingRowCount: number;
  pendingAuthUpdateRowCount: number;
  selectAllVisibleIlsRows: () => void;
  clearAllVisibleIlsSelections: () => void;
  selectOnlyNotInCaspio: (rowsOverride?: KaiserIlsImportRow[] | undefined) => void;
  selectOnlyInCaspio: () => void;
  excludeSelectedFromCreateApp: () => Promise<void>;
  isExcludingFromCreateApp: boolean;
  ilsImportSelected: Record<string, boolean>;
  refreshIlsRowsFromCaspio: () => Promise<void>;
  showOnlyNotInCaspio: boolean;
  setShowOnlyNotInCaspio: Dispatch<SetStateAction<boolean>>;
  setNotInCaspioCardActive: Dispatch<SetStateAction<boolean>>;
  populateMemberDataFromIlsRow: (row: KaiserIlsImportRow, options?: { silent?: boolean | undefined; } | undefined) => void;
  excludeRowsFromCreateApp: (rows: KaiserIlsImportRow[]) => Promise<void>;
  ilsDecisionLogByRowId: Record<string, IlsDecisionLogState>;
  sendingIlsDecisionRowId: string;
  openIlsServiceDecisionPreview: (row: KaiserIlsImportRow, choice: IlsDecisionChoice) => void;
  pendingIlsDecisionDraft: IlsDecisionPreviewDraft | null;
  setPendingIlsDecisionDraft: Dispatch<SetStateAction<IlsDecisionPreviewDraft | null>>;
  sendIlsServiceDecision: (draft: IlsDecisionPreviewDraft) => Promise<void>;
}

export function MifPullPanel({
  kaiserIlsPath,
  mifMasterSearchMrn,
  setMifMasterSearchMrn,
  mifMasterSearchMediCal,
  setMifMasterSearchMediCal,
  mifMasterSearchLastName,
  setMifMasterSearchLastName,
  mifMasterSearchFirstName,
  setMifMasterSearchFirstName,
  isSearchingMifMaster,
  searchMifMasterList,
  memberData,
  mifMasterSearchResult,
  refreshCaspioBeforeSpreadsheetParse,
  isCheckingCaspioExisting,
  isParsingIlsSpreadsheet,
  ilsSpreadsheetInputRef,
  parseIlsSpreadsheetFile,
  hasMifCaspioRefresh,
  loadNewMembersFromMifMasterList,
  selectedConsolidatorRunId,
  isLoadingConsolidatorRuns,
  notInCaspioCardCount,
  ilsImportRows,
  consolidatorRuns,
  focusNotInCaspioMembers,
  notInCaspioCardActive,
  notInCaspioCardHint,
  setSelectedConsolidatorRunId,
  ilsPickerSearchMode,
  setIlsPickerSearchMode,
  ilsPickerSearch,
  setIlsPickerSearch,
  ilsPickerRows,
  pickedIlsRowId,
  setPickedIlsRowId,
  setIlsImportSelected,
  createAppLoadedRunId,
  createAppLoadedAtIso,
  consolidatorUploadedFiles,
  parsePickedIlsRowToForm,
  clearIlsSpreadsheetImport,
  ilsSpreadsheetFileName,
  mifLastCaspioRefreshAtIso,
  selectedIlsRows,
  selectedCreatedIlsRows,
  nonCaspioRowCount,
  caspioExistingRowCount,
  pendingAuthUpdateRowCount,
  selectAllVisibleIlsRows,
  clearAllVisibleIlsSelections,
  selectOnlyNotInCaspio,
  selectOnlyInCaspio,
  excludeSelectedFromCreateApp,
  isExcludingFromCreateApp,
  ilsImportSelected,
  refreshIlsRowsFromCaspio,
  showOnlyNotInCaspio,
  setShowOnlyNotInCaspio,
  setNotInCaspioCardActive,
  populateMemberDataFromIlsRow,
  excludeRowsFromCreateApp,
  ilsDecisionLogByRowId,
  sendingIlsDecisionRowId,
  openIlsServiceDecisionPreview,
  pendingIlsDecisionDraft,
  setPendingIlsDecisionDraft,
  sendIlsServiceDecision,
}: MifPullPanelProps) {
  return (
    <>
      {kaiserIlsPath === 'pull_from_mif' ? (
      <>
      <div className="p-3 border rounded-md bg-indigo-50/40 space-y-3">
        <div className="-mx-3 -mt-3 mb-1 rounded-t-md border-b border-sky-200 bg-sky-100 px-3 py-2.5 shadow-sm">
          <div className="font-semibold tracking-tight text-sky-950">
            Pull from MIF
          </div>
          <div className="mt-0.5 text-xs text-sky-800">
            Load a consolidator run, leave picks off, then select one member at a time: parse → create
            skeleton → assign staff.
          </div>
        </div>
        <div className="rounded-md border border-indigo-200 bg-indigo-50/50 p-2 space-y-2">
          <div className="text-xs font-medium text-indigo-950">
            Check latest consolidated MIF master + Caspio
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              value={mifMasterSearchMrn}
              onChange={(e) => setMifMasterSearchMrn(e.target.value)}
              placeholder="MRN"
              className="h-8 bg-white text-xs"
            />
            <Input
              value={mifMasterSearchMediCal}
              onChange={(e) => setMifMasterSearchMediCal(e.target.value)}
              placeholder="Medi-Cal / CIN"
              className="h-8 bg-white text-xs"
            />
            <Input
              value={mifMasterSearchLastName}
              onChange={(e) => setMifMasterSearchLastName(e.target.value)}
              placeholder="Last name (e.g. Pun)"
              className="h-8 bg-white text-xs"
            />
            <Input
              value={mifMasterSearchFirstName}
              onChange={(e) => setMifMasterSearchFirstName(e.target.value)}
              placeholder="First name (e.g. Jung)"
              className="h-8 bg-white text-xs"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              disabled={isSearchingMifMaster}
              onClick={() => void searchMifMasterList()}
            >
              {isSearchingMifMaster ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Search className="mr-2 h-3.5 w-3.5" />
              )}
              Search MIF Master List
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8"
              onClick={() => {
                setMifMasterSearchMrn(String(memberData.memberMrn || ''));
                setMifMasterSearchMediCal(String(memberData.memberMediCalNum || ''));
                setMifMasterSearchLastName(String(memberData.memberLastName || ''));
                setMifMasterSearchFirstName(String(memberData.memberFirstName || ''));
              }}
            >
              Use form fields
            </Button>
          </div>
          {mifMasterSearchResult ? (
            <div
              className={`rounded border px-2 py-1.5 text-xs space-y-1 ${
                mifMasterSearchResult.exists
                  ? mifMasterSearchResult.createAppEligible
                    ? 'border-indigo-300 bg-indigo-100 text-indigo-950'
                    : 'border-amber-300 bg-amber-50 text-amber-950'
                  : 'border-emerald-300 bg-emerald-50 text-emerald-900'
              }`}
            >
              {mifMasterSearchResult.exists ? (
                <>
                  <div>
                    On latest MIF master
                    {mifMasterSearchResult.matchedBy
                      ? ` (matched by ${mifMasterSearchResult.matchedBy})`
                      : ''}
                    {mifMasterSearchResult.matchLabel
                      ? `: ${mifMasterSearchResult.matchLabel}`
                      : ''}
                    {mifMasterSearchResult.runLabel ? ` · ${mifMasterSearchResult.runLabel}` : ''}
                    .
                  </div>
                  {mifMasterSearchResult.createAppEligible ? (
                    <div className="font-medium">
                      Eligible for Create App picker — use last-name search below, or click Refresh
                      Consolidated Run if the list is empty.
                    </div>
                  ) : mifMasterSearchResult.createAppExcludeReason ? (
                    <div className="font-medium">
                      Not in Create App picker: {mifMasterSearchResult.createAppExcludeReason}
                    </div>
                  ) : null}
                </>
              ) : (
                <>Not on latest consolidated MIF master{mifMasterSearchResult.queriedAs ? ` for ${mifMasterSearchResult.queriedAs}` : ''}{mifMasterSearchResult.runLabel ? ` (${mifMasterSearchResult.runLabel})` : ''}.</>
              )}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void refreshCaspioBeforeSpreadsheetParse()}
              disabled={isCheckingCaspioExisting || isParsingIlsSpreadsheet}
            >
              {isCheckingCaspioExisting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Refreshing Caspio...
                </>
              ) : (
                <>
                  <Database className="mr-2 h-4 w-4" />
                  1) Refresh Caspio Members
                </>
              )}
            </Button>
            <input
              ref={ilsSpreadsheetInputRef}
              type="file"
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
              className="hidden"
              onChange={(e) => {
                const picked = e.target.files?.[0];
                if (picked) void parseIlsSpreadsheetFile(picked);
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => ilsSpreadsheetInputRef.current?.click()}
              disabled={isParsingIlsSpreadsheet || isCheckingCaspioExisting || !hasMifCaspioRefresh}
            >
              {isParsingIlsSpreadsheet ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {isParsingIlsSpreadsheet ? 'Parsing spreadsheet...' : '2) Upload MIF Spreadsheet'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                void loadNewMembersFromMifMasterList(selectedConsolidatorRunId || undefined, {
                  preferLatest: !selectedConsolidatorRunId,
                })
              }
              disabled={isParsingIlsSpreadsheet || isCheckingCaspioExisting || isLoadingConsolidatorRuns}
            >
              <Users className="mr-2 h-4 w-4" />
              Refresh Consolidated Run
            </Button>
            <div className="w-full grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <button
                type="button"
                disabled={
                  notInCaspioCardCount == null &&
                  ilsImportRows.length === 0 &&
                  consolidatorRuns.length === 0
                }
                onClick={() => void focusNotInCaspioMembers()}
                className={`rounded-lg border bg-white p-3 text-left transition hover:border-slate-400 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-slate-200 disabled:hover:shadow-none ${
                  notInCaspioCardActive ? 'ring-2 ring-blue-500' : ''
                }`}
              >
                <div className="text-sm text-muted-foreground">Not in Caspio</div>
                <div
                  className={`text-xl font-semibold ${
                    notInCaspioCardCount == null
                      ? 'text-muted-foreground'
                      : 'text-emerald-700'
                  }`}
                >
                  {notInCaspioCardCount == null ? '—' : notInCaspioCardCount}
                </div>
                <div className="mt-1 text-[11px] text-blue-700">
                  {[notInCaspioCardHint, 'Jump to Master list'].filter(Boolean).join(' · ')}
                </div>
              </button>
            </div>
            <div className="w-full space-y-2 rounded-md border bg-white p-3">
              <div className="text-sm font-medium">Create App filtered list</div>
              <div className="text-xs text-muted-foreground">
                Loads members from the selected consolidation run who are <span className="font-medium">not in Caspio</span>
                {' '}(including incomplete rows missing CIN), so you can create applications. Live Caspio check
                removes matches. Skeletons already created, Northern declines, removals, and Create App hides
                stay excluded. Refresh after new MIF uploads or skeleton creates.
              </div>
              <Select
                value={selectedConsolidatorRunId || undefined}
                onValueChange={(value) => setSelectedConsolidatorRunId(value)}
              >
                <SelectTrigger className="max-w-xl bg-white">
                  <SelectValue
                    placeholder={
                      isLoadingConsolidatorRuns
                        ? 'Loading consolidation runs…'
                        : consolidatorRuns.length
                          ? 'Optional: pick a run, or refresh to use the latest'
                          : 'No consolidation runs saved yet'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {consolidatorRuns.map((run) => (
                    <SelectItem key={run.id} value={run.id}>
                      {(run.createdAtIso
                        ? new Date(run.createdAtIso).toLocaleString()
                        : run.label) +
                        ` · ${run.newMemberCount} new` +
                        (run.sourceFiles.length ? ` · ${run.sourceFiles.length} MIF file(s)` : '')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-sky-200 bg-sky-50/60 p-2">
                <Select
                  value={ilsPickerSearchMode}
                  onValueChange={(value) =>
                    setIlsPickerSearchMode(
                      value === 'lastName' ? 'lastName' : value === 'mrn' ? 'mrn' : 'all'
                    )
                  }
                >
                  <SelectTrigger className="h-8 w-[140px] text-xs bg-white">
                    <SelectValue placeholder="Search by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Last name or MRN</SelectItem>
                    <SelectItem value="lastName">Last name</SelectItem>
                    <SelectItem value="mrn">MRN</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  value={ilsPickerSearch}
                  onChange={(event) => setIlsPickerSearch(event.target.value)}
                  placeholder={
                    ilsPickerSearchMode === 'lastName'
                      ? 'Search by last name…'
                      : ilsPickerSearchMode === 'mrn'
                        ? 'Search by MRN…'
                        : 'Search last name or MRN…'
                  }
                  className="h-8 min-w-[14rem] flex-1 max-w-md text-xs bg-white"
                  disabled={ilsImportRows.length === 0}
                />
                <span className="text-[11px] text-slate-600">
                  {ilsImportRows.length
                    ? `${ilsPickerRows.length} of ${ilsImportRows.length} members`
                    : 'Load a run first'}
                </span>
                {ilsPickerSearch.trim() ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-[11px] bg-white"
                    onClick={() => setIlsPickerSearch('')}
                  >
                    Clear
                  </Button>
                ) : null}
              </div>
              {ilsPickerSearch.trim() && ilsImportRows.length > 0 ? (
                <div className="max-h-36 overflow-auto rounded border bg-white text-[11px]">
                  {ilsPickerRows.length === 0 ? (
                    <div className="px-2 py-2 text-muted-foreground">No members match that search.</div>
                  ) : (
                    ilsPickerRows.slice(0, 40).map((row) => (
                      <button
                        key={`section1-search-${row.rowId}`}
                        type="button"
                        className={`flex w-full items-center justify-between gap-2 border-b px-2 py-1.5 text-left hover:bg-sky-50 ${
                          pickedIlsRowId === row.rowId ? 'bg-sky-100' : ''
                        }`}
                        onClick={() => {
                          setPickedIlsRowId(row.rowId);
                          setIlsImportSelected((prev) => ({ ...prev, [row.rowId]: true }));
                        }}
                      >
                        <span className="font-medium truncate">
                          {row.memberLastName || '—'}, {row.memberFirstName || '—'}
                        </span>
                        <span className="shrink-0 text-slate-600">MRN {row.memberMrn || '—'}</span>
                      </button>
                    ))
                  )}
                  {ilsPickerRows.length > 40 ? (
                    <div className="px-2 py-1 text-muted-foreground">
                      Showing first 40 matches — see full picker table below.
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="text-xs text-slate-700">
                <div>
                  Master list last updated:{' '}
                  <span className="font-medium">
                    {createAppLoadedRunId
                      ? (() => {
                          const selected = consolidatorRuns.find(
                            (run) => run.id === createAppLoadedRunId
                          );
                          return selected?.createdAtIso
                            ? new Date(selected.createdAtIso).toLocaleString()
                            : '—';
                        })()
                      : '—'}
                  </span>
                </div>
                <div className="mt-1">
                  Last consolidated refresh:{' '}
                  <span className="font-medium">
                    {createAppLoadedAtIso
                      ? new Date(createAppLoadedAtIso).toLocaleString()
                      : '—'}
                  </span>
                </div>
                <div className="mt-1">
                  Source MIF files:{' '}
                  {createAppLoadedRunId
                    ? (() => {
                        const selected = consolidatorRuns.find(
                          (run) => run.id === createAppLoadedRunId
                        );
                        return selected?.sourceFiles?.length
                          ? selected.sourceFiles.join(', ')
                          : '—';
                      })()
                    : '—'}
                </div>
              </div>
              {consolidatorUploadedFiles.length > 0 ? (
                <div className="max-h-28 overflow-auto rounded border bg-slate-50 px-2 py-1 text-[11px] text-slate-700">
                  <div className="font-medium">Recently uploaded MIFs</div>
                  {consolidatorUploadedFiles.slice(0, 12).map((file) => (
                    <div key={file.id}>
                      {file.fileName} ·{' '}
                      {file.uploadedAtIso
                        ? new Date(file.uploadedAtIso).toLocaleString()
                        : '—'}{' '}
                      · {file.rowCount} rows
                      {file.runId ? ` · run ${file.runId}` : ''}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground md:col-span-2">
              Refresh loads the latest consolidator run (or the run you picked) into this filtered list.
              Members already in Caspio or with a skeleton application stay on the comprehensive MIF list
              but are removed here.
            </p>
            <Link
              href="/admin/tools/ils-mif-consolidator"
              className="inline-flex items-center text-xs text-blue-700 underline"
            >
              Open ILS MIF Consolidator
            </Link>
            <Button
              type="button"
              variant="outline"
              onClick={parsePickedIlsRowToForm}
              disabled={ilsImportRows.length === 0}
            >
              Manual Parse Picked Row to Form
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={clearIlsSpreadsheetImport}
              disabled={isParsingIlsSpreadsheet || (ilsImportRows.length === 0 && !ilsSpreadsheetFileName)}
            >
              Delete Spreadsheet Upload
            </Button>
          </div>
        </div>
        <div className="rounded-md border bg-slate-50 px-2 py-1 text-xs text-slate-700">
          Recommended order: refresh Caspio members - upload MIF spreadsheet - pick row - parse row into form - create one application using the main Create button.
        </div>
        <div className="text-xs text-muted-foreground">
          Spreadsheet file: {ilsSpreadsheetFileName || 'None'}
        </div>
        <div className="text-xs text-muted-foreground">
          Last Caspio refresh:{' '}
          {mifLastCaspioRefreshAtIso ? new Date(mifLastCaspioRefreshAtIso).toLocaleString() : 'Not run yet'}
        </div>
        {!hasMifCaspioRefresh ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
            Step required: click <span className="font-medium">1) Refresh Caspio Members</span> before each MIF upload.
          </div>
        ) : null}
        {ilsSpreadsheetFileName ? (
          <div className="rounded-md border bg-emerald-50/60 px-2 py-1 text-xs text-emerald-800">
            Uploaded spreadsheet: <span className="font-medium">{ilsSpreadsheetFileName}</span>
          </div>
        ) : null}
      </div>
      
<div className="md:col-span-2 text-xs text-muted-foreground">
        Selected rows: {selectedIlsRows.length} / {ilsImportRows.length}
      </div>
      <div className="md:col-span-2 text-xs text-muted-foreground">
        Created records in selection: {selectedCreatedIlsRows.length}
      </div>
      <div className="md:col-span-2 text-xs text-muted-foreground">
        Picked row for parse:{' '}
        {(() => {
          if (!pickedIlsRowId) return 'None';
          const picked = ilsImportRows.find((row) => row.rowId === pickedIlsRowId);
          if (!picked) return 'None';
          const label = `${picked.memberFirstName || ''} ${picked.memberLastName || ''}`.trim();
          return label || picked.rowId;
        })()}
      </div>
      <SpreadsheetMemberPicker
        nonCaspioRowCount={nonCaspioRowCount}
        caspioExistingRowCount={caspioExistingRowCount}
        pendingAuthUpdateRowCount={pendingAuthUpdateRowCount}
        isCheckingCaspioExisting={isCheckingCaspioExisting}
        selectAllVisibleIlsRows={selectAllVisibleIlsRows}
        ilsImportRows={ilsImportRows}
        clearAllVisibleIlsSelections={clearAllVisibleIlsSelections}
        selectOnlyNotInCaspio={selectOnlyNotInCaspio}
        selectOnlyInCaspio={selectOnlyInCaspio}
        excludeSelectedFromCreateApp={excludeSelectedFromCreateApp}
        isExcludingFromCreateApp={isExcludingFromCreateApp}
        ilsImportSelected={ilsImportSelected}
        refreshIlsRowsFromCaspio={refreshIlsRowsFromCaspio}
        loadNewMembersFromMifMasterList={loadNewMembersFromMifMasterList}
        selectedConsolidatorRunId={selectedConsolidatorRunId}
        isParsingIlsSpreadsheet={isParsingIlsSpreadsheet}
        isLoadingConsolidatorRuns={isLoadingConsolidatorRuns}
        showOnlyNotInCaspio={showOnlyNotInCaspio}
        setShowOnlyNotInCaspio={setShowOnlyNotInCaspio}
        setNotInCaspioCardActive={setNotInCaspioCardActive}
        ilsPickerSearchMode={ilsPickerSearchMode}
        setIlsPickerSearchMode={setIlsPickerSearchMode}
        ilsPickerSearch={ilsPickerSearch}
        setIlsPickerSearch={setIlsPickerSearch}
        ilsPickerRows={ilsPickerRows}
        setIlsImportSelected={setIlsImportSelected}
        setPickedIlsRowId={setPickedIlsRowId}
        pickedIlsRowId={pickedIlsRowId}
        populateMemberDataFromIlsRow={populateMemberDataFromIlsRow}
        excludeRowsFromCreateApp={excludeRowsFromCreateApp}
        ilsDecisionLogByRowId={ilsDecisionLogByRowId}
        sendingIlsDecisionRowId={sendingIlsDecisionRowId}
        openIlsServiceDecisionPreview={openIlsServiceDecisionPreview}
        pendingIlsDecisionDraft={pendingIlsDecisionDraft}
        setPendingIlsDecisionDraft={setPendingIlsDecisionDraft}
        sendIlsServiceDecision={sendIlsServiceDecision}
      />
      </>
      ) : null}
    </>
  );
}
