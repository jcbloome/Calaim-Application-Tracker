'use client';

import { ReactNode, RefObject, useRef } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Loader2, Printer } from 'lucide-react';

type PdfPreviewLayoutProps = {
  isPdfView: boolean;
  viewPdfHref: string;
  backToEditorHref: string;
  backButtonLabel?: string;
  showBackButtonInHtmlView?: boolean;
  showDownloadButtonInPdfView?: boolean;
  showDownloadButtonInHtmlView?: boolean;
  printHref?: string;
  captureRef: RefObject<HTMLDivElement>;
  captureContent: ReactNode;
  htmlContent: ReactNode;
  pdfUrl: string;
  pdfLoading: boolean;
  pdfError?: string;
  loadingText?: string;
  previewTitle?: string;
  wrapperClassName?: string;
  htmlWrapperClassName?: string;
  captureWidthPx?: number;
};

export function PdfPreviewLayout({
  isPdfView,
  viewPdfHref,
  backToEditorHref,
  backButtonLabel = 'Back to editor',
  showBackButtonInHtmlView = false,
  showDownloadButtonInPdfView = true,
  showDownloadButtonInHtmlView = true,
  printHref,
  captureRef,
  captureContent,
  htmlContent,
  pdfUrl,
  pdfLoading,
  pdfError,
  loadingText = 'Generating PDF preview…',
  previewTitle = 'PDF preview',
  wrapperClassName = 'mx-auto w-full max-w-6xl space-y-3 p-4',
  htmlWrapperClassName = 'mx-auto w-full max-w-5xl space-y-4',
  captureWidthPx = 1120,
}: PdfPreviewLayoutProps) {
  const previewFrameRef = useRef<HTMLIFrameElement>(null);

  const handleDownloadPdf = () => {
    if (!pdfUrl) return;
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = `${previewTitle.replace(/[^a-z0-9]/gi, '_')}.pdf`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isPdfView) {
    return (
      <div className={wrapperClassName}>
        <div className="mb-2 rounded-md border bg-white p-3 print:hidden">
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" asChild>
              <Link href={backToEditorHref}>{backButtonLabel}</Link>
            </Button>
            {showDownloadButtonInPdfView ? (
              <Button variant="outline" onClick={handleDownloadPdf} disabled={!pdfUrl || pdfLoading}>
                {pdfLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <Printer className="mr-2 h-4 w-4" />
                    Download PDF
                  </>
                )}
              </Button>
            ) : null}
          </div>
          {showDownloadButtonInPdfView && pdfUrl && !pdfLoading ? (
            <div className="mt-2 text-xs text-muted-foreground text-right">
              Tip: Use the PDF viewer controls below to print directly from your browser
            </div>
          ) : null}
        </div>

        <div className="fixed left-[-100000px] top-0" style={{ width: `${captureWidthPx}px` }}>
          <div ref={captureRef}>{captureContent}</div>
        </div>

        {pdfError ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{pdfError}</div> : null}

        {pdfUrl ? (
          <div className="rounded-md border bg-white">
            <iframe ref={previewFrameRef} title={previewTitle} src={pdfUrl} className="h-[85vh] w-full" />
          </div>
        ) : (
          <div className="rounded-md border bg-white p-6 text-sm text-muted-foreground">{loadingText}</div>
        )}
      </div>
    );
  }

  return (
    <div className={htmlWrapperClassName}>
      <div className="mb-2 flex items-center justify-end gap-2 rounded-md border bg-white p-3 print:hidden">
        {showBackButtonInHtmlView ? (
          <Button variant="outline" asChild>
            <Link href={backToEditorHref}>{backButtonLabel}</Link>
          </Button>
        ) : null}
        <Button variant="outline" asChild>
          <Link href={viewPdfHref}>View PDF layout</Link>
        </Button>
        {showDownloadButtonInHtmlView ? (
          <Button variant="outline" asChild>
            <Link href={printHref || viewPdfHref}>Download PDF</Link>
          </Button>
        ) : null}
      </div>
      {htmlContent}
    </div>
  );
}

