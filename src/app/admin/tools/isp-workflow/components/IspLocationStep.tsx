'use client';

import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { type IspLocationSnapshot, type IspVisitLocationSource } from '@/lib/isp-visit-location';
import { type Dispatch, type SetStateAction } from 'react';
import type { useToast } from '@/hooks/use-toast';

export interface IspLocationStepProps {
  confirmedIspLocation: boolean;
  confirmedPurpose: boolean;
  visitLocationReady: boolean;
  ispRcfeSoftMismatch: boolean;
  needsVisitLocationChoice: boolean;
  ispLocationSnapshot: IspLocationSnapshot;
  rcfeLocationSnapshot: IspLocationSnapshot;
  ispLocationUpdating: boolean;
  isLoadingPreview: boolean;
  acceptRcfeAsDefaultIspLocation: () => Promise<void>;
  refreshIspLocationFromCaspio: () => Promise<void>;
  visitLocationSource: "" | IspVisitLocationSource;
  canConfirmIspLocationStep: boolean;
  setConfirmedIspLocation: Dispatch<SetStateAction<boolean>>;
  toast: ReturnType<typeof useToast>['toast'];
}

export function IspLocationStep({
  confirmedIspLocation,
  confirmedPurpose,
  visitLocationReady,
  ispRcfeSoftMismatch,
  needsVisitLocationChoice,
  ispLocationSnapshot,
  rcfeLocationSnapshot,
  ispLocationUpdating,
  isLoadingPreview,
  acceptRcfeAsDefaultIspLocation,
  refreshIspLocationFromCaspio,
  visitLocationSource,
  canConfirmIspLocationStep,
  setConfirmedIspLocation,
  toast,
}: IspLocationStepProps) {
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
        Verify ISP location
        {confirmedIspLocation ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : null}
        {ispRcfeSoftMismatch && !confirmedIspLocation ? (
          <AlertTriangle className="h-4 w-4 text-amber-600" />
        ) : null}
      </div>

      {!confirmedPurpose || !visitLocationReady ? (
        <div className="text-[11px] text-amber-800">
          Finish step 4 (purpose
          {needsVisitLocationChoice ? ' + RCFE / ISP location' : ''}) first.
        </div>
      ) : (
        <div className="space-y-2">
          <div className="rounded border bg-muted/20 px-2 py-1.5 text-[11px] text-slate-800">
            <div className="font-medium text-slate-900">ISP location</div>
            <div>
              {[
                ispLocationSnapshot.name,
                ispLocationSnapshot.street,
                ispLocationSnapshot.city,
                ispLocationSnapshot.state,
                ispLocationSnapshot.zip,
              ]
                .filter(Boolean)
                .join(' · ') || 'No ISP location in Caspio yet'}
            </div>
          </div>

          {ispRcfeSoftMismatch && !confirmedIspLocation ? (
            <div className="space-y-2 rounded border border-amber-300 bg-amber-50 px-2 py-2 text-[11px] text-amber-950">
              <div className="flex items-start gap-1.5 font-medium">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Name/address differs from RCFE — RCFE is the default when plugged in
              </div>
              <div>
                RCFE (default): {rcfeLocationSnapshot.name}
                {rcfeLocationSnapshot.street ? ` · ${rcfeLocationSnapshot.street}` : ''}
                {rcfeLocationSnapshot.city ? ` · ${rcfeLocationSnapshot.city}` : ''}
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  disabled={ispLocationUpdating || isLoadingPreview}
                  onClick={() => void acceptRcfeAsDefaultIspLocation()}
                >
                  {ispLocationUpdating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Accept RCFE as default
                </Button>
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
              ISP location verified
              {visitLocationSource === 'rcfe' && rcfeLocationSnapshot.name
                ? ' (RCFE)'
                : ''}
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
                  title: 'ISP location verified',
                  description: 'You can continue to clinical uploads.',
                  className: 'bg-green-100 text-green-900 border-green-200',
                });
              }}
            >
              Confirm ISP location verified
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
