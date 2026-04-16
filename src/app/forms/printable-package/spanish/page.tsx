'use client';

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { PrintableFullPackageSpanish } from '@/components/forms/PrintableFullPackageSpanish';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { generatePdfFromHtmlSections } from '@/lib/pdf/generatePdfFromHtmlSections';
import { PdfPreviewLayout } from '@/components/pdf/PdfPreviewLayout';

function SpanishFullPackageContent() {
  const searchParams = useSearchParams();
  const memberName = searchParams.get('memberName') || '';
  const memberMrn = searchParams.get('memberMrn') || '';
  const applicationId = searchParams.get('applicationId') || '';
  const pathway = searchParams.get('pathway') as 'SNF Transition' | 'SNF Diversion' || 'SNF Transition';
  const isPdfView = String(searchParams.get('view') || '').toLowerCase() === 'pdf';

  // Create application data from URL params
  const applicationData = {
    memberFirstName: memberName.split(' ')[0] || '',
    memberLastName: memberName.split(' ').slice(1).join(' ') || '',
    memberMrn: memberMrn
  };

  const captureRef = useRef<HTMLDivElement>(null);
  const [pdfUrl, setPdfUrl] = useState<string>('');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string>('');

  const generatePreviewPdf = async () => {
    if (!captureRef.current) return;
    setPdfLoading(true);
    setPdfError('');
    try {
      const sections = Array.from(
        captureRef.current.querySelectorAll('.printable-package-section')
      ) as HTMLElement[];
      const bytes = await generatePdfFromHtmlSections(sections, {
        stampPageNumbers: true,
        headerText: 'Solicitud de Apoyo Comunitario CalAIM',
        options: { marginIn: 0.5, scale: 2, format: 'letter', orientation: 'portrait' },
      });
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch (e: any) {
      setPdfError(String(e?.message || 'Could not generate PDF preview.'));
      setPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return '';
      });
    } finally {
      setPdfLoading(false);
    }
  };

  useEffect(() => {
    if (!isPdfView) return;
    void generatePreviewPdf();
    return () => {
      setPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return '';
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPdfView, applicationId, memberMrn, memberName, pathway]);

  const viewerHref = useMemo(() => {
    const params = new URLSearchParams();
    if (memberName) params.set('memberName', memberName);
    if (memberMrn) params.set('memberMrn', memberMrn);
    if (applicationId) params.set('applicationId', applicationId);
    if (pathway) params.set('pathway', pathway);
    params.set('view', 'pdf');
    return `/forms/printable-package/spanish?${params.toString()}`;
  }, [memberName, memberMrn, applicationId, pathway]);

  const htmlHref = useMemo(() => {
    const params = new URLSearchParams();
    if (memberName) params.set('memberName', memberName);
    if (memberMrn) params.set('memberMrn', memberMrn);
    if (applicationId) params.set('applicationId', applicationId);
    if (pathway) params.set('pathway', pathway);
    return `/forms/printable-package/spanish?${params.toString()}`;
  }, [memberName, memberMrn, applicationId, pathway]);

  return (
    <PdfPreviewLayout
      isPdfView={isPdfView}
      viewPdfHref={viewerHref}
      backToEditorHref={htmlHref}
      printHref={viewerHref}
      captureRef={captureRef}
      captureContent={
        <PrintableFullPackageSpanish
          applicationData={applicationData}
          applicationId={applicationId}
          pathway={pathway}
          showPrintButton={false}
        />
      }
      htmlContent={
        <PrintableFullPackageSpanish
          applicationData={applicationData}
          applicationId={applicationId}
          pathway={pathway}
          showPrintButton={false}
        />
      }
      pdfUrl={pdfUrl}
      pdfLoading={pdfLoading}
      pdfError={pdfError}
      previewTitle="Spanish full package PDF preview"
      loadingText={pdfLoading ? 'Generating PDF preview…' : 'PDF preview not available yet.'}
      wrapperClassName="mx-auto w-full max-w-5xl space-y-3"
      htmlWrapperClassName="mx-auto w-full max-w-5xl space-y-4"
      captureWidthPx={1024}
    />
  );
}

export default function SpanishFullPackagePrintPage() {
  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      <main className="container mx-auto py-8 px-4 print:p-0">
        <Suspense fallback={<div className="flex justify-center items-center h-64">Loading...</div>}>
          <SpanishFullPackageContent />
        </Suspense>
        <div className="mt-4 text-center text-sm print:hidden">
          <Button asChild variant="outline">
            <Link href="/forms/printable-package/spanish?view=pdf">Open PDF Preview</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}