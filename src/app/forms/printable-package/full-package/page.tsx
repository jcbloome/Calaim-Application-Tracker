
'use client';

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { PrintableFullPackage } from '@/components/forms/PrintableFullPackage';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { generatePdfFromHtmlSections } from '@/lib/pdf/generatePdfFromHtmlSections';

function FullPackageContent() {
  const searchParams = useSearchParams();
  const memberName = searchParams.get('memberName') || '';
  const memberMrn = searchParams.get('memberMrn') || '';
  const applicationId = searchParams.get('applicationId') || '';
  const pathway = searchParams.get('pathway') as 'SNF Transition' | 'SNF Diversion' || 'SNF Transition';
  const isPdfView = String(searchParams.get('view') || '').toLowerCase() === 'pdf';
  const autoPrint = String(searchParams.get('autoprint') || '') === '1';

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
  const [autoPrintOpened, setAutoPrintOpened] = useState(false);

  const downloadPdf = () => {
    if (!pdfUrl) return;
    const fileName = `CalAIM_Complete_Package_${applicationId || 'form'}.pdf`;
    const a = document.createElement('a');
    a.href = pdfUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const openPdf = () => {
    if (!pdfUrl) return;
    window.open(pdfUrl, '_blank', 'noopener,noreferrer');
  };

  const openPdfAndPrint = () => {
    if (!pdfUrl) return;
    const w = window.open(pdfUrl, '_blank', 'noopener,noreferrer');
    if (!w) return;
    const timer = window.setInterval(() => {
      try {
        if (w.document?.readyState === 'complete') {
          window.clearInterval(timer);
          w.focus();
          w.print();
        }
      } catch {
        // ignore
      }
    }, 250);
    window.setTimeout(() => window.clearInterval(timer), 8000);
  };

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
        headerText: 'CalAIM Community Support Application',
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
    setAutoPrintOpened(false);
    return () => {
      setPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return '';
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPdfView, applicationId, memberMrn, memberName, pathway]);

  useEffect(() => {
    if (!isPdfView) return;
    if (!autoPrint) return;
    if (!pdfUrl || pdfLoading) return;
    if (autoPrintOpened) return;
    setAutoPrintOpened(true);
    openPdfAndPrint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPdfView, autoPrint, pdfUrl, pdfLoading, autoPrintOpened]);

  const viewerHref = useMemo(() => {
    const params = new URLSearchParams();
    if (memberName) params.set('memberName', memberName);
    if (memberMrn) params.set('memberMrn', memberMrn);
    if (applicationId) params.set('applicationId', applicationId);
    if (pathway) params.set('pathway', pathway);
    params.set('view', 'pdf');
    return `/forms/printable-package/full-package?${params.toString()}`;
  }, [memberName, memberMrn, applicationId, pathway]);

  const htmlHref = useMemo(() => {
    const params = new URLSearchParams();
    if (memberName) params.set('memberName', memberName);
    if (memberMrn) params.set('memberMrn', memberMrn);
    if (applicationId) params.set('applicationId', applicationId);
    if (pathway) params.set('pathway', pathway);
    return `/forms/printable-package/full-package?${params.toString()}`;
  }, [memberName, memberMrn, applicationId, pathway]);

  if (isPdfView) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-3">
        <div className="mb-4 flex items-center justify-end gap-2 rounded-md border bg-white p-3 print:hidden">
          <Button variant="outline" asChild>
            <Link href={htmlHref}>Back to editor</Link>
          </Button>
          <Button
            variant="outline"
            onClick={() => openPdfAndPrint()}
            disabled={!pdfUrl || pdfLoading}
          >
            {pdfLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating…
              </>
            ) : (
              'Print / Save PDF'
            )}
          </Button>
        </div>

        {/* Hidden capture DOM (source-of-truth for PDF generation) */}
        <div className="fixed left-[-100000px] top-0" style={{ width: '1024px' }}>
          <div ref={captureRef}>
            <PrintableFullPackage
              applicationData={applicationData}
              applicationId={applicationId}
              pathway={pathway}
              showPrintButton={false}
            />
          </div>
        </div>

        {pdfError ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{pdfError}</div> : null}

        {pdfUrl ? (
          <div className="rounded-md border bg-white">
            <iframe title="Full package PDF preview" src={pdfUrl} className="h-[85vh] w-full" />
          </div>
        ) : (
          <div className="rounded-md border bg-white p-6 text-sm text-muted-foreground">
            {pdfLoading ? 'Generating PDF preview…' : 'PDF preview not available yet.'}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div className="mb-2 flex items-center justify-end gap-2 rounded-md border bg-white p-3 print:hidden">
        <Button variant="outline" asChild>
          <Link href={viewerHref}>View PDF layout</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={`${viewerHref}&autoprint=1`}>Print / Save PDF</Link>
        </Button>
      </div>

      <PrintableFullPackage
        applicationData={applicationData}
        applicationId={applicationId}
        pathway={pathway}
        showPrintButton={false}
      />
    </div>
  );
}

export default function FullPackagePrintPage() {
  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      <main className="container mx-auto py-8 px-4 print:p-0">
        <Suspense fallback={<div className="flex justify-center items-center h-64">Loading...</div>}>
          <FullPackageContent />
        </Suspense>
        <div className="mt-4 text-center text-sm print:hidden">
          <Button asChild variant="outline">
            <Link href="/forms/printable-package/full-package?view=pdf">Open PDF Preview</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
