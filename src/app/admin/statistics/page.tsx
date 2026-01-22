
'use client';

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFirestore } from '@/firebase';
import { collection, query, Timestamp, getDocs, collectionGroup } from 'firebase/firestore';
import type { Application } from '@/lib/definitions';
import { Loader2, Users, Building2, Stethoscope, UserCheck, Activity, BarChart3 } from 'lucide-react';
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
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-3 md:px-6 pt-3 md:pt-6">
            <CardTitle className="text-xs md:text-sm font-medium">{title}</CardTitle>
        </CardHeader>
        <CardContent className="px-3 md:px-6 pb-3 md:pb-6">
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

  // Status statistics state
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

  const fetchStatusStats = useCallback(async () => {
    if (!isAdmin) return;

    setStatsLoading(true);
    setStatsError(null);
    
    try {
      // Fetch status breakdown
      const statusResponse = await fetch('/api/admin/statistics/status-breakdown');
      const statusData = await statusResponse.json();
      
      // Handle both successful and error responses
      setStatusBreakdown(statusData);
      
      // Show error messages if API failed but still display available data
      if (!statusData.success && statusData.error) {
        console.warn('Status breakdown API error:', statusData.error);
      }
      
    } catch (err: any) {
      console.error('Error fetching status statistics:', err);
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
        console.log('✅ Member data loaded successfully:', memberResult.data);
        console.log('📊 Total members from API:', memberResult.data?.totalMembers);
        setMemberData(memberResult.data);
      } else {
        console.error('❌ Member data error:', memberResult.error);
        console.log('❌ Full member result:', memberResult);
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
    fetchStatusStats();
  }, [fetchApps, fetchResourceData, fetchStatusStats]);

  // Calculate resource statistics
  const resourceStats = useMemo(() => {
    const staffKeys = Object.keys(staffData);
    const rcfeKeys = Object.keys(rcfeData);
    
    const totalSocialWorkers = staffKeys.reduce((sum, key) => sum + (staffData[key]?.socialWorkers?.length || 0), 0);
    const totalRNs = staffKeys.reduce((sum, key) => sum + (staffData[key]?.rns?.length || 0), 0);
    const totalRCFEs = rcfeKeys.reduce((sum, key) => sum + (rcfeData[key]?.facilities?.length || 0), 0);
    const totalAuthorizedMembers = memberData?.totalMembers || 0;
    
    console.log('📊 STATISTICS CALCULATION DEBUG:', {
      memberData: memberData,
      totalMembers: memberData?.totalMembers,
      totalAuthorizedMembers: totalAuthorizedMembers,
      staffKeys: staffKeys.length,
      rcfeKeys: rcfeKeys.length
    });
    
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
    <div className="space-y-4 md:space-y-6 p-4 md:p-6">
        <div>
            <h1 className="text-2xl md:text-3xl font-bold">Statistics Dashboard</h1>
            <p className="text-sm md:text-base text-muted-foreground">
                Comprehensive overview of system resources and applications.
            </p>
        </div>

        {/* Resource Statistics */}
        <div>
            <h2 className="text-lg md:text-xl font-semibold mb-3 md:mb-4">System Resources</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard title="Total RCFEs" borderColor="border-purple-500">
                    <div className="flex items-center gap-2 md:gap-3">
                        <Building2 className="h-6 w-6 md:h-8 md:w-8 text-purple-600" />
                        <div>
                            <p className="text-xl md:text-2xl font-bold text-purple-700">
                                {resourceLoading ? <Loader2 className="h-4 w-4 md:h-6 md:w-6 animate-spin" /> : resourceStats.totalRCFEs}
                            </p>
                            <p className="text-xs text-muted-foreground">Residential Care Facilities</p>
                        </div>
                    </div>
                </StatCard>

                <StatCard title="Social Workers (MSW)" borderColor="border-green-500">
                    <div className="flex items-center gap-2 md:gap-3">
                        <Users className="h-6 w-6 md:h-8 md:w-8 text-green-600" />
                        <div>
                            <p className="text-xl md:text-2xl font-bold text-green-700">
                                {resourceLoading ? <Loader2 className="h-4 w-4 md:h-6 md:w-6 animate-spin" /> : resourceStats.totalSocialWorkers}
                            </p>
                            <p className="text-xs text-muted-foreground">Licensed Social Workers</p>
                        </div>
                    </div>
                </StatCard>

                <StatCard title="Registered Nurses (RN)" borderColor="border-blue-500">
                    <div className="flex items-center gap-2 md:gap-3">
                        <Stethoscope className="h-6 w-6 md:h-8 md:w-8 text-blue-600" />
                        <div>
                            <p className="text-xl md:text-2xl font-bold text-blue-700">
                                {resourceLoading ? <Loader2 className="h-4 w-4 md:h-6 md:w-6 animate-spin" /> : resourceStats.totalRNs}
                            </p>
                            <p className="text-xs text-muted-foreground">Licensed Nurses</p>
                        </div>
                    </div>
                </StatCard>

                <StatCard title="Authorized Members" borderColor="border-orange-500">
                    <div className="flex items-center gap-2 md:gap-3">
                        <UserCheck className="h-6 w-6 md:h-8 md:w-8 text-orange-600" />
                        <div>
                            <p className="text-xl md:text-2xl font-bold text-orange-700">
                                {resourceLoading ? <Loader2 className="h-4 w-4 md:h-6 md:w-6 animate-spin" /> : resourceStats.totalAuthorizedMembers}
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


        {/* Application Statistics */}
        <div>
            <h2 className="text-lg md:text-xl font-semibold mb-3 md:mb-4">Application Statistics</h2>
        {/* 
            Grid changed from "grid-cols-1 md:grid-cols-2 xl:grid-cols-3" to 
            "grid-cols-1 md:grid-cols-2 xl:grid-cols-4"
            to fit both County and City cards side by side on extra-large screens. 
            If even more responsive styling is required, further adjustment to parent components may be needed.
        */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            <StatCard title="Applications by County" borderColor="border-blue-500">
                <DataList data={stats.byCounty} />
            </StatCard>

            <StatCard title="Top 10 Cities" borderColor="border-sky-500">
                <DataList data={topCities} emptyText="No city data available." />
            </StatCard>
            
            <StatCard title="Applications by Health Plan" borderColor="border-green-500">
                <DataList data={stats.byHealthPlan} />
            </StatCard>

            <StatCard title="Applications by Pathway" borderColor="border-orange-500">
                <DataList data={stats.byPathway} />
            </StatCard>

            {/* CalAIM Program Status Card */}
            <StatCard title="CalAIM Program Status" borderColor="border-emerald-500">
                {statsLoading ? (
                    <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                ) : (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                        {statusBreakdown.calaimStatuses?.slice(0, 8).map((item: any) => (
                            <div key={item.status} className="flex justify-between items-center py-1 text-xs">
                                <span className="text-gray-700 truncate pr-2">{item.status}</span>
                                <span className="font-semibold text-emerald-600 flex-shrink-0">{item.count}</span>
                            </div>
                        ))}
                        {statusBreakdown.calaimStatuses?.length > 8 && (
                            <p className="text-xs text-muted-foreground text-center pt-1">
                                +{statusBreakdown.calaimStatuses.length - 8} more
                            </p>
                        )}
                    </div>
                )}
            </StatCard>

            {/* Top 10 Referrers Card */}
            <StatCard title="Top 10 Referrers" borderColor="border-purple-500">
                {stats.topReferrers?.length > 0 ? (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                        {stats.topReferrers.slice(0, 8).map((referrer: any, index: number) => (
                            <div key={referrer.name} className="flex justify-between items-center py-1 text-xs">
                                <span className="text-gray-700 truncate pr-2">#{index + 1} {referrer.name}</span>
                                <span className="font-semibold text-purple-600 flex-shrink-0">{referrer.value}</span>
                            </div>
                        ))}
                        {stats.topReferrers.length > 8 && (
                            <p className="text-xs text-muted-foreground text-center pt-1">
                                +{stats.topReferrers.length - 8} more
                            </p>
                        )}
                    </div>
                ) : (
                    <p className="text-xs text-muted-foreground py-4">No referrer data available.</p>
                )}
            </StatCard>

            {/* Submissions by Month Card */}
            <StatCard title="Submissions by Month" borderColor="border-yellow-500">
                <div className="mb-3">
                     <Select 
                        value={selectedYear} 
                        onValueChange={setSelectedYear}
                    >
                        <SelectTrigger className="w-full text-xs">
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
                <DataList data={stats.submissionsByMonth} emptyText="No submissions for this year." />
            </StatCard>

            {/* Placeholder Cards to maintain 4-column grid */}
            <StatCard title="Coming Soon" borderColor="border-gray-300">
                <div className="flex items-center justify-center py-8">
                    <div className="text-center">
                        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-100 flex items-center justify-center">
                            <Activity className="h-6 w-6 text-gray-400" />
                        </div>
                        <p className="text-xs text-muted-foreground">Additional metrics</p>
                    </div>
                </div>
            </StatCard>

            <StatCard title="Future Analytics" borderColor="border-gray-300">
                <div className="flex items-center justify-center py-8">
                    <div className="text-center">
                        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-100 flex items-center justify-center">
                            <BarChart3 className="h-6 w-6 text-gray-400" />
                        </div>
                        <p className="text-xs text-muted-foreground">Enhanced reporting</p>
                    </div>
                </div>
            </StatCard>

        </div>
        </div>
    </div>
  );
}
