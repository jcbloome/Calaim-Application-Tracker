
'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFirestore, useCollection } from '@/firebase';
import { collectionGroup, query, Query } from 'firebase/firestore';
import type { Application } from '@/lib/definitions';
import { Loader2, Users, Map, HeartHandshake, Forklift, Building } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';


const StatCard = ({ title, icon: Icon, children }: { title: string, icon: React.ElementType, children: React.ReactNode }) => (
    <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            <Icon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
            {children}
        </CardContent>
    </Card>
);

const DataList = ({ data, emptyText = "No data available." }: { data: { name: string, value: number }[], emptyText?: string }) => (
    <div className="space-y-2">
        {data.length > 0 ? data.map(item => (
            <div key={item.name} className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{item.name}</p>
                <p className="text-sm font-medium">{item.value}</p>
            </div>
        )) : <p className="text-sm text-muted-foreground">{emptyText}</p>}
    </div>
);


export default function AdminStatisticsPage() {
  const firestore = useFirestore();

  const applicationsQuery = useMemo(() => {
    if (!firestore) return null;
    return query(collectionGroup(firestore, 'applications')) as Query<Application>;
  }, [firestore]);

  const { data: applications, isLoading, error } = useCollection<Application>(applicationsQuery);

  const stats = useMemo(() => {
    if (!applications) return { byCounty: [], byHealthPlan: [], byPathway: [], topReferrers: [] };
    
    const counts = {
        byCounty: new Map<string, number>(),
        byHealthPlan: new Map<string, number>(),
        byPathway: new Map<string, number>(),
        byReferrer: new Map<string, number>(),
    };

    applications.forEach(app => {
        // County
        if (app.memberCounty) {
            counts.byCounty.set(app.memberCounty, (counts.byCounty.get(app.memberCounty) || 0) + 1);
        }
        // Health Plan
        if (app.healthPlan) {
            counts.byHealthPlan.set(app.healthPlan, (counts.byHealthPlan.get(app.healthPlan) || 0) + 1);
        }
        // Pathway
        if (app.pathway) {
            counts.byPathway.set(app.pathway, (counts.byPathway.get(app.pathway) || 0) + 1);
        }
        // Referrer
        if (app.referrerName) {
            counts.byReferrer.set(app.referrerName, (counts.byReferrer.get(app.referrerName) || 0) + 1);
        }
    });

    const toSortedArray = (map: Map<string, number>) => Array.from(map.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

    return {
        byCounty: toSortedArray(counts.byCounty),
        byHealthPlan: toSortedArray(counts.byHealthPlan),
        byPathway: toSortedArray(counts.byPathway),
        topReferrers: toSortedArray(counts.byReferrer).slice(0, 10),
    };
  }, [applications]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-4">Loading statistics...</p>
      </div>
    );
  }

  if (error) {
    return <p className="text-destructive">Error loading application data: {error.message}</p>;
  }

  return (
    <div className="space-y-6">
        <div>
            <h1 className="text-3xl font-bold">Application Statistics</h1>
            <p className="text-muted-foreground">
                A visual breakdown of all applications in the system.
            </p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <StatCard title="Applications by County" icon={Map}>
                <DataList data={stats.byCounty} />
            </StatCard>
            
            <StatCard title="Applications by Health Plan" icon={HeartHandshake}>
                <DataList data={stats.byHealthPlan} />
            </StatCard>

            <StatCard title="Applications by Pathway" icon={Forklift}>
                <DataList data={stats.byPathway} />
            </StatCard>

             <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Top 10 Referrers</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                     {stats.topReferrers.length > 0 ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead className="text-right">Submissions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {stats.topReferrers.map(r => (
                                    <TableRow key={r.name}>
                                        <TableCell className="font-medium">{r.name}</TableCell>
                                        <TableCell className="text-right">{r.value}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                     ) : (
                        <p className="text-sm text-muted-foreground pt-4">No referrer data available.</p>
                     )}
                </CardContent>
            </Card>

        </div>
    </div>
  );
}
