'use client';

import { Suspense, useEffect } from 'react';
import ActivityLog from '@/components/admin/ActivityLog';
import { useAdmin } from '@/hooks/use-admin';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

function ActivityLogPageInner() {
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

export default function ActivityLogPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <ActivityLogPageInner />
    </Suspense>
  );
}
