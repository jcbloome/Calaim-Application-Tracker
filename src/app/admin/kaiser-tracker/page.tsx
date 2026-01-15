'use client';

import React from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function KaiserTrackerPage() {
  const { isAdmin } = useAdmin();

  if (!isAdmin) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
          </CardHeader>
          <CardContent>
            <p>You need admin access to view the Kaiser Tracker.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Kaiser Tracker Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of all Kaiser members from Caspio with comprehensive status tracking
          </p>
        </div>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Kaiser Tracker</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Kaiser Tracker functionality is temporarily disabled due to build issues. This will be restored soon.</p>
        </CardContent>
      </Card>
    </div>
  );
}