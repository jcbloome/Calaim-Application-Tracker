'use client';

import React, { useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { SWTopNav } from '@/components/sw/SWTopNav';

export default function SWVisitVerificationError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('SW visit verification error:', error);
  }, [error]);

  const hardReload = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.location.reload();
  }, []);

  const clearCacheAndReload = useCallback(async () => {
    if (typeof window === 'undefined') return;
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      // Best-effort: clear Cache Storage (helps with stale chunk errors).
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {
      // ignore
    } finally {
      window.location.reload();
    }
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="bg-white/80 backdrop-blur border-b">
        <div className="container mx-auto px-4 py-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Link href="/" className="text-sm font-semibold text-gray-900">
            Connect CalAIM
          </Link>
          <SWTopNav className="justify-start md:justify-end" />
        </div>
      </div>

      <div className="container mx-auto px-4 py-10">
        <div className="max-w-xl mx-auto rounded-lg border bg-white p-6 space-y-4 shadow-sm">
          <div className="text-lg font-semibold text-gray-900">Something went wrong</div>
          <div className="text-sm text-muted-foreground">
            This can happen after a deploy if your browser has a stale cached script. Try reload first, or clear cache and reload.
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={reset}>Try again</Button>
            <Button variant="outline" onClick={hardReload}>
              Reload page
            </Button>
            <Button variant="outline" onClick={() => void clearCacheAndReload()}>
              Clear cache and reload
            </Button>
            <Button asChild variant="ghost">
              <Link href="/sw-login">Go to login</Link>
            </Button>
          </div>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">Technical details</summary>
            <pre className="mt-2 whitespace-pre-wrap break-words">{String(error?.message || 'Unknown error')}</pre>
            {error?.digest ? <pre className="mt-2 whitespace-pre-wrap break-words">Digest: {error.digest}</pre> : null}
          </details>
        </div>
      </div>
    </div>
  );
}

