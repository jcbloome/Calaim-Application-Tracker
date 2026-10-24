'use client';

import dynamic from 'next/dynamic';

export const PushToCaspioDialog = dynamic(
  () => import('./PushToCaspioDialog').then((m) => m.PushToCaspioDialog),
  { ssr: false }
);
export const IlsServiceStartedEmailDialog = dynamic(
  () => import('./IlsEmailDialogs').then((m) => m.IlsServiceStartedEmailDialog),
  { ssr: false }
);
export const ClaimsDepartmentEmailDialog = dynamic(
  () => import('./IlsEmailDialogs').then((m) => m.ClaimsDepartmentEmailDialog),
  { ssr: false }
);
