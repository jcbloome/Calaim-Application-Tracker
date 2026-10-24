'use client';

import { CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Eye, Send, Loader2, Undo2, RefreshCw, FileText, Mail } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { type NorthernDeclineBatchRecord, type DeclinedMemberRecord } from './consolidator-types';
import { type Dispatch, type SetStateAction } from 'react';

export interface DeclinedMembersPanelProps {
  northernDeclineBatches: NorthernDeclineBatchRecord[];
  setViewedNorthernBatch: Dispatch<SetStateAction<NorthernDeclineBatchRecord | null>>;
  isSendingDeclines: boolean;
  isCheckingDeclineCaspio: boolean;
  openResendNorthernBatchComposer: (batch: NorthernDeclineBatchRecord) => void;
  isUndeclining: boolean;
  undeclineNorthernBatchMembers: (batch: NorthernDeclineBatchRecord) => Promise<boolean>;
  declinedMembers: DeclinedMemberRecord[];
  declinedCaspioDisplayById: Record<string, { inCaspio: boolean | null; label: string; }>;
  isRefreshingDeclinedCaspio: boolean;
  refreshDeclinedCaspioStatus: (options?: { silent?: boolean | undefined; } | undefined) => Promise<void>;
  isDownloadingServiceDeliveryPdf: boolean;
  selectedDeclinedMemberIds: Record<string, boolean>;
  downloadServiceDeliveryPdfForDeclinedMembers: (targets: DeclinedMemberRecord[]) => Promise<void>;
  openResendSelectedDeclinedMembersComposer: () => void;
  undeclineSelectedDeclinedMembersFromList: () => Promise<void>;
  setSelectedDeclinedMemberIds: Dispatch<SetStateAction<Record<string, boolean>>>;
  openDeclinedEmailViewer: (row: DeclinedMemberRecord) => void;
  openResendDeclinedMemberComposer: (row: DeclinedMemberRecord) => void;
  undeclineDeclinedRecords: (records: DeclinedMemberRecord[], options?: { label?: string | undefined; } | undefined) => Promise<boolean>;
}

export function DeclinedMembersPanel({
  northernDeclineBatches,
  setViewedNorthernBatch,
  isSendingDeclines,
  isCheckingDeclineCaspio,
  openResendNorthernBatchComposer,
  isUndeclining,
  undeclineNorthernBatchMembers,
  declinedMembers,
  declinedCaspioDisplayById,
  isRefreshingDeclinedCaspio,
  refreshDeclinedCaspioStatus,
  isDownloadingServiceDeliveryPdf,
  selectedDeclinedMemberIds,
  downloadServiceDeliveryPdfForDeclinedMembers,
  openResendSelectedDeclinedMembersComposer,
  undeclineSelectedDeclinedMembersFromList,
  setSelectedDeclinedMemberIds,
  openDeclinedEmailViewer,
  openResendDeclinedMemberComposer,
  undeclineDeclinedRecords,
}: DeclinedMembersPanelProps) {
  return (
    <CardContent className="space-y-4">
      <div className="space-y-2">
        <div className="text-sm font-medium">Bulk send log ({northernDeclineBatches.length})</div>
        <div className="max-h-[280px] overflow-auto rounded border">
          <table className="w-max min-w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-left">
              <tr>
                <th className="whitespace-nowrap px-3 py-2">Sent</th>
                <th className="whitespace-nowrap px-3 py-2">Members</th>
                <th className="whitespace-nowrap px-3 py-2">Subject</th>
                <th className="whitespace-nowrap px-3 py-2">By</th>
                <th className="whitespace-nowrap px-3 py-2">Email</th>
                <th className="whitespace-nowrap px-3 py-2">Restore</th>
              </tr>
            </thead>
            <tbody>
              {northernDeclineBatches.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                    No bulk northern denial emails logged yet.
                  </td>
                </tr>
              ) : (
                northernDeclineBatches.map((batch) => (
                  <tr key={batch.id} className="border-t">
                    <td className="whitespace-nowrap px-3 py-2">
                      {batch.sentAtIso ? new Date(batch.sentAtIso).toLocaleString() : '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-center">{batch.memberCount}</td>
                    <td
                      className="max-w-[28rem] truncate px-3 py-2 text-muted-foreground"
                      title={batch.subject || undefined}
                    >
                      {batch.subject || '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {batch.actedByEmail || '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <div className="flex flex-nowrap gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 shrink-0 px-2"
                          onClick={() => setViewedNorthernBatch(batch)}
                        >
                          <Eye className="mr-1 h-3.5 w-3.5" />
                          View Email
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 shrink-0 px-2"
                          disabled={isSendingDeclines || isCheckingDeclineCaspio}
                          onClick={() => openResendNorthernBatchComposer(batch)}
                        >
                          <Send className="mr-1 h-3.5 w-3.5" />
                          Edit &amp; Resend
                        </Button>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 shrink-0 px-2 text-sky-800"
                        disabled={isUndeclining || !(batch.members || []).length}
                        title="Put these members back on Northern / Create Application lists"
                        onClick={() => void undeclineNorthernBatchMembers(batch)}
                      >
                        {isUndeclining ? (
                          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Undo2 className="mr-1 h-3.5 w-3.5" />
                        )}
                        Undecline all
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-medium">
            Declined members ({declinedMembers.length})
            {Object.values(declinedCaspioDisplayById).filter((s) => s.inCaspio === true).length
              ? ` · ${Object.values(declinedCaspioDisplayById).filter((s) => s.inCaspio === true).length} already in Caspio`
              : ''}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              disabled={isRefreshingDeclinedCaspio || !declinedMembers.length}
              onClick={() => void refreshDeclinedCaspioStatus()}
            >
              {isRefreshingDeclinedCaspio ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-3.5 w-3.5" />
              )}
              {isRefreshingDeclinedCaspio ? 'Checking Caspio…' : 'Check Caspio'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              disabled={
                isDownloadingServiceDeliveryPdf ||
                !Object.values(selectedDeclinedMemberIds).some(Boolean)
              }
              title="Download line-by-line Service Request Form PDF(s) for selected declined members"
              onClick={() =>
                void downloadServiceDeliveryPdfForDeclinedMembers(
                  declinedMembers.filter((row) => selectedDeclinedMemberIds[row.id])
                )
              }
            >
              {isDownloadingServiceDeliveryPdf ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileText className="mr-1 h-3.5 w-3.5" />
              )}
              Service Request Form
              {Object.values(selectedDeclinedMemberIds).filter(Boolean).length
                ? ` (${Object.values(selectedDeclinedMemberIds).filter(Boolean).length})`
                : ''}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              disabled={
                isSendingDeclines ||
                isCheckingDeclineCaspio ||
                !Object.values(selectedDeclinedMemberIds).some(Boolean)
              }
              title="Live Caspio check, then preview/edit/resend one bulk denial for selected declined members"
              onClick={() => openResendSelectedDeclinedMembersComposer()}
            >
              {isSendingDeclines || isCheckingDeclineCaspio ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Mail className="mr-1 h-3.5 w-3.5" />
              )}
              {isCheckingDeclineCaspio ? 'Checking Caspio…' : 'Bulk Email Denial'}
              {!isCheckingDeclineCaspio &&
              Object.values(selectedDeclinedMemberIds).filter(Boolean).length
                ? ` (${Object.values(selectedDeclinedMemberIds).filter(Boolean).length})`
                : ''}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-sky-800"
              disabled={
                isUndeclining ||
                !Object.values(selectedDeclinedMemberIds).some(Boolean)
              }
              onClick={() => void undeclineSelectedDeclinedMembersFromList()}
            >
              {isUndeclining ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Undo2 className="mr-1 h-3.5 w-3.5" />
              )}
              Undecline selected
              {Object.values(selectedDeclinedMemberIds).filter(Boolean).length
                ? ` (${Object.values(selectedDeclinedMemberIds).filter(Boolean).length})`
                : ''}
            </Button>
          </div>
        </div>
        <div className="max-h-[420px] overflow-auto rounded border">
          <table className="w-max min-w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-left">
              <tr>
                <th className="w-10 whitespace-nowrap px-3 py-2">
                  <Checkbox
                    checked={
                      declinedMembers.length > 0 &&
                      declinedMembers.every((row) => selectedDeclinedMemberIds[row.id])
                    }
                    onCheckedChange={(checked) => {
                      const on = checked === true;
                      const next: Record<string, boolean> = {};
                      if (on) {
                        declinedMembers.forEach((row) => {
                          next[row.id] = true;
                        });
                      }
                      setSelectedDeclinedMemberIds(next);
                    }}
                    aria-label="Select all declined members"
                  />
                </th>
                <th className="whitespace-nowrap px-3 py-2">Member</th>
                <th className="whitespace-nowrap px-3 py-2">MRN</th>
                <th className="whitespace-nowrap px-3 py-2">County</th>
                <th className="whitespace-nowrap px-3 py-2">In Caspio</th>
                <th className="whitespace-nowrap px-3 py-2">Denied</th>
                <th className="whitespace-nowrap px-3 py-2">Source</th>
                <th className="whitespace-nowrap px-3 py-2">Subject</th>
                <th className="whitespace-nowrap px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {declinedMembers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                    No declined members yet.
                  </td>
                </tr>
              ) : (
                declinedMembers.map((row) => {
                  const caspioStatus = declinedCaspioDisplayById[row.id];
                  const inCaspio = caspioStatus?.inCaspio;
                  const sourceLabel =
                    row.sourceType === 'single_auth_pdf'
                      ? 'Single auth'
                      : row.sourceType === 'mif_consolidator_bulk' || !row.sourceType
                        ? 'Northern bulk'
                        : row.sourceType === 'create_app_ils_import'
                          ? 'Create App'
                          : row.sourceType;
                  return (
                  <tr
                    key={row.id}
                    className={`border-t ${inCaspio === true ? 'bg-amber-50/70' : ''}`}
                  >
                    <td className="whitespace-nowrap px-3 py-2">
                      <Checkbox
                        checked={Boolean(selectedDeclinedMemberIds[row.id])}
                        onCheckedChange={(checked) =>
                          setSelectedDeclinedMemberIds((prev) => ({
                            ...prev,
                            [row.id]: checked === true,
                          }))
                        }
                        aria-label={`Select ${row.memberLastName}, ${row.memberFirstName}`}
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-medium">
                      {row.memberLastName}, {row.memberFirstName}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                      {row.memberMrn || '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{row.memberCounty || '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {isRefreshingDeclinedCaspio && inCaspio == null ? (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Checking…
                        </span>
                      ) : inCaspio === true ? (
                        <span
                          className="inline-flex max-w-[14rem] flex-col gap-0.5"
                          title={caspioStatus?.label || 'In Caspio'}
                        >
                          <span className="font-medium text-amber-900">Yes</span>
                          <span className="truncate text-[11px] text-amber-800/90">
                            {caspioStatus?.label || 'In Caspio'}
                          </span>
                        </span>
                      ) : inCaspio === false ? (
                        <span className="font-medium text-emerald-700">No</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {row.declinedAtIso ? new Date(row.declinedAtIso).toLocaleString() : '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {sourceLabel || '—'}
                    </td>
                    <td
                      className="max-w-[22rem] truncate px-3 py-2 text-muted-foreground"
                      title={row.emailSubject || undefined}
                    >
                      {row.emailSubject || '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <div className="flex flex-nowrap gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 shrink-0 px-2"
                          disabled={isDownloadingServiceDeliveryPdf}
                          title="Download Service Request Form PDF for this member's file"
                          onClick={() => void downloadServiceDeliveryPdfForDeclinedMembers([row])}
                        >
                          <FileText className="mr-1 h-3.5 w-3.5" />
                          PDF
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 shrink-0 px-2"
                          onClick={() => openDeclinedEmailViewer(row)}
                        >
                          <Eye className="mr-1 h-3.5 w-3.5" />
                          View Email
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 shrink-0 px-2"
                          disabled={isSendingDeclines || isCheckingDeclineCaspio}
                          onClick={() => openResendDeclinedMemberComposer(row)}
                        >
                          <Send className="mr-1 h-3.5 w-3.5" />
                          Edit &amp; Resend
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 shrink-0 px-2 text-sky-800"
                          disabled={isUndeclining}
                          title="Put back on Northern / Create Application lists"
                          onClick={() =>
                            void undeclineDeclinedRecords([row], {
                              label: `${row.memberLastName}, ${row.memberFirstName}`.trim(),
                            })
                          }
                        >
                          {isUndeclining ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Undo2 className="mr-1 h-3.5 w-3.5" />
                          )}
                          Undecline
                        </Button>
                      </div>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </CardContent>
  );
}
