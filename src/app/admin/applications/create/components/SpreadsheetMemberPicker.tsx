'use client';

import { Loader2, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import {
  isIlsRowCreated,
  isIlsRowLockedForSkeletonCreate,
  type KaiserIlsImportRow,
} from './kaiser-ils-import-helpers';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { type Dispatch, type SetStateAction } from 'react';
import { type IlsDecisionLogState, type IlsDecisionPreviewDraft } from './create-application-types';
import { type IlsDecisionChoice } from '@/lib/ils-decision-email';

export interface SpreadsheetMemberPickerProps {
  nonCaspioRowCount: number;
  caspioExistingRowCount: number;
  pendingAuthUpdateRowCount: number;
  isCheckingCaspioExisting: boolean;
  selectAllVisibleIlsRows: () => void;
  ilsImportRows: KaiserIlsImportRow[];
  clearAllVisibleIlsSelections: () => void;
  selectOnlyNotInCaspio: (rowsOverride?: KaiserIlsImportRow[] | undefined) => void;
  selectOnlyInCaspio: () => void;
  excludeSelectedFromCreateApp: () => Promise<void>;
  isExcludingFromCreateApp: boolean;
  ilsImportSelected: Record<string, boolean>;
  refreshIlsRowsFromCaspio: () => Promise<void>;
  loadNewMembersFromMifMasterList: (runId?: string | undefined, options?: { silent?: boolean | undefined; preferLatest?: boolean | undefined; } | undefined) => Promise<KaiserIlsImportRow[]>;
  selectedConsolidatorRunId: string;
  isParsingIlsSpreadsheet: boolean;
  isLoadingConsolidatorRuns: boolean;
  showOnlyNotInCaspio: boolean;
  setShowOnlyNotInCaspio: Dispatch<SetStateAction<boolean>>;
  setNotInCaspioCardActive: Dispatch<SetStateAction<boolean>>;
  ilsPickerSearchMode: "all" | "lastName" | "mrn";
  setIlsPickerSearchMode: Dispatch<SetStateAction<"all" | "lastName" | "mrn">>;
  ilsPickerSearch: string;
  setIlsPickerSearch: Dispatch<SetStateAction<string>>;
  ilsPickerRows: KaiserIlsImportRow[];
  setIlsImportSelected: Dispatch<SetStateAction<Record<string, boolean>>>;
  setPickedIlsRowId: Dispatch<SetStateAction<string>>;
  pickedIlsRowId: string;
  populateMemberDataFromIlsRow: (row: KaiserIlsImportRow, options?: { silent?: boolean | undefined; } | undefined) => void;
  excludeRowsFromCreateApp: (rows: KaiserIlsImportRow[]) => Promise<void>;
  ilsDecisionLogByRowId: Record<string, IlsDecisionLogState>;
  sendingIlsDecisionRowId: string;
  openIlsServiceDecisionPreview: (row: KaiserIlsImportRow, choice: IlsDecisionChoice) => void;
  pendingIlsDecisionDraft: IlsDecisionPreviewDraft | null;
  setPendingIlsDecisionDraft: Dispatch<SetStateAction<IlsDecisionPreviewDraft | null>>;
  sendIlsServiceDecision: (draft: IlsDecisionPreviewDraft) => Promise<void>;
}

export function SpreadsheetMemberPicker({
  nonCaspioRowCount,
  caspioExistingRowCount,
  pendingAuthUpdateRowCount,
  isCheckingCaspioExisting,
  selectAllVisibleIlsRows,
  ilsImportRows,
  clearAllVisibleIlsSelections,
  selectOnlyNotInCaspio,
  selectOnlyInCaspio,
  excludeSelectedFromCreateApp,
  isExcludingFromCreateApp,
  ilsImportSelected,
  refreshIlsRowsFromCaspio,
  loadNewMembersFromMifMasterList,
  selectedConsolidatorRunId,
  isParsingIlsSpreadsheet,
  isLoadingConsolidatorRuns,
  showOnlyNotInCaspio,
  setShowOnlyNotInCaspio,
  setNotInCaspioCardActive,
  ilsPickerSearchMode,
  setIlsPickerSearchMode,
  ilsPickerSearch,
  setIlsPickerSearch,
  ilsPickerRows,
  setIlsImportSelected,
  setPickedIlsRowId,
  pickedIlsRowId,
  populateMemberDataFromIlsRow,
  excludeRowsFromCreateApp,
  ilsDecisionLogByRowId,
  sendingIlsDecisionRowId,
  openIlsServiceDecisionPreview,
  pendingIlsDecisionDraft,
  setPendingIlsDecisionDraft,
  sendIlsServiceDecision,
}: SpreadsheetMemberPickerProps) {
  return (
    <div
      id="create-app-mif-member-picker"
      className="md:col-span-2 rounded-md border bg-slate-50 p-2 text-xs space-y-2 scroll-mt-24"
    >
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">Spreadsheet member picker</span>
          <span className="text-muted-foreground">Not in Caspio: {nonCaspioRowCount}</span>
          <span className="text-muted-foreground">Already in Caspio: {caspioExistingRowCount}</span>
          {pendingAuthUpdateRowCount > 0 ? (
            <span className="font-medium text-amber-800">
              Pending auth update: {pendingAuthUpdateRowCount}
            </span>
          ) : null}
          {isCheckingCaspioExisting ? (
            <span className="inline-flex items-center gap-1 text-amber-700">
              <Loader2 className="h-3 w-3 animate-spin" />
              Checking Caspio matches...
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={selectAllVisibleIlsRows} disabled={ilsImportRows.length === 0}>
            Select Visible
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={clearAllVisibleIlsSelections} disabled={ilsImportRows.length === 0}>
            Clear Visible
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={() => selectOnlyNotInCaspio()} disabled={ilsImportRows.length === 0}>
            Select Only Not In Caspio
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={selectOnlyInCaspio} disabled={ilsImportRows.length === 0}>
            Select Only In Caspio
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-[11px] text-amber-800 border-amber-200"
            onClick={() => void excludeSelectedFromCreateApp()}
            disabled={
              isExcludingFromCreateApp ||
              !Object.values(ilsImportSelected).some(Boolean)
            }
            title="Hide selected members from Create Application only. They stay on the consolidator master list."
          >
            {isExcludingFromCreateApp ? (
              <>
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                Hiding...
              </>
            ) : (
              <>
                <Trash2 className="mr-1 h-3 w-3" />
                Hide Selected from Create App
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-[11px]"
            onClick={() => void refreshIlsRowsFromCaspio()}
            disabled={ilsImportRows.length === 0 || isCheckingCaspioExisting}
          >
            {isCheckingCaspioExisting ? (
              <>
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                Refreshing Caspio...
              </>
            ) : (
              'Refresh Caspio + MIF Match'
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-[11px]"
            onClick={() =>
              void loadNewMembersFromMifMasterList(selectedConsolidatorRunId || undefined, {
                preferLatest: !selectedConsolidatorRunId,
              })
            }
            disabled={isParsingIlsSpreadsheet || isCheckingCaspioExisting || isLoadingConsolidatorRuns}
            title="Reload Create App rows from the selected (or latest) consolidation run"
          >
            {isLoadingConsolidatorRuns || isParsingIlsSpreadsheet ? (
              <>
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                Refreshing...
              </>
            ) : (
              <>
                <Users className="mr-1 h-3 w-3" />
                Refresh Consolidated Run
              </>
            )}
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-[11px]" asChild>
            <Link href="/admin/tools/spreadsheet-uploads">
              Spreadsheet Upload Status
            </Link>
          </Button>
          <label className="inline-flex items-center gap-2 text-[11px] text-muted-foreground">
            <Checkbox
              checked={showOnlyNotInCaspio}
              onCheckedChange={(checked) => {
                const on = Boolean(checked);
                setShowOnlyNotInCaspio(on);
                setNotInCaspioCardActive(on);
              }}
            />
            Show only rows not in Caspio
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={ilsPickerSearchMode}
            onValueChange={(value) =>
              setIlsPickerSearchMode(
                value === 'lastName' ? 'lastName' : value === 'mrn' ? 'mrn' : 'all'
              )
            }
          >
            <SelectTrigger className="h-8 w-[150px] text-xs bg-white">
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
                ? 'Search by last name'
                : ilsPickerSearchMode === 'mrn'
                  ? 'Search by MRN'
                  : 'Search last name or MRN'
            }
            className="h-8 w-full max-w-sm text-xs"
          />
          <span className="text-[11px] text-muted-foreground">
            Showing {ilsPickerRows.length} of {ilsImportRows.length} rows
          </span>
          {ilsPickerSearch.trim() ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() => setIlsPickerSearch('')}
            >
              Clear Search
            </Button>
          ) : null}
        </div>
        <div className="max-h-[500px] overflow-auto rounded border bg-white">
          <table className="min-w-[1600px] w-full table-fixed text-[11px] md:text-[12px] leading-5">
            <thead className="sticky top-0 z-40 bg-slate-50">
              <tr className="text-left">
                <th className="sticky left-0 top-0 z-50 bg-slate-50 px-2 py-2 font-semibold whitespace-nowrap border-r w-[52px] min-w-[52px] max-w-[52px]">
                  Pick
                </th>
                <th className="sticky left-[52px] top-0 z-50 bg-slate-50 px-1 py-2 font-semibold whitespace-nowrap border-r w-[100px] min-w-[100px] max-w-[100px]">
                  Parse Row
                </th>
                <th className="sticky left-[152px] top-0 z-50 bg-slate-50 px-1 py-2 font-semibold whitespace-nowrap border-r w-[88px] min-w-[88px] max-w-[88px]">
                  Hide
                </th>
                <th className="sticky left-[240px] top-0 z-50 bg-slate-50 px-2 py-2 font-semibold whitespace-nowrap border-r w-[128px] min-w-[128px] max-w-[128px]">
                  First Name
                </th>
                <th className="sticky left-[368px] top-0 z-50 bg-slate-50 px-2 py-2 font-semibold whitespace-nowrap border-r w-[140px] min-w-[140px] max-w-[140px]">
                  Last Name
                </th>
                <th className="sticky left-[508px] top-0 z-50 bg-slate-50 px-2 py-2 font-semibold whitespace-nowrap border-r w-[180px] min-w-[180px] max-w-[180px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.12)]">
                  City
                </th>
                <th className="hidden md:table-cell px-2 py-2 font-semibold whitespace-nowrap min-w-[120px] w-[120px]">County</th>
                <th className="px-2 py-2 font-semibold whitespace-nowrap min-w-[120px] w-[120px]">MRN</th>
                <th className="px-2 py-2 font-semibold whitespace-nowrap min-w-[150px] w-[150px]">Medical Number (CIN)</th>
                <th className="px-2 py-2 font-semibold whitespace-nowrap min-w-[150px] w-[150px]">Skeleton Status</th>
                <th className="px-2 py-2 font-semibold whitespace-nowrap min-w-[220px] w-[220px]">Caspio Match</th>
                <th className="px-2 py-2 font-semibold whitespace-nowrap min-w-[220px] w-[220px]">MIF Master Match</th>
                <th className="px-2 py-2 font-semibold whitespace-nowrap min-w-[220px] w-[220px]">ILS Decision</th>
              </tr>
            </thead>
            <tbody>
              {ilsImportRows.length === 0 ? (
                <tr className="border-t">
                  <td colSpan={13} className="px-2 py-2 text-muted-foreground">
                    No parsed rows yet. Click <span className="font-medium">2) Upload MIF Spreadsheet</span>. If your file uses uncommon headers, I can add them.
                  </td>
                </tr>
              ) : ilsPickerRows.length === 0 ? (
                <tr className="border-t">
                  <td colSpan={13} className="px-2 py-2 text-muted-foreground">
                    No rows in this filter.
                  </td>
                </tr>
              ) : (
                ilsPickerRows.map((row) => (
                  <tr key={`picker-${row.rowId}`} className="border-t">
                    {(() => {
                      const isCreated = isIlsRowCreated(row);
                      const isLockedForSkeleton = isIlsRowLockedForSkeletonCreate(row);
                      return (
                        <>
                    <td className="sticky left-0 z-20 bg-white px-2 py-2 align-top border-r w-[52px] min-w-[52px] max-w-[52px]">
                      <Checkbox
                        checked={Boolean(ilsImportSelected[row.rowId])}
                        disabled={isLockedForSkeleton}
                        onCheckedChange={(checked) => {
                          if (isLockedForSkeleton) return;
                          const isChecked = Boolean(checked);
                          setIlsImportSelected((prev) => ({ ...prev, [row.rowId]: isChecked }));
                          if (isChecked) {
                            setPickedIlsRowId(row.rowId);
                          } else if (pickedIlsRowId === row.rowId) {
                            setPickedIlsRowId('');
                          }
                        }}
                      />
                    </td>
                    <td className="sticky left-[52px] z-20 bg-white px-1 py-2 align-top border-r w-[100px] min-w-[100px] max-w-[100px]">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 w-full px-1 text-[10px]"
                        disabled={isLockedForSkeleton}
                        onClick={() => {
                          setPickedIlsRowId(row.rowId);
                          populateMemberDataFromIlsRow(row);
                        }}
                      >
                        Parse Row
                      </Button>
                    </td>
                    <td className="sticky left-[152px] z-20 bg-white px-1 py-2 align-top border-r w-[88px] min-w-[88px] max-w-[88px]">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-full px-1 text-[10px] text-amber-800 hover:bg-amber-50"
                        disabled={isExcludingFromCreateApp}
                        title="Hide from Create Application only. Stays on consolidator master list."
                        onClick={() => void excludeRowsFromCreateApp([row])}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                    <td className="sticky left-[240px] z-20 bg-white px-2 py-2 align-top whitespace-nowrap border-r w-[128px] min-w-[128px] max-w-[128px] overflow-hidden text-ellipsis" title={row.memberFirstName || undefined}>
                      {row.memberFirstName || '—'}
                    </td>
                    <td className="sticky left-[368px] z-20 bg-white px-2 py-2 align-top whitespace-nowrap border-r w-[140px] min-w-[140px] max-w-[140px] overflow-hidden text-ellipsis" title={row.memberLastName || undefined}>
                      {row.memberLastName || '—'}
                    </td>
                    <td className="sticky left-[508px] z-20 bg-white px-2 py-2 align-top border-r w-[180px] min-w-[180px] max-w-[180px] whitespace-normal break-words shadow-[2px_0_4px_-2px_rgba(0,0,0,0.12)]" title={row.memberCity || undefined}>
                      {row.memberCity || '—'}
                    </td>
                    <td className="hidden md:table-cell px-2 py-2 align-top whitespace-nowrap">
                      {row.memberCounty ||
                        (row.memberCity || row.memberZip ? (
                          <span className="font-medium text-amber-800">Cannot determine</span>
                        ) : (
                          '—'
                        ))}
                    </td>
                    <td className="px-2 py-2 align-top whitespace-nowrap">{row.memberMrn || '—'}</td>
                    <td className="px-2 py-2 align-top whitespace-nowrap">{row.memberMediCalNum || '—'}</td>
                    <td className="px-2 py-2 align-top whitespace-nowrap">
                      {isCreated ? (
                        <span className="text-emerald-700 font-medium">Created</span>
                      ) : row.needsAuthorizedUpdate ? (
                        <span className="font-medium text-amber-800">
                          In Caspio · Pending → Authorized
                        </span>
                      ) : row.caspioExists ? (
                        <span className="text-amber-700 font-medium">
                          In Caspio
                          {row.caspioCalAIMStatus ? ` (${row.caspioCalAIMStatus})` : ''}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Not created</span>
                      )}
                    </td>
                    <td className="px-2 py-2 align-top min-w-[220px]">
                      {row.caspioExists ? (
                        <span
                          className={
                            row.needsAuthorizedUpdate
                              ? 'font-medium text-amber-800 whitespace-normal'
                              : 'text-amber-700 whitespace-nowrap'
                          }
                        >
                          Yes
                          {row.caspioMatchedBy
                            ? ` (${
                                row.caspioMatchedBy === 'mrn'
                                  ? 'MRN'
                                  : row.caspioMatchedBy === 'medi_cal'
                                    ? 'MEDI-CAL/CIN'
                                    : 'NAME'
                              })`
                            : ''}
                          {row.caspioMatchedClientId2
                            ? ` - Client_ID2 ${row.caspioMatchedClientId2}`
                            : ''}
                          {row.caspioCalAIMStatus ? ` · ${row.caspioCalAIMStatus}` : ''}
                          {row.needsAuthorizedUpdate
                            ? ' · needs auth update'
                            : ''}
                        </span>
                      ) : (
                        <span className="text-emerald-700">No</span>
                      )}
                    </td>
                    <td className="px-2 py-2 align-top min-w-[220px]">
                      {row.mifMasterExists ? (
                        <span className="text-indigo-700 whitespace-nowrap">
                          Yes
                          {row.mifMasterMatchedBy
                            ? ` (${
                                row.mifMasterMatchedBy === 'mrn'
                                  ? 'MRN'
                                  : row.mifMasterMatchedBy === 'medi_cal'
                                    ? 'MEDI-CAL/CIN'
                                    : row.mifMasterMatchedBy === 'client_id2'
                                      ? 'Client_ID2'
                                      : 'NAME'
                              })`
                            : ''}
                          {row.mifMasterMatchLabel ? ` - ${row.mifMasterMatchLabel}` : ''}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">No</span>
                      )}
                    </td>
                    <td className="px-2 py-2 align-top min-w-[220px]">
                      {(() => {
                        const decisionLog = ilsDecisionLogByRowId[row.rowId];
                        return (
                          <div className="space-y-1">
                            <div className="flex flex-wrap gap-1">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[11px] border-red-300 bg-red-50 text-red-900 hover:bg-red-100"
                                disabled={sendingIlsDecisionRowId === row.rowId}
                                onClick={() => openIlsServiceDecisionPreview(row, 'decline')}
                              >
                                {sendingIlsDecisionRowId === row.rowId ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                                Decline
                              </Button>
                            </div>
                            {decisionLog ? (
                              <div className="text-[11px] text-muted-foreground">
                                {decisionLog.choice === 'accept' ? 'Accepted' : 'Declined'} ·{' '}
                                {decisionLog.sentAtIso ? new Date(decisionLog.sentAtIso).toLocaleString() : 'Logged'} · {decisionLog.sentBy || 'Staff'}
                              </div>
                            ) : (
                              <div className="text-[11px] text-muted-foreground">No decision sent yet</div>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                        </>
                      );
                    })()}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {pendingIlsDecisionDraft ? (
          <div className="mt-3 rounded-md border bg-slate-50 p-3 text-xs space-y-2">
            <div className="font-medium">
              Verification Email Preview ({pendingIlsDecisionDraft.choice === 'accept' ? 'Accept' : 'Decline'})
            </div>
            <div>
              <span className="font-medium">To:</span> {pendingIlsDecisionDraft.recipients.join(', ')}
            </div>
            <div className="space-y-1">
              <Label htmlFor="ilsDecisionSubject" className="text-xs font-medium">
                Subject (editable)
              </Label>
              <Input
                id="ilsDecisionSubject"
                value={pendingIlsDecisionDraft.subject}
                onChange={(event) =>
                  setPendingIlsDecisionDraft((prev) =>
                    prev ? { ...prev, subject: event.target.value } : prev
                  )
                }
                className="bg-white text-sm"
                disabled={sendingIlsDecisionRowId === pendingIlsDecisionDraft.rowId}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ilsDecisionBody" className="text-xs font-medium">
                Email message (editable)
              </Label>
              <Textarea
                id="ilsDecisionBody"
                value={pendingIlsDecisionDraft.emailBodyText}
                onChange={(event) =>
                  setPendingIlsDecisionDraft((prev) =>
                    prev ? { ...prev, emailBodyText: event.target.value } : prev
                  )
                }
                className="min-h-[220px] bg-white font-mono text-[13px] leading-6"
                disabled={sendingIlsDecisionRowId === pendingIlsDecisionDraft.rowId}
              />
              <div className="text-[11px] text-muted-foreground">
                Edit freely before sending. Member details and signature are included in the default text.
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => void sendIlsServiceDecision(pendingIlsDecisionDraft)}
                disabled={
                  sendingIlsDecisionRowId === pendingIlsDecisionDraft.rowId ||
                  !String(pendingIlsDecisionDraft.subject || '').trim() ||
                  !String(pendingIlsDecisionDraft.emailBodyText || '').trim()
                }
              >
                {sendingIlsDecisionRowId === pendingIlsDecisionDraft.rowId ? (
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                ) : null}
                Confirm & Send to ILS + Jason
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setPendingIlsDecisionDraft(null)}
                disabled={sendingIlsDecisionRowId === pendingIlsDecisionDraft.rowId}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
    </div>
  );
}
