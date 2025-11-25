

'use client';

import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart';
import { statsData } from '@/lib/data';
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
import { Building, Users, Route } from 'lucide-react';

const COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

const StatCard = ({ title, value, icon: Icon, data, description }: { title: string, value: string | number, icon: React.ElementType, data?: { name: string, value: number }[], description?: string }) => (
    <Card>
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

const TopListCard = ({ title, data, listType }: { title: string; data: { name: string; value: number }[]; listType: string }) => {
    const topItems = data.slice(0, 10);

    return (
        <Card>
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
                                            <span className="text-muted-foreground">{item.value} applications</span>
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
        />
        <StatCard 
            title="Applications by Pathway"
            value={totalByPathway}
            icon={Route}
            data={statsData.byPathway}
            description="Total applications across all pathways"
        />

         <Card className="lg:col-span-1">
            <CardHeader>
                <CardTitle className="text-base">Monthly Totals</CardTitle>
                <CardDescription>Total applications submitted per month.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-2 text-sm">
                    {statsData.monthly.map(item => (
                        <div key={item.month} className="flex justify-between">
                            <span>{new Date().getFullYear()} {item.month}</span>
                            <span className="font-medium">{item.total} applications</span>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
      </div>

       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <TopListCard title="Top 10 Referrer Agencies" data={statsData.topReferrers} listType="Referrers" />
        <TopListCard title="Top 10 ISP Contacts" data={statsData.topIspContacts} listType="ISP Contacts" />

         <Card>
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
