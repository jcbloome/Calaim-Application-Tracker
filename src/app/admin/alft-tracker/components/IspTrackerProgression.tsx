'use client';

import { cn } from '@/lib/utils';
import { CheckCircle2, AlertTriangle, Circle } from 'lucide-react';
import {
  ispProgressSummary,
  type IspProgressState,
  type StandaloneUpload,
} from './alft-tracker-helpers';

export interface IspTrackerProgressionProps {
  managerActionsOnly: boolean;
  editIspProgress: { key: string; label: string; state: IspProgressState; }[];
  openSentToIlsDialog: () => void;
  sentToIlsStatusMeta: { sent: boolean; manual: boolean; dateLabel: string; iso: string; };
  editRowLive: StandaloneUpload | null;
  editRow: StandaloneUpload | null;
  canRunFinalReviewFromEdit: boolean;
}

export function IspTrackerProgression({
  managerActionsOnly,
  editIspProgress,
  openSentToIlsDialog,
  sentToIlsStatusMeta,
  editRowLive,
  editRow,
  canRunFinalReviewFromEdit,
}: IspTrackerProgressionProps) {
  return (
    <>
      {managerActionsOnly ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2">
          <div className="text-sm font-semibold">ISP tracker progression</div>
          <div className="flex flex-wrap items-center gap-3">
            {editIspProgress.map((step) => (
              <button
                key={step.key}
                type="button"
                className={cn(
                  'inline-flex items-center gap-1.5 rounded px-1 py-0.5 text-xs sm:text-sm',
                  step.key === 'sent_to_ils' &&
                    'cursor-pointer hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500'
                )}
                onClick={() => {
                  if (step.key === 'sent_to_ils') openSentToIlsDialog();
                }}
                title={
                  step.key === 'sent_to_ils'
                    ? 'Click to mark Sent to ILS (manual date + confirmation)'
                    : undefined
                }
              >
                {step.state === 'done' ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : step.state === 'returned' ? (
                  <AlertTriangle className="h-4 w-4 text-orange-600" />
                ) : step.state === 'current' ? (
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground" />
                )}
                <span
                  className={cn(
                    step.state === 'done' && 'text-green-800 font-medium',
                    step.state === 'returned' && 'text-orange-800 font-semibold',
                    step.state === 'current' && 'text-amber-800 font-semibold',
                    step.state === 'pending' && 'text-muted-foreground'
                  )}
                >
                  {step.label}
                  {step.state === 'returned' && step.key === 'sw_signed' ? ' (re-sign needed)' : ''}
                  {step.state === 'returned' && step.key === 'admin_review' ? ' (sent back)' : ''}
                  {step.key === 'sent_to_ils' && step.state !== 'done' ? ' (set date…)' : ''}
                  {step.key === 'sent_to_ils' && step.state === 'done' && sentToIlsStatusMeta.dateLabel
                    ? ` · ${sentToIlsStatusMeta.dateLabel}${sentToIlsStatusMeta.manual ? ' (manual)' : ''}`
                    : ''}
                </span>
              </button>
            ))}
          </div>
          <div
            className={cn(
              'text-xs',
              String((editRowLive || editRow as any)?.workflowStatus || '')
                .toLowerCase()
                .includes('returned_to_sw')
                ? 'font-medium text-orange-800'
                : 'text-muted-foreground'
            )}
          >
            {ispProgressSummary(editRowLive || editRow)}
          </div>
          {sentToIlsStatusMeta.sent && sentToIlsStatusMeta.dateLabel ? (
            <div className="rounded border border-teal-200 bg-teal-50 px-2 py-1.5 text-xs text-teal-950">
              Sent to ILS date:{' '}
              <span className="font-semibold">{sentToIlsStatusMeta.dateLabel}</span>
              {sentToIlsStatusMeta.manual ? ' · manual entry' : ' · from cover package'}
              <button
                type="button"
                className="ml-2 underline underline-offset-2"
                onClick={() => openSentToIlsDialog()}
              >
                Edit date
              </button>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              Click <span className="font-medium">Sent to ILS</span> to confirm and enter a manual send date.
            </div>
          )}
          {String((editRowLive || editRow as any)?.alftManagerReview?.rejectionReason || '').trim() ? (
            <div className="rounded border border-orange-200 bg-orange-50 px-2 py-1.5 text-xs text-orange-950">
              <span className="font-medium">Last return comments: </span>
              {String((editRowLive || editRow as any)?.alftManagerReview?.rejectionReason || '').trim()}
            </div>
          ) : null}
          {String((editRowLive || editRow as any)?.alftRnTierRecommendation?.tier || '').trim() ? (
            <div className="rounded border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-950">
              <div className="font-semibold">
                RN tier agreement / suggestion:{' '}
                <span className="text-base">
                  Tier {String((editRowLive || editRow as any)?.alftRnTierRecommendation?.tier || '').trim()}
                </span>
              </div>
              <div className="mt-1 text-xs text-violet-800">
                Approve this tier at the bottom of the form (admin final review before download).
              </div>
            </div>
          ) : canRunFinalReviewFromEdit ? (
            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Waiting for RN tier agreement or suggestion (required before final approval / tier-level
              request).
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
