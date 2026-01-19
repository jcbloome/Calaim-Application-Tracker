'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useFirestore } from '@/firebase';
import { collection, onSnapshot, query, collectionGroup, Timestamp } from 'firebase/firestore';
import { 
  format, 
  startOfDay, 
  endOfDay, 
  isToday, 
  startOfWeek, 
  endOfWeek, 
  startOfMonth, 
  endOfMonth, 
  isThisWeek, 
  isThisMonth, 
  getDay, 
  addDays, 
  isSameDay, 
  isWeekend,
  parseISO,
  isValid
} from 'date-fns';
import { 
  FileText, 
  Upload, 
  Calendar,
  TrendingUp,
  Users,
  Loader2,
  Activity as ActivityIcon,
  BarChart3
} from 'lucide-react';

interface ApplicationLogEntry {
  id: string;
  memberName: string;
  applicationId: string;
  submittedAt: Date;
  status: string;
  healthPlan: string;
  dayOfWeek: string;
  isWeekend: boolean;
  weekNumber: number;
  source: 'user' | 'admin';
}

interface ApplicationStats {
  totalApplications: number;
  userApplications: number;
  adminApplications: number;
  kaiserApplications: number;
  healthNetApplications: number;
  completedApplications: number;
  inProgressApplications: number;
}

interface WeeklyApplicationStats {
  [dayOfWeek: string]: ApplicationStats;
}

interface MonthlyApplicationStats {
  [weekNumber: string]: WeeklyApplicationStats;
}

export default function ActivityLogPage() {
  const [viewMode, setViewMode] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [dailyStats, setDailyStats] = useState<ApplicationStats>({
    totalApplications: 0,
    userApplications: 0,
    adminApplications: 0,
    kaiserApplications: 0,
    healthNetApplications: 0,
    completedApplications: 0,
    inProgressApplications: 0
  });
  const [weeklyStats, setWeeklyStats] = useState<WeeklyApplicationStats>({});
  const [monthlyStats, setMonthlyStats] = useState<MonthlyApplicationStats>({});
  const [applicationLogs, setApplicationLogs] = useState<ApplicationLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const firestore = useFirestore();

  useEffect(() => {
    if (!firestore) {
      console.log('❌ Firestore not available');
      return;
    }

    console.log('🔥 Starting Application Log data load...');

    let userDocs: any[] = [];
    let adminDocs: any[] = [];

    const userApplicationsQuery = collectionGroup(firestore, 'applications');
    const adminApplicationsQuery = collection(firestore, 'applications');

    const handleError = (error: any) => {
      console.error('❌ Error loading application log:', error);
      setIsLoading(false);
    };

    const processAllApplications = () => {
      const allDocs = [...userDocs, ...adminDocs];
      console.log(`📊 Processing ${allDocs.length} applications for activity log`);
      
      const logEntries: ApplicationLogEntry[] = [];
      const today = new Date();
      const currentWeekStart = startOfWeek(today);
      
      // Initialize weekly stats
      const weeklyData: WeeklyApplicationStats = {};
      for (let i = 0; i < 7; i++) {
        const day = addDays(currentWeekStart, i);
        const dayKey = format(day, 'EEEE');
        weeklyData[dayKey] = {
          totalApplications: 0,
          userApplications: 0,
          adminApplications: 0,
          kaiserApplications: 0,
          healthNetApplications: 0,
          completedApplications: 0,
          inProgressApplications: 0
        };
      }

      let dailyData: ApplicationStats = {
        totalApplications: 0,
        userApplications: 0,
        adminApplications: 0,
        kaiserApplications: 0,
        healthNetApplications: 0,
        completedApplications: 0,
        inProgressApplications: 0
      };

      // Initialize monthly stats
      const monthlyData: MonthlyApplicationStats = {};
      
      allDocs.forEach((doc) => {
        const data = doc.data();
        const memberName = `${data.memberFirstName || 'Unknown'} ${data.memberLastName || 'Member'}`;
        const isUserApp = doc.ref.path.includes('users/');
        const source: 'user' | 'admin' = isUserApp ? 'user' : 'admin';
        
        // Determine submission date
        let submittedAt: Date;
        if (data.createdAt?.toDate) {
          submittedAt = data.createdAt.toDate();
        } else if (data.lastUpdated?.toDate) {
          submittedAt = data.lastUpdated.toDate();
        } else {
          submittedAt = new Date(); // Fallback to now
        }

        const dayOfWeek = format(submittedAt, 'EEEE');
        const weekNumber = Math.ceil(submittedAt.getDate() / 7);
        const healthPlan = data.healthPlan || data.selectedHealthPlan || 'Unknown';
        const status = data.status || 'Unknown';

        // Create log entry
        logEntries.push({
          id: doc.id,
          memberName,
          applicationId: doc.id,
          submittedAt,
          status,
          healthPlan,
          dayOfWeek,
          isWeekend: isWeekend(submittedAt),
          weekNumber,
          source
        });

        // Update daily stats
        if (isToday(submittedAt)) {
          dailyData.totalApplications++;
          if (source === 'user') {
            dailyData.userApplications++;
          } else {
            dailyData.adminApplications++;
          }
          
          if (healthPlan.toLowerCase().includes('kaiser')) {
            dailyData.kaiserApplications++;
          } else if (healthPlan.toLowerCase().includes('health net')) {
            dailyData.healthNetApplications++;
          }
          
          if (status.toLowerCase().includes('complete')) {
            dailyData.completedApplications++;
          } else {
            dailyData.inProgressApplications++;
          }
        }

        // Update weekly stats
        if (isThisWeek(submittedAt)) {
          weeklyData[dayOfWeek].totalApplications++;
          if (source === 'user') {
            weeklyData[dayOfWeek].userApplications++;
          } else {
            weeklyData[dayOfWeek].adminApplications++;
          }
          
          if (healthPlan.toLowerCase().includes('kaiser')) {
            weeklyData[dayOfWeek].kaiserApplications++;
          } else if (healthPlan.toLowerCase().includes('health net')) {
            weeklyData[dayOfWeek].healthNetApplications++;
          }
          
          if (status.toLowerCase().includes('complete')) {
            weeklyData[dayOfWeek].completedApplications++;
          } else {
            weeklyData[dayOfWeek].inProgressApplications++;
          }
        }
      });

      // Sort log entries by timestamp (newest first)
      logEntries.sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime());

      setApplicationLogs(logEntries);
      setDailyStats(dailyData);
      setWeeklyStats(weeklyData);
      setMonthlyStats(monthlyData);
      setIsLoading(false);
      
      console.log('✅ Application log processing complete:', {
        entries: logEntries.length,
        dailyStats: dailyData,
        weeklyStats: Object.keys(weeklyData).length
      });
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
  }, [firestore]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Activity Log</h1>
          <p className="text-muted-foreground">
            Loading application data...
          </p>
        </div>
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Activity Log</h1>
          <p className="text-muted-foreground">
            Running totals of daily, weekly, and monthly applications with comprehensive tracking.
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button
            variant={viewMode === 'daily' ? 'default' : 'outline'}
            onClick={() => setViewMode('daily')}
          >
            Daily
          </Button>
          <Button
            variant={viewMode === 'weekly' ? 'default' : 'outline'}
            onClick={() => setViewMode('weekly')}
          >
            Weekly
          </Button>
          <Button
            variant={viewMode === 'monthly' ? 'default' : 'outline'}
            onClick={() => setViewMode('monthly')}
          >
            Monthly
          </Button>
        </div>
      </div>

      {/* Daily View */}
      {viewMode === 'daily' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Applications</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dailyStats.totalApplications}</div>
                <p className="text-xs text-muted-foreground">Today</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">User vs Admin</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dailyStats.userApplications} / {dailyStats.adminApplications}</div>
                <p className="text-xs text-muted-foreground">User / Admin</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Health Plans</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dailyStats.kaiserApplications} / {dailyStats.healthNetApplications}</div>
                <p className="text-xs text-muted-foreground">Kaiser / Health Net</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Status</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dailyStats.completedApplications} / {dailyStats.inProgressApplications}</div>
                <p className="text-xs text-muted-foreground">Complete / In Progress</p>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Weekly View */}
      {viewMode === 'weekly' && (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
          {Object.entries(weeklyStats).map(([day, stats]) => (
            <Card key={day}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{day}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-xs">
                  <span className="font-medium">{stats.totalApplications}</span> Total
                </div>
                <div className="text-xs">
                  <span className="font-medium">{stats.userApplications}</span> User
                </div>
                <div className="text-xs">
                  <span className="font-medium">{stats.adminApplications}</span> Admin
                </div>
                <div className="text-xs">
                  <span className="font-medium">{stats.kaiserApplications}</span> Kaiser
                </div>
                <div className="text-xs">
                  <span className="font-medium">{stats.healthNetApplications}</span> Health Net
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Application Log */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Application Submissions Log
          </CardTitle>
          <CardDescription>
            Complete log of all application submissions with running totals
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {applicationLogs.slice(0, 50).map((entry) => (
              <div key={entry.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 text-blue-500" />
                  <div>
                    <p className="font-medium">{entry.memberName}</p>
                    <p className="text-sm text-muted-foreground">
                      {entry.healthPlan} • {entry.status}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">
                    {format(entry.submittedAt, 'MMM d, yyyy')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(entry.submittedAt, 'h:mm a')}
                  </p>
                  <div className="flex gap-1 mt-1">
                    <Badge variant={entry.source === 'user' ? 'default' : 'secondary'}>
                      {entry.source}
                    </Badge>
                    <Badge variant={entry.isWeekend ? 'outline' : 'secondary'}>
                      {entry.dayOfWeek}
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
            
            {applicationLogs.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No applications recorded yet
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}