'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, Brain, Map, Database, FolderSync, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useAdmin } from '@/hooks/use-admin';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const integrationTools = [
  {
    title: 'Batch Sync',
    description: 'Bulk synchronize data between Firebase and Caspio systems',
    icon: RefreshCw,
    href: '/admin/batch-sync',
    color: 'text-blue-600'
  },
  {
    title: 'Intelligent Matching',
    description: 'AI-powered member matching and data correlation tools',
    icon: Brain,
    href: '/admin/intelligent-matching',
    color: 'text-purple-600'
  },
  {
    title: 'Legacy Member Search',
    description: 'Search and match legacy member records using comprehensive algorithms',
    icon: Brain,
    href: '/admin/comprehensive-matching',
    color: 'text-indigo-600'
  },
  {
    title: 'Field Mapping',
    description: 'Configure and manage Caspio field mappings and data transformations',
    icon: Map,
    href: '/admin/caspio-field-mapping',
    color: 'text-green-600'
  },
  {
    title: 'Caspio API Test',
    description: 'Test Caspio database connections, API endpoints, and data queries',
    icon: Database,
    href: '/admin/caspio-test',
    color: 'text-orange-600'
  },
  {
    title: 'Google Drive Test',
    description: 'Test Google Drive API integration, folder scanning, and document migration',
    icon: FolderSync,
    href: '/admin/migrate-drive',
    color: 'text-red-600'
  }
];

export default function DataIntegrationPage() {
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
        <h1 className="text-3xl font-bold">Data & Integration Tools</h1>
        <p className="text-muted-foreground mt-2">
          Manage data synchronization, API integrations, and matching algorithms
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {integrationTools.map((tool) => {
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
