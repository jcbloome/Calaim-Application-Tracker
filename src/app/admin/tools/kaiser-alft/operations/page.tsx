'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ClipboardList, FileText, Database, TestTube2, Eye } from 'lucide-react';

const OPERATIONS_TOOLS: Array<{
  title: string;
  description: string;
  href: string;
  cta: string;
  icon: any;
}> = [
  {
    title: 'ALFT Page 1-2 Caspio Mapping',
    description: 'Inspect matchable Caspio fields used to prefill ALFT page 1-2 data.',
    href: '/admin/alft-caspio-mapping',
    cta: 'Open Mapping Datapage',
    icon: Database,
  },
  {
    title: 'ISP Workflow',
    description:
      'Select members, verify Caspio fields, route MSW / RN / admin staff, check location, prefill, and send SW invites.',
    href: '/admin/tools/isp-workflow',
    cta: 'Open ISP Workflow',
    icon: ClipboardList,
  },
  {
    title: 'ISP Assignment',
    description: 'Track which social worker is assigned to each member sent through the ALFT / ISP app.',
    href: '/admin/tools/isp-assignment',
    cta: 'Open ISP Assignment',
    icon: Eye,
  },
  {
    title: 'ISP Downloads Data Page',
    description: 'Search and re-download logged ISP / ALFT packet PDFs from workflow completions.',
    href: '/admin/tools/isp-downloads',
    cta: 'Open ISP Downloads',
    icon: FileText,
  },
  {
    title: 'ISP Tracker',
    description:
      'Progress grid for each ISP, plus daily action reminder toggles (bulk and per member).',
    href: '/admin/tools/isp-tracker',
    cta: 'Open ISP Tracker',
    icon: ClipboardList,
  },
  {
    title: 'ALFT Detail Tracker',
    description: 'Open the detailed ALFT intake list and editor.',
    href: '/admin/alft-tracker',
    cta: 'Open ALFT Detail',
    icon: Database,
  },
  {
    title: 'ALFT Dummy Preview',
    description: 'Use dummy packet preview to validate ALFT formatting and workflow safely.',
    href: '/admin/alft-tracker/dummy-preview',
    cta: 'Open Dummy Preview',
    icon: Eye,
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
    title: 'ALFT Sample Workflow',
    description: 'Step-by-step dry-run guide for pre-deployment validation.',
    href: '/admin/alft-workflow-sample',
    cta: 'Open Sample Workflow',
    icon: TestTube2,
  },
];

export default function KaiserAlftOperationsPage() {
  return (
    <div className="container mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>ALFT Operations Tools</CardTitle>
            <Badge variant="outline">Tools / Kaiser / ALFT</Badge>
          </div>
          <CardDescription>Operations datapage for ALFT support, validation, and workflow monitoring tools.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/tools/kaiser-alft">Back to ALFT Hub</Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {OPERATIONS_TOOLS.map((item) => {
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
