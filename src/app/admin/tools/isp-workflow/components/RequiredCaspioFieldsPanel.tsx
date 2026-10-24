'use client';

import { Button } from '@/components/ui/button';
import { clientIdOf, type KaiserMember } from './isp-workflow-helpers';
import { RefreshCw, Loader2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { type Dispatch, type SetStateAction } from 'react';

export interface RequiredCaspioFieldsPanelProps {
  loadCaspioFieldPreview: (memberIdRaw: string, memberOverride?: KaiserMember | null | undefined, options?: { preferLive?: boolean | undefined; assessorTypeOverride?: "msw" | "rn" | undefined; } | undefined) => Promise<void>;
  selectedMember: KaiserMember;
  isLoadingPreview: boolean;
  prefillDataSource: string;
  previewError: string;
  missingRequiredLabels: string[];
  hasPreviewForSelection: boolean;
  ispContactPhoneEmpty: boolean;
  overrideIspContactPhone: boolean;
  setOverrideIspContactPhone: Dispatch<SetStateAction<boolean>>;
  requiredFieldStatuses: { label: string; value: string; waived: boolean; ready: boolean; id: string; }[];
}

export function RequiredCaspioFieldsPanel({
  loadCaspioFieldPreview,
  selectedMember,
  isLoadingPreview,
  prefillDataSource,
  previewError,
  missingRequiredLabels,
  hasPreviewForSelection,
  ispContactPhoneEmpty,
  overrideIspContactPhone,
  setOverrideIspContactPhone,
  requiredFieldStatuses,
}: RequiredCaspioFieldsPanelProps) {
  return (
    <div className="rounded-md border bg-slate-50 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium">Required Caspio ISP fields</div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            void loadCaspioFieldPreview(clientIdOf(selectedMember), selectedMember, {
              preferLive: true,
            })
          }
          disabled={isLoadingPreview}
        >
          <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isLoadingPreview ? 'animate-spin' : ''}`} />
          Refresh from Caspio (live)
        </Button>
      </div>
      {prefillDataSource ? (
        <div
          className={`mt-1 text-[11px] ${
            prefillDataSource === 'caspio-live'
              ? 'text-emerald-700'
              : 'text-amber-800'
          }`}
        >
          Data source:{' '}
          {prefillDataSource === 'caspio-live'
            ? 'Live Caspio'
            : prefillDataSource === 'firestore-cache'
              ? 'Firestore cache (stale risk — click Refresh from Caspio)'
              : prefillDataSource}
        </div>
      ) : null}
      {isLoadingPreview ? (
        <div className="mt-2 inline-flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading live Caspio field status…
        </div>
      ) : previewError ? (
        <div className="mt-2 text-xs text-red-700">{previewError}</div>
      ) : missingRequiredLabels.length > 0 ? (
        <div className="mt-2 text-xs text-red-700">
          Missing required data in Caspio: {missingRequiredLabels.join(', ')}.
          {prefillDataSource === 'firestore-cache'
            ? ' If you already updated Caspio, click Refresh from Caspio (live).'
            : ''}
        </div>
      ) : hasPreviewForSelection ? (
        <div className="mt-2 text-xs text-green-700">All required fields are present.</div>
      ) : (
        <div className="mt-2 text-xs text-muted-foreground">Select a member to check Caspio fields.</div>
      )}
      {hasPreviewForSelection && !isLoadingPreview && !previewError && ispContactPhoneEmpty ? (
        <label className="mt-2 flex items-start gap-2 rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-950">
          <Checkbox
            checked={overrideIspContactPhone}
            onCheckedChange={(checked) => setOverrideIspContactPhone(checked === true)}
            className="mt-0.5"
          />
          <span>
            Override missing ISP Contact Phone and continue
            <span className="mt-0.5 block text-amber-900/80">
              Use when the ISP contact is just a caregiver / front desk at the RCFE and Caspio
              has no dedicated phone yet.
            </span>
          </span>
        </label>
      ) : null}
      {hasPreviewForSelection && !isLoadingPreview && !previewError ? (
        <div className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
          {requiredFieldStatuses.map((field) => {
            if (field.waived) {
              return (
                <div key={field.id} className="text-amber-800">
                  {field.id === 'isp_contact_phone'
                    ? `${field.label}: Overridden — caregiver / front desk at RCFE is OK`
                    : `${field.label}: Waived — ask for staff on arrival at RCFE`}
                  {field.value ? ` (Caspio has: ${field.value})` : ''}
                </div>
              );
            }
            const ready = Boolean(field.value);
            return (
              <div key={field.id} className={ready ? 'text-green-700' : 'text-red-700'}>
                {field.label}: {ready ? `Ready (${field.value})` : 'Missing'}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
