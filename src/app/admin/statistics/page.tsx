
'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFirestore, useCollection } from '@/firebase';
import { collectionGroup, query, Query } from 'firebase/firestore';
import type { Application } from '@/lib/definitions';
import { Loader2, Users, Map as MapIcon, HeartHandshake, Forklift, Building, Crown, Trophy } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';


const StatCard = ({ title, icon: Icon, children, borderColor }: { title: string, icon: React.ElementType, children: React.ReactNode, borderColor?: string }) => (
    <Card className={cn('relative overflow-hidden', borderColor && `border-t-4 ${borderColor}`)}>
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
    <div className="space-y-1">
        {data.length > 0 ? data.map((item, index) => (
            <div 
                key={item.name} 
                className={cn(
                    "flex items-center justify-between p-2 rounded-md",
                    index === 0 && "bg-amber-50"
                )}
            >
                <div className="flex items-center gap-2">
                    {index === 0 && <Crown className="h-4 w-4 text-amber-500" />}
                    <p className={cn("text-sm", index === 0 ? "font-semibold text-amber-800" : "text-muted-foreground")}>{item.name}</p>
                </div>
                <p className={cn("text-sm font-medium", index === 0 ? "text-amber-900" : "text-foreground")}>{item.value}</p>
            </div>
        )) : <p className="text-sm text-muted-foreground p-2">{emptyText}</p>}
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
            <StatCard title="Applications by County" icon={MapIcon} borderColor="border-blue-500">
                <DataList data={stats.byCounty} />
            </StatCard>
            
            <StatCard title="Applications by Health Plan" icon={HeartHandshake} borderColor="border-green-500">
                <DataList data={stats.byHealthPlan} />
            </StatCard>

            <StatCard title="Applications by Pathway" icon={Forklift} borderColor="border-orange-500">
                <DataList data={stats.byPathway} />
            </StatCard>

             <Card className="border-t-4 border-purple-500">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Top 10 Referrers</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                     {stats.topReferrers.length > 0 ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Rank</TableHead>
                                    <TableHead>Name</TableHead>
                                    <TableHead className="text-right">Submissions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {stats.topReferrers.map((r, index) => (
                                    <TableRow key={r.name} className={cn(index < 3 && 'bg-purple-50/50')}>
                                        <TableCell className="font-medium w-16">
                                            <div className="flex items-center gap-2">
                                                {index === 0 && <Trophy className="h-4 w-4 text-amber-400"/>}
                                                {index === 1 && <Trophy className="h-4 w-4 text-slate-400"/>}
                                                {index === 2 && <Trophy className="h-4 w-4 text-amber-700"/>}
                                                <span>#{index + 1}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="font-medium">{r.name}</TableCell>
                                        <TableCell className="text-right font-semibold">{r.value}</TableCell>
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
