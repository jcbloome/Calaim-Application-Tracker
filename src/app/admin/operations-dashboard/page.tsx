'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Kanban, DollarSign, Calendar, Activity, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useAdmin } from '@/hooks/use-admin';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const operationsTools = [
  {
    title: 'Managerial Overview',
    description: 'Comprehensive dashboard for tracking member assignments, RCFE distribution, and staff workload',
    icon: Kanban,
    href: '/admin/managerial-overview',
    color: 'text-purple-600'
  },
  {
    title: 'SW Claims Management',
    description: 'Review, approve, and process social worker visit claims and gas reimbursements',
    icon: DollarSign,
    href: '/admin/sw-claims-management',
    color: 'text-green-600'
  },
  {
    title: 'Daily Task Tracker',
    description: 'Track and manage daily tasks, assignments, and workflow items',
    icon: Calendar,
    href: '/admin/daily-tasks',
    color: 'text-blue-600'
  },
  {
    title: 'Login Activity',
    description: 'Monitor user login activity, session tracking, and access logs',
    icon: Activity,
    href: '/admin/login-activity',
    color: 'text-orange-600'
  }
];

export default function OperationsDashboardPage() {
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
        <h1 className="text-3xl font-bold">Operations Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Centralized access to operational tools, tracking, and management systems
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {operationsTools.map((tool) => {
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
