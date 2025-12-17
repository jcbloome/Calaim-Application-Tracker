
'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFirestore, useCollection } from '@/firebase';
import { collectionGroup, query, Query } from 'firebase/firestore';
import type { Application, FormStatus } from '@/lib/definitions';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Loader2, CheckCircle2, XCircle, Circle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { GlossaryDialog } from '@/components/GlossaryDialog';

const trackedComponents = [
  { key: 'CS Member Summary', abbreviation: 'CS' },
  { key: 'HIPAA Authorization', abbreviation: 'HIPAA' },
  { key: 'Liability Waiver', abbreviation: 'LW' },
  { key: 'Freedom of Choice Waiver', abbreviation: 'FoC' },
  { key: "LIC 602A - Physician's Report", abbreviation: '602' },
  { key: 'Medicine List', abbreviation: 'Meds' },
  { key: 'Proof of Income', abbreviation: 'POI' },
  { key: 'Declaration of Eligibility', abbreviation: 'DE' },
  { key: 'SNF Facesheet', abbreviation: 'SNF' },
];

const StatusIndicator = ({ status, formName }: { status: 'Completed' | 'Pending' | 'Not Applicable', formName: string }) => {
    const statusConfig = {
        Completed: { Icon: CheckCircle2, color: 'text-green-500', label: 'Completed' },
        Pending: { Icon: XCircle, color: 'text-orange-500', label: 'Pending' },
        'Not Applicable': { Icon: Circle, color: 'text-gray-300', label: 'Not Applicable' },
    };
    
    const { Icon, color, label } = statusConfig[status];

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger>
                    <Icon className={`h-5 w-5 ${color}`} />
                </TooltipTrigger>
                <TooltipContent>
                    <p>{formName}: {label}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
};

const getComponentStatus = (app: Application, componentKey: string): 'Completed' | 'Pending' | 'Not Applicable' => {
    const form = app.forms?.find(f => f.name === componentKey);
    
    if (componentKey === 'Declaration of Eligibility' && app.pathway !== 'SNF Diversion') {
        return 'Not Applicable';
    }
    if (componentKey === 'SNF Facesheet' && app.pathway !== 'SNF Transition') {
        return 'Not Applicable';
    }

    if (form?.status === 'Completed') {
        return 'Completed';
    }
    
    return 'Pending';
};


export default function ProgressTrackerPage() {
  const firestore = useFirestore();

  const applicationsQuery = useMemo(() => {
    if (!firestore) return null;
    return query(collectionGroup(firestore, 'applications')) as Query<Application>;
  }, [firestore]);

  const { data: applications, isLoading, error } = useCollection<Application>(applicationsQuery);

  const sortedApplications = useMemo(() => {
    if (!applications) return [];
    return [...applications].sort((a, b) => {
        const timeA = a.lastUpdated ? (a.lastUpdated as any).toMillis() : 0;
        const timeB = b.lastUpdated ? (b.lastUpdated as any).toMillis() : 0;
        return timeB - timeA;
      });
  }, [applications])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Application Progress Tracker</CardTitle>
          <CardDescription>
            A detailed grid showing the status of each required component for all applications.
          </CardDescription>
        </CardHeader>
        <CardContent>
            <div className="flex flex-wrap gap-x-4 gap-y-2 p-4 border rounded-lg bg-muted/50 mb-6 items-center">
                 <div className="flex-1">
                    <h3 className="font-semibold text-sm">Legend</h3>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span><strong className="font-mono">CS:</strong> CS Member Summary</span>
                        <span><strong className="font-mono">LW:</strong> Liability Waiver</span>
                        <span><strong className="font-mono">FoC:</strong> Freedom of Choice</span>
                        <span><strong className="font-mono">602:</strong> Physician's Report</span>
                        <span><strong className="font-mono">POI:</strong> Proof of Income</span>
                        <span><strong className="font-mono">DE:</strong> Declaration of Eligibility</span>
                    </div>
                </div>
                 <GlossaryDialog className="mt-2 sm:mt-0" />
            </div>

          {error && <p className="text-destructive">Error: {error.message}</p>}
          {isLoading ? (
             <div className="flex items-center justify-center h-48">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="ml-4">Loading application data...</p>
            </div>
          ) : (
             <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="min-w-[200px]">Member</TableHead>
                            <TableHead colSpan={trackedComponents.length} className="text-center">Required Components</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                        <TableRow>
                            <TableHead></TableHead>
                            {trackedComponents.map(c => (
                                <TableHead key={c.key} className="text-center w-[60px] p-2">
                                     <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger className="cursor-help font-mono text-xs">{c.abbreviation}</TooltipTrigger>
                                            <TooltipContent><p>{c.key}</p></TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </TableHead>
                            ))}
                            <TableHead></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sortedApplications.length > 0 ? sortedApplications.map(app => (
                            <TableRow key={app.id}>
                                <TableCell>
                                    <div className="font-medium">{`${app.memberFirstName} ${app.memberLastName}`}</div>
                                    <div className="text-xs text-muted-foreground font-mono">{app.id}</div>
                                </TableCell>
                                {trackedComponents.map(c => (
                                    <TableCell key={c.key} className="text-center">
                                        <StatusIndicator 
                                            status={getComponentStatus(app, c.key)}
                                            formName={c.key}
                                        />
                                    </TableCell>
                                ))}
                                <TableCell className="text-right">
                                    <Button asChild variant="outline" size="sm">
                                        <Link href={`/admin/applications/${app.id}?userId=${app.userId}`}>View</Link>
                                    </Button>
                                </TableCell>
                            </TableRow>
                        )) : (
                             <TableRow>
                                <TableCell colSpan={trackedComponents.length + 2} className="h-24 text-center">
                                    No applications found.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
             </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

