'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

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

      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Button asChild size="sm">
              <Link href="/admin/tools/kaiser-alft/operations">Open Operations Tools</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/tools/isp-workflow">ISP Workflow</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/tools/isp-assignment">ISP Assignment</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/tools/kaiser-alft/queues">Open Assignment + Intake</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/tools/kaiser-alft/instructions">Open ALFT Instructions</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
