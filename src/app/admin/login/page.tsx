
'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

export default function AdminLoginPage() {
  
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md shadow-2xl">
              <CardHeader className="items-center text-center p-6">
                <CardTitle className="text-2xl font-bold">Admin Portal</CardTitle>
            </CardHeader>
            <CardContent className="text-center space-y-4">
                <p>
                    Admin login is temporarily disabled.
                </p>
                <p className="text-sm text-muted-foreground">
                    Please use the navigation menu to access the admin sections.
                </p>
                 <Link href="/admin/super" className="text-primary underline">
                    Go to Super Admin Page
                </Link>
            </CardContent>
        </Card>
    </main>
  );
}
