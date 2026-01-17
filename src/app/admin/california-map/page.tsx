'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function CaliforniaMapPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the enhanced map page
    router.replace('/admin/california-map-enhanced');
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
        <p className="text-gray-600">Redirecting to Enhanced Resource Map...</p>
      </div>
    </div>
  );
}