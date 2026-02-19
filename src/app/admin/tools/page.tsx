'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Wrench, MapPinned } from 'lucide-react';

export default function AdminToolsPage() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Wrench className="h-8 w-8 text-blue-600" />
          Tools
        </h1>
        <p className="text-muted-foreground mt-2">Internal utilities for admin operations and future features.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPinned className="h-5 w-5" />
              SW proximity prep (EFT setup)
            </CardTitle>
            <CardDescription>Match Caspio `SW_ID` to staff address from `Cal_AIM_EFT_Setup`.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/admin/tools/sw-proximity">Open</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

