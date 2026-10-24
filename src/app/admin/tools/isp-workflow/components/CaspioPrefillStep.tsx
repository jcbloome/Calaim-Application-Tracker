'use client';

import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Loader2, RefreshCw, Upload, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { clean, type KaiserMember } from './isp-workflow-helpers';
import { Checkbox } from '@/components/ui/checkbox';
import { type Dispatch, type SetStateAction } from 'react';

export interface CaspioPrefillStepProps {
  showForm: boolean;
  confirmedClinicalUploads: boolean;
  completedPdfImportDone: boolean;
  formerSwImportMode: boolean;
  prefillIspForm: () => Promise<void>;
  prefillLockedByCompletedPdf: boolean;
  isPrefilling: boolean;
  isRefreshingCaspioFields: boolean;
  isParsingCompletedPdf: boolean;
  isLoadingPreview: boolean;
  canPrefillIspForm: boolean;
  refreshCaspioFieldsOntoExistingIsp: () => Promise<void>;
  selectedMember: KaiserMember;
  selectedClientId: string;
  importCompletedAlftPdf: (file: File) => Promise<void>;
  completedPdfFileName: string;
  clearCompletedAlftPdfImport: () => Promise<void>;
  completedPdfParseProgress: string;
  prefillBlockedReasons: string[];
  ispContactPhoneEmpty: boolean;
  overrideIspContactPhone: boolean;
  setOverrideIspContactPhone: Dispatch<SetStateAction<boolean>>;
}

export function CaspioPrefillStep({
  showForm,
  confirmedClinicalUploads,
  completedPdfImportDone,
  formerSwImportMode,
  prefillIspForm,
  prefillLockedByCompletedPdf,
  isPrefilling,
  isRefreshingCaspioFields,
  isParsingCompletedPdf,
  isLoadingPreview,
  canPrefillIspForm,
  refreshCaspioFieldsOntoExistingIsp,
  selectedMember,
  selectedClientId,
  importCompletedAlftPdf,
  completedPdfFileName,
  clearCompletedAlftPdfImport,
  completedPdfParseProgress,
  prefillBlockedReasons,
  ispContactPhoneEmpty,
  overrideIspContactPhone,
  setOverrideIspContactPhone,
}: CaspioPrefillStepProps) {
  return (
    <div
      className={`rounded-md border bg-white p-3 ${
        showForm ? 'border-green-300' : !confirmedClinicalUploads ? 'opacity-70' : ''
      }`}
    >
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <Badge variant="outline">7</Badge>
        Prefill ISP form
        {showForm ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : null}
        {completedPdfImportDone ? (
          <Badge className="bg-emerald-100 text-emerald-900 hover:bg-emerald-100">
            Completed PDF import
          </Badge>
        ) : null}
      </div>
      <p className="mb-2 text-xs text-muted-foreground">
        {completedPdfImportDone
          ? 'Completed ALFT PDF imported — Prefill is complete. Use Refresh Caspio fields to pull updated home address / contact data without erasing the ISP. Full Caspio Prefill stays disabled.'
          : formerSwImportMode
            ? 'For a departed SW, upload the completed/signed ALFT PDF here after steps 1–6. That parses the form so you can edit it and Save as ISP intake (no SW portal invite).'
            : 'Unlocks after steps 1–6 and all required Caspio fields are ready. “Besides client answering” stays blank for the SW to complete. Or upload a completed ALFT PDF instead of Caspio Prefill.'}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => void prefillIspForm()}
          disabled={
            prefillLockedByCompletedPdf ||
            isPrefilling ||
            isRefreshingCaspioFields ||
            isParsingCompletedPdf ||
            isLoadingPreview ||
            !canPrefillIspForm
          }
          title={
            prefillLockedByCompletedPdf
              ? 'Disabled — completed PDF already imported for this member'
              : undefined
          }
        >
          {isPrefilling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {prefillLockedByCompletedPdf ? 'Prefill complete (PDF)' : 'Prefill ISP Form'}
        </Button>
        {completedPdfImportDone ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => void refreshCaspioFieldsOntoExistingIsp()}
            disabled={
              isRefreshingCaspioFields ||
              isPrefilling ||
              isParsingCompletedPdf ||
              isLoadingPreview ||
              !showForm ||
              !(selectedMember || clean(selectedClientId))
            }
            title="Pull home address, mailing, ISP location, and contact fields from Caspio while keeping the imported ISP answers"
          >
            {isRefreshingCaspioFields ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh Caspio fields
          </Button>
        ) : null}
        <label className="inline-flex cursor-pointer">
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            disabled={
              isParsingCompletedPdf ||
              isPrefilling ||
              isRefreshingCaspioFields ||
              !(selectedMember || clean(selectedClientId))
            }
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importCompletedAlftPdf(file);
              e.currentTarget.value = '';
            }}
          />
          <span
            className={`inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium ${
              isParsingCompletedPdf ||
              isPrefilling ||
              isRefreshingCaspioFields ||
              !(selectedMember || clean(selectedClientId))
                ? 'pointer-events-none opacity-50'
                : 'hover:bg-accent'
            }`}
          >
            {isParsingCompletedPdf ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            {completedPdfImportDone ? 'Re-upload completed ALFT PDF' : 'Upload completed ALFT PDF'}
          </span>
        </label>
        {completedPdfImportDone || completedPdfFileName ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-10 text-red-700 hover:bg-red-50 hover:text-red-800"
            disabled={isParsingCompletedPdf || isPrefilling || isRefreshingCaspioFields}
            onClick={() => clearCompletedAlftPdfImport()}
            title="Remove completed PDF import"
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Delete PDF import
          </Button>
        ) : null}
      </div>
      {isParsingCompletedPdf || completedPdfFileName ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {isParsingCompletedPdf
            ? completedPdfParseProgress || 'Reading completed ALFT PDF…'
            : isRefreshingCaspioFields
              ? 'Refreshing Caspio home address / contact fields…'
              : `Imported: ${completedPdfFileName}${
                  completedPdfImportDone
                    ? ' — Prefill locked (use Refresh Caspio fields for address updates)'
                    : ''
                }`}
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          Upload a completed ALFT PDF (not created in-app) to fill the form and skip Caspio Prefill.
        </p>
      )}
      {!completedPdfImportDone && !canPrefillIspForm && prefillBlockedReasons.length > 0 ? (
        <div className="mt-2 space-y-2 text-xs text-amber-800">
          <div className="space-y-0.5">
            <div className="font-medium">Still needed to unlock Caspio prefill:</div>
            {prefillBlockedReasons.map((reason) => (
              <div key={reason}>• {reason}</div>
            ))}
          </div>
          {ispContactPhoneEmpty ? (
            <label className="flex items-start gap-2 rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-950">
              <Checkbox
                checked={overrideIspContactPhone}
                onCheckedChange={(checked) => setOverrideIspContactPhone(checked === true)}
                className="mt-0.5"
              />
              <span>
                Override missing ISP Contact Phone and continue
                <span className="mt-0.5 block text-amber-900/80">
                  Use when the ISP contact is just a caregiver / front desk at the RCFE.
                </span>
              </span>
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
