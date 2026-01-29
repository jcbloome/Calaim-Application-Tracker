'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MessageSquareText, FileText, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useAdmin } from '@/hooks/use-admin';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Suspense, useEffect } from 'react';

const communicationTools = [
  {
    title: 'Client Notes Management',
    description: 'Active management interface for client notes with follow-ups, assignments, and workflow tools',
    icon: MessageSquareText,
    href: '/admin/client-notes',
    color: 'text-blue-600'
  },
  {
    title: 'Add Client Note',
    description: 'Create a new client note for an existing Client_ID2 in Caspio',
    icon: MessageSquareText,
    href: '/admin/client-notes?compose=1',
    color: 'text-green-600'
  },
  {
    title: 'Complete Note Log',
    description: 'Unified audit trail of ALL notes: client notes, staff notes, system notifications, and CalAIM member notes',
    icon: FileText,
    href: '/admin/super-admin-notes',
    color: 'text-purple-600'
  }
];

function CommunicationNotesContent() {
  const { isSuperAdmin, isLoading } = useAdmin();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isSuperAdmin) {
      router.push('/admin');
    }
  }, [isSuperAdmin, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Communication & Notes</h1>
        <p className="text-muted-foreground mt-2">
          Manage all note systems, communication logs, and messaging tools
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {communicationTools.map((tool) => {
          const Icon = tool.icon;
          return (
            <Card key={tool.href} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Icon className={`h-8 w-8 ${tool.color}`} />
                  <CardTitle className="text-xl">{tool.title}</CardTitle>
                </div>
                <CardDescription>{tool.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Link href={tool.href}>
                  <Button className="w-full">
                    Open {tool.title}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export default function CommunicationNotesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      }
    >
      <CommunicationNotesContent />
    </Suspense>
  );
}
