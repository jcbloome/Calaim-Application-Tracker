import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { applications as mockApplications } from '@/lib/data';
import type { ApplicationStatus } from '@/lib/definitions';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileDown, Search } from 'lucide-react';

const getBadgeVariant = (status: ApplicationStatus) => {
  switch (status) {
    case 'Approved': return 'bg-green-100 text-green-800 border-green-200';
    case 'Completed & Submitted': return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'Requires Revision': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'In Progress': default: return 'bg-gray-100 text-gray-800 border-gray-200';
  }
};

export default function AdminApplicationsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
            <h1 className="text-2xl font-bold tracking-tight">All Applications</h1>
            <p className="text-muted-foreground">Manage and review all submitted applications.</p>
        </div>
        <Button>
          <FileDown className="mr-2 h-4 w-4" />
          Export All
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4 justify-between sm:items-center">
            <CardTitle>Application Records</CardTitle>
            <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative w-full sm:w-auto">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search by name or ID..." className="pl-8 w-full sm:w-[250px]" />
                </div>
                <Select>
                    <SelectTrigger className="w-full sm:w-[180px]">
                        <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="requires_revision">Requires Revision</SelectItem>
                        <SelectItem value="submitted">Submitted</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                    </SelectContent>
                </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member / App ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Pathway</TableHead>
                <TableHead className="hidden sm:table-cell">Last Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockApplications.map(app => (
                <TableRow key={app.id}>
                  <TableCell>
                    <div className="font-medium">{app.memberName}</div>
                    <div className="text-xs text-muted-foreground font-mono truncate">{app.id}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={getBadgeVariant(app.status)}>
                      {app.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{app.pathway}</TableCell>
                  <TableCell className="hidden sm:table-cell">{app.lastUpdated}</TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/admin/application/${app.id}`}>View Details</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
