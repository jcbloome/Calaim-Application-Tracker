'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ClipboardList, UploadCloud } from 'lucide-react';

const QUEUE_TOOLS: Array<{
  title: string;
  description: string;
  href: string;
  cta: string;
  icon: any;
}> = [
  {
    title: 'ALFT Assignment Queue',
    description: 'Load authorized Kaiser members from Caspio and start workflow invites for assigned social workers.',
    href: '/admin/alft-assignment',
    cta: 'Open Assignment Queue',
    icon: ClipboardList,
  },
  {
    title: 'ALFT Workflow Intake',
    description: 'Track workflow status, manager review loops, RN sign-off, and final PDF/email handoff.',
    href: '/admin/alft-tracker',
    cta: 'Open Workflow Intake',
    icon: UploadCloud,
  },
];

export default function KaiserAlftQueueToolsPage() {
  return (
    <div className="container mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>ALFT Assignment + Intake</CardTitle>
            <Badge variant="outline">Tools / Kaiser / ALFT</Badge>
          </div>
          <CardDescription>Queue datapage for starting assignments and managing ALFT workflow intake.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/tools/kaiser-alft">Back to ALFT Hub</Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {QUEUE_TOOLS.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.href}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icon className="h-4 w-4" />
                  {item.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{item.description}</p>
                <Button asChild variant="outline">
                  <Link href={item.href}>{item.cta}</Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
