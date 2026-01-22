'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SWPortalPage() {
  const router = useRouter();
  
  useEffect(() => {
    // Redirect to submit claims as default
    router.push('/sw-portal/submit-claims');
  }, [router]);

  return null;
}
