'use client';

import React, { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

function clean(value: string | null) {
  return String(value || '').trim();
}

function normalizePersonName(value: string) {
  const raw = clean(value);
  if (!raw) return '';
  if (raw.includes('@')) return raw.toLowerCase();

  const commaParts = raw
    .split(',')
    .map((part) => clean(part))
    .filter(Boolean);
  const reordered =
    commaParts.length >= 2
      ? `${commaParts.slice(1).join(' ')} ${commaParts[0]}`.trim()
      : raw;

  const tokens = reordered
    .replace(/[:;|/\\]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.replace(/^[^a-zA-Z]+|[^a-zA-Z'-]+$/g, ''))
    .filter(Boolean)
    .filter((token) => /[a-zA-Z]/.test(token) && !/\d/.test(token));

  return tokens
    .join(' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/(^|[\s'-])([a-z])/g, (_m, prefix: string, chr: string) => `${prefix}${chr.toUpperCase()}`);
}

function asDisplayDate(value: string) {
  const v = clean(value);
  if (!v) return '';
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;
  const isoWithTime = v.match(/^(\d{4})-(\d{2})-(\d{2})T.*$/);
  if (isoWithTime) return `${isoWithTime[2]}/${isoWithTime[3]}/${isoWithTime[1]}`;
  return v;
}

const YES_NO_OPTIONS = ['', 'Yes', 'No'];
const REGION_OPTIONS = ['', 'NCAL', 'SCAL'];
const TIER_OPTIONS = ['', 'Tier 1', 'Tier 2', 'Tier 3', 'Tier 4', 'Tier 5'];
const ALW_SUBMITTED_OPTIONS = [
  '',
  'Yes',
  'No, ILS/external providers to assist Member with completing ALW Application',
];

function normalizeYesNo(value: string): string {
  const raw = clean(value).toLowerCase();
  if (!raw) return '';
  if (['yes', 'y', '1', 'true', 'checked'].includes(raw)) return 'Yes';
  if (['no', 'n', '0', 'false', 'unchecked'].includes(raw)) return 'No';
  return clean(value);
}

function normalizeRegion(value: string): string {
  const raw = clean(value).toLowerCase();
  if (!raw) return '';
  if (raw === 'ncal' || raw.includes('north')) return 'NCAL';
  if (raw === 'scal' || raw.includes('south')) return 'SCAL';
  return clean(value).toUpperCase();
}

function normalizeSubmittedOption(value: string): string {
  const raw = clean(value).toLowerCase();
  if (!raw) return '';
  if (raw === 'yes' || raw === 'y' || raw === '1' || raw === 'true') return 'Yes';
  if (raw.includes('no') && raw.includes('assist')) {
    return 'No, ILS/external providers to assist Member with completing ALW Application';
  }
  if (raw === 'no' || raw === 'n' || raw === '0' || raw === 'false') return 'No';
  return clean(value);
}

function normalizeTier(value: string): string {
  const raw = clean(value);
  if (!raw) return '';
  const match = raw.match(/(\d+)/);
  if (!match) return raw;
  return `Tier ${match[1]}`;
}

function KaiserIspCoverSheetPrintableContent() {
  const searchParams = useSearchParams();
  const returnTo = clean(searchParams.get('returnTo')) || '/admin/tools/kaiser-isp-cover-sheet';
  const memberName = clean(searchParams.get('memberName'));
  const memberMrn = clean(searchParams.get('memberMrn'));
  const memberClientId = clean(searchParams.get('memberClientId'));
  const memberCounty = clean(searchParams.get('memberCounty'));
  const memberDob = asDisplayDate(clean(searchParams.get('memberDob')));
  const memberPhone = clean(searchParams.get('memberPhone'));
  const memberEmail = clean(searchParams.get('memberEmail'));
  const coverPageType = clean(searchParams.get('ispCoverPageType'));
  const facilityName = clean(searchParams.get('Facility_Name'));
  const facilityAddress = clean(searchParams.get('Facility_Address'));
  const facilityType = clean(searchParams.get('Facility_Type'));
  const movedInDate = asDisplayDate(clean(searchParams.get('Move_In_Date')));
  const inAlwCounty = clean(searchParams.get('In_ALW_County'));
  const alwFacility = clean(searchParams.get('At_ALW_Facility'));
  const alwSubmitted = clean(searchParams.get('Did_Submit_ALW_Application'));
  const alwWaitlist = clean(searchParams.get('On_ALW_Waitlist'));
  const facilityVetted = clean(searchParams.get('Facility_Vetted_Contracted'));
  const roomBoardAmount = clean(searchParams.get('Room_and_Board_Amount'));
  const requestedTier = clean(searchParams.get('Requested_Tier_Level'));
  const currentLivingSituation = clean(searchParams.get('Describe_Member_Living_Situation'));
  const ispSocialWorker = normalizePersonName(clean(searchParams.get('ISP_Social_Worker')));
  const ispRn = normalizePersonName(clean(searchParams.get('ISP_RN')));
  const ispAssessmentDate = asDisplayDate(clean(searchParams.get('ISP_Assessment_Date')));
  const coverPageTypeLabel =
    coverPageType === 'reauthorization'
      ? 'Reauthorization Cover Page'
      : coverPageType === 'authorization'
        ? 'Authorization Cover Page'
        : '';

  const [dropdownOverrides, setDropdownOverrides] = useState(() => ({
    kaiserRegion: normalizeRegion(clean(searchParams.get('Kaiser_North_or_South'))),
    inAlwCounty: normalizeYesNo(inAlwCounty),
    atAlwFacility: normalizeYesNo(alwFacility),
    didSubmitAlwApplication: normalizeSubmittedOption(alwSubmitted),
    onAlwWaitlist: normalizeYesNo(alwWaitlist),
    facilityVettedContracted: normalizeYesNo(facilityVetted),
    requestedTierLevel: normalizeTier(requestedTier),
  }));
  const [showDropdownControls, setShowDropdownControls] = useState(false);

  const effectiveKaiserRegion = clean(dropdownOverrides.kaiserRegion) || clean(searchParams.get('Kaiser_North_or_South'));
  const effectiveInAlwCounty = clean(dropdownOverrides.inAlwCounty) || inAlwCounty;
  const effectiveAtAlwFacility = clean(dropdownOverrides.atAlwFacility) || alwFacility;
  const effectiveDidSubmitAlwApplication = clean(dropdownOverrides.didSubmitAlwApplication) || alwSubmitted;
  const effectiveOnAlwWaitlist = clean(dropdownOverrides.onAlwWaitlist) || alwWaitlist;
  const effectiveFacilityVetted = clean(dropdownOverrides.facilityVettedContracted) || facilityVetted;
  const effectiveRequestedTier = clean(dropdownOverrides.requestedTierLevel) || requestedTier;
  const dropdownPrefillStatuses = useMemo(
    () => [
      effectiveKaiserRegion,
      effectiveInAlwCounty,
      effectiveAtAlwFacility,
      effectiveDidSubmitAlwApplication,
      effectiveOnAlwWaitlist,
      effectiveFacilityVetted,
      effectiveRequestedTier,
    ],
    [
      effectiveKaiserRegion,
      effectiveInAlwCounty,
      effectiveAtAlwFacility,
      effectiveDidSubmitAlwApplication,
      effectiveOnAlwWaitlist,
      effectiveFacilityVetted,
      effectiveRequestedTier,
    ]
  );
  const hasAnyDropdownMissing = dropdownPrefillStatuses.some((value) => !clean(value));
  const shouldShowDropdownControls = showDropdownControls || hasAnyDropdownMissing;

  const mergedParams = useMemo(() => {
    const params = new URLSearchParams();
    searchParams.forEach((value, key) => {
      if (key === 'download') return;
      if (!clean(value)) return;
      params.set(key, value);
    });
    if (clean(dropdownOverrides.kaiserRegion)) params.set('Kaiser_North_or_South', clean(dropdownOverrides.kaiserRegion));
    if (clean(dropdownOverrides.inAlwCounty)) params.set('In_ALW_County', clean(dropdownOverrides.inAlwCounty));
    if (clean(dropdownOverrides.atAlwFacility)) params.set('At_ALW_Facility', clean(dropdownOverrides.atAlwFacility));
    if (clean(dropdownOverrides.didSubmitAlwApplication)) params.set('Did_Submit_ALW_Application', clean(dropdownOverrides.didSubmitAlwApplication));
    if (clean(dropdownOverrides.onAlwWaitlist)) params.set('On_ALW_Waitlist', clean(dropdownOverrides.onAlwWaitlist));
    if (clean(dropdownOverrides.facilityVettedContracted)) params.set('Facility_Vetted_Contracted', clean(dropdownOverrides.facilityVettedContracted));
    if (clean(dropdownOverrides.requestedTierLevel)) params.set('Requested_Tier_Level', clean(dropdownOverrides.requestedTierLevel));
    return params;
  }, [searchParams, dropdownOverrides]);

  const templateUrl = useMemo(() => {
    const query = mergedParams.toString();
    return `/api/forms/kaiser-isp-cover-sheet/template${query ? `?${query}` : ''}`;
  }, [mergedParams]);

  const downloadUrl = useMemo(() => {
    const params = new URLSearchParams(mergedParams);
    params.set('download', '1');
    return `/api/forms/kaiser-isp-cover-sheet/template?${params.toString()}`;
  }, [mergedParams]);

  const requiredFieldStatuses = useMemo(
    () => [
      { label: 'Member Name', value: memberName },
      { label: 'MRN/CIN', value: memberMrn },
      { label: 'Cell Phone Number', value: memberPhone },
      { label: 'County', value: memberCounty },
      { label: 'Kaiser Region', value: effectiveKaiserRegion },
      { label: 'Cover Sheet Type', value: coverPageTypeLabel },
      { label: 'ISP Assessment Date', value: ispAssessmentDate },
      { label: 'ISP Social Worker', value: ispSocialWorker },
      { label: 'ISP RN', value: ispRn },
      { label: 'Current Living Situation', value: currentLivingSituation },
      { label: 'Facility Name', value: facilityName },
      { label: 'Facility Address', value: facilityAddress },
    ],
    [
      memberName,
      memberMrn,
      memberPhone,
      memberCounty,
      effectiveKaiserRegion,
      coverPageTypeLabel,
      ispAssessmentDate,
      ispSocialWorker,
      ispRn,
      currentLivingSituation,
      facilityName,
      facilityAddress,
    ]
  );
  const optionalFieldStatuses = useMemo(
    () => [
      { label: 'ALW County Value', value: inAlwCounty },
      { label: 'At ALW Facility', value: effectiveAtAlwFacility },
      { label: 'Submitted ALW Application', value: effectiveDidSubmitAlwApplication },
      { label: 'On ALW Waitlist', value: effectiveOnAlwWaitlist },
      { label: 'Room and Board Amount', value: roomBoardAmount },
      { label: 'Requested Tier Level', value: effectiveRequestedTier },
      { label: 'Date Member Moved In', value: movedInDate },
      { label: 'Facility Vetted/Contracted', value: effectiveFacilityVetted },
      { label: 'Facility Type', value: facilityType },
      { label: 'Email', value: memberEmail },
    ],
    [
      inAlwCounty,
      effectiveAtAlwFacility,
      effectiveDidSubmitAlwApplication,
      effectiveOnAlwWaitlist,
      roomBoardAmount,
      effectiveRequestedTier,
      movedInDate,
      effectiveFacilityVetted,
      facilityType,
      memberEmail,
    ]
  );
  const missingRequired = useMemo(
    () => requiredFieldStatuses.filter((field) => !clean(field.value)),
    [requiredFieldStatuses]
  );
  const canGenerateActualPdf = missingRequired.length === 0;

  const handleOpenPdf = () => {
    if (!canGenerateActualPdf) return;
    window.open(templateUrl, '_blank', 'noopener,noreferrer');
  };

  const handleDownloadPdf = () => {
    if (!canGenerateActualPdf) return;
    window.location.href = downloadUrl;
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div className="rounded-md border bg-white p-3 print:hidden">
        <h1 className="text-lg font-semibold text-slate-900">Kaiser ISP Cover Sheet</h1>
      </div>

      <div className="mb-2 flex items-center justify-end gap-2 rounded-md border bg-white p-3 print:hidden">
        <Button variant="outline" asChild>
          <Link href={returnTo}>Back to ISP Tool</Link>
        </Button>
        <Button variant="outline" onClick={handleOpenPdf} disabled={!canGenerateActualPdf}>
          View / Print PDF
        </Button>
        <Button variant="outline" onClick={handleDownloadPdf} disabled={!canGenerateActualPdf}>
          Download PDF
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Prefill Preview</CardTitle>
          <CardDescription>
            Review all prefilled values here first. PDF generation is enabled only when required fields are complete.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <div><span className="font-medium">Cover Sheet Type:</span> {coverPageTypeLabel || 'Missing - go back and select one'}</div>
          <div><span className="font-medium">Member:</span> {memberName || 'N/A'}</div>
          <div><span className="font-medium">MRN/CIN:</span> {memberMrn || 'N/A'}</div>
          <div><span className="font-medium">Client_ID2:</span> {memberClientId || 'N/A'}</div>
          <div><span className="font-medium">County:</span> {memberCounty || 'N/A'}</div>
          <div><span className="font-medium">ALW County Value:</span> {effectiveInAlwCounty || 'N/A'}</div>
          <div><span className="font-medium">Kaiser Region:</span> {effectiveKaiserRegion || 'N/A'}</div>
          <div><span className="font-medium">Date of Birth:</span> {memberDob || 'N/A'}</div>
          <div><span className="font-medium">Cell Phone:</span> {memberPhone || 'N/A'}</div>
          <div><span className="font-medium">Email:</span> {memberEmail || 'N/A'}</div>
          <div><span className="font-medium">ISP Assessment Date:</span> {ispAssessmentDate || 'N/A'}</div>
          <div><span className="font-medium">ISP Social Worker:</span> {ispSocialWorker || 'N/A'}</div>
          <div><span className="font-medium">ISP RN:</span> {ispRn || 'N/A'}</div>
          <div><span className="font-medium">Current Living Situation:</span> {currentLivingSituation || 'N/A'}</div>
          <div><span className="font-medium">Facility Name:</span> {facilityName || 'N/A'}</div>
          <div><span className="font-medium">Facility Address:</span> {facilityAddress || 'N/A'}</div>
          <div><span className="font-medium">Facility Type:</span> {facilityType || 'N/A'}</div>
          <div><span className="font-medium">Date Member Moved In:</span> {movedInDate || 'N/A'}</div>
          <div><span className="font-medium">Facility Vetted/Contracted:</span> {effectiveFacilityVetted || 'N/A'}</div>
          <div><span className="font-medium">At ALW Facility:</span> {effectiveAtAlwFacility || 'N/A'}</div>
          <div><span className="font-medium">Submitted ALW Application:</span> {effectiveDidSubmitAlwApplication || 'N/A'}</div>
          <div><span className="font-medium">On ALW Waitlist:</span> {effectiveOnAlwWaitlist || 'N/A'}</div>
          <div><span className="font-medium">Room and Board Amount:</span> {roomBoardAmount || 'N/A'}</div>
          <div><span className="font-medium">Requested Tier Level:</span> {effectiveRequestedTier || 'N/A'}</div>
        </CardContent>
      </Card>

      {!shouldShowDropdownControls ? (
        <Card className="print:hidden">
          <CardHeader>
            <CardTitle>Dropdown Prefill Controls</CardTitle>
            <CardDescription>
              Dropdown values were auto-filled from Caspio.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              type="button"
              onClick={() => setShowDropdownControls(true)}
            >
              Edit Dropdown Values
            </Button>
          </CardContent>
        </Card>
      ) : (
      <Card className="print:hidden">
        <CardHeader>
          <CardTitle>Dropdown Prefill Controls</CardTitle>
          <CardDescription>
            {hasAnyDropdownMissing
              ? 'Some dropdown values are missing. Select values below before generating.'
              : 'Choose dropdown values here before generating the PDF. No new template upload needed.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Kaiser Region</span>
            <select
              className="w-full rounded border bg-white px-2 py-1"
              value={dropdownOverrides.kaiserRegion}
              onChange={(event) => setDropdownOverrides((prev) => ({ ...prev, kaiserRegion: event.target.value }))}
            >
              {REGION_OPTIONS.map((option) => (
                <option key={option || 'blank'} value={option}>
                  {option || 'Select from drop down'}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">In ALW County</span>
            <select
              className="w-full rounded border bg-white px-2 py-1"
              value={dropdownOverrides.inAlwCounty}
              onChange={(event) => setDropdownOverrides((prev) => ({ ...prev, inAlwCounty: event.target.value }))}
            >
              {YES_NO_OPTIONS.map((option) => (
                <option key={option || 'blank'} value={option}>
                  {option || 'Select from drop down'}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">At ALW Facility</span>
            <select
              className="w-full rounded border bg-white px-2 py-1"
              value={dropdownOverrides.atAlwFacility}
              onChange={(event) => setDropdownOverrides((prev) => ({ ...prev, atAlwFacility: event.target.value }))}
            >
              {YES_NO_OPTIONS.map((option) => (
                <option key={option || 'blank'} value={option}>
                  {option || 'Select from drop down'}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Submitted ALW Application</span>
            <select
              className="w-full rounded border bg-white px-2 py-1"
              value={dropdownOverrides.didSubmitAlwApplication}
              onChange={(event) =>
                setDropdownOverrides((prev) => ({ ...prev, didSubmitAlwApplication: event.target.value }))
              }
            >
              {ALW_SUBMITTED_OPTIONS.map((option) => (
                <option key={option || 'blank'} value={option}>
                  {option || 'Select from drop down'}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">On ALW Waitlist</span>
            <select
              className="w-full rounded border bg-white px-2 py-1"
              value={dropdownOverrides.onAlwWaitlist}
              onChange={(event) => setDropdownOverrides((prev) => ({ ...prev, onAlwWaitlist: event.target.value }))}
            >
              {YES_NO_OPTIONS.map((option) => (
                <option key={option || 'blank'} value={option}>
                  {option || 'Select from drop down'}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Facility Vetted / Contracted</span>
            <select
              className="w-full rounded border bg-white px-2 py-1"
              value={dropdownOverrides.facilityVettedContracted}
              onChange={(event) =>
                setDropdownOverrides((prev) => ({ ...prev, facilityVettedContracted: event.target.value }))
              }
            >
              {YES_NO_OPTIONS.map((option) => (
                <option key={option || 'blank'} value={option}>
                  {option || 'Select from drop down'}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="font-medium">Requested Tier Level (ILS)</span>
            <select
              className="w-full rounded border bg-white px-2 py-1"
              value={dropdownOverrides.requestedTierLevel}
              onChange={(event) =>
                setDropdownOverrides((prev) => ({ ...prev, requestedTierLevel: event.target.value }))
              }
            >
              {TIER_OPTIONS.map((option) => (
                <option key={option || 'blank'} value={option}>
                  {option || 'Select from drop down'}
                </option>
              ))}
            </select>
          </label>
        </CardContent>
      </Card>
      )}

      <Card className="print:hidden">
        <CardHeader>
          <CardTitle>Required Field Check</CardTitle>
          <CardDescription>
            Missing items are highlighted in red before generating the actual PDF.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {missingRequired.length > 0 ? (
            <div className="rounded border border-red-200 bg-red-50 p-2 text-red-800">
              Missing required fields: {missingRequired.map((item) => item.label).join(', ')}
            </div>
          ) : (
            <div className="rounded border border-green-200 bg-green-50 p-2 text-green-800">
              All required fields are present. You can now generate the actual PDF.
            </div>
          )}
          <div className="grid gap-1 sm:grid-cols-2">
            {requiredFieldStatuses.map((field) => {
              const hasValue = Boolean(clean(field.value));
              return (
                <div key={field.label} className={hasValue ? 'text-green-700' : 'text-red-700'}>
                  {field.label}: {hasValue ? `Ready (${field.value})` : 'Missing'}
                </div>
              );
            })}
            {optionalFieldStatuses.map((field) => {
              const hasValue = Boolean(clean(field.value));
              return (
                <div key={field.label} className={hasValue ? 'text-green-700' : 'text-slate-500'}>
                  {field.label}: {hasValue ? `Ready (${field.value})` : 'Optional (not blocking)'}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function KaiserIspCoverSheetPrintablePage() {
  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      <main className="container mx-auto px-4 py-8 print:p-0">
        <Suspense fallback={<div className="flex h-64 items-center justify-center">Loading...</div>}>
          <KaiserIspCoverSheetPrintableContent />
        </Suspense>
      </main>
    </div>
  );
}

