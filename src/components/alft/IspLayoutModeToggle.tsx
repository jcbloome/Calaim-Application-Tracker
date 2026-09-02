'use client';

import { Monitor, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { IspLayoutMode } from '@/lib/isp-layout-mode';

export function IspLayoutModeToggle({
  mode,
  onChange,
  className = '',
}: {
  mode: IspLayoutMode;
  onChange: (mode: IspLayoutMode) => void;
  className?: string;
}) {
  return (
    <div
      className={`inline-flex items-center rounded-md border bg-white p-0.5 ${className}`.trim()}
      role="group"
      aria-label="ISP form layout"
    >
      <Button
        type="button"
        size="sm"
        variant={mode === 'desktop' ? 'default' : 'ghost'}
        className="h-8 gap-1.5 px-2.5 text-xs"
        onClick={() => onChange('desktop')}
        aria-pressed={mode === 'desktop'}
      >
        <Monitor className="h-3.5 w-3.5" />
        Desktop
      </Button>
      <Button
        type="button"
        size="sm"
        variant={mode === 'mobile' ? 'default' : 'ghost'}
        className="h-8 gap-1.5 px-2.5 text-xs"
        onClick={() => onChange('mobile')}
        aria-pressed={mode === 'mobile'}
      >
        <Smartphone className="h-3.5 w-3.5" />
        Mobile
      </Button>
    </div>
  );
}
