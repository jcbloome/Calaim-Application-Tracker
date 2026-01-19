'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useFirestore } from '@/firebase';
import { collection, collectionGroup, query, where, onSnapshot, orderBy, Timestamp } from 'firebase/firestore';
import { 
  FileText, 
  Upload, 
  Bell, 
  ExternalLink,
  Calendar,
  Users,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { format, startOfDay, endOfDay, isToday, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay } from 'date-fns';
import Link from 'next/link';

interface DailyStats {
  newDocuments: number;
  completedCsSummaries: number;
  totalApplications: number;
  pendingReview: number;
}

interface WeeklyStats {
  [key: string]: {
    date: Date;
    newDocuments: number;
    completedCsSummaries: number;
    totalApplications: number;
    dayName: string;
  };
}

interface NotificationItem {
  id: string;
  type: 'document_upload' | 'cs_summary_complete';
  applicationId: string;
  memberName: string;
  timestamp: Date;
  hasNewDocuments?: boolean;
  newDocumentCount?: number;
  csSummaryComplete?: boolean;
}

export function DailyNotificationDashboard() {
  const [viewMode, setViewMode] = useState<'daily' | 'weekly'>('daily');
  const [dailyStats, setDailyStats] = useState<DailyStats>({
    newDocuments: 0,
    completedCsSummaries: 0,
    totalApplications: 0,
    pendingReview: 0
  });
  const [weeklyStats, setWeeklyStats] = useState<WeeklyStats>({});
  const [notificationItems, setNotificationItems] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const firestore = useFirestore();

  // Load daily statistics and notifications
  useEffect(() => {
    if (!firestore) return;

    const today = new Date();
    const startOfToday = startOfDay(today);
    const endOfToday = endOfDay(today);

    // Query for both user applications and admin-created applications
    const userApplicationsQuery = collectionGroup(firestore, 'applications');
    const adminApplicationsQuery = collection(firestore, 'applications');

    let userDocs: any[] = [];
    let adminDocs: any[] = [];
    
    // Define error handler first
    const handleError = (error: any) => {
      console.error('❌ Error loading daily dashboard:', error);
      setIsLoading(false);
      toast({
        title: 'Error Loading Dashboard',
        description: 'Failed to load daily activity data. Please try refreshing the page.',
        variant: 'destructive',
      });
    };
    
    // Listen to both user applications and admin applications
    const unsubscribeUser = onSnapshot(userApplicationsQuery, (userSnapshot) => {
      userDocs = userSnapshot.docs;
      processAllApplications();
    }, handleError);
    
    const unsubscribeAdmin = onSnapshot(adminApplicationsQuery, (adminSnapshot) => {
      adminDocs = adminSnapshot.docs;
      processAllApplications();
    }, handleError);
    
    const processAllApplications = () => {
      const stats: DailyStats = {
        newDocuments: 0,
        completedCsSummaries: 0,
        totalApplications: 0,
        pendingReview: 0
      };

      // Initialize weekly stats
      const weeklyData: WeeklyStats = {};
      const weekStart = startOfWeek(today);
      const weekEnd = endOfWeek(today);
      const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
      
      weekDays.forEach(day => {
        const dayKey = format(day, 'yyyy-MM-dd');
        weeklyData[dayKey] = {
          date: day,
          newDocuments: 0,
          completedCsSummaries: 0,
          totalApplications: 0,
          dayName: format(day, 'EEE')
        };
      });

      const items: NotificationItem[] = [];
      let todayActivityCount = 0;

      // Process both user and admin applications
      const allDocs = [...userDocs, ...adminDocs];
      allDocs.forEach((doc) => {
        const data = doc.data();
        const memberName = `${data.memberFirstName || 'Unknown'} ${data.memberLastName || 'Member'}`;
        const lastModified = data.lastModified?.toDate() || data.createdAt?.toDate() || new Date();
        const timestamp = lastModified;

        // Check if activity happened today
        const isToday = timestamp >= startOfToday && timestamp <= endOfToday;
        if (isToday) {
          todayActivityCount++;
        }

        // Count new documents (focus on recent activity)
        if (data.hasNewDocuments && data.newDocumentCount > 0) {
          if (isToday) {
            stats.newDocuments += data.newDocumentCount;
            items.push({
              id: `${doc.id}-documents`,
              type: 'document_upload',
              applicationId: doc.id,
              memberName,
              timestamp,
              hasNewDocuments: true,
              newDocumentCount: data.newDocumentCount
            });
          }

          // Add to weekly stats if within this week
          const docUploadDate = data.lastDocumentUpload?.toDate() || timestamp;
          if (docUploadDate >= weekStart && docUploadDate <= weekEnd) {
            const dayKey = format(docUploadDate, 'yyyy-MM-dd');
            if (weeklyData[dayKey]) {
              weeklyData[dayKey].newDocuments += data.newDocumentCount;
            }
          }
        }

        // Count completed CS summaries (check recent completions)
        if (data.csSummaryComplete) {
          const csCompletedAt = data.csSummaryCompletedAt?.toDate();
          const csCompletedToday = csCompletedAt && isToday(csCompletedAt);
          
          // Debug logging for CS Summary completion
          console.log(`🔍 CS Summary Debug for ${memberName}:`, {
            csSummaryComplete: data.csSummaryComplete,
            csSummaryCompletedAt: csCompletedAt,
            csCompletedToday,
            today: new Date(),
            applicationId: doc.id
          });
          
          if (csCompletedToday) {
            stats.completedCsSummaries++;
            items.push({
              id: `${doc.id}-cs-summary`,
              type: 'cs_summary_complete',
              applicationId: doc.id,
              memberName,
              timestamp: csCompletedAt || timestamp,
              csSummaryComplete: true
            });
          }

          // Add to weekly stats if within this week
          if (csCompletedAt && csCompletedAt >= weekStart && csCompletedAt <= weekEnd) {
            const dayKey = format(csCompletedAt, 'yyyy-MM-dd');
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

      // Set total applications to today's activity count for more relevant stats
      stats.totalApplications = todayActivityCount;

      // Update weekly stats with total applications for each day
      Object.keys(weeklyData).forEach(dayKey => {
        const dayDate = weeklyData[dayKey].date;
        const dayStart = startOfDay(dayDate);
        const dayEnd = endOfDay(dayDate);
        
        const dayActivityCount = allDocs.filter(doc => {
          const data = doc.data();
          const lastModified = data.lastModified?.toDate() || data.createdAt?.toDate() || new Date();
          return lastModified >= dayStart && lastModified <= dayEnd;
        }).length;
        
        weeklyData[dayKey].totalApplications = dayActivityCount;
      });

      setDailyStats(stats);
      setWeeklyStats(weeklyData);
      setNotificationItems(items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()));
      setIsLoading(false);
    };

    return () => {
      unsubscribeUser();
      unsubscribeAdmin();
    };
  }, [firestore, toast]);


  const sendNotifications = async (type: 'documents' | 'summaries') => {
    try {
      const functions = getFunctions();
      const applicationIds = notificationItems
        .filter(item => item.type === (type === 'documents' ? 'document_upload' : 'cs_summary_complete'))
        .map(item => item.applicationId);

      if (applicationIds.length === 0) {
        toast({
          title: 'No Items to Notify',
          description: `No ${type} found to send notifications for`,
        });
        return;
      }

      const sendFunction = type === 'documents' 
        ? httpsCallable(functions, 'sendDocumentUploadNotifications')
        : httpsCallable(functions, 'sendCsSummaryNotifications');

      const result = await sendFunction({ applicationIds });
      const data = result.data as any;

      if (data.success) {
        toast({
          title: 'Notifications Sent',
          description: data.message,
          className: 'bg-green-100 text-green-900 border-green-200',
        });
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Send Failed',
        description: error.message || 'Could not send notifications',
      });
    }
  };

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
            {viewMode === 'daily' ? 'Daily Activity Dashboard' : 'Weekly Activity Dashboard'}
          </h2>
          <p className="text-muted-foreground">
            {viewMode === 'daily' 
              ? `Real-time overview of today's application activity • ${format(new Date(), 'EEEE, MMMM do, yyyy')}`
              : `Weekly breakdown of application activity by day • ${format(startOfWeek(new Date()), 'MMM do')} - ${format(endOfWeek(new Date()), 'MMM do, yyyy')}`
            }
          </p>
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
        </div>
      </div>

      {/* Stats Cards */}
      {viewMode === 'daily' ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Daily Stats Cards */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-blue-600">{dailyStats.newDocuments}</p>
                <p className="text-xs text-muted-foreground">New Documents</p>
              </div>
              <Upload className="h-4 w-4 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-green-600">{dailyStats.completedCsSummaries}</p>
                <p className="text-xs text-muted-foreground">CS Forms Complete</p>
              </div>
              <FileText className="h-4 w-4 text-green-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-orange-600">{dailyStats.pendingReview}</p>
                <p className="text-xs text-muted-foreground">Pending Review</p>
              </div>
              <Clock className="h-4 w-4 text-orange-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-purple-600">{dailyStats.totalApplications}</p>
                <p className="text-xs text-muted-foreground">Total Activity</p>
              </div>
              <TrendingUp className="h-4 w-4 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* New Documents Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-blue-600" />
              New Documents Today
              {dailyStats.newDocuments > 0 && (
                <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                  {dailyStats.newDocuments}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Documents uploaded today requiring review
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {notificationItems.filter(item => item.type === 'document_upload').length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">
                <Upload className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No new documents today</p>
              </div>
            ) : (
              <>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {notificationItems
                    .filter(item => item.type === 'document_upload')
                    .slice(0, 5)
                    .map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-2 border rounded">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{item.memberName}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.newDocumentCount} new file{item.newDocumentCount !== 1 ? 's' : ''} • {format(item.timestamp, 'HH:mm')}
                          </p>
                        </div>
                        <Link href={`/admin/applications/${item.applicationId}`}>
                          <Button size="sm" variant="outline">
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </Link>
                      </div>
                    ))}
                </div>
                
                <div className="flex gap-2 pt-2 border-t">
                  <Button
                    size="sm"
                    onClick={() => sendNotifications('documents')}
                    className="flex-1"
                  >
                    <Bell className="mr-2 h-3 w-3" />
                    Send Email Alerts
                  </Button>
                  <Link href="/admin/applications?filter=new-documents">
                    <Button size="sm" variant="outline">
                      View All
                    </Button>
                  </Link>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Completed CS Summaries Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-green-600" />
              CS Summaries Completed
              {dailyStats.completedCsSummaries > 0 && (
                <Badge className="bg-green-100 text-green-800 border-green-200">
                  {dailyStats.completedCsSummaries}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              CS Summary forms completed today
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {notificationItems.filter(item => item.type === 'cs_summary_complete').length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No completed forms today</p>
              </div>
            ) : (
              <>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {notificationItems
                    .filter(item => item.type === 'cs_summary_complete')
                    .slice(0, 5)
                    .map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-2 border rounded">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{item.memberName}</p>
                          <p className="text-xs text-muted-foreground">
                            Form completed • {format(item.timestamp, 'HH:mm')}
                          </p>
                        </div>
                        <Link href={`/admin/applications/${item.applicationId}`}>
                          <Button size="sm" variant="outline">
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </Link>
                      </div>
                    ))}
                </div>
                
                <div className="flex gap-2 pt-2 border-t">
                  <Button
                    size="sm"
                    onClick={() => sendNotifications('summaries')}
                    className="flex-1"
                  >
                    <Bell className="mr-2 h-3 w-3" />
                    Send Email Alerts
                  </Button>
                  <Link href="/admin/applications?filter=completed-cs">
                    <Button size="sm" variant="outline">
                      View All
                    </Button>
                  </Link>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      {dailyStats.pendingReview > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              Action Required
            </CardTitle>
            <CardDescription>
              {dailyStats.pendingReview} item{dailyStats.pendingReview !== 1 ? 's' : ''} need{dailyStats.pendingReview === 1 ? 's' : ''} your attention
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  sendNotifications('documents');
                  sendNotifications('summaries');
                }}
                className="flex-1"
              >
                <Bell className="mr-2 h-4 w-4" />
                Send All Notifications
              </Button>
              <Link href="/admin/applications?filter=pending-review">
                <Button variant="outline">
                  <Users className="mr-2 h-4 w-4" />
                  Review All
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
      ) : (
        /* Weekly View */
        <div className="space-y-6">
          <div className="grid grid-cols-7 gap-4">
            {Object.entries(weeklyStats).map(([dayKey, dayData]) => (
              <Card key={dayKey} className={`${isSameDay(dayData.date, new Date()) ? 'ring-2 ring-blue-500' : ''}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-center">
                    {dayData.dayName}
                  </CardTitle>
                  <CardDescription className="text-xs text-center">
                    {format(dayData.date, 'MMM d')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Upload className="h-3 w-3 text-blue-600" />
                      <span className="text-sm font-semibold text-blue-600">
                        {dayData.newDocuments}
                      </span>
                    </div>
                    <div className="flex items-center justify-center gap-1">
                      <FileText className="h-3 w-3 text-green-600" />
                      <span className="text-sm font-semibold text-green-600">
                        {dayData.completedCsSummaries}
                      </span>
                    </div>
                    <div className="flex items-center justify-center gap-1">
                      <Users className="h-3 w-3 text-gray-600" />
                      <span className="text-sm font-semibold text-gray-600">
                        {dayData.totalApplications}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          
          {/* Weekly Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Weekly Summary</CardTitle>
              <CardDescription>
                Activity summary for {format(startOfWeek(new Date()), 'MMM do')} - {format(endOfWeek(new Date()), 'MMM do, yyyy')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <Upload className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium">Documents</span>
                  </div>
                  <p className="text-2xl font-bold text-blue-600">
                    {Object.values(weeklyStats).reduce((sum, day) => sum + day.newDocuments, 0)}
                  </p>
                </div>
                <div>
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <FileText className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium">CS Summaries</span>
                  </div>
                  <p className="text-2xl font-bold text-green-600">
                    {Object.values(weeklyStats).reduce((sum, day) => sum + day.completedCsSummaries, 0)}
                  </p>
                </div>
                <div>
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <Users className="h-4 w-4 text-gray-600" />
                    <span className="text-sm font-medium">Applications</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-600">
                    {Object.values(weeklyStats).reduce((sum, day) => sum + day.totalApplications, 0)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}