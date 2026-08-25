'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MonitorOff } from 'lucide-react';
import { useAdmin } from '@/hooks/use-admin';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ELECTRON_POPUPS_MOTHBALLED } from '@/lib/notification-utils';

export default function ElectronControlsPage() {
  const router = useRouter();
  const { isSuperAdmin, isLoading } = useAdmin();

  useEffect(() => {
    if (!isLoading && !isSuperAdmin) {
      router.replace('/admin');
    }
  }, [isLoading, isSuperAdmin, router]);

  if (isLoading) return null;
  if (!isSuperAdmin) return null;

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MonitorOff className="h-5 w-5" />
            Electron Controls
            <Badge variant="secondary">Mothballed</Badge>
          </CardTitle>
          <CardDescription>
            The Electron desktop app is retired. Connect CalAIM admin runs in the browser only.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            Desktop tray popups and Electron notification controls are disabled
            {ELECTRON_POPUPS_MOTHBALLED ? ' (ELECTRON_POPUPS_MOTHBALLED=true)' : ''}. Use web Action Items and
            My Notifications instead.
          </p>
          <Button asChild variant="outline">
            <Link href="/admin">Back to Admin</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
