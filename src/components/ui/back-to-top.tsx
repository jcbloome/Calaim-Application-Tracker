'use client';

import { ArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type BackToTopProps = {
  className?: string;
  label?: string;
};

/** Bottom-of-page control to jump back to the top of long admin forms. */
export function BackToTop({ className, label = 'Return to top of page' }: BackToTopProps) {
  return (
    <div className={cn('flex justify-center border-t pt-4 pb-2 print:hidden', className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => {
          try {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          } catch {
            window.scrollTo(0, 0);
          }
        }}
      >
        <ArrowUp className="h-4 w-4" />
        {label}
      </Button>
    </div>
  );
}
