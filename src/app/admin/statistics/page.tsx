
'use client';

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFirestore } from '@/firebase';
import { collection, query, Timestamp, getDocs, collectionGroup } from 'firebase/firestore';
import type { Application } from '@/lib/definitions';
import { Loader2, Users, Building2, Stethoscope, UserCheck, User, Activity } from 'lucide-react';
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
import { useAdmin } from '@/hooks/use-admin';
import { errorEmitter, FirestorePermissionError } from '@/firebase';


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
  const { isAdmin, isLoading: isAdminLoading } = useAdmin();
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());

  const [applications, setApplications] = useState<Application[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Resource data state
  const [staffData, setStaffData] = useState<any>({});
  const [rcfeData, setRCFEData] = useState<any>({});
  const [memberData, setMemberData] = useState<any>(null);
  const [resourceLoading, setResourceLoading] = useState(false);
  const [resourceError, setResourceError] = useState<string | null>(null);

  // Staff and status statistics state
  const [staffAssignments, setStaffAssignments] = useState<any[]>([]);
  const [statusBreakdown, setStatusBreakdown] = useState<any>({});
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

  const fetchApps = useCallback(async () => {
    if (isAdminLoading || !firestore || !isAdmin) {
        if (!isAdminLoading) setIsLoading(false);
        return;
    };

    setIsLoading(true);
    setError(null);
    try {
        const appsQuery = collectionGroup(firestore, 'applications');
        const snapshot = await getDocs(appsQuery).catch(e => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'applications (collection group)', operation: 'list' }));
            throw e;
        });
        const apps = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as Application[];
        setApplications(apps);
    } catch (err: any) {
        setError(err);
    } finally {
        setIsLoading(false);
    }
  }, [firestore, isAdmin, isAdminLoading]);

  const fetchStaffAndStatusStats = useCallback(async () => {
    if (!isAdmin) return;

    setStatsLoading(true);
    setStatsError(null);
    
    try {
      // Fetch staff assignments
      const staffResponse = await fetch('/api/admin/statistics/staff-assignments');
      const staffData = await staffResponse.json();
      
      // Fetch status breakdown
      const statusResponse = await fetch('/api/admin/statistics/status-breakdown');
      const statusData = await statusResponse.json();
      
      // Handle both successful and error responses
      setStaffAssignments(staffData.staffAssignments || []);
      setStatusBreakdown(statusData);
      
      // Show error messages if APIs failed but still display available data
      if (!staffData.success && staffData.error) {
        console.warn('Staff assignments API error:', staffData.error);
      }
      if (!statusData.success && statusData.error) {
        console.warn('Status breakdown API error:', statusData.error);
      }
      
    } catch (err: any) {
      console.error('Error fetching staff and status statistics:', err);
      setStatsError(err.message);
    } finally {
      setStatsLoading(false);
    }
  }, [isAdmin]);

  // Fetch resource data (staff, RCFEs, members)
  const fetchResourceData = useCallback(async () => {
    if (!isAdmin) return;

    setResourceLoading(true);
    setResourceError(null);
    
    try {
      const [staffResponse, rcfeResponse, memberResponse] = await Promise.all([
        fetch('/api/staff-locations'),
        fetch('/api/rcfe-locations'),
        fetch('/api/member-locations')
      ]);

      const staffResult = await staffResponse.json();
      const rcfeResult = await rcfeResponse.json();
      const memberResult = await memberResponse.json();

      if (staffResult.success) {
        setStaffData(staffResult.data.staffByCounty);
      } else {
        console.error('Staff data error:', staffResult.error);
      }

      if (rcfeResult.success) {
        setRCFEData(rcfeResult.data.rcfesByCounty);
      } else {
        console.error('RCFE data error:', rcfeResult.error);
      }

      if (memberResult.success) {
        setMemberData(memberResult.data);
      } else {
        console.error('Member data error:', memberResult.error);
      }

    } catch (error: any) {
      console.error('Error fetching resource data:', error);
      setResourceError(error.message);
    } finally {
      setResourceLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchApps();
    fetchResourceData();
    fetchStaffAndStatusStats();
  }, [fetchApps, fetchResourceData, fetchStaffAndStatusStats]);

  // Calculate resource statistics
  const resourceStats = useMemo(() => {
    const staffKeys = Object.keys(staffData);
    const rcfeKeys = Object.keys(rcfeData);
    
    const totalSocialWorkers = staffKeys.reduce((sum, key) => sum + (staffData[key]?.socialWorkers?.length || 0), 0);
    const totalRNs = staffKeys.reduce((sum, key) => sum + (staffData[key]?.rns?.length || 0), 0);
    const totalRCFEs = rcfeKeys.reduce((sum, key) => sum + (rcfeData[key]?.facilities?.length || 0), 0);
    const totalAuthorizedMembers = memberData?.totalMembers || 0;
    
    return {
      totalSocialWorkers,
      totalRNs,
      totalRCFEs,
      totalAuthorizedMembers
    };
  }, [staffData, rcfeData, memberData]);

  // -- ADDED: Calculation for topCities, below! --
  const { stats, availableYears, topCities } = useMemo(() => {
    const defaultHealthPlans = new Map<string, number>([['Kaiser', 0], ['Health Net', 0]]);
    if (!applications) {
      return {
        stats: {
          byCounty: [],
          byHealthPlan: Array.from(defaultHealthPlans.entries()).map(([name, value]) => ({ name, value })),
          byPathway: [],
          topReferrers: [],
          submissionsByMonth: []
        },
        availableYears: [],
        topCities: []
      };
    }
    
    const counts = {
        byCounty: new Map<string, number>(),
        byHealthPlan: new Map<string, number>([['Kaiser', 0], ['Health Net', 0]]),
        byPathway: new Map<string, number>(),
        byReferrer: new Map<string, number>(),
        byCity: new Map<string, number>(),
    };
    
    const years = new Set<number>();
    const submissionsByMonth = new Array(12).fill(0).map((_, i) => ({
      name: format(new Date(0, i), 'MMMM'),
      value: 0
    }));

    applications.forEach(app => {
        // County
        if (app.currentCounty) {
            counts.byCounty.set(app.currentCounty, (counts.byCounty.get(app.currentCounty) || 0) + 1);
        }

        // City
        if (app.currentCity) {
            counts.byCity.set(app.currentCity, (counts.byCity.get(app.currentCity) || 0) + 1);
        }
        
        // Health Plan
        if (app.healthPlan) {
            if (counts.byHealthPlan.has(app.healthPlan)) {
                counts.byHealthPlan.set(app.healthPlan, (counts.byHealthPlan.get(app.healthPlan) || 0) + 1);
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
            if (date.getFullYear() === Number(selectedYear)) {
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
        topCities: toSortedArray(counts.byCity).slice(0, 10),
    };
  }, [applications, selectedYear]);

  if (isLoading || isAdminLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-4">Loading statistics...</p>
      </div>
    );
  }

  if (error) {
    return <p className="text-destructive">Error loading application data: A permission error occurred.</p>;
  }

  return (
    <div className="space-y-6">
        <div>
            <h1 className="text-3xl font-bold">Statistics Dashboard</h1>
            <p className="text-muted-foreground">
                Comprehensive overview of system resources and applications.
            </p>
        </div>

        {/* Resource Statistics */}
        <div>
            <h2 className="text-xl font-semibold mb-4">System Resources</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <StatCard title="Total RCFEs" borderColor="border-purple-500">
                    <div className="flex items-center gap-3">
                        <Building2 className="h-8 w-8 text-purple-600" />
                        <div>
                            <p className="text-2xl font-bold text-purple-700">
                                {resourceLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : resourceStats.totalRCFEs}
                            </p>
                            <p className="text-xs text-muted-foreground">Residential Care Facilities</p>
                        </div>
                    </div>
                </StatCard>

                <StatCard title="Social Workers (MSW)" borderColor="border-green-500">
                    <div className="flex items-center gap-3">
                        <Users className="h-8 w-8 text-green-600" />
                        <div>
                            <p className="text-2xl font-bold text-green-700">
                                {resourceLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : resourceStats.totalSocialWorkers}
                            </p>
                            <p className="text-xs text-muted-foreground">Licensed Social Workers</p>
                        </div>
                    </div>
                </StatCard>

                <StatCard title="Registered Nurses (RN)" borderColor="border-blue-500">
                    <div className="flex items-center gap-3">
                        <Stethoscope className="h-8 w-8 text-blue-600" />
                        <div>
                            <p className="text-2xl font-bold text-blue-700">
                                {resourceLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : resourceStats.totalRNs}
                            </p>
                            <p className="text-xs text-muted-foreground">Licensed Nurses</p>
                        </div>
                    </div>
                </StatCard>

                <StatCard title="Authorized Members" borderColor="border-orange-500">
                    <div className="flex items-center gap-3">
                        <UserCheck className="h-8 w-8 text-orange-600" />
                        <div>
                            <p className="text-2xl font-bold text-orange-700">
                                {resourceLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : resourceStats.totalAuthorizedMembers}
                            </p>
                            <p className="text-xs text-muted-foreground">CalAIM Members</p>
                        </div>
                    </div>
                </StatCard>
            </div>
            {resourceError && (
                <p className="text-sm text-destructive mt-2">Error loading resource data: {resourceError}</p>
            )}
        </div>

        {/* Staff Assignment Statistics */}
        <div>
            <h2 className="text-xl font-semibold mb-4">Staff Assignments</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {statsLoading ? (
                    Array.from({ length: 6 }, (_, i) => (
                        <Card key={i} className="border-l-4 border-indigo-500">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">
                                    <div className="flex items-center gap-2">
                                        <User className="h-4 w-4" />
                                        Loading...
                                    </div>
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center gap-3">
                                    <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
                                    <div>
                                        <p className="text-2xl font-bold text-indigo-700">--</p>
                                        <p className="text-xs text-muted-foreground">Members assigned</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))
                ) : (
                    staffAssignments.map((staff, index) => (
                        <Card key={staff.name} className="border-l-4 border-indigo-500">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">
                                    <div className="flex items-center gap-2">
                                        <User className="h-4 w-4" />
                                        {staff.name}
                                    </div>
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center gap-3">
                                    <Users className="h-6 w-6 text-indigo-600" />
                                    <div>
                                        <p className="text-2xl font-bold text-indigo-700">{staff.count}</p>
                                        <p className="text-xs text-muted-foreground">Members assigned</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>
            {statsError && (
                <p className="text-sm text-destructive mt-2">Error loading staff assignments: {statsError}</p>
            )}
        </div>

        {/* CalAIM Status Summary */}
        <div>
            <h2 className="text-xl font-semibold mb-4">CalAIM Status Summary</h2>
            <div className="grid grid-cols-1 gap-6">
                {/* CalAIM Status Card */}
                <Card className="border-l-4 border-green-500">
                    <CardHeader>
                        <CardTitle className="text-lg font-semibold flex items-center gap-2">
                            <Activity className="h-5 w-5 text-green-600" />
                            CalAIM Program Status
                        </CardTitle>
                        <CardDescription>Current CalAIM program status distribution</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {statsLoading ? (
                            <div className="flex items-center justify-center py-4">
                                <Loader2 className="h-6 w-6 animate-spin" />
                            </div>
                        ) : (
                            <div className="space-y-2 max-h-64 overflow-y-auto">
                                {statusBreakdown.calaimStatuses?.slice(0, 10).map((item: any) => (
                                    <div key={item.status} className="flex justify-between items-center py-1 border-b border-gray-100">
                                        <span className="text-sm text-gray-700 truncate">{item.status}</span>
                                        <span className="text-sm font-semibold text-green-600">{item.count}</span>
                                    </div>
                                ))}
                                {statusBreakdown.calaimStatuses?.length > 10 && (
                                    <p className="text-xs text-muted-foreground text-center pt-2">
                                        +{statusBreakdown.calaimStatuses.length - 10} more statuses
                                    </p>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
            {statsError && (
                <p className="text-sm text-destructive mt-2">Error loading CalAIM status data: {statsError}</p>
            )}
        </div>

        {/* Application Statistics */}
        <div>
            <h2 className="text-xl font-semibold mb-4">Application Statistics</h2>
        {/* 
            Grid changed from "grid-cols-1 md:grid-cols-2 xl:grid-cols-3" to 
            "grid-cols-1 md:grid-cols-2 xl:grid-cols-4"
            to fit both County and City cards side by side on extra-large screens. 
            If even more responsive styling is required, further adjustment to parent components may be needed.
        */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            <StatCard title="Applications by County" borderColor="border-blue-500">
                <DataList data={stats.byCounty} />
            </StatCard>

            {/* NEW: Top 10 Cities Card */}
            <StatCard title="Top 10 Cities" borderColor="border-sky-500">
                <DataList data={topCities} emptyText="No city data available." />
            </StatCard>
            
            <StatCard title="Applications by Health Plan" borderColor="border-green-500">
                <DataList data={stats.byHealthPlan} />
            </StatCard>

            <StatCard title="Applications by Pathway" borderColor="border-orange-500">
                <DataList data={stats.byPathway} />
            </StatCard>
            
             <Card className="border-t-4 border-yellow-500 md:col-span-1">
                <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                        <div className="space-y-0">
                             <CardTitle className="text-sm font-medium">Submissions by Month</CardTitle>
                        </div>
                    </div>
                    <div className="pt-2">
                         <Select 
                            value={selectedYear} 
                            onValueChange={setSelectedYear}
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

             <Card className="border-t-4 border-purple-500 md:col-span-2">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Top 10 Referrers</CardTitle>
                </CardHeader>
                <CardContent>
                     {stats.topReferrers.length > 0 ? (
                        <div className="overflow-x-auto">
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
                        </div>
                     ) : (
                        <p className="text-sm text-muted-foreground pt-4">No referrer data available.</p>
                     )}
                </CardContent>
            </Card>

        </div>
        </div>
    </div>
  );
}
