'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth, useUser } from '@/firebase';
import { onAuthStateChanged } from 'firebase/auth';

function clean(value: string | null) {
  return String(value || '').trim();
}

/** Accept `$1000`, `$1,000.00`, or `1000` → normalized display for cover sheet PDF. */
function normalizeMoneyAmount(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const stripped = raw.replace(/\$/g, '').trim();
  const negative = /^-/.test(stripped);
  const cleaned = stripped.replace(/[^0-9.]/g, '');
  if (!cleaned) return '';
  const parts = cleaned.split('.');
  const whole = parts[0] || '0';
  const fraction = parts.length > 1 ? parts.slice(1).join('').slice(0, 2) : '';
  const asNumber = Number(`${whole}${fraction ? `.${fraction}` : ''}`);
  if (!Number.isFinite(asNumber)) {
    return raw.includes('$') ? raw : `$${raw}`;
  }
  const abs = Math.abs(asNumber);
  const formatted =
    fraction || abs % 1 !== 0
      ? abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : abs.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return `${negative ? '-' : ''}$${formatted}`;
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

function ensureMswTitle(value: string) {
  const normalized = clean(value);
  if (!normalized) return '';
  if (/\bmsw\b/i.test(normalized)) {
    return normalized.replace(/\bmsw\b/gi, 'MSW');
  }
  return `${normalized}, MSW`;
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
  if (raw === 'no' || raw === 'n' || raw === '0' || raw === 'false') {
    return 'No, ILS/external providers to assist Member with completing ALW Application';
  }
  return clean(value);
}

function normalizeTier(value: string): string {
  const raw = clean(value);
  if (!raw) return '';
  const match = raw.match(/(\d+)/);
  if (!match) return raw;
  return `Tier ${match[1]}`;
}

type PrefillState = {
  returnTo: string;
  memberName: string;
  memberMrn: string;
  memberClientId: string;
  memberCounty: string;
  memberDob: string;
  memberPhone: string;
  memberEmail: string;
  coverPageType: string;
  facilityName: string;
  facilityAddress: string;
  facilityType: string;
  movedInDate: string;
  inAlwCounty: string;
  alwFacility: string;
  alwSubmitted: string;
  alwWaitlist: string;
  facilityVetted: string;
  roomBoardAmount: string;
  requestedTier: string;
  caspioTierLevel: string;
  currentLivingSituation: string;
  changeOfCondition: string;
  ispSocialWorker: string;
  ispRn: string;
  ispAssessmentDate: string;
  kaiserRegionRaw: string;
};

type KaiserMemberLike = {
  Client_ID2?: string;
  client_ID2?: string;
  memberName?: string;
  memberFirstName?: string;
  memberLastName?: string;
  memberMrn?: string;
  memberPhone?: string;
  memberEmail?: string;
  memberCounty?: string;
  Birth_Date?: string;
  birthDate?: string;
  caspioRaw?: Record<string, unknown>;
  [key: string]: unknown;
};

const CHANGE_CONDITION_YES_OPTION =
  'Yes, ILS must provide clinical reassessment noting changes in condition';
const CHANGE_CONDITION_NO_OPTION =
  'No, KP will reauthorize at current tier level';
const TIER_OPTIONS = ['Tier 1', 'Tier 2', 'Tier 3', 'Tier 4', 'Tier 5'];

const getMemberValue = (member: KaiserMemberLike, keys: string[]) => {
  for (const key of keys) {
    const top = String(member[key] ?? '').trim();
    if (top) return top;
    const raw = String(member.caspioRaw?.[key] ?? '').trim();
    if (raw) return raw;
  }
  return '';
};

const composeAddress = (...parts: Array<unknown>) =>
  parts
    .map((part) => clean(String(part ?? '')))
    .filter(Boolean)
    .join(', ')
    .replace(/,\s*,/g, ', ')
    .trim();

const toMemberDisplayName = (member: KaiserMemberLike) => {
  const first = String(member.memberFirstName || '').trim();
  const last = String(member.memberLastName || '').trim();
  const firstLast = `${first} ${last}`.trim();
  if (firstLast) return firstLast;
  return clean(member.memberName as string);
};

function KaiserIspCoverSheetPrintableContent() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  const { toast } = useToast();
  const [isRefreshingFromCaspio, setIsRefreshingFromCaspio] = useState(false);
  const [isLoggingDownload, setIsLoggingDownload] = useState(false);
  const [isStartingOver, setIsStartingOver] = useState(false);
  const [showFilledPreview, setShowFilledPreview] = useState(true);
  const [coverSheetTypeVerified, setCoverSheetTypeVerified] = useState(false);
  const [rcfeVerified, setRcfeVerified] = useState(false);
  const [financialResponsibilityVerified, setFinancialResponsibilityVerified] = useState(false);
  const [changeConditionVerified, setChangeConditionVerified] = useState(false);
  const [verificationChecked, setVerificationChecked] = useState(false);
  const [lastDownloadName, setLastDownloadName] = useState('');
  const [prefill, setPrefill] = useState<PrefillState>(() => ({
    returnTo: clean(searchParams.get('returnTo')) || '/admin/tools/kaiser-isp-cover-sheet',
    memberName: clean(searchParams.get('memberName')),
    memberMrn: clean(searchParams.get('memberMrn')),
    memberClientId: clean(searchParams.get('memberClientId')),
    memberCounty:
      clean(searchParams.get('ALW_County')) ||
      clean(searchParams.get('memberCounty')),
    memberDob: clean(searchParams.get('memberDob')),
    memberPhone: clean(searchParams.get('memberPhone')),
    memberEmail: clean(searchParams.get('memberEmail')),
    // Force explicit user choice on this page (no auto-selection).
    coverPageType: '',
    facilityName: clean(searchParams.get('Facility_Name')),
    facilityAddress: clean(searchParams.get('Facility_Address')),
    facilityType: clean(searchParams.get('Facility_Type')),
    movedInDate: clean(searchParams.get('Move_In_Date')),
    inAlwCounty: clean(searchParams.get('In_ALW_County')),
    alwFacility: clean(searchParams.get('At_ALW_Facility')),
    alwSubmitted: clean(searchParams.get('Did_Submit_ALW_Application')),
    alwWaitlist: clean(searchParams.get('On_ALW_Waitlist')),
    facilityVetted: clean(searchParams.get('Facility_Vetted_Contracted')),
    roomBoardAmount: normalizeMoneyAmount(searchParams.get('Room_and_Board_Amount')),
    // Must be explicitly selected and verified on this page.
    requestedTier: '',
    caspioTierLevel: clean(searchParams.get('Tiered_Level_of_Care') || searchParams.get('Requested_Tier_Level')),
    currentLivingSituation: clean(searchParams.get('Describe_Member_Living_Situation')),
    // Must be explicitly selected and verified on this page for reauthorization.
    // Do not prefill from URL/Caspio.
    changeOfCondition: '',
    ispSocialWorker: clean(searchParams.get('ISP_Social_Worker')),
    ispRn: clean(searchParams.get('ISP_RN')),
    ispAssessmentDate: clean(searchParams.get('ISP_Assessment_Date')),
    kaiserRegionRaw: clean(searchParams.get('Kaiser_North_or_South')),
  }));
  const returnTo = prefill.returnTo;
  const memberName = prefill.memberName;
  const memberMrn = prefill.memberMrn;
  const memberClientId = prefill.memberClientId;
  const memberCounty = prefill.memberCounty;
  const memberPhone = prefill.memberPhone;
  const memberEmail = prefill.memberEmail;
  const coverPageType = prefill.coverPageType;
  const facilityName = prefill.facilityName;
  const facilityAddress = prefill.facilityAddress;
  const facilityType = prefill.facilityType;
  const movedInDate = asDisplayDate(prefill.movedInDate);
  const inAlwCounty = prefill.inAlwCounty;
  const alwFacility = prefill.alwFacility;
  const alwSubmitted = prefill.alwSubmitted;
  const alwWaitlist = prefill.alwWaitlist;
  const facilityVetted = prefill.facilityVetted;
  const roomBoardAmount = prefill.roomBoardAmount;
  const requestedTier = prefill.requestedTier;
  const caspioTierLevel = prefill.caspioTierLevel;
  const currentLivingSituation = prefill.currentLivingSituation;
  const changeOfCondition = prefill.changeOfCondition;
  const ispSocialWorker = ensureMswTitle(normalizePersonName(prefill.ispSocialWorker));
  const ispRn = normalizePersonName(prefill.ispRn);
  const ispAssessmentDate = asDisplayDate(prefill.ispAssessmentDate);
  const normalizedCoverPageType =
    coverPageType === 'authorization' || coverPageType === 'reauthorization' ? coverPageType : '';
  const coverPageTypeLabel =
    normalizedCoverPageType === 'reauthorization'
      ? 'Reauthorization Cover Page'
      : normalizedCoverPageType === 'authorization'
        ? 'Authorization Cover Page'
        : '';

  const effectiveKaiserRegion = normalizeRegion(prefill.kaiserRegionRaw);
  const effectiveInAlwCounty = normalizeYesNo(inAlwCounty);
  const effectiveAtAlwFacility = normalizeYesNo(alwFacility);
  const effectiveDidSubmitAlwApplication = normalizeSubmittedOption(alwSubmitted);
  const effectiveOnAlwWaitlist = normalizeYesNo(alwWaitlist);
  const effectiveFacilityVetted = normalizeYesNo(facilityVetted);
  const effectiveRequestedTier = normalizeTier(requestedTier);
  const effectiveCaspioTierLevel = normalizeTier(caspioTierLevel);
  const effectiveChangeOfCondition = clean(changeOfCondition);
  // Reassessment/reauthorization is always RCFE for current living situation.
  const effectiveLivingSituation =
    normalizedCoverPageType === 'reauthorization' ? 'RCFE' : clean(currentLivingSituation);

  const mergedParams = useMemo(() => {
    const params = new URLSearchParams();
    if (clean(prefill.returnTo)) params.set('returnTo', clean(prefill.returnTo));
    if (clean(prefill.memberName)) params.set('memberName', clean(prefill.memberName));
    if (clean(prefill.memberMrn)) params.set('memberMrn', clean(prefill.memberMrn));
    if (clean(prefill.memberClientId)) params.set('memberClientId', clean(prefill.memberClientId));
    if (clean(prefill.memberCounty)) {
      params.set('memberCounty', clean(prefill.memberCounty));
      params.set('ALW_County', clean(prefill.memberCounty));
    }
    if (clean(prefill.memberDob)) params.set('memberDob', clean(prefill.memberDob));
    if (clean(prefill.memberPhone)) params.set('memberPhone', clean(prefill.memberPhone));
    if (clean(prefill.memberEmail)) params.set('memberEmail', clean(prefill.memberEmail));
    if (clean(prefill.coverPageType)) params.set('ispCoverPageType', clean(prefill.coverPageType));
    if (clean(prefill.facilityName)) params.set('Facility_Name', clean(prefill.facilityName));
    if (clean(prefill.facilityAddress)) params.set('Facility_Address', clean(prefill.facilityAddress));
    if (clean(prefill.facilityType)) params.set('Facility_Type', clean(prefill.facilityType));
    if (clean(prefill.movedInDate)) params.set('Move_In_Date', clean(prefill.movedInDate));
    if (clean(effectiveLivingSituation)) params.set('Describe_Member_Living_Situation', clean(effectiveLivingSituation));
    if (clean(effectiveChangeOfCondition)) params.set('Change_of_Condition', clean(effectiveChangeOfCondition));
    if (clean(prefill.roomBoardAmount)) {
      params.set('Room_and_Board_Amount', normalizeMoneyAmount(prefill.roomBoardAmount));
    }
    if (clean(prefill.ispSocialWorker)) params.set('ISP_Social_Worker', clean(prefill.ispSocialWorker));
    if (clean(prefill.ispRn)) params.set('ISP_RN', clean(prefill.ispRn));
    if (clean(prefill.ispAssessmentDate)) params.set('ISP_Assessment_Date', clean(prefill.ispAssessmentDate));
    if (clean(effectiveKaiserRegion)) params.set('Kaiser_North_or_South', clean(effectiveKaiserRegion));
    if (clean(effectiveInAlwCounty)) params.set('In_ALW_County', clean(effectiveInAlwCounty));
    if (clean(effectiveAtAlwFacility)) params.set('At_ALW_Facility', clean(effectiveAtAlwFacility));
    if (clean(effectiveDidSubmitAlwApplication)) params.set('Did_Submit_ALW_Application', clean(effectiveDidSubmitAlwApplication));
    if (clean(effectiveOnAlwWaitlist)) params.set('On_ALW_Waitlist', clean(effectiveOnAlwWaitlist));
    if (clean(effectiveFacilityVetted)) params.set('Facility_Vetted_Contracted', clean(effectiveFacilityVetted));
    if (clean(effectiveRequestedTier)) params.set('Requested_Tier_Level', clean(effectiveRequestedTier));
    return params;
  }, [
    prefill,
    effectiveKaiserRegion,
    effectiveInAlwCounty,
    effectiveAtAlwFacility,
    effectiveDidSubmitAlwApplication,
    effectiveOnAlwWaitlist,
    effectiveFacilityVetted,
    effectiveRequestedTier,
    effectiveChangeOfCondition,
    effectiveLivingSituation,
  ]);

  const prefilledPreviewUrl = useMemo(() => {
    const query = mergedParams.toString();
    return `/api/forms/kaiser-isp-cover-sheet/template${query ? `?${query}` : ''}`;
  }, [mergedParams]);

  const buildDownloadUrl = (downloadLogId: string) => {
    const params = new URLSearchParams(mergedParams);
    params.set('download', '1');
    params.set('verified', '1');
    params.set('downloadLogId', downloadLogId);
    return `/api/forms/kaiser-isp-cover-sheet/template?${params.toString()}`;
  };

  const requiredFieldStatuses = useMemo(
    () => [
      { label: 'Member Name', value: memberName },
      { label: 'MRN/CIN', value: memberMrn },
      { label: 'Cell Phone Number', value: memberPhone },
      { label: 'County (currently live in / ALW_County)', value: memberCounty },
      { label: 'Kaiser Region', value: effectiveKaiserRegion },
      { label: 'Cover Sheet Type', value: coverPageTypeLabel },
      { label: 'Cover Sheet Type Verified', value: coverSheetTypeVerified ? 'Yes' : '' },
      { label: 'Tier Level (Step 1 Selection)', value: effectiveRequestedTier },
      { label: 'ISP Assessment Date', value: ispAssessmentDate },
      { label: 'ISP Social Worker', value: ispSocialWorker },
      { label: 'ISP RN', value: ispRn },
      { label: 'Current Living Situation', value: effectiveLivingSituation },
      { label: 'Facility Name', value: facilityName },
      { label: 'Facility Address', value: facilityAddress },
      { label: 'RCFE Prefill Verified', value: rcfeVerified ? 'Yes' : '' },
      {
        label: 'Client Financial Responsibility (Room & Board)',
        value: normalizeMoneyAmount(roomBoardAmount) || clean(roomBoardAmount),
      },
      {
        label: 'Client Financial Responsibility Verified',
        value: financialResponsibilityVerified ? 'Yes' : '',
      },
      { label: 'Did Submit ALW Application', value: effectiveDidSubmitAlwApplication },
      ...(normalizedCoverPageType === 'reauthorization'
        ? [
            { label: 'Date Member Moved Into Facility', value: movedInDate },
            { label: 'Has Member Had Change in Condition', value: effectiveChangeOfCondition },
            { label: 'Change in Condition Verified', value: changeConditionVerified ? 'Yes' : '' },
          ]
        : []),
    ],
    [
      memberName,
      memberMrn,
      memberPhone,
      memberCounty,
      effectiveKaiserRegion,
      coverPageTypeLabel,
      coverSheetTypeVerified,
      effectiveRequestedTier,
      ispAssessmentDate,
      ispSocialWorker,
      ispRn,
      effectiveLivingSituation,
      facilityName,
      facilityAddress,
      rcfeVerified,
      roomBoardAmount,
      financialResponsibilityVerified,
      effectiveDidSubmitAlwApplication,
      effectiveChangeOfCondition,
      changeConditionVerified,
      normalizedCoverPageType,
      movedInDate,
    ]
  );
  const optionalFieldStatuses = useMemo(
    () => [
      { label: 'ALW County Value', value: inAlwCounty },
      { label: 'At ALW Facility', value: effectiveAtAlwFacility },
      { label: 'On ALW Waitlist', value: effectiveOnAlwWaitlist },
      { label: 'Current Caspio Tier', value: effectiveCaspioTierLevel },
      ...(normalizedCoverPageType === 'reauthorization'
        ? []
        : [
            { label: 'Date Member Moved In', value: movedInDate },
            { label: 'Change in Condition', value: effectiveChangeOfCondition },
          ]),
      { label: 'Facility Vetted/Contracted', value: effectiveFacilityVetted },
      { label: 'Facility Type', value: facilityType },
      { label: 'Email', value: memberEmail },
    ],
    [
      inAlwCounty,
      effectiveAtAlwFacility,
      effectiveOnAlwWaitlist,
      effectiveCaspioTierLevel,
      effectiveChangeOfCondition,
      movedInDate,
      normalizedCoverPageType,
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

  useEffect(() => {
    const shouldRedirect =
      pathname.startsWith('/forms/kaiser-isp-cover-sheet/printable') ||
      pathname.startsWith('/admin/tools/kaiser-isp-cover-sheet/printable');
    if (!shouldRedirect) return;
    const query = searchParams.toString();
    const target = `/admin/tools/kaiser-isp-cover-sheet/kaiser-isp-cover-sheet${query ? `?${query}` : ''}`;
    router.replace(target);
  }, [pathname, router, searchParams]);

  const resolveCurrentUser = async (waitMs = 2500) => {
    if (user) return user;
    if (auth.currentUser) return auth.currentUser;
    const authAny = auth as any;
    if (typeof authAny?.authStateReady === 'function') {
      try {
        await Promise.race([
          authAny.authStateReady(),
          new Promise((resolve) => setTimeout(resolve, waitMs)),
        ]);
      } catch {
        // continue to fallback checks
      }
      if (auth.currentUser) return auth.currentUser;
    }
    return await new Promise<any>((resolve) => {
      let finished = false;
      const done = (user: any) => {
        if (finished) return;
        finished = true;
        resolve(user || null);
      };
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        if (user) {
          unsubscribe();
          done(user);
        }
      });
      setTimeout(() => {
        unsubscribe();
        done(auth.currentUser || null);
      }, waitMs);
    });
  };

  useEffect(() => {
    if (!showFilledPreview) {
      setVerificationChecked(false);
    }
  }, [showFilledPreview]);

  const handleDownloadPdf = async () => {
    if (!canGenerateActualPdf) return;
    if (!verificationChecked) {
      toast({
        title: 'Verification required',
        description: 'Please verify required fields before downloading.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoggingDownload(true);
    setLastDownloadName('');
    try {
      const currentUser = await resolveCurrentUser();
      const idToken = currentUser ? await currentUser.getIdToken() : '';
      const fallbackStaffName = clean(
        currentUser?.displayName ||
        user?.displayName ||
        auth.currentUser?.displayName ||
        searchParams.get('staffName') ||
        currentUser?.email ||
        user?.email ||
        auth.currentUser?.email
      );
      const fallbackStaffEmail = clean(
        currentUser?.email ||
        user?.email ||
        auth.currentUser?.email ||
        searchParams.get('staffEmail')
      ).toLowerCase();
      const logResponse = await fetch('/api/forms/kaiser-isp-cover-sheet/download-log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({
          memberName,
          memberMrn,
          memberClientId,
          coverPageType,
          verified: true,
          fallbackStaffName,
          fallbackStaffEmail,
        }),
      });
      const logBody = await logResponse.json().catch(() => ({}));
      if (!logResponse.ok || !logBody?.success) {
        throw new Error(String(logBody?.error || 'Failed to record download log'));
      }

      const loggedDownloadId = clean(logBody?.log?.id);
      if (!loggedDownloadId) {
        throw new Error('Missing download log id. Could not archive this form.');
      }

      const downloadName = clean(logBody?.log?.downloadName);
      const downloadUrl = buildDownloadUrl(loggedDownloadId);
      setLastDownloadName(downloadName ? `${downloadName}.pdf` : 'ISP cover sheet file');
      setTimeout(() => {
        window.location.href = downloadUrl;
      }, 60);
    } catch (error: any) {
      toast({
        title: 'Download blocked',
        description: String(error?.message || 'Could not verify/download this form.'),
        variant: 'destructive',
      });
    } finally {
      setIsLoggingDownload(false);
    }
  };

  const handleRefreshFromCaspio = async () => {
    const targetClientId = clean(prefill.memberClientId);
    if (!targetClientId) {
      toast({
        title: 'Client ID missing',
        description: 'Cannot refresh from Caspio without Client_ID2.',
        variant: 'destructive',
      });
      return;
    }

    setIsRefreshingFromCaspio(true);
    try {
      const response = await fetch('/api/kaiser-members?source=caspio&refresh=1', { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.success || !Array.isArray(body?.members)) {
        throw new Error(String(body?.error || 'Unable to fetch members from Caspio'));
      }

      const normalizedTarget = targetClientId.toLowerCase();
      const matched = (body.members as KaiserMemberLike[]).find((candidate) => {
        const candidateId = String(candidate?.Client_ID2 || candidate?.client_ID2 || '').trim().toLowerCase();
        return candidateId === normalizedTarget;
      });

      if (!matched) {
        throw new Error(`No Caspio member found for Client_ID2 ${targetClientId}.`);
      }

      const refreshedAlwSubmitted = getMemberValue(matched, ['Did_Submit_ALW_Application']);
      const refreshedFacilityAddress =
        composeAddress(
          getMemberValue(matched, ['RCFE_Address']),
          getMemberValue(matched, ['RCFE_City']),
          getMemberValue(matched, ['RCFE_State']),
          getMemberValue(matched, ['RCFE_Zip'])
        ) ||
        getMemberValue(matched, ['Facility_Address', 'ISP_Current_Address', 'RCFE_Address', 'Member_Address']);
      const refreshed = {
        memberName: toMemberDisplayName(matched) || prefill.memberName,
        memberMrn: clean((matched.memberMrn as string) || getMemberValue(matched, ['MCP_CIN', 'Member_MRN'])) || prefill.memberMrn,
        memberCounty:
          getMemberValue(matched, ['ALW_County', 'Alw_County', 'Member_County']) ||
          clean((matched.memberCounty as string) || '') ||
          prefill.memberCounty,
        memberDob: clean((matched.birthDate as string) || (matched.Birth_Date as string) || getMemberValue(matched, ['Birth_Date'])) || prefill.memberDob,
        memberPhone: clean((matched.memberPhone as string) || getMemberValue(matched, ['Best_Contact_Phone', 'Member_Phone'])) || prefill.memberPhone,
        memberEmail: clean((matched.memberEmail as string) || getMemberValue(matched, ['Member_Email'])) || prefill.memberEmail,
        facilityName: getMemberValue(matched, ['Facility_Name', 'ISP_Current_Location', 'RCFE_Name']) || prefill.facilityName,
        facilityAddress: refreshedFacilityAddress || prefill.facilityAddress,
        facilityType: getMemberValue(matched, ['Facility_Type']) || prefill.facilityType,
        movedInDate: getMemberValue(matched, ['Verified_Move_In_Date', 'Move_In_Date', 'Date_Member_Moved_Into_Facility']) || prefill.movedInDate,
        inAlwCounty: getMemberValue(matched, ['In_ALW_County']) || prefill.inAlwCounty,
        alwFacility: getMemberValue(matched, ['At_ALW_Facility']) || prefill.alwFacility,
        alwSubmitted: refreshedAlwSubmitted || prefill.alwSubmitted,
        alwWaitlist: getMemberValue(matched, ['On_ALW_Waitlist']) || prefill.alwWaitlist,
        facilityVetted: getMemberValue(matched, ['Facility_Vetted_Contracted']) || prefill.facilityVetted,
        roomBoardAmount:
          normalizeMoneyAmount(
            getMemberValue(matched, [
              'Room_and_Board_Amount',
              'Members_Financial_Responsibility',
              'Client_Financial_Responsibility',
              'Financial_Responsibility',
              'Expected_Room_Board_Payment',
            ])
          ) || normalizeMoneyAmount(prefill.roomBoardAmount),
        caspioTierLevel:
          getMemberValue(matched, ['Tiered_Level_of_Care', 'Requested_Tier_Level']) || prefill.caspioTierLevel,
        currentLivingSituation:
          getMemberValue(matched, ['Describe_Member_Living_Situation', 'Current_Living_Situation']) || prefill.currentLivingSituation,
        ispSocialWorker: getMemberValue(matched, ['ISP_Social_Worker', 'Social_Worker_Assigned']) || prefill.ispSocialWorker,
        ispRn: getMemberValue(matched, ['ISP_RN', 'RN_Assigned']) || prefill.ispRn,
        ispAssessmentDate: getMemberValue(matched, ['ISP_Assessment_Date']) || prefill.ispAssessmentDate,
        kaiserRegionRaw: getMemberValue(matched, ['Kaiser_North_or_South']) || prefill.kaiserRegionRaw,
      };

      setPrefill((prev) => ({ ...prev, ...refreshed }));
      setRcfeVerified(false);
      setFinancialResponsibilityVerified(false);
      setVerificationChecked(false);

      toast({
        title: 'Prefill refreshed',
        description: `Pulled latest Caspio values for Client_ID2 ${targetClientId}.`,
      });
    } catch (error: any) {
      toast({
        title: 'Refresh failed',
        description: String(error?.message || 'Unable to refresh this member from Caspio.'),
        variant: 'destructive',
      });
    } finally {
      setIsRefreshingFromCaspio(false);
    }
  };

  const handleStartOver = async () => {
    const currentUser = await resolveCurrentUser();
    const idToken = currentUser ? await currentUser.getIdToken() : '';
    setIsStartingOver(true);
    try {
      if (idToken) {
        await fetch('/api/forms/kaiser-isp-cover-sheet/download-log', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            eventType: 'start_over',
            memberName: prefill.memberName,
            memberClientId: prefill.memberClientId,
          }),
        }).catch(() => null);
      }

      setPrefill((prev) => ({
        ...prev,
        coverPageType: '',
        movedInDate: '',
        changeOfCondition: '',
        requestedTier: '',
      }));
      setCoverSheetTypeVerified(false);
      setRcfeVerified(false);
      setFinancialResponsibilityVerified(false);
      setChangeConditionVerified(false);
      setVerificationChecked(false);
      setLastDownloadName('');
      setShowFilledPreview(true);
      toast({
        title: 'Form reset',
        description: 'Step 1 selections were cleared. Start over is logged in activity.',
      });
    } finally {
      setIsStartingOver(false);
    }
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
        <Button
          variant="outline"
          type="button"
          onClick={handleRefreshFromCaspio}
          disabled={isRefreshingFromCaspio || !clean(memberClientId)}
        >
          {isRefreshingFromCaspio ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Refresh from Caspio
        </Button>
        <Button
          variant="outline"
          onClick={() => setShowFilledPreview((prev) => !prev)}
          disabled={!canGenerateActualPdf}
        >
          {showFilledPreview ? 'Hide Filled Preview' : 'View Filled Preview'}
        </Button>
        <Button
          variant="outline"
          type="button"
          onClick={() => void handleStartOver()}
          disabled={isStartingOver}
        >
          {isStartingOver ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Start Over
        </Button>
      </div>

      <Card className="print:hidden">
        <CardHeader>
          <CardTitle>Instructions</CardTitle>
          <CardDescription>Follow this sequence for a tracked download.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div>1) Select and verify cover sheet type, RCFE, and client financial responsibility (and confirm moved-in date for reauthorization).</div>
          <div>2) Check all required fields are present.</div>
          <div>3) See prefilled form below and verify print view.</div>
          <div>4) Verify before download.</div>
          <div>5) Download (tracked in directory).</div>
        </CardContent>
      </Card>

      <Card className="print:hidden">
        <CardHeader>
          <CardTitle>Step 1: Cover Sheet Selection & Verification</CardTitle>
          <CardDescription>Select Initial Authorization or Reauthorization on this page.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Cover Sheet Type (required)</span>
            <select
              className="w-full max-w-sm rounded border bg-white px-2 py-1"
              value={normalizedCoverPageType}
              onChange={(event) => {
                const nextValue = clean(event.target.value);
                const safeValue = nextValue === 'authorization' || nextValue === 'reauthorization' ? nextValue : '';
                setPrefill((prev) => ({ ...prev, coverPageType: safeValue }));
                setCoverSheetTypeVerified(false);
                setChangeConditionVerified(false);
                setPrefill((prev) => ({ ...prev, changeOfCondition: '' }));
                setVerificationChecked(false);
              }}
            >
              <option value="">Select cover sheet type</option>
              <option value="authorization">Initial Authorization</option>
              <option value="reauthorization">Reauthorization</option>
            </select>
          </label>
          {!normalizedCoverPageType ? (
            <p className="text-xs text-amber-700">
              Select one cover sheet type before previewing/downloading.
            </p>
          ) : (
            <div className="space-y-2">
              <label className="flex items-start gap-2 text-sm">
                <Checkbox
                  checked={coverSheetTypeVerified}
                  onCheckedChange={(checked) => setCoverSheetTypeVerified(checked === true)}
                />
                <span>
                  I verify the selected cover sheet type is correct:
                  <span className="ml-1 font-medium">{coverPageTypeLabel}</span>
                </span>
              </label>
              {normalizedCoverPageType ? (
                <div className="space-y-2">
                  <label className="space-y-1 text-sm">
                    <span className="font-medium">
                      What date did member move into facility?
                      {normalizedCoverPageType === 'reauthorization' ? ' (required for reauthorization)' : ' (optional for initial authorization)'}
                    </span>
                    <input
                      type="text"
                      value={prefill.movedInDate}
                      onChange={(event) =>
                        setPrefill((prev) => ({ ...prev, movedInDate: clean(event.target.value) }))
                      }
                      placeholder="MM/DD/YYYY (prefilled from Verified_Move_In_Date when available)"
                      className="w-full max-w-sm rounded border bg-white px-2 py-1"
                    />
                  </label>
                  {normalizedCoverPageType === 'reauthorization' ? (
                    <div className="space-y-2">
                      <label className="space-y-1 text-sm">
                        <span className="font-medium">Has member had change in condition? (required for reauthorization)</span>
                        <select
                          className="w-full max-w-2xl rounded border bg-white px-2 py-1"
                          value={effectiveChangeOfCondition}
                          onChange={(event) => {
                            setPrefill((prev) => ({ ...prev, changeOfCondition: clean(event.target.value) }));
                            setChangeConditionVerified(false);
                            setVerificationChecked(false);
                          }}
                        >
                          <option value="">Select one</option>
                          <option value={CHANGE_CONDITION_YES_OPTION}>{CHANGE_CONDITION_YES_OPTION}</option>
                          <option value={CHANGE_CONDITION_NO_OPTION}>{CHANGE_CONDITION_NO_OPTION}</option>
                        </select>
                      </label>
                      {effectiveChangeOfCondition ? (
                        <label className="flex items-start gap-2 text-sm">
                          <Checkbox
                            checked={changeConditionVerified}
                            onCheckedChange={(checked) => setChangeConditionVerified(checked === true)}
                          />
                          <span>
                            I verify the selected change in condition option is correct:
                            <span className="ml-1 font-medium">{effectiveChangeOfCondition}</span>
                          </span>
                        </label>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="space-y-1 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">Tier Level Requested (required)</span>
                      {normalizedCoverPageType === 'reauthorization' ? (
                        <span className="text-xs text-blue-700">
                          Tiered_Level_of_Care (if available): {effectiveCaspioTierLevel || 'Not available'}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        className="w-full max-w-sm rounded border bg-white px-2 py-1"
                        value={effectiveRequestedTier}
                        onChange={(event) =>
                          setPrefill((prev) => ({ ...prev, requestedTier: clean(event.target.value) }))
                        }
                      >
                        <option value="">Select tier level</option>
                        {TIER_OPTIONS.map((tier) => (
                          <option key={tier} value={tier}>
                            {tier}
                          </option>
                        ))}
                      </select>
                    </div>
                    {normalizedCoverPageType !== 'reauthorization' ? (
                      <div className="text-xs text-muted-foreground">
                        Current Caspio tier: {effectiveCaspioTierLevel || 'Not available'}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <div className="rounded border border-dashed bg-slate-50 p-3">
                <div className="mb-2 text-sm font-medium">Manual Prefill (if Caspio is missing values)</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="space-y-1 text-sm">
                    <span className="font-medium">Name of RCFE (Facility Name)</span>
                    <input
                      type="text"
                      value={prefill.facilityName}
                      onChange={(event) => {
                        setPrefill((prev) => ({ ...prev, facilityName: event.target.value }));
                        setRcfeVerified(false);
                        setVerificationChecked(false);
                      }}
                      placeholder="Enter RCFE name if missing"
                      className="w-full rounded border bg-white px-2 py-1"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="font-medium">RCFE Address (Facility Address)</span>
                    <input
                      type="text"
                      value={prefill.facilityAddress}
                      onChange={(event) => {
                        setPrefill((prev) => ({ ...prev, facilityAddress: event.target.value }));
                        setRcfeVerified(false);
                        setVerificationChecked(false);
                      }}
                      placeholder="Enter facility address if missing"
                      className="w-full rounded border bg-white px-2 py-1"
                    />
                  </label>
                  <label className="space-y-1 text-sm sm:col-span-2">
                    <span className="font-medium">
                      Client Financial Responsibility (Room &amp; Board Amount) (required)
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={prefill.roomBoardAmount}
                      onChange={(event) => {
                        setPrefill((prev) => ({ ...prev, roomBoardAmount: event.target.value }));
                        setFinancialResponsibilityVerified(false);
                        setVerificationChecked(false);
                      }}
                      onBlur={(event) => {
                        const normalized = normalizeMoneyAmount(event.target.value);
                        setPrefill((prev) => ({
                          ...prev,
                          roomBoardAmount: normalized || clean(event.target.value),
                        }));
                      }}
                      placeholder="e.g. $1000 or 1000 (from Caspio or enter manually)"
                      className="w-full rounded border bg-white px-2 py-1"
                    />
                    <span className="text-xs text-muted-foreground">
                      Accepts dollar amounts with or without a $ sign. Blur formats the value for the PDF.
                    </span>
                  </label>
                </div>
                {clean(prefill.roomBoardAmount) ? (
                  <label className="mt-3 flex items-start gap-2 text-sm">
                    <Checkbox
                      checked={financialResponsibilityVerified}
                      onCheckedChange={(checked) => {
                        setFinancialResponsibilityVerified(checked === true);
                        if (checked !== true) setVerificationChecked(false);
                      }}
                    />
                    <span>
                      I verify Client Financial Responsibility is correct:
                      <span className="ml-1 font-medium">
                        {normalizeMoneyAmount(prefill.roomBoardAmount) || clean(prefill.roomBoardAmount)}
                      </span>
                    </span>
                  </label>
                ) : (
                  <p className="mt-2 text-xs text-amber-700">
                    Enter Client Financial Responsibility (e.g. $1000 or 1000) and verify it before generating.
                  </p>
                )}
                {(clean(prefill.facilityName) || clean(prefill.facilityAddress)) ? (
                  <label className="mt-3 flex items-start gap-2 text-sm">
                    <Checkbox
                      checked={rcfeVerified}
                      onCheckedChange={(checked) => {
                        setRcfeVerified(checked === true);
                        if (checked !== true) setVerificationChecked(false);
                      }}
                    />
                    <span>
                      I verify the RCFE prefill is correct:
                      <span className="ml-1 font-medium">
                        {clean(prefill.facilityName) || 'No facility name'}{clean(prefill.facilityAddress) ? ` — ${clean(prefill.facilityAddress)}` : ''}
                      </span>
                    </span>
                  </label>
                ) : (
                  <p className="mt-2 text-xs text-amber-700">
                    RCFE name/address are required and must be verified before generating the form.
                  </p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="print:hidden">
        <CardHeader>
          <CardTitle>Step 2: Required Field Check</CardTitle>
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

      {showFilledPreview ? (
        <Card className="print:hidden">
          <CardHeader>
            <CardTitle>Step 3: Filled PDF Preview</CardTitle>
            <CardDescription>
              Review the completed form here. KP tier determination stays a dropdown. Use the tracked Download
              button above to save a fillable PDF.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <iframe
              title="Kaiser ISP filled preview"
              src={`${prefilledPreviewUrl}#toolbar=0&navpanes=0&scrollbar=1`}
              className="h-[900px] w-full rounded border"
            />
          </CardContent>
        </Card>
      ) : null}

      <Card className="print:hidden">
        <CardHeader>
          <CardTitle>Step 4: Verification Before Download</CardTitle>
          <CardDescription>
            Confirm you reviewed the filled preview/print view before downloading.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={verificationChecked}
              disabled={!showFilledPreview || !canGenerateActualPdf}
              onCheckedChange={(checked) => setVerificationChecked(checked === true)}
            />
            <span>
              I verified this form for accuracy and completeness. Download will be logged with member name,
              timestamp, and staff user.
            </span>
          </label>
          {!showFilledPreview ? (
            <p className="mt-2 text-xs text-amber-700">
              Open the filled preview first, then verify and download.
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">Step 5:</span>
            <Button
              variant="default"
              onClick={handleDownloadPdf}
              disabled={!canGenerateActualPdf || !verificationChecked || isLoggingDownload || isUserLoading}
            >
              {isLoggingDownload ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Download PDF
            </Button>
          </div>
          {lastDownloadName ? (
            <div className="rounded border border-green-200 bg-green-50 p-2 text-sm text-green-800">
              Download successful: <span className="font-medium">{lastDownloadName}</span>
              <span className="mx-1">•</span>
              <Link
                href="/admin/tools/kaiser-isp-cover-downloads"
                className="underline underline-offset-2 hover:text-green-900"
              >
                ISP Cover Downloads Page
              </Link>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="print:hidden">
        <CardHeader>
          <CardTitle>Downloaded Forms Directory</CardTitle>
          <CardDescription>Use the downloads page to search and review generated ISP cover files.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Link
            href="/admin/tools/kaiser-isp-cover-downloads"
            className="text-blue-700 underline underline-offset-2 hover:text-blue-900"
          >
            ISP Cover Downloads Page
          </Link>
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

