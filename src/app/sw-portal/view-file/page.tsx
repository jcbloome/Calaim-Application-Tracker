'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

const ALLOWED_HOSTS = new Set(['firebasestorage.googleapis.com']);

function isAllowedDocumentUrl(raw: string) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return false;
    return ALLOWED_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

function SwViewFileContent() {
  const searchParams = useSearchParams();
  const src = String(searchParams?.get('src') || '').trim();
  const title = String(searchParams?.get('title') || 'Document').trim() || 'Document';
  const defaultRotate = String(searchParams?.get('rotate') || '1') !== '0';
  const [rotated, setRotated] = useState(defaultRotate);

  const allowed = useMemo(() => isAllowedDocumentUrl(src), [src]);

  if (!src || !allowed) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">This document link is missing or not allowed.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/sw-portal/home">Back to portal</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-slate-100">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b bg-background px-3 py-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/sw-portal/home">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Link>
        </Button>
        <div className="min-w-0 flex-1 truncate text-sm font-medium">{title}</div>
        <Button type="button" variant="outline" size="sm" onClick={() => setRotated((v) => !v)}>
          <RotateCw className="mr-2 h-4 w-4" />
          {rotated ? 'Portrait scroll' : 'Rotate wide view'}
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href={src} target="_blank" rel="noreferrer">
            Open original
          </a>
        </Button>
      </div>

      {rotated ? (
        <div className="relative flex-1 overflow-auto p-2">
          <p className="mb-2 text-center text-xs text-muted-foreground">
            Wide table rotated for phone portrait — scroll to read, or turn your device sideways.
          </p>
          <div className="mx-auto flex min-h-[70vh] w-full max-w-[100vw] items-start justify-center overflow-auto">
            <div
              className="origin-top-left"
              style={{
                transform: 'rotate(90deg) translateY(-100%)',
                width: '100vh',
                height: '100vw',
                maxWidth: 'none',
              }}
            >
              <iframe
                src={src}
                title={title}
                className="h-full w-full border-0 bg-white shadow-sm"
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 p-2">
          <iframe src={src} title={title} className="h-[calc(100vh-8rem)] w-full border-0 bg-white shadow-sm" />
        </div>
      )}
    </div>
  );
}

export default function SwViewFilePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <SwViewFileContent />
    </Suspense>
  );
}
