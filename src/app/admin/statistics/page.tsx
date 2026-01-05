
'use client';

import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collectionGroup, query, Query, Timestamp } from 'firebase/firestore';
import type { Application } from '@/lib/definitions';
import { Loader2 } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from '@/lib/utils';
import { format } from 'date-fns';


const StatCard = ({ title, children, borderColor }: { title: string, children: React.ReactNode, borderColor?: string }) => (
    <Card className={cn('relative overflow-hidden', borderColor && `border-t-4 ${borderColor}`)}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
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
                className="flex items-center justify-between p-2 rounded-md"
            >
                <p className={cn("text-sm", index === 0 ? "font-semibold" : "text-foreground")}>{item.name}</p>
                <p className={cn("text-sm font-medium", index === 0 ? "font-semibold" : "")}>{item.value}</p>
            </div>
        )) : <p className="text-sm text-muted-foreground p-2">{emptyText}</p>}
    </div>
);


export default function AdminStatisticsPage() {
  const firestore = useFirestore();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const applicationsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collectionGroup(firestore, 'applications')) as Query<Application>;
  }, [firestore]);

  const { data: applications, isLoading, error } = useCollection<Application>(applicationsQuery);

  const { stats, availableYears } = useMemo(() => {
    const defaultHealthPlans = new Map<string, number>([['Kaiser', 0], ['Health Net', 0]]);
    if (!applications) return { stats: { byCounty: [], byHealthPlan: Array.from(defaultHealthPlans.entries()).map(([name, value]) => ({ name, value })), byPathway: [], topReferrers: [], submissionsByMonth: [] }, availableYears: [] };
    
    const counts = {
        byCounty: new Map<string, number>(),
        byHealthPlan: new Map<string, number>([['Kaiser', 0], ['Health Net', 0]]),
        byPathway: new Map<string, number>(),
        byReferrer: new Map<string, number>(),
    };
    
    const years = new Set<number>();
    const submissionsByMonth = new Array(12).fill(0).map((_, i) => ({
      name: format(new Date(0, i), 'MMMM'),
      value: 0
    }));

    applications.forEach(app => {
        // County
        if (app.memberCounty) {
            counts.byCounty.set(app.memberCounty, (counts.byCounty.get(app.memberCounty) || 0) + 1);
        }
        
        // Health Plan - Consolidate Kaiser & Kaiser Permanente
        if (app.healthPlan) {
            let plan = app.healthPlan;
            if (plan === 'Kaiser Permanente') {
                plan = 'Kaiser';
            }
            if (counts.byHealthPlan.has(plan)) {
                counts.byHealthPlan.set(plan, (counts.byHealthPlan.get(plan) || 0) + 1);
            }
        }

        // Pathway
        if (app.pathway) {
            counts.byPathway.set(app.pathway, (counts.byPathway.get(app.pathway) || 0) + 1);
        }
        
        // Referrer (user who created application)
        if (app.referrerName) {
            counts.byReferrer.set(app.referrerName, (counts.byReferrer.get(app.referrerName) || 0) + 1);
        }

        // Submissions by month/year
        if (app.lastUpdated) {
            const date = (app.lastUpdated as Timestamp).toDate();
            years.add(date.getFullYear());
            if (date.getFullYear() === selectedYear) {
                const month = date.getMonth();
                submissionsByMonth[month].value++;
            }
        }
    });

    const toSortedArray = (map: Map<string, number>) => Array.from(map.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

    return {
        stats: {
            byCounty: toSortedArray(counts.byCounty),
            byHealthPlan: toSortedArray(counts.byHealthPlan),
            byPathway: toSortedArray(counts.byPathway),
            topReferrers: toSortedArray(counts.byReferrer).slice(0, 10),
            submissionsByMonth: submissionsByMonth.filter(m => m.value > 0).sort((a, b) => b.value - a.value),
        },
        availableYears: Array.from(years).sort((a, b) => b - a),
    };
  }, [applications, selectedYear]);

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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <StatCard title="Applications by County" borderColor="border-blue-500">
                <DataList data={stats.byCounty} />
            </StatCard>
            
            <StatCard title="Applications by Health Plan" borderColor="border-green-500">
                <DataList data={stats.byHealthPlan} />
            </StatCard>

            <StatCard title="Applications by Pathway" borderColor="border-orange-500">
                <DataList data={stats.byPathway} />
            </StatCard>
            
             <Card className="border-t-4 border-yellow-500">
                <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                        <div className="space-y-0">
                             <CardTitle className="text-sm font-medium">Submissions by Month</CardTitle>
                        </div>
                    </div>
                    <div className="pt-2">
                         <Select 
                            value={selectedYear.toString()} 
                            onValueChange={(value) => setSelectedYear(Number(value))}
                        >
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Select Year" />
                            </SelectTrigger>
                            <SelectContent>
                                {availableYears.length > 0 ? (
                                    availableYears.map(year => (
                                        <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                                    ))
                                ) : (
                                    <SelectItem value={new Date().getFullYear().toString()} disabled>
                                        {new Date().getFullYear()}
                                    </SelectItem>
                                )}
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent>
                    <DataList data={stats.submissionsByMonth} emptyText="No submissions for this year." />
                </CardContent>
            </Card>

             <Card className="border-t-4 border-purple-500">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Top 10 Referrers</CardTitle>
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
                                    <TableRow key={r.name}>
                                        <TableCell className="font-medium w-16">
                                            <div className="flex items-center gap-2">
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
