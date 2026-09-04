'use client';

import { TierLevelDefinitionsContent } from '@/components/alft/TierLevelDefinitionsContent';

export default function SwTierLevelDefinitionsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <TierLevelDefinitionsContent showBackLink backHref="/sw-portal/home" />
    </div>
  );
}
