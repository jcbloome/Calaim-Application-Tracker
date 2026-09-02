'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

type PreviewPage = {
  pageNumber: number;
  dataUrl: string;
};

const isPdfUrl = (url: string, name?: string) => {
  const haystack = `${url} ${name || ''}`.toLowerCase();
  return /\.pdf(\?|#|$)/i.test(haystack) || haystack.includes('application/pdf');
};

const isImageUrl = (url: string, name?: string) => {
  const haystack = `${url} ${name || ''}`.toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp)(\?|#|$)/i.test(haystack);
};

async function loadPdfJs() {
  let pdfjs: any = null;
  try {
    const mod: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
    pdfjs = mod?.getDocument ? mod : mod?.default || mod;
  } catch {
    const mod: any = await import(
      /* webpackIgnore: true */ 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.530/legacy/build/pdf.min.mjs'
    );
    pdfjs = mod?.getDocument ? mod : mod?.default || mod;
  }
  if (pdfjs?.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc =
      'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.530/legacy/build/pdf.worker.min.mjs';
  }
  return pdfjs;
}

async function renderAllPdfPages(url: string): Promise<PreviewPage[]> {
  const pdfjs = await loadPdfJs();
  const loadingTask = pdfjs.getDocument({
    url,
    // Firebase Storage signed URLs need withCredentials false.
    withCredentials: false,
  });
  const pdf = await loadingTask.promise;
  const pages: PreviewPage[] = [];
  const total = Number(pdf.numPages || 0);

  for (let pageNumber = 1; pageNumber <= total; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.35 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) continue;
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: context, viewport }).promise;
    pages.push({
      pageNumber,
      dataUrl: canvas.toDataURL('image/jpeg', 0.92),
    });
  }

  return pages;
}

export function MultiPageFilePreview({
  url,
  name,
}: {
  url: string;
  name?: string;
}) {
  const [pages, setPages] = useState<PreviewPage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const pdf = isPdfUrl(url, name);
  const image = isImageUrl(url, name);

  useEffect(() => {
    let cancelled = false;
    if (!url || !pdf) {
      setPages([]);
      setLoading(false);
      setError('');
      return;
    }

    setLoading(true);
    setError('');
    setPages([]);

    void renderAllPdfPages(url)
      .then((nextPages) => {
        if (cancelled) return;
        if (!nextPages.length) {
          setError('Could not render PDF pages.');
          return;
        }
        setPages(nextPages);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setError(String(err?.message || 'Could not load all PDF pages.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [url, pdf]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          {pdf && pages.length > 0
            ? `Showing all ${pages.length} page${pages.length === 1 ? '' : 's'}`
            : pdf
              ? 'Loading document pages…'
              : 'Document preview'}
        </div>
        <Button type="button" variant="outline" size="sm" className="h-8" asChild>
          <a href={url} target="_blank" rel="noreferrer">
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            Open full file
          </a>
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded border bg-zinc-100 p-2">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={name || 'File preview'} className="mx-auto max-w-full rounded bg-white shadow" />
        ) : null}

        {pdf ? (
          loading ? (
            <div className="flex h-full min-h-[240px] items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Rendering all pages…
            </div>
          ) : error ? (
            <div className="space-y-3 p-3 text-sm">
              <div className="text-red-700">{error}</div>
              <iframe
                src={`${url}#view=FitH`}
                title={name || 'PDF preview'}
                className="h-[65vh] w-full rounded border bg-white"
              />
            </div>
          ) : (
            <div className="space-y-4">
              {pages.map((page) => (
                <div key={page.pageNumber} className="rounded border bg-white p-2 shadow-sm">
                  <div className="mb-2 text-center text-[11px] font-medium text-zinc-600">
                    Page {page.pageNumber} of {pages.length}
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={page.dataUrl}
                    alt={`Page ${page.pageNumber}`}
                    className="mx-auto h-auto w-full max-w-[860px]"
                  />
                </div>
              ))}
            </div>
          )
        ) : null}

        {!pdf && !image ? (
          <iframe
            src={url}
            title={name || 'File preview'}
            className="h-[65vh] w-full rounded border bg-white"
          />
        ) : null}
      </div>
    </div>
  );
}
