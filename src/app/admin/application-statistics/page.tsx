

'use client';
import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Building, Users, Route, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFirestore, useCollection } from '@/firebase';
import { collectionGroup, query, Timestamp } from 'firebase/firestore';
import type { Application } from '@/lib/definitions';
import { format } from 'date-fns';

const StatCard = ({ title, value, icon: Icon, data, description, borderColor }: { title: string, value: string | number, icon: React.ElementType, data?: { name: string, value: number }[], description?: string, borderColor?: string }) => (
    <Card className={cn(borderColor)}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            <Icon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
            <div className="text-2xl font-bold">{value}</div>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
            {data && (
                <div className="mt-2 space-y-1 text-sm">
                    {data.map(item => (
                        <div key={item.name} className="flex justify-between">
                            <span>{item.name}</span>
                            <span className="font-medium">{item.value}</span>
                        </div>
                    ))}
                </div>
            )}
        </CardContent>
    </Card>
);

const TopListCard = ({ title, data, listType, borderColor }: { title: string; data: { name: string; value: number }[]; listType: string; borderColor?: string }) => {
    const topItems = data.slice(0, 10);

    return (
        <Card className={cn(borderColor)}>
            <CardHeader>
                <div className="flex justify-between items-center">
                    <CardTitle className="text-base">{title}</CardTitle>
                     <Dialog>
                        <DialogTrigger asChild>
                            <Button variant="link" size="sm" className="p-0 h-auto">Expand All</Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>All {listType}</DialogTitle>
                            </DialogHeader>
                            <ScrollArea className="h-96">
                                <div className="pr-4">
                                {data.map((item, index) => (
                                    <div key={index}>
                                        <div className="flex justify-between items-center py-2">
                                            <span className="font-medium">{item.name}</span>
                                            <span className="text-muted-foreground">{item.value}</span>
                                        </div>
                                         {index < data.length - 1 && <Separator />}
                                    </div>
                                ))}
                                </div>
                            </ScrollArea>
                        </DialogContent>
                    </Dialog>
                </div>
            </CardHeader>
            <CardContent>
                <ul className="space-y-2 text-sm">
                    {topItems.map((item, index) => (
                        <li key={index} className="flex justify-between">
                            <span>{index + 1}. {item.name}</span>
                            <span className="font-medium">{item.value}</span>
                        </li>
                    ))}
                </ul>
            </CardContent>
        </Card>
    );
};


export default function ApplicationStatisticsPage() {
    const firestore = useFirestore();

    const applicationsQuery = useMemo(() => {
        if (!firestore) return null;
        return query(collectionGroup(firestore, 'applications'));
    }, [firestore]);

    const { data: applications, isLoading } = useCollection<Application & { [key: string]: any }>(applicationsQuery);

    const statsData = useMemo(() => {
        if (!applications) {
            return { byMcp: [], byPathway: [], byCounty: [], monthly: [], topIspContacts: [], topReferrers: [] };
        }
        
        const byMcp: Record<string, number> = {};
        const byPathway: Record<string, number> = {};
        const byCounty: Record<string, number> = {};
        const monthly: Record<string, number> = {};
        const topIspContacts: Record<string, number> = {};
        const topReferrers: Record<string, number> = {};

        for (const app of applications) {
            if (app.healthPlan) byMcp[app.healthPlan] = (byMcp[app.healthPlan] || 0) + 1;
            if (app.pathway) byPathway[app.pathway] = (byPathway[app.pathway] || 0) + 1;
            if (app.memberCounty) byCounty[app.memberCounty] = (byCounty[app.memberCounty] || 0) + 1;

            if (app.lastUpdated) {
                try {
                    const date = app.lastUpdated instanceof Timestamp ? app.lastUpdated.toDate() : new Date(app.lastUpdated);
                    const month = format(date, 'MMM');
                    monthly[month] = (monthly[month] || 0) + 1;
                } catch (e) {
                    // Ignore invalid dates for stats
                }
            }
            if (app.ispContactName) topIspContacts[app.ispContactName] = (topIspContacts[app.ispContactName] || 0) + 1;
            if (app.agency && app.agency !== 'N/A') topReferrers[app.agency] = (topReferrers[app.agency] || 0) + 1;
        }

        const formatForChart = (data: Record<string, number>) => Object.entries(data).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

        const monthOrder = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const sortedMonthly = Object.entries(monthly).map(([month, total]) => ({ month, total })).sort((a, b) => monthOrder.indexOf(a.month) - monthOrder.indexOf(b.month));

        return {
            byMcp: formatForChart(byMcp),
            byPathway: formatForChart(byPathway),
            byCounty: formatForChart(byCounty),
            monthly: sortedMonthly,
            topIspContacts: formatForChart(topIspContacts),
            topReferrers: formatForChart(topReferrers),
        };
    }, [applications]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        )
    }

    const totalByMcp = statsData.byMcp.reduce((sum, item) => sum + item.value, 0);
    const totalByPathway = statsData.byPathway.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Application Statistics</h1>
        <p className="text-muted-foreground">Analytics dashboard for application trends.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard 
            title="Applications by MCP"
            value={totalByMcp}
            icon={Building}
            data={statsData.byMcp}
            description="Total applications across all plans"
            borderColor="border-t-4 border-blue-500"
        />
        <StatCard 
            title="Applications by Pathway"
            value={totalByPathway}
            icon={Route}
            data={statsData.byPathway}
            description="Total applications across all pathways"
            borderColor="border-t-4 border-green-500"
        />

         <Card className="lg:col-span-1 border-t-4 border-purple-500">
            <CardHeader>
                <CardTitle className="text-base">Monthly Totals</CardTitle>
                <CardDescription>Total applications submitted per month.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-2 text-sm">
                    {statsData.monthly.map(item => (
                        <div key={item.month} className="flex justify-between">
                            <span>{new Date().getFullYear()} {item.month}</span>
                            <span className="font-medium">{item.total}</span>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
      </div>

       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <TopListCard title="Top 10 Referrer Agencies" data={statsData.topReferrers} listType="Referrers" borderColor="border-t-4 border-red-500" />
        <TopListCard title="Top 10 ISP Contacts" data={statsData.topIspContacts} listType="ISP Contacts" borderColor="border-t-4 border-orange-500" />

         <Card className="border-t-4 border-sky-500">
            <CardHeader>
                <CardTitle className="text-base">Applications by County</CardTitle>
                <CardDescription>Top 5 counties by application volume.</CardDescription>
            </CardHeader>
            <CardContent>
                <ChartContainer config={{}} className="h-[250px] w-full">
                    <BarChart layout="vertical" data={statsData.byCounty} margin={{ top: 0, right: 20, left: 50, bottom: 0 }}>
                    <CartesianGrid horizontal={false} />
                    <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} fontSize={12} width={100} />
                    <XAxis type="number" hide />
                    <Tooltip cursor={false} content={<ChartTooltipContent />} />
                    <Bar dataKey="value" layout="vertical" radius={4} fill="hsl(var(--chart-2))" />
                    </BarChart>
                </ChartContainer>
            </CardContent>
        </Card>
      </div>
    </div>
  );
}
