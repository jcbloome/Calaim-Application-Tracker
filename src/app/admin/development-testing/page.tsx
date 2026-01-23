'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TestTube2, Mail, Map, Bell, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useAdmin } from '@/hooks/use-admin';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const testingTools = [
  {
    title: 'User Diagnostics',
    description: 'Diagnostic tools for troubleshooting user account and authentication issues',
    icon: TestTube2,
    href: '/admin/user-diagnostics',
    color: 'text-blue-600'
  },
  {
    title: 'Email Test Panel',
    description: 'Test email notifications, templates, and delivery systems',
    icon: Mail,
    href: '/admin/email-test',
    color: 'text-green-600'
  },
  {
    title: 'Email Testing',
    description: 'Additional email testing and validation tools',
    icon: Mail,
    href: '/admin/test-emails',
    color: 'text-green-600'
  },
  {
    title: 'Google Maps Test',
    description: 'Test Google Maps integration, geocoding, and location services',
    icon: Map,
    href: '/admin/test-google-maps',
    color: 'text-red-600'
  },
  {
    title: 'Notification Test',
    description: 'Test push notifications, browser notifications, and alert systems',
    icon: Bell,
    href: '/admin/test-notifications',
    color: 'text-orange-600'
  },
  {
    title: 'Notification Demo',
    description: 'Interactive demo of notification system features and capabilities',
    icon: Bell,
    href: '/admin/notification-demo',
    color: 'text-purple-600'
  }
];

export default function DevelopmentTestingPage() {
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
        <h1 className="text-3xl font-bold">Development & Testing</h1>
        <p className="text-muted-foreground mt-2">
          Testing tools, diagnostics, and development utilities
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {testingTools.map((tool) => {
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
