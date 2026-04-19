'use client';

import React, { Suspense, useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { PrintableKaiserReferralForm } from '@/components/forms/PrintableKaiserReferralForm';
import { Button } from '@/components/ui/button';

const KAISER_NORTH_INTAKE_EMAIL = 'REGMCDURNs-KPNC@KP.org';
const KAISER_SOUTH_INTAKE_EMAIL = 'RegCareCoordCaseMgmt@KP.org';

function normalizeCountyName(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ county$/i, '')
    .replace(/[^a-z]/g, '');
}

function getKaiserRegionFromCounty(county: unknown): 'Kaiser North' | 'Kaiser South' | '' {
  const normalized = normalizeCountyName(county);
  if (!normalized) return '';

  const kaiserNorthCounties = new Set([
    'alameda', 'contracosta', 'marin', 'napa', 'sanfrancisco', 'sanmateo', 'santaclara', 'solano', 'sonoma',
    'sacramento', 'yolo', 'placer', 'eldorado', 'sutter', 'yuba', 'amador', 'nevada',
    'sanjoaquin', 'stanislaus', 'merced', 'madera', 'fresno', 'kings',
    'butte', 'shasta', 'tehama', 'glenn', 'colusa', 'humboldt', 'delnorte', 'siskiyou', 'trinity',
    'mendocino', 'lake', 'lassen', 'modoc', 'plumas',
  ]);

  return kaiserNorthCounties.has(normalized) ? 'Kaiser North' : 'Kaiser South';
}

function KaiserReferralPrintableContent() {
  const searchParams = useSearchParams();
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [hasReviewedPdfPreview, setHasReviewedPdfPreview] = useState(false);

  const formPrefill = useMemo(
    () => ({
      applicationId: searchParams.get('applicationId') || '',
      userId: searchParams.get('userId') || '',
      memberName: searchParams.get('memberName') || '',
      memberDob: searchParams.get('memberDob') || '',
      memberPhone: searchParams.get('memberPhone') || '',
      memberEmail: searchParams.get('memberEmail') || '',
      memberAddress: searchParams.get('memberAddress') || '',
      memberMrn: searchParams.get('memberMrn') || '',
      memberMediCal: searchParams.get('memberMediCal') || '',
      caregiverName: searchParams.get('caregiverName') || '',
      caregiverContact: searchParams.get('caregiverContact') || '',
      referralDate: searchParams.get('referralDate') || '',
      referrerName: searchParams.get('referrerName') || '',
      referrerOrganization: searchParams.get('referrerOrganization') || '',
      referrerNpi: searchParams.get('referrerNpi') || '',
      referrerAddress: searchParams.get('referrerAddress') || '',
      referrerEmail: searchParams.get('referrerEmail') || '',
      referrerPhone: searchParams.get('referrerPhone') || '',
      referrerRelationship: searchParams.get('referrerRelationship') || '',
      currentLocationName: searchParams.get('currentLocationName') || '',
      currentLocationAddress: searchParams.get('currentLocationAddress') || '',
      healthPlan: searchParams.get('healthPlan') || '',
      memberCounty: searchParams.get('memberCounty') || '',
      alft21Choice: searchParams.get('alft21Choice') || '',
      alft22Choice: searchParams.get('alft22Choice') || '',
      kaiserAuthAlreadyReceived: searchParams.get('kaiserAuthAlreadyReceived') || '',
      kaiserReferralSubmittedAtIso: searchParams.get('kaiserReferralSubmittedAtIso') || '',
      returnTo: searchParams.get('returnTo') || '',
    }),
    [searchParams]
  );

  const pathwayHref = useMemo(() => {
    if (formPrefill.returnTo) {
      return formPrefill.returnTo;
    }
    if (formPrefill.applicationId) {
      return `/pathway?applicationId=${encodeURIComponent(formPrefill.applicationId)}`;
    }
    return '/applications';
  }, [formPrefill.applicationId, formPrefill.returnTo]);

  const printableProps = useMemo(() => {
    return {
      applicationId: formPrefill.applicationId,
      userId: formPrefill.userId,
      memberName: formPrefill.memberName,
      memberDob: formPrefill.memberDob,
      memberPhone: formPrefill.memberPhone,
      memberEmail: formPrefill.memberEmail,
      memberAddress: formPrefill.memberAddress,
      memberMrn: formPrefill.memberMrn,
      memberMediCal: formPrefill.memberMediCal,
      caregiverName: formPrefill.caregiverName,
      caregiverContact: formPrefill.caregiverContact,
      referralDate: formPrefill.referralDate,
      referrerName: formPrefill.referrerName,
      referrerOrganization: formPrefill.referrerOrganization,
      referrerNpi: formPrefill.referrerNpi,
      referrerAddress: formPrefill.referrerAddress,
      referrerEmail: formPrefill.referrerEmail,
      referrerPhone: formPrefill.referrerPhone,
      referrerRelationship: formPrefill.referrerRelationship,
      currentLocationName: formPrefill.currentLocationName,
      currentLocationAddress: formPrefill.currentLocationAddress,
      healthPlan: formPrefill.healthPlan,
      memberCounty: formPrefill.memberCounty,
    };
  }, [formPrefill]);

  const kaiserRegion = useMemo(() => getKaiserRegionFromCounty(printableProps.memberCounty), [printableProps.memberCounty]);
  const kaiserIntakeEmail = kaiserRegion === 'Kaiser North' ? KAISER_NORTH_INTAKE_EMAIL : KAISER_SOUTH_INTAKE_EMAIL;

  const [alft21Choice, setAlft21Choice] = useState<'A' | 'B'>(
    formPrefill.alft21Choice === 'B' ? 'B' : 'A'
  );
  const [alft22Choice, setAlft22Choice] = useState<'A' | 'B' | 'C' | ''>(
    formPrefill.alft22Choice === 'A' || formPrefill.alft22Choice === 'B' || formPrefill.alft22Choice === 'C'
      ? (formPrefill.alft22Choice as 'A' | 'B' | 'C')
      : (String(formPrefill.currentLocationName || '').trim() || String(formPrefill.currentLocationAddress || '').trim())
        ? 'C'
        : ''
  );
  const [section1AlfUsage, setSection1AlfUsage] = useState<'yes' | 'no' | ''>(() => {
    const raw = String(searchParams.get('section1AlfUsage') || '').trim().toLowerCase();
    if (raw === 'yes' || raw === 'no') return raw;
    return '';
  });
  const hasRequiredLocation = Boolean(alft22Choice);
  const hasRequiredSection1Usage = section1AlfUsage === 'yes' || section1AlfUsage === 'no';
  const hasRequiredSelectionsForPdf = hasRequiredLocation && hasRequiredSection1Usage;
  const requiresKaiserReferralSendFlow = !['1', 'true', 'yes'].includes(
    String(formPrefill.kaiserAuthAlreadyReceived || '').trim().toLowerCase()
  );

  const buildTemplateUrl = useCallback(
    (download = false) => {
      const params = new URLSearchParams();
      if (download) params.set('download', '1');
      for (const [key, value] of Object.entries(printableProps)) {
        const text = String(value || '').trim();
        if (!text) continue;
        params.set(key, text);
      }
      params.set('alft21Choice', alft21Choice);
      if (alft22Choice) {
        params.set('alft22Choice', alft22Choice);
      }
      if (section1AlfUsage) {
        params.set('section1AlfUsage', section1AlfUsage);
      }
      const query = params.toString();
      return `/api/forms/kaiser-referral/template${query ? `?${query}` : ''}`;
    },
    [alft21Choice, alft22Choice, section1AlfUsage, printableProps]
  );

  const openExternalPdfUrl = useCallback((url: string) => {
    try {
      if (window.desktopNotificationPill?.open) {
        window.desktopNotificationPill.open(url);
        return;
      }
    } catch {
      // fall through
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  const handleViewPdf = useCallback(async () => {
    if (!alft22Choice) {
      window.alert('Section 2.2 is required: select where the member is currently living.');
      return;
    }
    if (!section1AlfUsage) {
      window.alert('Section 1 Current Service Usage is required: select Yes or No for Assisted Living Facility Transitions.');
      return;
    }
    setIsGeneratingPdf(true);
    try {
      const absoluteUrl = `${window.location.origin}${buildTemplateUrl(false)}`;
      openExternalPdfUrl(absoluteUrl);
      setHasReviewedPdfPreview(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate PDF.';
      window.alert(message);
    } finally {
      setIsGeneratingPdf(false);
    }
  }, [alft22Choice, section1AlfUsage, buildTemplateUrl, openExternalPdfUrl]);

  const handleDownloadPdf = useCallback(async () => {
    if (!alft22Choice) {
      window.alert('Section 2.2 is required: select where the member is currently living.');
      return;
    }
    if (!section1AlfUsage) {
      window.alert('Section 1 Current Service Usage is required: select Yes or No for Assisted Living Facility Transitions.');
      return;
    }
    setIsGeneratingPdf(true);
    try {
      const link = document.createElement('a');
      link.href = buildTemplateUrl(true);
      link.download = '';
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to download PDF.';
      window.alert(message);
    } finally {
      setIsGeneratingPdf(false);
    }
  }, [alft22Choice, section1AlfUsage, buildTemplateUrl]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div className="rounded-md border bg-white p-3 print:hidden">
        <h1 className="text-lg font-semibold text-slate-900">Kaiser Authorization Request Template</h1>
      </div>
      <div className="mb-2 flex items-center justify-end gap-2 rounded-md border bg-white p-3 print:hidden">
        <Button variant="outline" asChild>
          <Link href={pathwayHref}>Back to Application Pathway</Link>
        </Button>
      </div>
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800 print:hidden">
        <div className="font-medium">Flow Status (Before Step 1)</div>
        <div className="mt-1 text-xs text-muted-foreground">
          Detected region: {kaiserRegion || 'Kaiser South'} ({kaiserIntakeEmail})
        </div>
        {!requiresKaiserReferralSendFlow ? (
          <div className="mt-1 text-xs text-slate-700">
            Authorization already received at intake. Referral send steps (Step 3-5) are not required.
          </div>
        ) : null}
        <div className="mt-1 text-xs text-emerald-700">
          Staff reminder: Section 2.2 <span className="font-semibold">Where member is currently living</span> is required before sending.
          {hasRequiredLocation ? ' (Completed)' : ' (Please complete)'}
        </div>
        {!hasReviewedPdfPreview ? (
          <div className="mt-1 text-xs text-amber-700">
            PDF preview required: complete Step 2 View PDF before continuing.
          </div>
        ) : null}
        {!hasRequiredSection1Usage ? (
          <div className="mt-1 text-xs text-amber-700">
            Section 1 current service usage is required: choose Yes/No for Assisted Living Facility Transitions.
          </div>
        ) : null}
      </div>
      <div className="rounded-md border bg-amber-50 p-3 text-sm print:hidden">
        <div className="font-medium text-amber-900">Step 1: Complete required Kaiser fields</div>
        <div className="mt-1 text-xs text-amber-900">
          Select required values before moving to PDF review.
        </div>
        <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-medium text-amber-900">2.1 Service requested</span>
            <select
              className="w-full rounded border bg-white px-2 py-1"
              value={alft21Choice}
              onChange={(e) => setAlft21Choice((e.target.value === 'B' ? 'B' : 'A'))}
            >
              <option value="A">A - Time-Limited transition services and expenses</option>
              <option value="B">B - Ongoing ALF services</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-amber-900">2.2 Current living location</span>
            <select
              className="w-full rounded border bg-white px-2 py-1"
              value={alft22Choice}
              onChange={(e) => {
                const next = e.target.value;
                if (next === 'A' || next === 'B' || next === 'C') setAlft22Choice(next);
                else setAlft22Choice('');
              }}
            >
              <option value="">Select one...</option>
              <option value="A">A - Skilled Nursing Facility (SNF)</option>
              <option value="B">B - At home or in public subsidized housing</option>
              <option value="C">C - In an Assisted Living Facility / Board and Care</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-amber-900">
              1) Current service usage: Assisted Living Facility Transitions
            </span>
            <select
              className="w-full rounded border bg-white px-2 py-1"
              value={section1AlfUsage}
              onChange={(e) => {
                const next = e.target.value;
                if (next === 'yes' || next === 'no') setSection1AlfUsage(next);
                else setSection1AlfUsage('');
              }}
            >
              <option value="">Select one...</option>
              <option value="no">No (initial referral)</option>
              <option value="yes">Yes (reauthorization)</option>
            </select>
          </label>
        </div>
        <div className="mt-2 text-xs text-amber-900">
          Always enforced: External referral by = <strong>Other, please specify</strong>, and attestation = <strong>checked</strong>.
        </div>
      </div>
      <PrintableKaiserReferralForm
        {...printableProps}
        showPrintButton={false}
        hasReviewedPdfPreview={hasReviewedPdfPreview}
        onOpenPdfPreview={handleViewPdf}
        onDownloadPdfPreview={handleDownloadPdf}
        isGeneratingPdfPreview={isGeneratingPdf}
        isPdfPreviewStepEnabled={hasRequiredSelectionsForPdf}
        requiresKaiserReferralSendFlow={requiresKaiserReferralSendFlow}
        initialStep5AcknowledgedAtIso={formPrefill.kaiserReferralSubmittedAtIso}
        requiredAlft22Choice={alft22Choice}
        requiredSection1AlfUsage={section1AlfUsage}
      />
    </div>
  );
}

export default function KaiserReferralPrintablePage() {
  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      <main className="container mx-auto py-8 px-4 print:p-0">
        <Suspense fallback={<div className="flex h-64 items-center justify-center">Loading...</div>}>
          <KaiserReferralPrintableContent />
        </Suspense>
      </main>
    </div>
  );
}

