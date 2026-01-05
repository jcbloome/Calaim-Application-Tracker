'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Header } from '@/components/Header';
import { ArrowRight, User, Shield } from 'lucide-react';
import { useAdmin } from '@/hooks/use-admin';

export default function HomePage() {
  const { user, isUserLoading, isAdmin, isSuperAdmin } = useAdmin();

  return (
    <>
      <Header />
      <main className="flex-grow flex items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-lg text-center shadow-lg">
          <CardHeader>
            <CardTitle className="text-3xl font-bold">
              Welcome to CalAIM Pathfinder
            </CardTitle>
            <CardDescription>
              Please select your login portal.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild size="lg">
              <Link href="/applications">
                <User className="mr-2" /> User Portal
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/admin">
                <Shield className="mr-2" /> Admin Portal
              </Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
