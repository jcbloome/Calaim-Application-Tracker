'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ClipboardList,
  UploadCloud,
  FileText,
  Database,
  TestTube2,
  Eye,
} from 'lucide-react';

const ALFT_TOOLS: Array<{
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
  {
    title: 'ALFT Documents',
    description: 'Review ALFT packets and related document artifacts.',
    href: '/admin/alft-documents',
    cta: 'Open ALFT Documents',
    icon: FileText,
  },
  {
    title: 'ALFT Workflow Log',
    description: 'View historical ALFT workflow events and status transitions.',
    href: '/admin/alft-log',
    cta: 'Open Workflow Log',
    icon: ClipboardList,
  },
  {
    title: 'ALFT Page 1-2 Caspio Mapping',
    description: 'Inspect matchable Caspio fields used to prefill ALFT page 1-2 data.',
    href: '/admin/alft-caspio-mapping',
    cta: 'Open Mapping Datapage',
    icon: Database,
  },
  {
    title: 'ALFT Sample Workflow',
    description: 'Step-by-step dry-run guide for pre-deployment validation.',
    href: '/admin/alft-workflow-sample',
    cta: 'Open Sample Workflow',
    icon: TestTube2,
  },
  {
    title: 'ALFT Dummy Preview',
    description: 'Use dummy packet preview to validate ALFT formatting and workflow safely.',
    href: '/admin/alft-tracker/dummy-preview',
    cta: 'Open Dummy Preview',
    icon: Eye,
  },
];

export default function KaiserAlftHubPage() {
  return (
    <div className="container mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Kaiser ALFT Hub</CardTitle>
            <Badge variant="outline">Tools / Kaiser / ALFT</Badge>
          </div>
          <CardDescription>
            Consolidated ALFT datapage with all workflow and mapping tools in one place.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {ALFT_TOOLS.map((item) => {
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
