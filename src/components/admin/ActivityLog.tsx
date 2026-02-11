'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useAdmin } from '@/hooks/use-admin';
import { useToast } from '@/hooks/use-toast';
import { useFirestore } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Filter, Download, RefreshCw, Upload, Edit, Mail, Phone, MessageSquare, Activity, CheckCircle } from 'lucide-react';
import { collection, getDocs, collectionGroup, doc, updateDoc } from 'firebase/firestore';
import { format, isToday, isYesterday, isThisWeek, isThisMonth } from 'date-fns';
import { cn } from '@/lib/utils';

export interface ActivityLogEntry {
  id: string;
  date: Date;
  memberName: string;
  memberId: string;
  applicationId?: string;
  appUserId?: string;
  activityType:
    | 'form_completed'
    | 'form_uploaded'
    | 'status_change'
    | 'note_added'
    | 'assignment_change'
    | 'email_sent'
    | 'call_made'
    | 'other';
  description: string;
  staffMember: string;
  userName?: string;
  notes?: string;
  formName?: string;
  oldValue?: string;
  newValue?: string;
  source: 'application' | 'notes' | 'caspio' | 'system' | 'manual';
  priority: 'low' | 'medium' | 'high';
  formIndex?: number;
  appPath?: string;
  acknowledged?: boolean;
  needsReviewType?: 'cs_summary' | 'document' | null;
  healthPlan?: string;
}

const ACTIVITY_TYPES = [
  { value: 'all', label: 'All Activities' },
  { value: 'form_completed', label: 'Forms Completed' },
  { value: 'form_uploaded', label: 'Files Uploaded' },
  { value: 'status_change', label: 'Status Changes' },
  { value: 'note_added', label: 'Notes Added' },
  { value: 'assignment_change', label: 'Staff Assignments' },
  { value: 'email_sent', label: 'Emails Sent' },
  { value: 'call_made', label: 'Calls Made' },
  { value: 'other', label: 'Other Activities' },
];

const DATE_FILTERS = [
  { value: 'all', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_30_days', label: 'Last 30 Days' },
];

const getPlanBadgeLabel = (plan?: string) => {
  const normalized = String(plan || '').toLowerCase();
  if (normalized.includes('health net')) return 'HN';
  if (normalized.includes('kaiser')) return 'K';
  return 'Other';
};

const getPlanBadgeClass = (plan?: string) => {
  const normalized = String(plan || '').toLowerCase();
  if (normalized.includes('health net')) return 'bg-green-100 text-green-800 border-green-200';
  if (normalized.includes('kaiser')) return 'bg-blue-100 text-blue-800 border-blue-200';
  return 'bg-gray-100 text-gray-800 border-gray-200';
};

const getPlanFilterLink = (plan?: string, reviewType?: ActivityLogEntry['needsReviewType']) => {
  if (!reviewType) return null;
  const normalized = String(plan || '').toLowerCase();
  const planKey = normalized.includes('health net') ? 'health-net' : normalized.includes('kaiser') ? 'kaiser' : null;
  if (!planKey) return null;
  const reviewKey = reviewType === 'cs_summary' ? 'cs' : reviewType === 'document' ? 'docs' : null;
  if (!reviewKey) return null;
  return `/admin/applications?plan=${planKey}&review=${reviewKey}`;
};

const isNewCsSummaryActivity = (activity: ActivityLogEntry) => {
  const isCsSummary =
    activity.needsReviewType === 'cs_summary' &&
    (activity.formName === 'CS Member Summary' || activity.formName === 'CS Summary');
  if (!isCsSummary) return false;
  // "New" window: 24 hours from completion
  return Date.now() - activity.date.getTime() < 24 * 60 * 60 * 1000;
};

export default function ActivityLog({
  embedded = false,
  className,
}: {
  embedded?: boolean;
  className?: string;
}) {
  const { isAdmin, isLoading: isAdminLoading } = useAdmin();
  const { toast } = useToast();
  const firestore = useFirestore();

  const [activities, setActivities] = useState<ActivityLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filters, setFilters] = useState({
    member: '',
    staff: 'all',
    activityType: 'all',
    dateRange: 'all',
    source: 'all',
  });

  const [staffMembers, setStaffMembers] = useState<string[]>([]);

  const fetchActivityData = async () => {
    if (!firestore || !isAdmin) return;

    setIsLoading(true);
    try {
      const allActivities: ActivityLogEntry[] = [];

      // 1) Applications (user apps + admin apps)
      const userAppsQuery = collectionGroup(firestore, 'applications');
      const adminAppsQuery = collection(firestore, 'applications');

      const [userAppsSnapshot, adminAppsSnapshot] = await Promise.all([
        getDocs(userAppsQuery),
        getDocs(adminAppsQuery),
      ]);

      userAppsSnapshot.docs.forEach((snap) => {
        const appData: any = snap.data();
        const memberName = `${appData.memberFirstName || ''} ${appData.memberLastName || ''}`.trim();
        const appUserId = appData.userId || snap.ref.path.split('/')[1];

        if (Array.isArray(appData.forms)) {
          appData.forms.forEach((form: any, formIndex: number) => {
            if (form.status === 'Completed' && form.dateCompleted) {
              const isSummary = form.name === 'CS Member Summary' || form.name === 'CS Summary';
              const needsCsReview = isSummary && !appData.applicationChecked;
              const needsDocAck = !isSummary && !form.acknowledged;

              allActivities.push({
                id: `${snap.id}-${form.name}-${form.dateCompleted?.seconds || Date.now()}`,
                date: form.dateCompleted.toDate ? form.dateCompleted.toDate() : new Date(form.dateCompleted),
                memberName,
                memberId: appData.client_ID2 || snap.id,
                applicationId: snap.id,
                appUserId,
                activityType: form.type === 'Upload' ? 'form_uploaded' : 'form_completed',
                description: `${form.type === 'Upload' ? 'Uploaded' : 'Completed'} ${form.name}`,
                staffMember: form.completedBy || appData.referrerName || 'System',
                userName: appData.referrerName || '',
                notes: form.notes || '',
                formName: form.name,
                source: 'application',
                priority: 'medium',
                formIndex,
                appPath: snap.ref.path,
                acknowledged: Boolean(form.acknowledged),
                needsReviewType: needsCsReview ? 'cs_summary' : needsDocAck ? 'document' : null,
                healthPlan: appData.healthPlan,
              });
            }
          });
        }

        if (appData.lastUpdated) {
          allActivities.push({
            id: `${snap.id}-status-${appData.lastUpdated?.seconds || Date.now()}`,
            date: appData.lastUpdated.toDate ? appData.lastUpdated.toDate() : new Date(appData.lastUpdated),
            memberName,
            memberId: appData.client_ID2 || snap.id,
            applicationId: snap.id,
            appUserId,
            activityType: 'status_change',
            description: `Application status: ${appData.status}`,
            staffMember: appData.referrerName || 'System',
            userName: appData.referrerName || '',
            notes: `Pathway: ${appData.pathway}, Health Plan: ${appData.healthPlan}`,
            oldValue: '',
            newValue: appData.status,
            source: 'application',
            priority: appData.status === 'Requires Revision' ? 'high' : 'low',
            healthPlan: appData.healthPlan,
          });
        }
      });

      adminAppsSnapshot.docs.forEach((snap) => {
        const appData: any = snap.data();
        const memberName = `${appData.memberFirstName || ''} ${appData.memberLastName || ''}`.trim();

        if (Array.isArray(appData.forms)) {
          appData.forms.forEach((form: any, formIndex: number) => {
            if (form.status === 'Completed' && form.dateCompleted) {
              const isSummary = form.name === 'CS Member Summary' || form.name === 'CS Summary';
              const needsCsReview = isSummary && !appData.applicationChecked;
              const needsDocAck = !isSummary && !form.acknowledged;
              allActivities.push({
                id: `admin-${snap.id}-${form.name}-${form.dateCompleted?.seconds || Date.now()}`,
                date: form.dateCompleted.toDate ? form.dateCompleted.toDate() : new Date(form.dateCompleted),
                memberName,
                memberId: appData.client_ID2 || snap.id,
                applicationId: snap.id,
                activityType: form.type === 'Upload' ? 'form_uploaded' : 'form_completed',
                description: `${form.type === 'Upload' ? 'Uploaded' : 'Completed'} ${form.name}`,
                staffMember: form.completedBy || 'Admin',
                userName: 'Admin',
                notes: form.notes || '',
                formName: form.name,
                source: 'application',
                priority: 'medium',
                formIndex,
                appPath: snap.ref.path,
                acknowledged: Boolean(form.acknowledged),
                needsReviewType: needsCsReview ? 'cs_summary' : needsDocAck ? 'document' : null,
                healthPlan: appData.healthPlan,
              });
            }
          });
        }

        if (appData.lastUpdated) {
          allActivities.push({
            id: `admin-${snap.id}-status-${appData.lastUpdated?.seconds || Date.now()}`,
            date: appData.lastUpdated.toDate ? appData.lastUpdated.toDate() : new Date(appData.lastUpdated),
            memberName,
            memberId: appData.client_ID2 || snap.id,
            applicationId: snap.id,
            activityType: 'status_change',
            description: `Application status: ${appData.status}`,
            staffMember: appData.referrerName || 'System',
            userName: appData.referrerName || '',
            notes: `Pathway: ${appData.pathway}, Health Plan: ${appData.healthPlan}`,
            oldValue: '',
            newValue: appData.status,
            source: 'application',
            priority: appData.status === 'Requires Revision' ? 'high' : 'low',
            healthPlan: appData.healthPlan,
          });
        }
      });

      // 2) Notifications/system logs
      try {
        const notificationsSnapshot = await getDocs(collection(firestore, 'notifications'));
        notificationsSnapshot.docs.forEach((snap) => {
          const notifData: any = snap.data();
          if (notifData.memberName && notifData.sentAt) {
            allActivities.push({
              id: `notification-${snap.id}`,
              date: notifData.sentAt.toDate ? notifData.sentAt.toDate() : new Date(notifData.sentAt),
              memberName: notifData.memberName,
              memberId: notifData.applicationId || '',
              activityType: 'email_sent',
              description: `Email sent: ${notifData.type || 'Notification'}`,
              staffMember: notifData.sentBy || 'System',
              userName: notifData.userName || '',
              notes: notifData.message || '',
              source: 'system',
              priority: 'low',
            });
          }
        });
      } catch (error) {
        console.log('Could not fetch notifications:', error);
      }

      // 3) Staff notifications (notes)
      try {
        const staffNotificationsSnapshot = await getDocs(collection(firestore, 'staff_notifications'));
        staffNotificationsSnapshot.docs.forEach((snap) => {
          const noteData: any = snap.data();
          if (!noteData?.timestamp) return;
          allActivities.push({
            id: `staff-note-${snap.id}`,
            date: noteData.timestamp?.toDate ? noteData.timestamp.toDate() : new Date(noteData.timestamp),
            memberName: noteData.memberName || 'General Note',
            memberId: noteData.clientId2 || noteData.memberId || '',
            applicationId: noteData.applicationId,
            appUserId: noteData.userId || undefined,
            activityType: 'note_added',
            description: noteData.title || 'Note added',
            staffMember: noteData.senderName || noteData.createdByName || 'System',
            userName: noteData.senderName || noteData.createdByName || '',
            notes: noteData.message || '',
            source: 'notes',
            priority: String(noteData.priority || '').toLowerCase().includes('high') ? 'high' : 'low',
            healthPlan: noteData.healthPlan || '',
          });
        });
      } catch (error) {
        console.log('Could not fetch staff notifications:', error);
      }

      allActivities.sort((a, b) => b.date.getTime() - a.date.getTime());
      setActivities(allActivities);

      const uniqueStaff = [...new Set(allActivities.map((a) => a.staffMember).filter(Boolean))];
      setStaffMembers(uniqueStaff.sort());

      toast({
        title: 'Activity Log Loaded',
        description: `Loaded ${allActivities.length} activities`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error) {
      console.error('Error fetching activity data:', error);
      toast({
        title: 'Load Failed',
        description: 'Failed to load activity log. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const filteredActivities = useMemo(() => {
    return activities.filter((activity) => {
      if (filters.member && !activity.memberName.toLowerCase().includes(filters.member.toLowerCase())) return false;
      if (filters.staff !== 'all' && activity.staffMember !== filters.staff) return false;
      if (filters.activityType !== 'all' && activity.activityType !== filters.activityType) return false;

      if (filters.dateRange !== 'all') {
        const d = activity.date;
        switch (filters.dateRange) {
          case 'today':
            if (!isToday(d)) return false;
            break;
          case 'yesterday':
            if (!isYesterday(d)) return false;
            break;
          case 'this_week':
            if (!isThisWeek(d)) return false;
            break;
          case 'this_month':
            if (!isThisMonth(d)) return false;
            break;
          case 'last_30_days': {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            if (d < thirtyDaysAgo) return false;
            break;
          }
        }
      }

      if (filters.source !== 'all' && activity.source !== filters.source) return false;
      return true;
    });
  }, [activities, filters]);

  const clearFilters = () => {
    setFilters({
      member: '',
      staff: 'all',
      activityType: 'all',
      dateRange: 'all',
      source: 'all',
    });
  };

  const handleAcknowledge = async (activity: ActivityLogEntry, checked: boolean) => {
    if (!firestore || activity.formIndex === undefined || !activity.appPath) return;
    try {
      const docRef = doc(firestore, activity.appPath);
      await updateDoc(docRef, {
        [`forms.${activity.formIndex}.acknowledged`]: checked,
      });
      setActivities((prev) => prev.map((e) => (e.id === activity.id ? { ...e, acknowledged: checked } : e)));
      toast({
        title: checked ? 'Document acknowledged' : 'Acknowledgement removed',
        description: `${activity.formName || 'Document'} updated.`,
      });
    } catch (error) {
      console.error('Error acknowledging document:', error);
      toast({
        title: 'Update failed',
        description: 'Could not update acknowledgement status.',
        variant: 'destructive',
      });
    }
  };

  const getActivityIcon = (type: ActivityLogEntry['activityType']) => {
    switch (type) {
      case 'form_completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'form_uploaded':
        return <Upload className="h-4 w-4 text-blue-600" />;
      case 'status_change':
        return <Edit className="h-4 w-4 text-orange-600" />;
      case 'note_added':
        return <MessageSquare className="h-4 w-4 text-purple-600" />;
      case 'assignment_change':
        return <Activity className="h-4 w-4 text-indigo-600" />;
      case 'email_sent':
        return <Mail className="h-4 w-4 text-cyan-600" />;
      case 'call_made':
        return <Phone className="h-4 w-4 text-pink-600" />;
      default:
        return <Activity className="h-4 w-4 text-gray-600" />;
    }
  };

  const getPriorityColor = (priority: ActivityLogEntry['priority']) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatDate = (date: Date) => {
    if (isToday(date)) return `Today ${format(date, 'h:mm a')}`;
    if (isYesterday(date)) return `Yesterday ${format(date, 'h:mm a')}`;
    return format(date, 'MMM d, yyyy h:mm a');
  };

  if (isAdminLoading) return <div className="flex items-center justify-center h-64">Loading...</div>;
  if (!isAdmin) return <div className="flex items-center justify-center h-64">Access denied</div>;

  return (
    <div className={cn(embedded ? 'space-y-6' : 'container mx-auto p-6 space-y-6', className)}>
      {!embedded && (
        <div className="flex items-center gap-3 mb-6">
          <Activity className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Activity Log</h1>
            <p className="text-muted-foreground">Comprehensive log of all member-related activities</p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Member Name</label>
              <Input
                placeholder="Search member..."
                value={filters.member}
                onChange={(e) => setFilters((p) => ({ ...p, member: e.target.value }))}
                className="h-9"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Staff Member</label>
              <Select value={filters.staff} onValueChange={(value) => setFilters((p) => ({ ...p, staff: value }))}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All Staff" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Staff</SelectItem>
                  {staffMembers.map((staff) => (
                    <SelectItem key={staff} value={staff}>
                      {staff}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Activity Type</label>
              <Select
                value={filters.activityType}
                onValueChange={(value) => setFilters((p) => ({ ...p, activityType: value }))}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  {ACTIVITY_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Date Range</label>
              <Select value={filters.dateRange} onValueChange={(value) => setFilters((p) => ({ ...p, dateRange: value }))}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All Time" />
                </SelectTrigger>
                <SelectContent>
                  {DATE_FILTERS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Source</label>
              <Select value={filters.source} onValueChange={(value) => setFilters((p) => ({ ...p, source: value }))}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All Sources" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  <SelectItem value="application">Applications</SelectItem>
                  <SelectItem value="notes">Notes</SelectItem>
                  <SelectItem value="caspio">Caspio</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end gap-2">
              <Button variant="outline" onClick={clearFilters} className="h-9">
                Clear
              </Button>
              <Button onClick={fetchActivityData} disabled={isLoading} className="h-9">
                {isLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Activity Log ({filteredActivities.length} entries)</span>
            <Button variant="outline" size="sm" disabled>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2">Loading activities...</span>
            </div>
          ) : filteredActivities.length === 0 ? (
            <div className="text-center py-12">
              <Activity className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No activities found</h3>
              <p className="mt-1 text-sm text-gray-500">Try adjusting your filters or refresh the data.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">Date</TableHead>
                    <TableHead className="w-[180px]">Member</TableHead>
                    <TableHead className="w-[60px]">Type</TableHead>
                    <TableHead className="w-[70px]">Alert</TableHead>
                    <TableHead>Activity</TableHead>
                    <TableHead className="w-[120px]">Staff</TableHead>
                    <TableHead className="w-[110px]">Acknowledged</TableHead>
                    <TableHead className="w-[100px]">Priority</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredActivities.map((activity) => (
                    <TableRow key={activity.id} className="hover:bg-gray-50">
                      <TableCell className="text-xs">{formatDate(activity.date)}</TableCell>
                      <TableCell className="font-medium text-sm">
                        <div>
                          {activity.applicationId ? (
                            <Link
                              href={
                                activity.appUserId
                                  ? `/admin/applications/${activity.applicationId}?userId=${activity.appUserId}`
                                  : `/admin/applications/${activity.applicationId}`
                              }
                              className="font-medium text-blue-700 hover:underline"
                            >
                              {activity.memberName}
                            </Link>
                          ) : (
                            <div className="font-medium">{activity.memberName}</div>
                          )}
                          {activity.memberId && <div className="text-xs text-gray-500">ID: {activity.memberId}</div>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center">{getActivityIcon(activity.activityType)}</div>
                      </TableCell>
                      <TableCell>
                        {activity.needsReviewType ? (
                          <div className="flex items-center gap-1.5">
                            {isNewCsSummaryActivity(activity) && (
                              <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200 text-[10px] px-1.5 py-0.5">
                                New
                              </Badge>
                            )}
                            <Link
                              href={getPlanFilterLink(activity.healthPlan, activity.needsReviewType) || '#'}
                              className="inline-flex items-center"
                            >
                              <Badge
                                variant="outline"
                                className={cn('text-[10px] px-1.5 py-0.5', getPlanBadgeClass(activity.healthPlan))}
                              >
                                {getPlanBadgeLabel(activity.healthPlan)}(
                                {activity.needsReviewType === 'cs_summary' ? 'CS' : 'D'})
                              </Badge>
                            </Link>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="font-medium">{activity.description}</div>
                        {activity.formName && <div className="text-xs text-gray-500">Form: {activity.formName}</div>}
                        {activity.oldValue && activity.newValue && (
                          <div className="text-xs text-gray-500">
                            {activity.oldValue} → {activity.newValue}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="font-medium">{activity.staffMember}</div>
                        {activity.userName && activity.userName !== activity.staffMember && (
                          <div className="text-xs text-gray-500">by {activity.userName}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        {activity.activityType === 'form_completed' || activity.activityType === 'form_uploaded' ? (
                          <Checkbox
                            checked={activity.acknowledged || false}
                            onCheckedChange={(value) => handleAcknowledge(activity, Boolean(value))}
                            aria-label="Acknowledge document"
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('text-xs', getPriorityColor(activity.priority))}>
                          {activity.priority}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-gray-600 max-w-xs">
                        {activity.notes && (
                          <div className="truncate" title={activity.notes}>
                            {activity.notes}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

