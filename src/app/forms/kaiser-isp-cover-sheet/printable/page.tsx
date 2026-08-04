'use client';

import React, { Suspense, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

function clean(value: string | null) {
  return String(value || '').trim();
}

function KaiserIspCoverSheetPrintableContent() {
  const searchParams = useSearchParams();
  const returnTo = clean(searchParams.get('returnTo')) || '/admin/tools/kaiser-isp-cover-sheet';
  const memberName = clean(searchParams.get('memberName'));
  const memberMrn = clean(searchParams.get('memberMrn'));
  const memberClientId = clean(searchParams.get('memberClientId'));
  const memberCounty = clean(searchParams.get('memberCounty'));
  const coverPageType = clean(searchParams.get('ispCoverPageType'));
  const coverPageTypeLabel =
    coverPageType === 'reauthorization'
      ? 'Reauthorization Cover Page'
      : coverPageType === 'authorization'
        ? 'Authorization Cover Page'
        : '';

  const templateUrl = useMemo(() => {
    const params = new URLSearchParams();
    searchParams.forEach((value, key) => {
      if (key === 'download') return;
      if (!clean(value)) return;
      params.set(key, value);
    });
    const query = params.toString();
    return `/api/forms/kaiser-isp-cover-sheet/template${query ? `?${query}` : ''}`;
  }, [searchParams]);

  const downloadUrl = useMemo(() => {
    const params = new URLSearchParams();
    searchParams.forEach((value, key) => {
      if (!clean(value)) return;
      params.set(key, value);
    });
    params.set('download', '1');
    return `/api/forms/kaiser-isp-cover-sheet/template?${params.toString()}`;
  }, [searchParams]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div className="rounded-md border bg-white p-3 print:hidden">
        <h1 className="text-lg font-semibold text-slate-900">Kaiser ISP Cover Sheet</h1>
      </div>

      <div className="mb-2 flex items-center justify-end gap-2 rounded-md border bg-white p-3 print:hidden">
        <Button variant="outline" asChild>
          <Link href={returnTo}>Back to ISP Tool</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={templateUrl} target="_blank" rel="noopener noreferrer">
            View / Print PDF
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={downloadUrl}>Download PDF</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Prefill Preview</CardTitle>
          <CardDescription>
            This page uses the same PDF output pattern as the Kaiser referral generator.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <div><span className="font-medium">Cover Sheet Type:</span> {coverPageTypeLabel || 'Missing - go back and select one'}</div>
          <div><span className="font-medium">Member:</span> {memberName || 'N/A'}</div>
          <div><span className="font-medium">MRN/CIN:</span> {memberMrn || 'N/A'}</div>
          <div><span className="font-medium">Client_ID2:</span> {memberClientId || 'N/A'}</div>
          <div><span className="font-medium">County:</span> {memberCounty || 'N/A'}</div>
          <div><span className="font-medium">Kaiser Region:</span> {clean(searchParams.get('Kaiser_North_or_South')) || 'N/A'}</div>
          <div><span className="font-medium">ISP Assessment Date:</span> {clean(searchParams.get('ISP_Assessment_Date')) || 'N/A'}</div>
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

