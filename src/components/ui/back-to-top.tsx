'use client';

import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type BackToTopProps = {
  className?: string;
  label?: string;
  /**
   * `inline` — bottom-of-page control (default).
   * `floating` — fixed button that appears after scrolling down (better for long trackers).
   * `both` — floating while scrolled + inline footer control.
   */
  variant?: 'inline' | 'floating' | 'both';
  /** Pixels scrolled before the floating control appears. */
  showAfterPx?: number;
};

const scrollToTop = () => {
  try {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch {
    window.scrollTo(0, 0);
  }
};

/** Bottom-of-page / floating control to jump back to the top of long admin pages. */
export function BackToTop({
  className,
  label = 'Return to top of page',
  variant = 'inline',
  showAfterPx = 480,
}: BackToTopProps) {
  const [showFloating, setShowFloating] = useState(false);
  const useFloating = variant === 'floating' || variant === 'both';
  const useInline = variant === 'inline' || variant === 'both';

  useEffect(() => {
    if (!useFloating) return;
    const onScroll = () => {
      setShowFloating(window.scrollY > showAfterPx);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [showAfterPx, useFloating]);

  return (
    <>
      {useFloating ? (
        <div
          className={cn(
            'pointer-events-none fixed bottom-6 right-4 z-40 print:hidden sm:right-6',
            className
          )}
        >
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className={cn(
              'pointer-events-auto gap-2 border border-slate-300 bg-white/95 shadow-md backdrop-blur transition-opacity',
              showFloating ? 'opacity-100' : 'pointer-events-none opacity-0'
            )}
            aria-hidden={!showFloating}
            tabIndex={showFloating ? 0 : -1}
            onClick={scrollToTop}
          >
            <ArrowUp className="h-4 w-4" />
            <span className="hidden sm:inline">{label}</span>
            <span className="sm:hidden">Top</span>
          </Button>
        </div>
      ) : null}
      {useInline ? (
        <div className={cn('flex justify-center border-t pt-4 pb-2 print:hidden', !useFloating && className)}>
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={scrollToTop}>
            <ArrowUp className="h-4 w-4" />
            {label}
          </Button>
        </div>
      ) : null}
    </>
  );
}

/** Call after finishing a workflow action so staff land back at the page header. */
export function scrollAdminPageToTop() {
  scrollToTop();
}
