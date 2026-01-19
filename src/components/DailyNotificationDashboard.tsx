'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useFirestore } from '@/firebase';
import { collection, collectionGroup, onSnapshot, Timestamp } from 'firebase/firestore';
import { 
  FileText, 
  Upload, 
  Calendar,
  Users,
  TrendingUp,
  Loader2
} from 'lucide-react';
import { format, startOfDay, endOfDay, isToday, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isThisWeek, isThisMonth, getDay, addDays, isSameDay, isWeekend } from 'date-fns';

interface DailyStats {
  newDocuments: number;
  completedCsSummaries: number;
  totalApplications: number;
  pendingReview: number;
}

interface WeeklyStats {
  [key: string]: DailyStats;
}

interface MonthlyStats {
  [key: string]: WeeklyStats;
}

interface CsUploadLog {
  memberName: string;
  applicationId: string;
  completedAt: Date;
  dayOfWeek: string;
  weekNumber: number;
  isWeekend: boolean;
}

export function DailyNotificationDashboard() {
  const [viewMode, setViewMode] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [dailyStats, setDailyStats] = useState<DailyStats>({
    newDocuments: 0,
    completedCsSummaries: 0,
    totalApplications: 0,
    pendingReview: 0
  });
  const [weeklyStats, setWeeklyStats] = useState<WeeklyStats>({});
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats>({});
  const [csUploadLogs, setCsUploadLogs] = useState<CsUploadLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const firestore = useFirestore();

  useEffect(() => {
    if (!firestore) {
      console.log('❌ Firestore not available');
      return;
    }

    console.log('🔥 Firestore connected, starting dashboard data load...');

    const today = new Date();
    const startOfToday = startOfDay(today);
    const endOfToday = endOfDay(today);

    let userDocs: any[] = [];
    let adminDocs: any[] = [];

    const userApplicationsQuery = collectionGroup(firestore, 'applications');
    const adminApplicationsQuery = collection(firestore, 'applications');

    const handleError = (error: any) => {
      console.error('❌ Error loading daily dashboard:', error);
      setIsLoading(false);
      toast({
        title: 'Error Loading Dashboard',
        description: 'Failed to load daily activity data. Please try refreshing the page.',
        variant: 'destructive',
      });
    };

    const processAllApplications = () => {
      const stats: DailyStats = {
        newDocuments: 0,
        completedCsSummaries: 0,
        totalApplications: 0,
        pendingReview: 0
      };

      const allDocs = [...userDocs, ...adminDocs];
      console.log(`📊 Processing applications: ${userDocs.length} user apps + ${adminDocs.length} admin apps = ${allDocs.length} total`);
      
      let todayActivityCount = 0;
      const weeklyData: WeeklyStats = {};
      const monthlyData: MonthlyStats = {};
      const csLogs: CsUploadLog[] = [];

      // Initialize weekly stats for the current week
      const currentWeekStart = startOfWeek(new Date());
      for (let i = 0; i < 7; i++) {
        const day = addDays(currentWeekStart, i);
        const dayKey = format(day, 'EEEE');
        weeklyData[dayKey] = {
          newDocuments: 0,
          completedCsSummaries: 0,
          totalApplications: 0,
          pendingReview: 0
        };
      }

      allDocs.forEach((doc) => {
        const data = doc.data();
        const memberName = `${data.memberFirstName || 'Unknown'} ${data.memberLastName || 'Member'}`;
        const lastModified = data.lastModified?.toDate() || data.createdAt?.toDate() || new Date();
        const timestamp = lastModified;

        // Check if activity happened today
        const isActivityToday = timestamp >= startOfToday && timestamp <= endOfToday;
        if (isActivityToday) {
          todayActivityCount++;
        }

        // Count new documents
        if (data.hasNewDocuments && data.newDocumentCount > 0 && isActivityToday) {
          stats.newDocuments += data.newDocumentCount;
        }

        // Update weekly stats for new documents
        if (data.hasNewDocuments && data.newDocumentCount > 0 && timestamp >= startOfWeek(new Date()) && timestamp <= endOfWeek(new Date())) {
          const dayKey = format(timestamp, 'EEEE');
          if (weeklyData[dayKey]) {
            weeklyData[dayKey].newDocuments += data.newDocumentCount;
          }
        }

        // Count completed CS summaries - Include both confirmed and in-progress forms
        const isCSCompleted = data.csSummaryComplete || data.status === 'In Progress';
        const csCompletedAt = data.csSummaryCompletedAt?.toDate() || data.lastUpdated?.toDate() || data.createdAt?.toDate();
        
        console.log(`🔍 CS Summary Debug for ${memberName}:`, {
          applicationId: doc.id,
          status: data.status,
          csSummaryComplete: data.csSummaryComplete,
          isCSCompleted,
          csCompletedAt,
          lastUpdated: data.lastUpdated,
          createdAt: data.createdAt
        });

        if (isCSCompleted && csCompletedAt) {
          const csCompletedToday = isToday(csCompletedAt);
          const csCompletedThisWeek = isThisWeek(csCompletedAt);
          const csCompletedThisMonth = isThisMonth(csCompletedAt);
          
          console.log(`✅ CS Summary COUNTED for ${memberName}:`, {
            csCompletedAt,
            csCompletedToday,
            csCompletedThisWeek,
            csCompletedThisMonth,
            reason: data.csSummaryComplete ? 'Confirmed' : 'In Progress'
          });
          
          if (csCompletedToday) {
            stats.completedCsSummaries++;
            console.log(`📊 CS Summary COUNT INCREMENTED for ${memberName} - Total: ${stats.completedCsSummaries}`);
          }

          // Add to CS Upload logs for monthly view
          if (csCompletedThisMonth) {
            const dayOfWeek = format(csCompletedAt, 'EEEE');
            const weekNumber = Math.ceil((csCompletedAt.getDate() + startOfMonth(csCompletedAt).getDay()) / 7);
            
            csLogs.push({
              memberName,
              applicationId: doc.id,
              completedAt: csCompletedAt,
              dayOfWeek,
              weekNumber,
              isWeekend: isWeekend(csCompletedAt)
            });
          }

          // Update weekly stats
          if (csCompletedThisWeek) {
            const dayKey = format(csCompletedAt, 'EEEE');
            if (weeklyData[dayKey]) {
              weeklyData[dayKey].completedCsSummaries++;
            }
          }
        }

        // Count pending review items
        if (data.hasNewDocuments || (data.csSummaryComplete && !data.csSummaryNotificationSent)) {
          stats.pendingReview++;
        }
      });

      stats.totalApplications = todayActivityCount;

      // Update weekly stats for total applications and pending review
      Object.keys(weeklyData).forEach(dayKey => {
        const dayDate = new Date(currentWeekStart);
        const dayIndex = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].indexOf(dayKey);
        dayDate.setDate(dayDate.getDate() + dayIndex);
        
        allDocs.forEach((doc) => {
          const data = doc.data();
          const lastModified = data.lastModified?.toDate() || data.createdAt?.toDate() || new Date();
          
          if (isSameDay(lastModified, dayDate)) {
            weeklyData[dayKey].totalApplications++;
            
            if (data.hasNewDocuments || (data.csSummaryComplete && !data.csSummaryNotificationSent)) {
              weeklyData[dayKey].pendingReview++;
            }
          }
        });
      });

      setDailyStats(stats);
      setWeeklyStats(weeklyData);
      setCsUploadLogs(csLogs);
      setIsLoading(false);
    };

    const unsubscribeUser = onSnapshot(userApplicationsQuery, (userSnapshot) => {
      console.log(`📥 User applications loaded: ${userSnapshot.docs.length} docs`);
      userDocs = userSnapshot.docs;
      processAllApplications();
    }, handleError);
    
    const unsubscribeAdmin = onSnapshot(adminApplicationsQuery, (adminSnapshot) => {
      console.log(`📥 Admin applications loaded: ${adminSnapshot.docs.length} docs`);
      adminDocs = adminSnapshot.docs;
      processAllApplications();
    }, handleError);

    return () => {
      unsubscribeUser();
      unsubscribeAdmin();
    };
  }, [firestore, toast]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        <span>Loading daily dashboard...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            {viewMode === 'daily' && `Daily • ${format(new Date(), 'EEEE, MMMM do, yyyy')}`}
            {viewMode === 'weekly' && `Weekly • ${format(startOfWeek(new Date()), 'MMM do')} - ${format(endOfWeek(new Date()), 'MMM do, yyyy')}`}
            {viewMode === 'monthly' && `Monthly • ${format(startOfMonth(new Date()), 'MMMM yyyy')}`}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === 'daily' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('daily')}
          >
            <Calendar className="mr-2 h-4 w-4" />
            Daily
          </Button>
          <Button
            variant={viewMode === 'weekly' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('weekly')}
          >
            <TrendingUp className="mr-2 h-4 w-4" />
            Weekly
          </Button>
          <Button
            variant={viewMode === 'monthly' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('monthly')}
          >
            <Users className="mr-2 h-4 w-4" />
            Monthly
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-blue-600">{dailyStats.newDocuments}</p>
                <p className="text-xs text-muted-foreground">New Documents</p>
              </div>
              <Upload className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-green-600">{dailyStats.completedCsSummaries}</p>
                <p className="text-xs text-muted-foreground">CS Summaries</p>
              </div>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-gray-600">{dailyStats.totalApplications}</p>
                <p className="text-xs text-muted-foreground">Total Applications</p>
              </div>
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-yellow-600">{dailyStats.pendingReview}</p>
                <p className="text-xs text-muted-foreground">Pending Review</p>
              </div>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Weekly View */}
      {viewMode === 'weekly' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Weekly Activity Breakdown</CardTitle>
              <CardDescription>
                Activity breakdown by day of the week • {format(startOfWeek(new Date()), 'MMM do')} - {format(endOfWeek(new Date()), 'MMM do, yyyy')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
                {Object.entries(weeklyStats).map(([day, stats]) => (
                  <div key={day} className="text-center p-4 border rounded-lg">
                    <h3 className="font-semibold text-sm mb-2">{day}</h3>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span>CS Forms:</span>
                        <Badge variant="secondary">{stats.completedCsSummaries}</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span>Documents:</span>
                        <Badge variant="outline">{stats.newDocuments}</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span>Total:</span>
                        <Badge variant="default">{stats.totalApplications}</Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Weekly Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">
                    {Object.values(weeklyStats).reduce((sum, day) => sum + day.completedCsSummaries, 0)}
                  </p>
                  <p className="text-xs text-muted-foreground">CS Summaries This Week</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-blue-600">
                    {Object.values(weeklyStats).reduce((sum, day) => sum + day.newDocuments, 0)}
                  </p>
                  <p className="text-xs text-muted-foreground">Documents This Week</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-600">
                    {Object.values(weeklyStats).reduce((sum, day) => sum + day.totalApplications, 0)}
                  </p>
                  <p className="text-xs text-muted-foreground">Total Activity</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-yellow-600">
                    {Object.values(weeklyStats).reduce((sum, day) => sum + day.pendingReview, 0)}
                  </p>
                  <p className="text-xs text-muted-foreground">Pending Review</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Monthly View */}
      {viewMode === 'monthly' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Monthly Activity Overview</CardTitle>
              <CardDescription>
                Monthly breakdown of application activity • {format(startOfMonth(new Date()), 'MMMM yyyy')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 border rounded-lg">
                  <p className="text-3xl font-bold text-green-600">{csUploadLogs.length}</p>
                  <p className="text-sm text-muted-foreground">CS Summaries This Month</p>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <p className="text-3xl font-bold text-blue-600">
                    {csUploadLogs.filter(log => !log.isWeekend).length}
                  </p>
                  <p className="text-sm text-muted-foreground">Weekday Submissions</p>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <p className="text-3xl font-bold text-orange-600">
                    {csUploadLogs.filter(log => log.isWeekend).length}
                  </p>
                  <p className="text-sm text-muted-foreground">Weekend Submissions</p>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <p className="text-3xl font-bold text-purple-600">
                    {Math.round((csUploadLogs.length / new Date().getDate()) * 10) / 10}
                  </p>
                  <p className="text-sm text-muted-foreground">Daily Average</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {csUploadLogs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>CS Summary Upload Log</CardTitle>
                <CardDescription>
                  Detailed log of all CS Summary completions this month
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {csUploadLogs
                    .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime())
                    .map((log, index) => (
                      <div key={index} className="flex items-center justify-between p-2 border rounded">
                        <div className="flex items-center gap-2">
                          <Badge variant={log.isWeekend ? "secondary" : "default"}>
                            {log.dayOfWeek}
                          </Badge>
                          <span className="font-medium">{log.memberName}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>{format(log.completedAt, 'MMM do, h:mm a')}</span>
                          <Badge variant="outline">Week {log.weekNumber}</Badge>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}