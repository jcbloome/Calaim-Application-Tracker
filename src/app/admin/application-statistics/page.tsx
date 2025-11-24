

'use client';

import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Pie, PieChart, Cell, Legend, Tooltip, ResponsiveContainer } from 'recharts';
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
import { ExternalLink, User } from 'lucide-react';

const COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

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
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Application Statistics</h1>
        <p className="text-muted-foreground">Analytics dashboard for application trends.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Applications by MCP</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{}} className="h-[200px] w-full">
              <PieChart>
                <Tooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                <Pie data={statsData.byMcp} dataKey="value" nameKey="name" innerRadius={40} outerRadius={60} strokeWidth={5} paddingAngle={5}>
                   {statsData.byMcp.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Legend iconSize={10} />
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Applications by Pathway</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{}} className="h-[200px] w-full">
              <PieChart>
                <Tooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                <Pie data={statsData.byPathway} dataKey="value" nameKey="name" innerRadius={40} outerRadius={60} strokeWidth={5} paddingAngle={5}>
                  {statsData.byPathway.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Legend iconSize={10}/>
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>

         <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Monthly Totals</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{}} className="h-[200px] w-full">
              <BarChart data={statsData.monthly} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} />
                <Tooltip cursor={false} content={<ChartTooltipContent />} />
                <Bar dataKey="total" radius={4}>
                   {statsData.monthly.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <TopListCard title="Top 10 Referrers" data={statsData.topReferrers} listType="Referrers" />
        <TopListCard title="Top 10 ISP Contacts" data={statsData.topIspContacts} listType="ISP Contacts" />

         <Card>
            <CardHeader>
                <CardTitle className="text-base">Applications by County</CardTitle>
            </CardHeader>
            <CardContent>
                <ChartContainer config={{}} className="h-[250px] w-full">
                    <BarChart layout="vertical" data={statsData.byCounty} margin={{ top: 0, right: 20, left: 50, bottom: 0 }}>
                    <CartesianGrid horizontal={false} />
                    <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} fontSize={12} />
                    <XAxis type="number" hide />
                    <Tooltip cursor={false} content={<ChartTooltipContent />} />
                    <Bar dataKey="value" layout="vertical" radius={4}>
                        {statsData.byCounty.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                    </Bar>
                    </BarChart>
                </ChartContainer>
            </CardContent>
        </Card>
      </div>
    </div>
  );
}
