'use client';

import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
  ilsMifRowHasMifSourceData,
  ilsMifRowNeedsAuthorizedUpdate,
  isNorthernCounty,
  ilsMifRowPendingAuthAlreadyOnFile,
  isIlsMifCaspioPendingStatus,
  isIlsMifCreateAppCandidate,
  type IlsMifMasterRow,
} from '@/lib/ils-mif-parse';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, Send, Download, ExternalLink, Eye } from 'lucide-react';
import { MIF_SERVICE_DELIVERY_FORM_NAME } from '@/lib/mif-service-delivery-form';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import { type Dispatch, type SetStateAction, type JSX } from 'react';

export interface MasterRowsTableProps {
  allVisibleSelected: boolean;
  someVisibleSelected: boolean;
  visibleRows: IlsMifMasterRow[];
  selectAllVisibleMasterRows: () => void;
  deselectVisibleMasterRows: () => void;
  pagedVisibleRows: IlsMifMasterRow[];
  forDisplay: (row: IlsMifMasterRow) => IlsMifMasterRow;
  masterPage: number;
  effectiveMasterPageSize: number;
  mifDateLabelForRow: (row: Pick<IlsMifMasterRow, "sourceFileName" | "mifOriginalColumns" | "mifDateKey" | "mifDateLabel" | "dateReceivedRequestForAuthorization" | "dateOfReferralAuthorizationDecision">) => string;
  selected: Record<string, boolean>;
  setSelected: Dispatch<SetStateAction<Record<string, boolean>>>;
  statusBadge: (row: IlsMifMasterRow) => JSX.Element;
  isMatching: boolean;
  isSaving: boolean;
  isParsing: boolean;
  refreshingCaspioRowId: string;
  refreshMemberRowFromCaspio: (targetRow: IlsMifMasterRow) => Promise<void>;
  canPushAuthToCaspio: (row: IlsMifMasterRow) => boolean;
  pushingAuthRowId: string;
  pushAuthFieldsToCaspio: (row: IlsMifMasterRow) => Promise<void>;
  hasCheckedCaspio: boolean;
  isDownloadingServiceDeliveryPdf: boolean;
  isServiceDeliveryEligibleRow: (row: IlsMifMasterRow) => boolean;
  downloadServiceDeliveryPdfForMembers: (targetRows: IlsMifMasterRow[]) => Promise<void>;
  patchMasterRowAuthFields: (rowId: string, patch: Partial<Pick<IlsMifMasterRow, "authorizationNumberT2038" | "sourceFileName" | "authorizationEndT2038" | "authorizationStartT2038" | "markKaiserInactive">>) => void;
  declinedKeys: Set<string>;
  memberKey: (row: Pick<IlsMifMasterRow, "memberMrn" | "memberMediCalNum" | "memberFirstName" | "memberLastName">) => string;
  sendOneMemberToCreateApplication: (row: IlsMifMasterRow) => void;
  setAuthDetailRow: Dispatch<SetStateAction<IlsMifMasterRow | null>>;
}

export function MasterRowsTable({
  allVisibleSelected,
  someVisibleSelected,
  visibleRows,
  selectAllVisibleMasterRows,
  deselectVisibleMasterRows,
  pagedVisibleRows,
  forDisplay,
  masterPage,
  effectiveMasterPageSize,
  mifDateLabelForRow,
  selected,
  setSelected,
  statusBadge,
  isMatching,
  isSaving,
  isParsing,
  refreshingCaspioRowId,
  refreshMemberRowFromCaspio,
  canPushAuthToCaspio,
  pushingAuthRowId,
  pushAuthFieldsToCaspio,
  hasCheckedCaspio,
  isDownloadingServiceDeliveryPdf,
  isServiceDeliveryEligibleRow,
  downloadServiceDeliveryPdfForMembers,
  patchMasterRowAuthFields,
  declinedKeys,
  memberKey,
  sendOneMemberToCreateApplication,
  setAuthDetailRow,
}: MasterRowsTableProps) {
  return (
    <div className="max-h-[560px] overflow-auto rounded border">
      <TooltipProvider delayDuration={150} skipDelayDuration={0}>
      <table className="w-max min-w-full table-auto text-sm">
        <thead className="sticky top-0 z-10 bg-slate-50 text-left">
          <tr>
            <th className="px-3 py-2 whitespace-nowrap">
              <label className="inline-flex items-center gap-2 cursor-pointer whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someVisibleSelected;
                  }}
                  disabled={!visibleRows.length}
                  onChange={(event) => {
                    if (event.target.checked) selectAllVisibleMasterRows();
                    else deselectVisibleMasterRows();
                  }}
                  aria-label="Select all shown members"
                />
                <span>Select</span>
              </label>
            </th>
            <th className="px-3 py-2 whitespace-nowrap">Status</th>
            <th className="px-3 py-2 whitespace-nowrap min-w-[16rem]">
              Member
              <span className="ml-1 font-normal text-[10px] text-muted-foreground">
                (hover preview · download form)
              </span>
            </th>
            <th className="px-3 py-2 whitespace-nowrap min-w-[10rem]">MRN / CIN</th>
            <th className="px-3 py-2 whitespace-nowrap min-w-[8rem]">County</th>
            <th className="px-3 py-2 whitespace-nowrap min-w-[7rem]">CalAIM Status</th>
            <th className="px-3 py-2 whitespace-nowrap min-w-[9rem]">Kaiser Status</th>
            <th className="px-3 py-2 whitespace-nowrap min-w-[9rem]">Auth #</th>
            <th className="px-3 py-2 whitespace-nowrap min-w-[8rem]">Auth start</th>
            <th className="px-3 py-2 whitespace-nowrap min-w-[8rem]">Auth end</th>
            <th className="px-3 py-2 whitespace-nowrap min-w-[8rem]">MIF date</th>
            <th className="px-3 py-2 whitespace-nowrap min-w-[20rem]">Source file</th>
            <th className="px-3 py-2 whitespace-nowrap">Service Delivery</th>
            <th className="px-3 py-2 whitespace-nowrap">Create App</th>
            <th className="px-3 py-2 whitespace-nowrap">MIF → Caspio</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.length === 0 ? (
            <tr>
              <td colSpan={15} className="px-3 py-8 text-center text-muted-foreground">
                Upload MIF spreadsheets to build the master list.
              </td>
            </tr>
          ) : (
            pagedVisibleRows.map((sourceRow, rowIndex) => {
              const row = forDisplay(sourceRow);
              const rowKey = `${row.rowId}-${masterPage * effectiveMasterPageSize + rowIndex}`;
              const mifDateLabel = mifDateLabelForRow(row);
              const hasMifSource = ilsMifRowHasMifSourceData(row);
              return (
                <tr key={rowKey} className="border-t align-top">
                  <td className="px-3 py-2 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={Boolean(selected[row.rowId])}
                      onChange={(event) =>
                        setSelected((prev) => ({ ...prev, [row.rowId]: event.target.checked }))
                      }
                      aria-label={`Select ${row.memberLastName}, ${row.memberFirstName}`}
                    />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="space-y-1.5">
                      {statusBadge(row)}
                      <div className="flex flex-col items-stretch gap-1 max-w-[12rem]">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 border-sky-400 bg-sky-50 px-2 text-sky-950 hover:bg-sky-100 hover:text-sky-950"
                          disabled={
                            isMatching ||
                            isSaving ||
                            isParsing ||
                            refreshingCaspioRowId === row.rowId
                          }
                          title="Re-check this member in Caspio (refresh status / match)"
                          onClick={() => void refreshMemberRowFromCaspio(row)}
                        >
                          {refreshingCaspioRowId === row.rowId ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="mr-1 h-3.5 w-3.5" />
                          )}
                          Refresh Caspio
                        </Button>
                        {canPushAuthToCaspio(row) ? (
                          <Button
                            type="button"
                            size="sm"
                            className="h-7 bg-fuchsia-700 px-2 text-white hover:bg-fuchsia-800 hover:text-white disabled:opacity-60"
                            disabled={Boolean(pushingAuthRowId) || isSaving || isMatching}
                            title="Push MIF Authorization Number and Start/End dates (T2038) to Caspio — status is not changed"
                            onClick={() => void pushAuthFieldsToCaspio(row)}
                          >
                            {pushingAuthRowId === row.rowId ? (
                              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Send className="mr-1 h-3.5 w-3.5" />
                            )}
                            Update Caspio
                          </Button>
                        ) : null}
                        {hasCheckedCaspio && ilsMifRowNeedsAuthorizedUpdate(row) ? (
                          <span
                            className="inline-flex h-7 items-center rounded-md border border-violet-200 bg-violet-50 px-2 text-xs font-medium text-violet-900"
                            title="Set Authorized manually in Caspio, then click Refresh Caspio"
                          >
                            Authorize in Caspio
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 font-medium whitespace-nowrap">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="cursor-help text-left font-medium underline decoration-dotted decoration-slate-400 underline-offset-2 hover:text-sky-900"
                            title="Hover for Service Delivery Form preview — use Download form to save PDF"
                          >
                            {row.memberLastName}, {row.memberFirstName}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent
                          side="right"
                          align="start"
                          className="z-[200] max-w-sm border border-slate-200 bg-white p-3 text-slate-900 shadow-lg"
                        >
                          <div className="space-y-1.5 text-xs">
                            <div className="font-semibold text-sm text-slate-900">
                              {MIF_SERVICE_DELIVERY_FORM_NAME}
                            </div>
                            <div className="rounded border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] text-sky-950">
                              Use <span className="font-semibold">Download form</span> on this row (or select
                              rows + toolbar) to generate and save the PDF from MIF data.
                            </div>
                            {!hasMifSource ? (
                              <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-950">
                                This row is on the consolidator master and matched Caspio by MRN/CIN — it was
                                not imported from Caspio. MIF file/auth/service-delivery fields are missing on
                                the saved row. Re-upload the MIF that includes this member, then Re-check Caspio.
                              </div>
                            ) : null}
                            <div>
                              <span className="text-muted-foreground">Referring org:</span>{' '}
                              {row.referringOrganization || '—'}
                            </div>
                            <div>
                              <span className="text-muted-foreground">Referring party:</span>{' '}
                              {row.careManagerName || '—'}
                            </div>
                            <div>
                              <span className="text-muted-foreground">Referring phone:</span>{' '}
                              {row.careManagerPhone || '—'}
                            </div>
                            <div>
                              <span className="text-muted-foreground">Referring email:</span>{' '}
                              {row.careManagerEmail || '—'}
                            </div>
                            <div>
                              <span className="text-muted-foreground">Member phone:</span>{' '}
                              {row.memberPhone || row.primaryPhoneNumber || '—'}
                            </div>
                            <div>
                              <span className="text-muted-foreground">DOB:</span>{' '}
                              {row.memberDob || '—'}
                            </div>
                            <div>
                              <span className="text-muted-foreground">Address:</span>{' '}
                              {[
                                row.memberResidentialAddress || row.memberAddress,
                                row.memberResidentialCity || row.memberCity,
                                row.memberState,
                                row.memberResidentialZip || row.memberZip,
                              ]
                                .filter(Boolean)
                                .join(', ') || '—'}
                            </div>
                            <div>
                              <span className="text-muted-foreground">Emergency contact:</span>{' '}
                              {[row.emergencyContactName, row.emergencyContactRelationship]
                                .filter(Boolean)
                                .join(' · ') || '—'}
                              {row.emergencyContactPhone
                                ? ` · ${row.emergencyContactPhone}`
                                : ''}
                            </div>
                            <div>
                              <span className="text-muted-foreground">Auth #:</span>{' '}
                              {row.authorizationNumberT2038 || '—'}
                            </div>
                            <div>
                              <span className="text-muted-foreground">Auth dates:</span>{' '}
                              {row.authorizationStartT2038 || '—'} –{' '}
                              {row.authorizationEndT2038 || '—'}
                            </div>
                            <div>
                              <span className="text-muted-foreground">MIF date:</span>{' '}
                              {mifDateLabel || '—'}
                            </div>
                            <div className="break-all">
                              <span className="text-muted-foreground">Source file:</span>{' '}
                              {row.sourceFileName || '—'}
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    <div className="mt-0.5 text-[11px] font-normal text-slate-700 whitespace-normal">
                      <span
                        className={
                          row.authorizationNumberT2038 ? 'text-slate-800' : 'text-amber-800 font-medium'
                        }
                      >
                        Auth # {row.authorizationNumberT2038 || 'missing'}
                      </span>
                      <span className="mx-1 text-slate-400">·</span>
                      <span
                        className={
                          row.authorizationStartT2038 && row.authorizationEndT2038
                            ? 'text-slate-800'
                            : 'text-amber-800 font-medium'
                        }
                      >
                        {row.authorizationStartT2038 || '—'} – {row.authorizationEndT2038 || '—'}
                      </span>
                    </div>
                    <div
                      className={`text-[11px] font-normal whitespace-normal ${
                        mifDateLabel ? 'text-sky-900 font-medium' : 'text-amber-800'
                      }`}
                    >
                      MIF date: {mifDateLabel || '—'}
                      {row.sourceFileName ? (
                        <span className="font-normal text-slate-500"> · {row.sourceFileName}</span>
                      ) : null}
                    </div>
                    {hasMifSource ? (
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <Badge className="bg-sky-100 text-sky-950 hover:bg-sky-100 text-[10px] px-1.5 py-0">
                          MIF on file
                        </Badge>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-6 px-1.5 text-[10px] text-sky-950"
                          disabled={
                            isDownloadingServiceDeliveryPdf ||
                            !isServiceDeliveryEligibleRow(sourceRow)
                          }
                          title="Generate & download Service Delivery Form PDF from this member’s MIF"
                          onClick={() => void downloadServiceDeliveryPdfForMembers([sourceRow])}
                        >
                          {isDownloadingServiceDeliveryPdf ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : (
                            <Download className="mr-1 h-3 w-3" />
                          )}
                          Download form
                        </Button>
                      </div>
                    ) : (
                      <div className="mt-0.5 text-[11px] font-normal text-amber-800">
                        Master-list identity matched Caspio
                        {row.caspioMatchedBy ? ` by ${String(row.caspioMatchedBy).replace('_', ' ')}` : ''}
                        {row.caspioMatchedClientId2
                          ? ` · Client_ID2 ${row.caspioMatchedClientId2}`
                          : ''}
                        {' — '}MIF file/auth not stored on this row
                      </div>
                    )}
                    {isNorthernCounty(row.memberCounty) ? (
                      <div className="text-[11px] font-normal text-indigo-700">Northern county</div>
                    ) : null}
                    {hasCheckedCaspio && ilsMifRowNeedsAuthorizedUpdate(row) ? (
                      <div className="text-[11px] font-normal text-violet-800">
                        Pending with newer MIF auth end
                        {row.caspioAuthorizationEndT2038
                          ? ` (Caspio ends ${row.caspioAuthorizationEndT2038}`
                          : ' (no Caspio auth end'}
                        {row.authorizationEndT2038
                          ? `; MIF ends ${row.authorizationEndT2038})`
                          : ')'}{' '}
                        — update CalAIM_Status to Authorized
                      </div>
                    ) : hasCheckedCaspio && ilsMifRowPendingAuthAlreadyOnFile(row) ? (
                      <div className="text-[11px] font-normal text-slate-700">
                        Caspio CalAIM_Status is still Pending, but MIF auth end does not extend past Caspio
                        {row.caspioAuthorizationEndT2038
                          ? ` (Caspio ends ${row.caspioAuthorizationEndT2038}`
                          : ''}
                        {row.authorizationEndT2038 && row.caspioAuthorizationEndT2038
                          ? `; MIF ends ${row.authorizationEndT2038})`
                          : row.caspioAuthorizationEndT2038
                            ? ')'
                            : ''}
                        . Not queued under Caspio updates needed — if this auth is approved, set CalAIM_Status
                        to Authorized in Caspio, then Refresh Caspio. A brand-new auth needs a MIF with a later
                        end date to queue Pending→Authorized.
                      </div>
                    ) : null}
                    {hasCheckedCaspio && row.caspioOtherPlanExists ? (
                      <div className="mt-0.5 text-[11px] font-normal text-amber-900">
                        In Caspio under {row.caspioOtherPlanMco || 'another health plan'} — not
                        Kaiser intake
                        {row.markKaiserInactive ? ' · Kaiser Inactive marked' : ''}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div>MRN: {row.memberMrn || '—'}</div>
                    <div>CIN: {row.memberMediCalNum || '—'}</div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{row.memberCounty || '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs">
                    {!hasCheckedCaspio ? (
                      <span className="text-muted-foreground">—</span>
                    ) : row.caspioExists ? (
                      <span
                        className={
                          isIlsMifCaspioPendingStatus(row.caspioCalAIMStatus)
                            ? 'font-medium text-violet-800'
                            : ''
                        }
                      >
                        {row.caspioCalAIMStatus || '—'}
                      </span>
                    ) : row.caspioOtherPlanExists ? (
                      <div className="space-y-0.5">
                        <span className="font-medium text-amber-900">
                          In Caspio · {row.caspioOtherPlanMco || 'other plan'}
                        </span>
                        {row.caspioOtherPlanCalAimStatus ? (
                          <div className="text-[11px] text-amber-800">
                            CalAIM: {row.caspioOtherPlanCalAimStatus}
                          </div>
                        ) : null}
                        {row.caspioOtherPlanClientId2 ? (
                          <div className="text-[11px] text-muted-foreground font-mono">
                            {row.caspioOtherPlanClientId2}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="space-y-0.5">
                        <span className="text-emerald-800">Not in Caspio</span>
                        {String(row.skeletonApplicationId || '').trim() ? (
                          <div>
                            <Badge className="bg-sky-100 text-sky-950 hover:bg-sky-100 text-[10px] px-1.5 py-0">
                              Skeleton on file
                            </Badge>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs">
                    <div className="space-y-1.5">
                      {hasCheckedCaspio && row.caspioExists ? (
                        <div>{row.caspioKaiserStatus || '—'}</div>
                      ) : row.markKaiserInactive ? (
                        <Badge className="bg-slate-200 text-slate-900 hover:bg-slate-200 text-[10px] px-1.5 py-0">
                          Inactive (marked)
                        </Badge>
                      ) : (
                        <div className="text-muted-foreground">—</div>
                      )}
                      <label className="flex items-center gap-1.5 text-[11px] text-slate-700 cursor-pointer">
                        <Checkbox
                          checked={Boolean(row.markKaiserInactive)}
                          onCheckedChange={(v) =>
                            patchMasterRowAuthFields(row.rowId, {
                              markKaiserInactive: Boolean(v),
                            })
                          }
                          aria-label={`Mark Kaiser_Status Inactive for ${row.memberLastName}, ${row.memberFirstName}`}
                        />
                        <span>Kaiser Inactive</span>
                      </label>
                    </div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Input
                      value={row.authorizationNumberT2038 || ''}
                      onChange={(e) =>
                        patchMasterRowAuthFields(row.rowId, {
                          authorizationNumberT2038: e.target.value,
                        })
                      }
                      placeholder="Auth #"
                      className={`h-8 min-w-[9rem] font-mono text-xs ${
                        row.authorizationNumberT2038 ? '' : 'border-amber-400 bg-amber-50'
                      }`}
                    />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Input
                      value={row.authorizationStartT2038 || ''}
                      onChange={(e) =>
                        patchMasterRowAuthFields(row.rowId, {
                          authorizationStartT2038: e.target.value,
                        })
                      }
                      placeholder="MM/DD/YYYY"
                      className={`h-8 min-w-[8rem] font-mono text-xs ${
                        row.authorizationStartT2038 ? '' : 'border-amber-400 bg-amber-50'
                      }`}
                    />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Input
                      value={row.authorizationEndT2038 || ''}
                      onChange={(e) =>
                        patchMasterRowAuthFields(row.rowId, {
                          authorizationEndT2038: e.target.value,
                        })
                      }
                      placeholder="MM/DD/YYYY"
                      className={`h-8 min-w-[8rem] font-mono text-xs ${
                        row.authorizationEndT2038 ? '' : 'border-amber-400 bg-amber-50'
                      }`}
                    />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs font-medium text-sky-950">
                    {mifDateLabel || '—'}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">
                    {row.sourceFileName || '—'}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2"
                      disabled={
                        isDownloadingServiceDeliveryPdf ||
                        !isServiceDeliveryEligibleRow(sourceRow)
                      }
                      title={
                        isServiceDeliveryEligibleRow(sourceRow)
                          ? 'Generate & download Service Delivery Form PDF from this member’s MIF'
                          : 'Incomplete or duplicate batch rows cannot generate a PDF'
                      }
                      onClick={() => void downloadServiceDeliveryPdfForMembers([sourceRow])}
                    >
                      <Download className="mr-1 h-3.5 w-3.5" />
                      Download
                    </Button>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {String(row.skeletonApplicationId || '').trim() &&
                    !row.caspioExists &&
                    row.mergeStatus !== 'already_in_caspio' ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-sky-900"
                        asChild
                      >
                        <Link
                          href={`/admin/applications/${encodeURIComponent(String(row.skeletonApplicationId).trim())}`}
                          title={`Open skeleton application ${String(row.skeletonApplicationId).trim()}`}
                        >
                          <ExternalLink className="mr-1 h-3.5 w-3.5" />
                          Open skeleton
                        </Link>
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-emerald-800"
                        disabled={
                          !hasCheckedCaspio ||
                          isSaving ||
                          isParsing ||
                          isMatching ||
                          !isIlsMifCreateAppCandidate(row, declinedKeys.has(memberKey(row)))
                        }
                        title={
                          isIlsMifCreateAppCandidate(row, declinedKeys.has(memberKey(row)))
                            ? 'Open Create Application and parse this member into the form'
                            : 'Only Not in Caspio members without a skeleton can be sent (incomplete / missing CIN is OK)'
                        }
                        onClick={() => sendOneMemberToCreateApplication(row)}
                      >
                        <ExternalLink className="mr-1 h-3.5 w-3.5" />
                        Create App
                      </Button>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="flex flex-nowrap items-center gap-1.5">
                      {ilsMifRowNeedsAuthorizedUpdate(row) ? (
                        <span
                          className="inline-flex h-7 shrink-0 items-center rounded-md border border-violet-200 bg-violet-50 px-2 text-xs font-medium text-violet-900"
                          title="Set Authorized manually in Caspio, then refresh Caspio for this member"
                        >
                          Authorize in Caspio
                        </span>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 shrink-0 px-2"
                        disabled={
                          isMatching ||
                          isSaving ||
                          isParsing ||
                          refreshingCaspioRowId === row.rowId
                        }
                        title="Re-match this member against Caspio after you update auth or Caspio info (keeps your edited fields)"
                        onClick={() => void refreshMemberRowFromCaspio(row)}
                      >
                        {refreshingCaspioRowId === row.rowId ? (
                          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-1 h-3.5 w-3.5" />
                        )}
                        Caspio
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 shrink-0 px-2"
                        onClick={() => setAuthDetailRow(row)}
                      >
                        <Eye className="mr-1 h-3.5 w-3.5" />
                        Auth
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
      </TooltipProvider>
    </div>
  );
}
