'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const STEPS: Array<{ step: string; title: string; details: string; href: string; cta: string }> = [
  {
    step: '1',
    title: 'Start from Caspio Assignment',
    details: 'Load Kaiser members and start ALFT from the member SW fields (SW_ID + Social_Worker_Assigned).',
    href: '/admin/alft-assignment',
    cta: 'Open ALFT Assignment Queue',
  },
  {
    step: '2',
    title: 'Social Worker Draft Submission',
    details: 'SW fills/submits ALFT form and packet enters intake workflow for manager review.',
    href: '/admin/alft-tracker',
    cta: 'Open ALFT Workflow Intake',
  },
  {
    step: '3',
    title: 'Manager Review / Return for Changes',
    details: 'ALFT manager reviews and either sends back to SW for revisions or moves forward.',
    href: '/admin/alft-tracker',
    cta: 'Review / Return in Tracker',
  },
  {
    step: '4',
    title: 'SW + RN Signature Sequence',
    details: 'Request signatures, complete SW and RN sign-off, and confirm packet generation.',
    href: '/admin/alft-tracker',
    cta: 'Run Signature Workflow',
  },
  {
    step: '5',
    title: 'Final Preview and PDF Send',
    details: 'Use final preview confirmation gate, then send completed ALFT as PDF.',
    href: '/admin/alft-tracker',
    cta: 'Preview + Send Completed PDF',
  },
  {
    step: '6',
    title: 'Quality Dry-Run with Dummy Packet',
    details: 'Use the full dummy ALFT editor/print preview to validate formatting and end-to-end process safely.',
    href: '/admin/alft-tracker/dummy-preview',
    cta: 'Open Dummy ALFT Workflow',
  },
];

export default function AlftWorkflowSamplePage() {
  return (
    <div className="container mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>ALFT Sample Workflow (Pre-Deployment)</CardTitle>
            <Badge variant="outline">Kaiser Only</Badge>
          </div>
          <CardDescription>
            Dry-run every ALFT step in order before full rollout.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="space-y-3">
        {STEPS.map((item) => (
          <Card key={item.step}>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Badge className="min-w-6 justify-center">{item.step}</Badge>
                <CardTitle className="text-base">{item.title}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">{item.details}</p>
              <Button asChild variant="outline">
                <Link href={item.href}>{item.cta}</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

