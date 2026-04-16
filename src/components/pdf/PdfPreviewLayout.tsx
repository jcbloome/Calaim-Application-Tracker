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

  const handlePrintFromPreview = () => {
    const frameWindow = previewFrameRef.current?.contentWindow || null;
    if (frameWindow) {
      try {
        frameWindow.focus();
        frameWindow.print();
        return;
      } catch {
        // fall through to popup fallback
      }
    }

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

  if (isPdfView) {
    return (
      <div className={wrapperClassName}>
        <div className="mb-2 flex items-center justify-end gap-2 rounded-md border bg-white p-3 print:hidden">
          <Button variant="outline" asChild>
            <Link href={backToEditorHref}>{backButtonLabel}</Link>
          </Button>
          <Button variant="outline" onClick={handlePrintFromPreview} disabled={!pdfUrl || pdfLoading}>
            {pdfLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Printer className="mr-2 h-4 w-4" />
                Print / Save PDF
              </>
            )}
          </Button>
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
        <Button variant="outline" asChild>
          <Link href={printHref || viewPdfHref}>Print / Save PDF</Link>
        </Button>
      </div>
      {htmlContent}
    </div>
  );
}

