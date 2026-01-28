import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import AdminLoginClient from './AdminLoginClient';

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      }
    >
      <AdminLoginClient />
    </Suspense>
  );
}