'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useFirestore } from '@/firebase';
import { collection, query, where, onSnapshot, orderBy, Timestamp } from 'firebase/firestore';
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
  AlertTriangle,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { format, startOfDay, endOfDay } from 'date-fns';
import Link from 'next/link';

interface DailyStats {
  newDocuments: number;
  completedCsSummaries: number;
  totalApplications: number;
  pendingReview: number;
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
  const [dailyStats, setDailyStats] = useState<DailyStats>({
    newDocuments: 0,
    completedCsSummaries: 0,
    totalApplications: 0,
    pendingReview: 0
  });
  const [notificationItems, setNotificationItems] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();
  const firestore = useFirestore();

  // Load daily statistics and notifications
  useEffect(() => {
    if (!firestore) return;

    const today = new Date();
    const startOfToday = startOfDay(today);
    const endOfToday = endOfDay(today);

    // Query for applications with activity today
    const applicationsQuery = query(
      collection(firestore, 'applications'),
      where('lastModified', '>=', Timestamp.fromDate(startOfToday)),
      where('lastModified', '<=', Timestamp.fromDate(endOfToday)),
      orderBy('lastModified', 'desc')
    );

    const unsubscribe = onSnapshot(applicationsQuery, (snapshot) => {
      const stats: DailyStats = {
        newDocuments: 0,
        completedCsSummaries: 0,
        totalApplications: snapshot.size,
        pendingReview: 0
      };

      const items: NotificationItem[] = [];

      snapshot.forEach((doc) => {
        const data = doc.data();
        const memberName = `${data.memberFirstName} ${data.memberLastName}`;
        const timestamp = data.lastModified?.toDate() || new Date();

        // Count new documents
        if (data.hasNewDocuments && data.newDocumentCount > 0) {
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

        // Count completed CS summaries
        if (data.csSummaryComplete && !data.csSummaryNotificationSent) {
          stats.completedCsSummaries++;
          items.push({
            id: `${doc.id}-cs-summary`,
            type: 'cs_summary_complete',
            applicationId: doc.id,
            memberName,
            timestamp,
            csSummaryComplete: true
          });
        }

        // Count pending review items
        if (data.hasNewDocuments || (data.csSummaryComplete && !data.csSummaryNotificationSent)) {
          stats.pendingReview++;
        }
      });

      setDailyStats(stats);
      setNotificationItems(items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()));
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [firestore]);

  const refreshData = async () => {
    setIsRefreshing(true);
    try {
      const functions = getFunctions();
      const checkDocuments = httpsCallable(functions, 'checkForNewDocuments');
      const checkSummaries = httpsCallable(functions, 'checkForCompletedCsSummaries');
      
      await Promise.all([
        checkDocuments({}),
        checkSummaries({})
      ]);
      
      toast({
        title: 'Data Refreshed',
        description: 'Daily statistics updated',
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Refresh Failed',
        description: 'Could not refresh data',
      });
    } finally {
      setIsRefreshing(false);
    }
  };

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
          <h2 className="text-2xl font-bold tracking-tight">Daily Activity Dashboard</h2>
          <p className="text-muted-foreground">
            {format(new Date(), 'EEEE, MMMM do, yyyy')}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={refreshData}
          disabled={isRefreshing}
        >
          {isRefreshing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Refresh
        </Button>
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
      )}
    </div>
  );
}