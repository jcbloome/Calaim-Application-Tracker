'use client';

import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { clean, type AnswerMap } from './isp-workflow-helpers';
import { Checkbox } from '@/components/ui/checkbox';
import { type Dispatch, type SetStateAction } from 'react';
import { type H2022EndWarning } from '@/lib/h2022-end-warning';
import { type IspVisitLocationSource } from '@/lib/isp-visit-location';

export interface RcfeDetailsStepProps {
  confirmedPurpose: boolean;
  confirmedRn: boolean;
  assessmentPurpose: "" | "initial" | "change_condition" | "review";
  setAssessmentPurpose: Dispatch<SetStateAction<"" | "initial" | "change_condition" | "review">>;
  setConfirmedPurpose: Dispatch<SetStateAction<boolean>>;
  setConfirmedIspLocation: Dispatch<SetStateAction<boolean>>;
  setVisitLocationSource: Dispatch<SetStateAction<"" | IspVisitLocationSource>>;
  setAskCaregiverOnArrival: Dispatch<SetStateAction<boolean>>;
  setOverrideIspContactPhone: Dispatch<SetStateAction<boolean>>;
  caspioSourcePreview: Record<string, unknown>;
  setResolvedPreview: Dispatch<SetStateAction<Record<string, string>>>;
  applyVisitLocationToPreview: (baseResolved: Record<string, string>, source: Record<string, unknown>, locationSource?: "" | IspVisitLocationSource | undefined, _purpose?: string | undefined) => Record<string, string>;
  visitLocationSource: "" | IspVisitLocationSource;
  reauthH2022Warning: H2022EndWarning | null;
  resolvedPreview: Record<string, string>;
  setAnswers: Dispatch<SetStateAction<AnswerMap>>;
  setCaspioFilledIds: Dispatch<SetStateAction<string[]>>;
  askCaregiverOnArrival: boolean;
  visitLocationSummary: { name: string; street: string; city: string; phone: string; label: string; } | null;
}

export function RcfeDetailsStep({
  confirmedPurpose,
  confirmedRn,
  assessmentPurpose,
  setAssessmentPurpose,
  setConfirmedPurpose,
  setConfirmedIspLocation,
  setVisitLocationSource,
  setAskCaregiverOnArrival,
  setOverrideIspContactPhone,
  caspioSourcePreview,
  setResolvedPreview,
  applyVisitLocationToPreview,
  visitLocationSource,
  reauthH2022Warning,
  resolvedPreview,
  setAnswers,
  setCaspioFilledIds,
  askCaregiverOnArrival,
  visitLocationSummary,
}: RcfeDetailsStepProps) {
  return (
    <div
      className={`rounded-md border bg-white p-3 ${
        confirmedPurpose ? 'border-green-300' : !confirmedRn ? 'opacity-70' : ''
      }`}
    >
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <Badge variant="outline">4</Badge>
        Purpose of this assessment
        {confirmedPurpose ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : null}
      </div>
      <p className="mb-2 text-xs text-muted-foreground">
        Required — written into the ALFT form and carried through SW, staff, and RN steps.
      </p>
      <div className="mb-2 flex flex-wrap gap-3 text-sm">
        {[
          { value: 'initial' as const, label: 'Initial' },
          { value: 'change_condition' as const, label: 'Change of Condition' },
          { value: 'review' as const, label: 'Review (reassessment)' },
        ].map((opt) => (
          <label key={opt.value} className="inline-flex items-center gap-2">
            <input
              type="radio"
              name="isp-assessment-purpose"
              checked={assessmentPurpose === opt.value}
              disabled={!confirmedRn}
              onChange={() => {
                setAssessmentPurpose(opt.value);
                setConfirmedPurpose(true);
                setConfirmedIspLocation(false);
                if (opt.value !== 'review' && opt.value !== 'initial') {
                  setVisitLocationSource('');
                  setAskCaregiverOnArrival(false);
                  setOverrideIspContactPhone(false);
                  // Restore ISP-location preview defaults when leaving visit-location flow.
                  if (Object.keys(caspioSourcePreview).length) {
                    setResolvedPreview((prev) =>
                      applyVisitLocationToPreview(
                        prev,
                        caspioSourcePreview,
                        'isp_location',
                        opt.value
                      )
                    );
                  }
                } else if (
                  visitLocationSource &&
                  Object.keys(caspioSourcePreview).length
                ) {
                  setResolvedPreview((prev) =>
                    applyVisitLocationToPreview(
                      prev,
                      caspioSourcePreview,
                      visitLocationSource,
                      opt.value
                    )
                  );
                }
              }}
              className="h-4 w-4 accent-blue-700"
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>
      {reauthH2022Warning?.h2022WarningLabel ? (
        <div
          className={`mb-2 flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
            (reauthH2022Warning.h2022DaysUntilEnd ?? 0) < 0
              ? 'border-red-300 bg-red-50 text-red-950'
              : 'border-amber-300 bg-amber-50 text-amber-950'
          }`}
          role="status"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <div className="font-medium">{reauthH2022Warning.h2022WarningLabel}</div>
            {reauthH2022Warning.h2022EndDate ? (
              <div className="text-xs opacity-90">
                Authorization end date: {reauthH2022Warning.h2022EndDate}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {assessmentPurpose === 'review' || assessmentPurpose === 'initial' ? (
        <div className="mt-3 space-y-2 rounded border border-sky-200 bg-sky-50/60 p-3">
          <div className="text-xs font-medium text-sky-950">
            {assessmentPurpose === 'initial'
              ? 'Initial visit — is the member already at an RCFE, or at another ISP location (home, SNF, etc.)?'
              : 'Reassessment / reauthorization visit — is the member at an RCFE, or still at home / SNF / another ISP location?'}
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            {[
              {
                value: 'rcfe' as const,
                label:
                  assessmentPurpose === 'initial' ? 'Already at RCFE' : 'At RCFE',
              },
              {
                value: 'isp_location' as const,
                label:
                  assessmentPurpose === 'initial'
                    ? 'Other ISP location (home, SNF, etc.)'
                    : 'Still at home / SNF / other ISP location',
              },
            ].map((opt) => (
              <label key={opt.value} className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="isp-visit-location"
                  checked={visitLocationSource === opt.value}
                  onChange={() => {
                    setVisitLocationSource(opt.value);
                    if (opt.value !== 'rcfe') {
                      setAskCaregiverOnArrival(false);
                      setOverrideIspContactPhone(false);
                    }
                    setConfirmedIspLocation(false);
                    if (Object.keys(caspioSourcePreview).length) {
                      const nextPreview = applyVisitLocationToPreview(
                        resolvedPreview,
                        caspioSourcePreview,
                        opt.value,
                        assessmentPurpose
                      );
                      setResolvedPreview(nextPreview);
                      setAnswers((prev) => {
                        const merged = { ...prev };
                        for (const key of [
                          'p2_facility_name',
                          'p2_current_street',
                          'p2_current_city',
                          'p2_current_state',
                          'p2_current_zip',
                          'p2_current_type',
                          'p2_current_type_other',
                          'isp_location_name',
                          'isp_location_address',
                          'isp_location_city',
                          'isp_location_state',
                          'isp_location_zip',
                          'isp_location_type',
                          'isp_contact_street',
                          'isp_contact_city',
                          'isp_contact_state',
                          'isp_contact_zip',
                        ] as const) {
                          const value = clean(nextPreview[key]);
                          if (value) merged[key] = value;
                        }
                        return merged;
                      });
                      setCaspioFilledIds((prev) => {
                        const next = new Set(prev);
                        [
                          'p2_facility_name',
                          'p2_current_street',
                          'p2_current_city',
                          'p2_current_state',
                          'p2_current_zip',
                        ].forEach((id) => {
                          if (clean(nextPreview[id])) next.add(id);
                        });
                        return Array.from(next);
                      });
                    }
                  }}
                  className="h-4 w-4 accent-blue-700"
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
          {visitLocationSource === 'rcfe' ? (
            <div className="space-y-2">
              <p className="text-[11px] text-sky-900">
                Form pulls ISP Address from Caspio{' '}
                <span className="font-medium">RCFE_Name</span>,{' '}
                <span className="font-medium">RCFE_Address</span>,{' '}
                <span className="font-medium">RCFE_City</span>,{' '}
                <span className="font-medium">RCFE_State</span>,{' '}
                <span className="font-medium">RCFE_Zip</span> (where the member will go / already
                is). If RCFE and ISP Contact differ, step 5 can sync Caspio.
                {assessmentPurpose === 'initial'
                  ? ' SW email: Initial assessment — already at an RCFE.'
                  : ' SW email: Reassessment — at an RCFE.'}
              </p>
              <label className="flex items-start gap-2 rounded border border-sky-200 bg-white/80 px-2 py-1.5 text-[11px] text-slate-800">
                <Checkbox
                  checked={askCaregiverOnArrival}
                  onCheckedChange={(checked) => setAskCaregiverOnArrival(checked === true)}
                  className="mt-0.5"
                />
                <span>
                  No single ISP contact person — ask for staff when arriving at RCFE
                  <span className="mt-0.5 block text-muted-foreground">
                    For large assisted living / RCFEs without a dedicated contact (often just a
                    caregiver at the front desk). Waives ISP Contact Name and ISP Contact Phone as
                    required. SW invite will tell them to ask for staff on arrival.
                  </span>
                </span>
              </label>
            </div>
          ) : null}
          {visitLocationSource === 'isp_location' ? (
            <p className="text-[11px] text-sky-900">
              Form uses Caspio ISP location — verify it in step 5.
              {assessmentPurpose === 'review'
                ? ' SW email: may still be at home, SNF, or another ISP location.'
                : ' SW email: member not yet at an RCFE for this initial visit.'}
            </p>
          ) : null}
          {visitLocationSummary ? (
            <div className="rounded border bg-white px-2 py-1.5 text-[11px] text-slate-700">
              Preview ({visitLocationSummary.label}):{' '}
              {[
                visitLocationSummary.name,
                visitLocationSummary.street,
                visitLocationSummary.city,
                visitLocationSummary.phone,
              ]
                .filter(Boolean)
                .join(' · ') || 'No values found in Caspio yet'}
            </div>
          ) : null}
          {!visitLocationSource ? (
            <p className="text-[11px] text-amber-800">
              Select RCFE or ISP location so the SW email includes the correct visit type.
            </p>
          ) : null}
        </div>
      ) : null}
      {confirmedPurpose && assessmentPurpose ? (
        <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-green-700">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Purpose confirmed (
          {assessmentPurpose === 'initial'
            ? 'Initial'
            : assessmentPurpose === 'change_condition'
              ? 'Change of Condition'
              : 'Review / reauthorization'}
          )
          {(assessmentPurpose === 'review' || assessmentPurpose === 'initial') &&
          visitLocationSource
            ? ` · ${
                visitLocationSource === 'rcfe'
                  ? assessmentPurpose === 'initial'
                    ? 'Already at RCFE'
                    : 'At RCFE'
                  : 'Home / SNF / other ISP location'
              }`
            : ''}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">Select a purpose to continue.</div>
      )}
    </div>
  );
}
