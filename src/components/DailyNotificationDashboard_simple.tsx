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
import { format, startOfDay, endOfDay, isToday, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';

interface DailyStats {
  newDocuments: number;
  completedCsSummaries: number;
  totalApplications: number;
  pendingReview: number;
}

export function DailyNotificationDashboard() {
  const [viewMode, setViewMode] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [dailyStats, setDailyStats] = useState<DailyStats>({
    newDocuments: 0,
    completedCsSummaries: 0,
    totalApplications: 0,
    pendingReview: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const firestore = useFirestore();

  useEffect(() => {
    if (!firestore) return;

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
      let todayActivityCount = 0;

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

        // Count completed CS summaries
        if (data.csSummaryComplete) {
          const csCompletedAt = data.csSummaryCompletedAt?.toDate();
          const csCompletedToday = csCompletedAt && isToday(csCompletedAt);
          
          console.log(`🔍 CS Summary Debug for ${memberName}:`, {
            csSummaryComplete: data.csSummaryComplete,
            csSummaryCompletedAt: csCompletedAt,
            csCompletedToday,
            today: new Date(),
            applicationId: doc.id
          });
          
          if (csCompletedToday) {
            stats.completedCsSummaries++;
          }
        }

        // Count pending review items
        if (data.hasNewDocuments || (data.csSummaryComplete && !data.csSummaryNotificationSent)) {
          stats.pendingReview++;
        }
      });

      stats.totalApplications = todayActivityCount;

      setDailyStats(stats);
      setIsLoading(false);
    };

    const unsubscribeUser = onSnapshot(userApplicationsQuery, (userSnapshot) => {
      userDocs = userSnapshot.docs;
      processAllApplications();
    }, handleError);
    
    const unsubscribeAdmin = onSnapshot(adminApplicationsQuery, (adminSnapshot) => {
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
            {viewMode === 'daily' && 'Daily Activity Dashboard'}
            {viewMode === 'weekly' && 'Weekly Activity Dashboard'}
            {viewMode === 'monthly' && 'Monthly Activity Dashboard'}
          </h2>
          <p className="text-muted-foreground">
            {viewMode === 'daily' && `Real-time overview of today's application activity • ${format(new Date(), 'EEEE, MMMM do, yyyy')}`}
            {viewMode === 'weekly' && `Weekly breakdown of application activity by day • ${format(startOfWeek(new Date()), 'MMM do')} - ${format(endOfWeek(new Date()), 'MMM do, yyyy')}`}
            {viewMode === 'monthly' && `Monthly breakdown of application activity by week • ${format(startOfMonth(new Date()), 'MMMM yyyy')}`}
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

      {/* Placeholder for Weekly/Monthly Views */}
      {viewMode !== 'daily' && (
        <Card>
          <CardHeader>
            <CardTitle>{viewMode === 'weekly' ? 'Weekly' : 'Monthly'} View</CardTitle>
            <CardDescription>
              {viewMode === 'weekly' ? 'Weekly' : 'Monthly'} breakdown coming soon...
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              This view is being developed. For now, please use the Daily view to see current activity.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}