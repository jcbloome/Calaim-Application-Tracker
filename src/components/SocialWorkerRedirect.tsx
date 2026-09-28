'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useSocialWorker } from '@/hooks/use-social-worker';

export function SocialWorkerRedirect() {
  const { isSocialWorker, isLoading } = useSocialWorker();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && isSocialWorker) {
      // If social worker is on admin dashboard or other non-SW pages, redirect to visit verification
      if (pathname === '/admin' || (!pathname.includes('/admin/sw-'))) {
        console.log('🔄 Redirecting social worker to visit verification page');
        router.replace('/admin/sw-visit-verification');
      }
    }
  }, [isSocialWorker, isLoading, pathname, router]);

  return null; // This component doesn't render anything
}