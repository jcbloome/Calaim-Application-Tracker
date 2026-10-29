'use client';

import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  formatIspConfirmDate,
  ISP_CONFIRM_MAX_AGE_DAYS,
  type IspLocationReadiness,
  type IspLocationSnapshot,
  type IspVisitLocationSource,
} from '@/lib/isp-visit-location';
import { type Dispatch, type SetStateAction } from 'react';
import type { useToast } from '@/hooks/use-toast';

export interface IspLocationStepProps {
  confirmedIspLocation: boolean;
  confirmedPurpose: boolean;
  visitLocationReady: boolean;
  ispRcfeSoftMismatch: boolean;
  ispLocationReadiness: IspLocationReadiness;
  needsVisitLocationChoice: boolean;
  ispLocationSnapshot: IspLocationSnapshot;
  rcfeLocationSnapshot: IspLocationSnapshot;
  ispLocationUpdating: boolean;
  isLoadingPreview: boolean;
  acceptRcfeAsDefaultIspLocation: () => Promise<void>;
  refreshIspLocationFromCaspio: () => Promise<void>;
  visitLocationSource: "" | IspVisitLocationSource;
  assessmentPurpose: '' | 'initial' | 'change_condition' | 'review';
  canConfirmIspLocationStep: boolean;
  setConfirmedIspLocation: Dispatch<SetStateAction<boolean>>;
  toast: ReturnType<typeof useToast>['toast'];
}

export function IspLocationStep({
  confirmedIspLocation,
  confirmedPurpose,
  visitLocationReady,
  ispRcfeSoftMismatch,
  ispLocationReadiness,
  needsVisitLocationChoice,
  ispLocationSnapshot,
  rcfeLocationSnapshot,
  ispLocationUpdating,
  isLoadingPreview,
  acceptRcfeAsDefaultIspLocation,
  refreshIspLocationFromCaspio,
  visitLocationSource,
  assessmentPurpose,
  canConfirmIspLocationStep,
  setConfirmedIspLocation,
  toast,
}: IspLocationStepProps) {
  const confirmDateLabel = ispLocationReadiness.confirmDateRaw
    ? `${formatIspConfirmDate(ispLocationReadiness.confirmDateRaw)}${
        ispLocationReadiness.confirmAgeDays !== null
          ? ` (${ispLocationReadiness.confirmAgeDays} day${ispLocationReadiness.confirmAgeDays === 1 ? '' : 's'} ago)`
          : ''
      }`
    : 'Not set in Caspio';
  const atRcfe = visitLocationSource === 'rcfe';
  const isReauth = assessmentPurpose === 'review';
  const stepTitle =
    isReauth && atRcfe
      ? 'Confirm Current Physical Location (RCFE)'
      : isReauth
        ? 'Confirm Current Physical Location'
        : atRcfe
          ? 'Verify ISP location (RCFE)'
          : 'Verify ISP location';

  return (
    <div
      className={`rounded-md border bg-white p-3 ${
        confirmedIspLocation
          ? 'border-green-300'
          : !confirmedPurpose || !visitLocationReady
            ? 'opacity-70'
            : ispRcfeSoftMismatch
              ? 'border-amber-400'
              : ''
      }`}
    >
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <Badge variant="outline">5</Badge>
        {stepTitle}
        {confirmedIspLocation ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : null}
        {ispRcfeSoftMismatch && !confirmedIspLocation ? (
          <AlertTriangle className="h-4 w-4 text-amber-600" />
        ) : null}
      </div>

      {!confirmedPurpose || !visitLocationReady ? (
        <div className="text-[11px] text-amber-800">
          Finish step 4 (purpose
          {needsVisitLocationChoice ? ' + RCFE / Current Physical Location' : ''}) first.
        </div>
      ) : (
        <div className="space-y-2">
          {isReauth ? (
            <p className="text-[11px] text-slate-700">
              For reauthorization, ALFT <span className="font-medium">Current Physical Location</span>{' '}
              (Q3) must be confirmed. It is usually the same as the RCFE.
            </p>
          ) : null}

          <div className="rounded border bg-muted/20 px-2 py-1.5 text-[11px] text-slate-800">
            <div className="font-medium text-slate-900">
              {atRcfe ? 'Current Physical Location (from RCFE)' : 'Current Physical / ISP location'}
            </div>
            <div>
              {[
                atRcfe ? rcfeLocationSnapshot.name || ispLocationSnapshot.name : ispLocationSnapshot.name,
                atRcfe
                  ? rcfeLocationSnapshot.street || ispLocationSnapshot.street
                  : ispLocationSnapshot.street,
                atRcfe ? rcfeLocationSnapshot.city || ispLocationSnapshot.city : ispLocationSnapshot.city,
                atRcfe
                  ? rcfeLocationSnapshot.state || ispLocationSnapshot.state
                  : ispLocationSnapshot.state,
                atRcfe ? rcfeLocationSnapshot.zip || ispLocationSnapshot.zip : ispLocationSnapshot.zip,
              ]
                .filter(Boolean)
                .join(' · ') || 'No location in Caspio yet'}
            </div>
            <div
              className={
                atRcfe && !ispLocationReadiness.confirmDateFresh ? 'mt-0.5 text-amber-800' : 'mt-0.5 text-slate-600'
              }
            >
              ISP confirm date: {confirmDateLabel}
            </div>
          </div>

          {atRcfe && rcfeLocationSnapshot.name ? (
            <div className="rounded border border-sky-200 bg-sky-50/70 px-2 py-1.5 text-[11px] text-sky-950">
              <div className="font-medium">RCFE (Caspio)</div>
              <div>
                {[
                  rcfeLocationSnapshot.name,
                  rcfeLocationSnapshot.street,
                  rcfeLocationSnapshot.city,
                  rcfeLocationSnapshot.state,
                  rcfeLocationSnapshot.zip,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
          ) : null}

          {ispRcfeSoftMismatch && !confirmedIspLocation ? (
            <div className="space-y-2 rounded border border-amber-300 bg-amber-50 px-2 py-2 text-[11px] text-amber-950">
              <div className="flex items-start gap-1.5 font-medium">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {isReauth
                  ? `Current Physical Location must match the RCFE with an ISP confirm date in the last ${ISP_CONFIRM_MAX_AGE_DAYS} days before continuing`
                  : `Member is at RCFE — ISP location must match the RCFE with an ISP confirm date in the last ${ISP_CONFIRM_MAX_AGE_DAYS} days before continuing`}
              </div>
              <ul className="list-disc pl-5">
                {ispLocationReadiness.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              {rcfeLocationSnapshot.name ? (
                <div>
                  RCFE: {rcfeLocationSnapshot.name}
                  {rcfeLocationSnapshot.street ? ` · ${rcfeLocationSnapshot.street}` : ''}
                  {rcfeLocationSnapshot.city ? ` · ${rcfeLocationSnapshot.city}` : ''}
                </div>
              ) : (
                <div>Add the RCFE in Caspio (RCFE_Name / RCFE_Address), then Refresh.</div>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                {rcfeLocationSnapshot.name ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={ispLocationUpdating || isLoadingPreview}
                    onClick={() => void acceptRcfeAsDefaultIspLocation()}
                    title="Copy RCFE name/address into ISP Contact in Caspio and set ISP confirm date to today"
                  >
                    {ispLocationUpdating ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Use RCFE as Current Physical Location &amp; confirm today
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={ispLocationUpdating || isLoadingPreview}
                  onClick={() => void refreshIspLocationFromCaspio()}
                >
                  {isLoadingPreview ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Refresh
                </Button>
              </div>
            </div>
          ) : null}

          {confirmedIspLocation ? (
            <div className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {isReauth
                ? atRcfe
                  ? 'Current Physical Location confirmed (RCFE)'
                  : 'Current Physical Location confirmed'
                : atRcfe && rcfeLocationSnapshot.name
                  ? 'ISP location verified (RCFE)'
                  : 'ISP location verified'}
            </div>
          ) : !ispRcfeSoftMismatch ? (
            <Button
              type="button"
              size="sm"
              variant={canConfirmIspLocationStep ? 'default' : 'outline'}
              disabled={!canConfirmIspLocationStep || ispLocationUpdating}
              onClick={() => {
                setConfirmedIspLocation(true);
                toast({
                  title: isReauth
                    ? 'Current Physical Location confirmed'
                    : 'ISP location verified',
                  description: isReauth
                    ? atRcfe
                      ? 'ALFT Q3 will use the RCFE. You can continue to clinical uploads.'
                      : 'You can continue to clinical uploads.'
                    : 'You can continue to clinical uploads.',
                  className: 'bg-green-100 text-green-900 border-green-200',
                });
              }}
            >
              {isReauth
                ? atRcfe
                  ? 'Confirm Current Physical Location is the RCFE'
                  : 'Confirm Current Physical Location'
                : 'Confirm ISP location verified'}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
