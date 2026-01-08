
'use client';

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFirestore } from '@/firebase';
import { useAdmin } from '@/hooks/use-admin';
import { collectionGroup, getDocs, Timestamp } from 'firebase/firestore';
import type { Application, StaffTracker } from '@/lib/definitions';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Loader2, Printer, ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const reportableStatuses = [
  'T2038 Requested',
  'Tier Level Requested',
  'RCFE/ILS for Invoicing',
];

type ReportableData = {
  id: string;
  memberFullName: string;
  memberMrn?: string;
  status?: string;
  lastUpdated: string;
};

export default function IlsReportPage() {
  const firestore = useFirestore();
  const { isSuperAdmin, isLoading: isAdminLoading } = useAdmin();

  const [reportData, setReportData] = useState<ReportableData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (isAdminLoading || !firestore || !isSuperAdmin) {
      if (!isAdminLoading) setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const [appsSnap, trackersSnap] = await Promise.all([
        getDocs(collectionGroup(firestore, 'applications')),
        getDocs(collectionGroup(firestore, 'staffTrackers')),
      ]);

      const appsMap = new Map(appsSnap.docs.map(doc => [doc.id, doc.data() as Application]));
      const trackers = trackersSnap.docs.map(doc => doc.data() as StaffTracker);

      const filteredData: ReportableData[] = [];

      trackers.forEach(tracker => {
        if (tracker.status && reportableStatuses.includes(tracker.status)) {
          const app = appsMap.get(tracker.applicationId);
          if (app && app.healthPlan === 'Kaiser') {
            filteredData.push({
              id: app.id,
              memberFullName: `${app.memberFirstName} ${app.memberLastName}`,
              memberMrn: app.memberMrn,
              status: tracker.status,
              lastUpdated: format(tracker.lastUpdated.toDate(), 'PPP'),
            });
          }
        }
      });
      
      // Sort by status, then by name
      filteredData.sort((a, b) => {
        if (a.status! < b.status!) return -1;
        if (a.status! > b.status!) return 1;
        if (a.memberFullName < b.memberFullName) return -1;
        if (a.memberFullName > b.memberFullName) return 1;
        return 0;
      })

      setReportData(filteredData);
    } catch (error) {
      console.error("Error fetching ILS report data:", error);
    } finally {
      setIsLoading(false);
    }
  }, [firestore, isSuperAdmin, isAdminLoading]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (isLoading || isAdminLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-4">Generating ILS Report...</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 min-h-screen flex flex-col print:bg-white">
      <header className="print:hidden sticky top-0 bg-white/80 backdrop-blur-sm border-b z-10">
        <div className="container mx-auto py-4 px-4">
          <div className="flex justify-between items-center">
            <Button variant="outline" asChild>
              <Link href="/admin">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Return to Dashboard
              </Link>
            </Button>
            <Button onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" />
              Print Report
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-grow container mx-auto py-8 px-4 print:p-0">
        <Card className="bg-white p-4 sm:p-8 shadow-lg rounded-lg print:shadow-none print:p-4 print:border-none">
          <CardHeader className="text-center print:text-left print:p-0">
            <CardTitle className="text-2xl">ILS Weekly Report</CardTitle>
            <CardDescription>
              As of {format(new Date(), 'PPPP')}
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-6 print:mt-4">
            {reportData.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member Name</TableHead>
                    <TableHead>MRN</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData.map(item => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.memberFullName}</TableCell>
                      <TableCell>{item.memberMrn}</TableCell>
                      <TableCell>{item.status}</TableCell>
                      <TableCell>{item.lastUpdated}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-center text-muted-foreground py-10">
                No members are currently at the reportable stages.
              </p>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
