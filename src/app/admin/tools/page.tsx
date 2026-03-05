'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminToolsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/statistics');
  }, [router]);

  return null;
}

