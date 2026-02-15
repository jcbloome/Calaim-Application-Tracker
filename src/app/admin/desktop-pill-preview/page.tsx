'use client';

import { DesktopPillPreviewOverlay } from '@/components/DesktopPillPreviewOverlay';

export default function DesktopPillPreviewPage() {
  return (
    <div className="container mx-auto p-6 space-y-3">
      <h1 className="text-2xl font-bold">Desktop Pill Preview (Web)</h1>
      <p className="text-muted-foreground">
        This page installs a dev-only desktop notification shim and renders the same pill/panel UI in the browser.
        Create/send a note from <code>/admin/my-notes</code> (or wait for docs/CS review items), then watch the overlay update.
      </p>
      <DesktopPillPreviewOverlay />
    </div>
  );
}

