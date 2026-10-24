'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { stageBlockClass, type StandaloneUpload, type StageKey } from './alft-tracker-helpers';
import { Button } from '@/components/ui/button';
import { ExternalLink, Download } from 'lucide-react';
import Link from 'next/link';

export interface EditRowSummaryProps {
  managerActionsOnly: boolean;
  editRow: StandaloneUpload | null;
  editStage: StageKey | "not_started";
  editStageLabel: string;
  editCurrentStepLabel: string;
  editCurrentStepAtLabel: string;
  isRnReviewUi: boolean;
  openLiveAlftPrintable: (opts?: { requireUnlock?: boolean | undefined; } | undefined) => Promise<void>;
  canPrintOrDownloadFromEdit: boolean;
  lastDownloadFileName: string;
  lastDownloadedAtLabel: string;
  editSaving: boolean;
  editConfirmEdits: boolean;
  requestIspDownloadConfirm: (action: "approved" | "rebuild") => void;
  editRowLive: StandaloneUpload | null;
  downloadCompletedFormFromLog: (opts?: { view?: boolean | undefined; archivedAtIso?: string | undefined; answers?: Record<string, string | string[]> | undefined; } | undefined) => Promise<void>;
}

export function EditRowSummary({
  managerActionsOnly,
  editRow,
  editStage,
  editStageLabel,
  editCurrentStepLabel,
  editCurrentStepAtLabel,
  isRnReviewUi,
  openLiveAlftPrintable,
  canPrintOrDownloadFromEdit,
  lastDownloadFileName,
  lastDownloadedAtLabel,
  editSaving,
  editConfirmEdits,
  requestIspDownloadConfirm,
  editRowLive,
  downloadCompletedFormFromLog,
}: EditRowSummaryProps) {
  return (
    <div className="rounded-md border p-3">
      {!managerActionsOnly ? (
        <>
          <div className="text-base font-semibold">{editRow?.memberName || '—'}</div>
          <div className="text-sm text-muted-foreground font-mono">{editRow?.medicalRecordNumber || '—'}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn(stageBlockClass(editStage), 'text-sm px-2 py-1')}>
              {editStageLabel}
            </Badge>
            <span className="text-sm text-muted-foreground">
              Current step: <span className="font-medium text-foreground">{editCurrentStepLabel}</span>
              {editCurrentStepAtLabel ? <span className="ml-1">({editCurrentStepAtLabel})</span> : null}
            </span>
          </div>
        </>
      ) : (
        <div className="space-y-1">
          <div className="text-sm font-medium">Full ISP / ALFT for review</div>
          <div className="text-xs text-muted-foreground">
            On-screen review only. Print and download unlock after RN review and admin final check.
          </div>
        </div>
      )}
      {editRow?.id && !isRnReviewUi ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => void openLiveAlftPrintable({ requireUnlock: false })}
            title="Open printable from your current edits (not the archived download)"
          >
            <ExternalLink className="mr-2 h-3.5 w-3.5" />
            View/Print current ALFT
          </Button>
          {!canPrintOrDownloadFromEdit ? (
            <span className="text-xs text-amber-700">
              Download stays locked until RN + admin final check. Viewing always uses your latest edits.
            </span>
          ) : null}
        </div>
      ) : null}
      {lastDownloadFileName && !isRnReviewUi ? (
        <div className="mt-3 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 space-y-2">
          <div className="text-sm font-semibold text-emerald-950">Completed form archive</div>
          <div className="text-xs text-emerald-900 break-all">{lastDownloadFileName}</div>
          {lastDownloadedAtLabel ? (
            <div className="text-[11px] font-medium text-emerald-900">
              Last archived {lastDownloadedAtLabel} · ISP Download Archive snapshot
            </div>
          ) : (
            <div className="text-[11px] text-emerald-800/90">
              Kept on ISP Download Archive after Approved and download.
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="bg-white"
              disabled={editSaving}
              onClick={() => void openLiveAlftPrintable({ requireUnlock: false })}
              title="Always opens the newly edited form, not the old archive"
            >
              View latest edited form
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={editSaving || !canPrintOrDownloadFromEdit || !editConfirmEdits}
              onClick={() => requestIspDownloadConfirm('rebuild')}
              title={
                !editConfirmEdits
                  ? 'Check confirm edits below, then download'
                  : lastDownloadedAtLabel
                    ? `Rebuilds PDF from current edits, then archives a new version (prior version from ${lastDownloadedAtLabel} stays in archive)`
                    : 'Rebuilds PDF from current edits, then archives to ISP Download Archive'
              }
            >
              <Download className="mr-2 h-3.5 w-3.5" />
              Download latest edits
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={editSaving || !String((editRowLive || editRow as any)?.alftLastDownloadLogId || '').trim()}
              onClick={() => void downloadCompletedFormFromLog({ view: true })}
              title={
                lastDownloadedAtLabel
                  ? `Opens archived PDF from ${lastDownloadedAtLabel}`
                  : 'Opens the previous archived PDF snapshot only'
              }
            >
              Open old archive PDF
              {lastDownloadedAtLabel ? ` (${lastDownloadedAtLabel})` : ''}
            </Button>
            <Button type="button" variant="link" size="sm" className="h-auto px-0" asChild>
              <Link href="/admin/tools/isp-downloads">Open ISP Download Archive</Link>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
