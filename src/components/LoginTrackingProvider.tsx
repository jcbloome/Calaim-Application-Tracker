'use client';

import { useLoginTracking } from '@/hooks/use-login-tracking';

export default function LoginTrackingProvider({ children }: { children: React.ReactNode }) {
  useLoginTracking();
  
  return <>{children}</>;
}