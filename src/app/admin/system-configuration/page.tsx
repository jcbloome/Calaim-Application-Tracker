'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Wrench, Settings, BellRing, ArrowRight, Bell } from 'lucide-react';
import Link from 'next/link';
import { useAdmin } from '@/hooks/use-admin';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const systemTools = [
  {
    title: 'System Tools',
    description: 'Access development tools, testing utilities, and system maintenance functions',
    icon: Wrench,
    href: '/admin/super-admin-tools',
    color: 'text-gray-600'
  },
  {
    title: 'Review Notifications',
    description: 'Choose who receives Electron pop-ups for CS Summary and document review',
    icon: Bell,
    href: '/admin/system-configuration/review-notifications',
    color: 'text-indigo-600'
  },
  {
    title: 'Notification Settings',
    description: 'Configure notification preferences, email templates, and alert systems',
    icon: Settings,
    href: '/admin/notification-settings',
    color: 'text-blue-600'
  },
  {
    title: 'Priority Note Monitor',
    description: 'Monitor and track high-priority notes requiring immediate attention',
    icon: BellRing,
    href: '/admin/priority-note-monitor',
    color: 'text-red-600'
  }
];

export default function SystemConfigurationPage() {
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
        <h1 className="text-3xl font-bold">System Configuration</h1>
        <p className="text-muted-foreground mt-2">
          Configure system settings, notifications, and monitoring tools
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {systemTools.map((tool) => {
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
