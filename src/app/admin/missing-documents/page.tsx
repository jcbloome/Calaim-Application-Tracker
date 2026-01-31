'use client';

import React, { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, collectionGroup, getDocs } from 'firebase/firestore';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAdmin } from '@/hooks/use-admin';
import { useFirestore } from '@/firebase';
import type { Application } from '@/lib/definitions';
import type { FormValues } from '@/app/forms/cs-summary-form/schema';
import type { WithId } from '@/firebase';

type AppRecord = WithId<Application & FormValues> & {
  source?: 'user' | 'admin';
  userId?: string;
};

const getPathwayRequirements = (
  pathway: 'SNF Transition' | 'SNF Diversion',
  healthPlan?: string
) => {
  const commonRequirements = [
    { title: 'CS Member Summary' },
    { title: 'Waivers & Authorizations' },
    { title: 'Room and Board Commitment' },
    { title: 'Proof of Income' },
    { title: "LIC 602A - Physician's Report" },
    { title: 'Medicine List' },
    { title: 'Eligibility Screenshot' }
  ];
  
  if (pathway === 'SNF Diversion') {
    return [
      ...commonRequirements,
      { title: 'Declaration of Eligibility' }
    ];
  }
  
  return [
    ...commonRequirements,
    { title: 'SNF Facesheet' }
  ];
};

const getMissingItems = (application: AppRecord) => {
  const pathway = application.pathway as 'SNF Transition' | 'SNF Diversion';
  const requirements = pathway ? getPathwayRequirements(pathway, application.healthPlan) : [];
  const formStatusMap = new Map(application.forms?.map((form) => [form.name, form]) || []);
  
  return requirements
    .map((req) => req.title)
    .filter((title) => title !== 'CS Member Summary' && title !== 'CS Summary')
    .filter((title) => {
      const form = formStatusMap.get(title);
      if (!form) return true;
      if ((form as any).type === 'Info') return false;
      return form.status !== 'Completed';
    });
};

export default function MissingDocumentsPage() {
  const firestore = useFirestore();
  const { isAdmin, isAdminLoading } = useAdmin();
  const { toast } = useToast();
  
  const [isLoading, setIsLoading] = useState(false);
  const [applications, setApplications] = useState<AppRecord[]>([]);
  const [memberFilter, setMemberFilter] = useState('');
  const [healthPlanFilter, setHealthPlanFilter] = useState('all');
  const [pathwayFilter, setPathwayFilter] = useState('all');
  const [sendingReminders, setSendingReminders] = useState<Set<string>>(new Set());
  
  const fetchApplications = useCallback(async () => {
    if (!firestore || !isAdmin) return;
    setIsLoading(true);
    
    try {
      const [userAppsSnapshot, adminAppsSnapshot] = await Promise.all([
        getDocs(collectionGroup(firestore, 'applications')),
        getDocs(collection(firestore, 'applications'))
      ]);
      
      const userApps = userAppsSnapshot.docs.map((doc) => ({
        ...doc.data(),
        id: doc.id,
        source: 'user',
        userId: doc.ref.parent.parent?.id
      })) as AppRecord[];
      
      const adminApps = adminAppsSnapshot.docs.map((doc) => ({
        ...doc.data(),
        id: doc.id,
        source: 'admin'
      })) as AppRecord[];
      
      const deduped = new Map<string, AppRecord>();
      [...userApps, ...adminApps].forEach((app) => {
        const key = `${app.id}-${app.userId || 'admin'}`;
        deduped.set(key, app);
      });
      
      setApplications(Array.from(deduped.values()));
    } catch (error: any) {
      console.error('Error loading applications:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to load applications.'
      });
    } finally {
      setIsLoading(false);
    }
  }, [firestore, isAdmin, toast]);
  
  React.useEffect(() => {
    if (!isAdminLoading) {
      fetchApplications();
    }
  }, [fetchApplications, isAdminLoading]);
  
  const missingDocsApps = useMemo(() => {
    return applications
      .map((app) => ({
        ...app,
        missingItems: getMissingItems(app)
      }))
      .filter((app) => app.missingItems.length > 0);
  }, [applications]);
  
  const filteredApps = useMemo(() => {
    return missingDocsApps.filter((app) => {
      const memberName = `${app.memberFirstName || ''} ${app.memberLastName || ''}`.trim();
      const memberMatch = !memberFilter || memberName.toLowerCase().includes(memberFilter.toLowerCase());
      const healthPlanMatch = healthPlanFilter === 'all' || app.healthPlan === healthPlanFilter;
      const pathwayMatch = pathwayFilter === 'all' || app.pathway === pathwayFilter;
      return memberMatch && healthPlanMatch && pathwayMatch;
    });
  }, [missingDocsApps, memberFilter, healthPlanFilter, pathwayFilter]);
  
  const handleSendReminder = async (app: AppRecord) => {
    if (sendingReminders.has(app.id)) return;
    
    setSendingReminders((prev) => new Set(prev).add(app.id));
    
    try {
      const response = await fetch('/api/admin/send-document-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId: app.id,
          userId: app.userId
        })
      });
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to send reminder');
      }
      
      toast({
        title: 'Reminder Sent',
        description: `Document reminder sent for ${app.memberFirstName} ${app.memberLastName}.`
      });
      
      fetchApplications();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to send reminder.'
      });
    } finally {
      setSendingReminders((prev) => {
        const next = new Set(prev);
        next.delete(app.id);
        return next;
      });
    }
  };
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Missing Documents</h1>
        <p className="text-muted-foreground">
          Review applications with missing documents and send reminders.
        </p>
        <div className="mt-4">
          <Button asChild variant="outline">
            <Link href="/admin/progress-tracker?missingDocs=1">
              View in Progress Tracker
            </Link>
          </Button>
        </div>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Find applications by member, plan, or pathway.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col lg:flex-row gap-4">
            <Input
              placeholder="Filter by member name..."
              value={memberFilter}
              onChange={(event) => setMemberFilter(event.target.value)}
            />
            <Select value={healthPlanFilter} onValueChange={setHealthPlanFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by Health Plan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Health Plans</SelectItem>
                <SelectItem value="Kaiser">Kaiser</SelectItem>
                <SelectItem value="Health Net">Health Net</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
            <Select value={pathwayFilter} onValueChange={setPathwayFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by Pathway" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Pathways</SelectItem>
                <SelectItem value="SNF Transition">SNF Transition</SelectItem>
                <SelectItem value="SNF Diversion">SNF Diversion</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Applications with Missing Documents</CardTitle>
          <CardDescription>
            {filteredApps.length} application(s) with missing items
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Plan & Pathway</TableHead>
                  <TableHead>Missing Items</TableHead>
                  <TableHead>Last Updated</TableHead>
                  <TableHead>Last Reminder</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      Loading applications...
                    </TableCell>
                  </TableRow>
                ) : filteredApps.length > 0 ? (
                  filteredApps.map((app) => {
                    const lastUpdatedDate = (app.lastUpdated as any)?.toDate?.();
                    const lastReminderDate = (app as any)?.lastDocumentReminder?.toDate?.();
                    const memberName = `${app.memberFirstName || ''} ${app.memberLastName || ''}`.trim();
                    const detailUrl = `/admin/applications/${app.id}${app.userId ? `?userId=${app.userId}` : ''}`;
                    
                    return (
                      <TableRow key={`${app.id}-${app.userId || 'admin'}`}>
                        <TableCell className="font-medium">{memberName}</TableCell>
                        <TableCell>
                          <div>{app.healthPlan || 'Unknown'}</div>
                          <div className="text-xs text-muted-foreground">{app.pathway || 'Unknown'}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="outline">{app.missingItems.length} missing</Badge>
                            <span className="text-xs text-muted-foreground">
                              {app.missingItems.slice(0, 3).join(', ')}
                              {app.missingItems.length > 3 ? '…' : ''}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {lastUpdatedDate ? format(lastUpdatedDate, 'MM/dd/yyyy') : 'N/A'}
                        </TableCell>
                        <TableCell>
                          {lastReminderDate ? format(lastReminderDate, 'MM/dd/yyyy') : 'N/A'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex items-center gap-2">
                            <Button asChild variant="outline" size="sm">
                              <Link href={detailUrl}>View</Link>
                            </Button>
                            <Button asChild variant="outline" size="sm">
                              <Link href="/admin/progress-tracker?missingDocs=1">
                                Progress Tracker
                              </Link>
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleSendReminder(app)}
                              disabled={sendingReminders.has(app.id) || !app.referrerEmail}
                            >
                              {sendingReminders.has(app.id) ? 'Sending...' : 'Send Reminder'}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      No applications with missing documents found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
