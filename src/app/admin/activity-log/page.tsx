'use client';

import ActivityLog from '@/components/admin/ActivityLog';
import { useAdmin } from '@/hooks/use-admin';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function ActivityLogPage() {
  const { isSuperAdmin, isLoading } = useAdmin();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!isSuperAdmin) router.push('/admin');
  }, [isLoading, isSuperAdmin, router]);

  if (isLoading) return null;
  if (!isSuperAdmin) return null;
  return <ActivityLog embedded={false} />;
}