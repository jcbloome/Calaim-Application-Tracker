
'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFirestore, useCollection } from '@/firebase';
import { collectionGroup, query, Query } from 'firebase/firestore';
import type { Application } from '@/lib/definitions';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Loader2 } from 'lucide-react';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658'];

export default function AdminStatisticsPage() {
  const firestore = useFirestore();

  const applicationsQuery = useMemo(() => {
    if (!firestore) return null;
    return query(collectionGroup(firestore, 'applications')) as Query<Application>;
  }, [firestore]);

  const { data: applications, isLoading, error } = useCollection<Application>(applicationsQuery);

  const applicationsByCounty = useMemo(() => {
    if (!applications) return [];
    const counts: { [key: string]: number } = {};
    applications.forEach(app => {
        if (app.memberCounty) {
            counts[app.memberCounty] = (counts[app.memberCounty] || 0) + 1;
        }
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [applications]);

  const applicationsByHealthPlan = useMemo(() => {
    if (!applications) return [];
    const counts: { [key: string]: number } = {};
    applications.forEach(app => {
        if (app.healthPlan) {
            counts[app.healthPlan] = (counts[app.healthPlan] || 0) + 1;
        }
    });
     return Object.entries(counts).map(([name, value]) => ({ name, value }));
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
            <Card>
                <CardHeader>
                    <CardTitle>Applications by County</CardTitle>
                    <CardDescription>Distribution of applications across different counties.</CardDescription>
                </CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={applicationsByCounty} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip />
                            <Bar dataKey="value" fill="hsl(var(--primary))" />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle>Applications by Health Plan</CardTitle>
                    <CardDescription>Breakdown of applications by the member's health plan.</CardDescription>
                </CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie
                                data={applicationsByHealthPlan}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                outerRadius={80}
                                fill="#8884d8"
                                dataKey="value"
                                nameKey="name"
                                label={(entry) => `${entry.name} (${entry.value})`}
                            >
                                {applicationsByHealthPlan.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
        </div>
    </div>
  );
}
