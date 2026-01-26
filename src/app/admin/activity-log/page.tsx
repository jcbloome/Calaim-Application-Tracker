'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Calendar, 
  User, 
  FileText, 
  Filter, 
  Download, 
  RefreshCw, 
  Search, 
  Clock,
  AlertCircle,
  CheckCircle,
  Upload,
  Edit,
  Mail,
  Phone,
  MessageSquare,
  Activity,
} from 'lucide-react';
import { useFirestore } from '@/firebase';
import { collection, getDocs, collectionGroup, doc, updateDoc } from 'firebase/firestore';
import { format, isToday, isYesterday, isThisWeek, isThisMonth, parseISO } from 'date-fns';

interface ActivityLogEntry {
  id: string;
  date: Date;
  memberName: string;
  memberId: string;
  activityType: 'form_completed' | 'form_uploaded' | 'status_change' | 'note_added' | 'assignment_change' | 'email_sent' | 'call_made' | 'other';
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
  { value: 'other', label: 'Other Activities' }
];

const DATE_FILTERS = [
  { value: 'all', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_30_days', label: 'Last 30 Days' }
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

export default function ActivityLogPage() {
  const { isAdmin, isLoading: isAdminLoading } = useAdmin();
  const { toast } = useToast();
  const firestore = useFirestore();
  
  const [activities, setActivities] = useState<ActivityLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState({
    member: '',
    staff: 'all',
    activityType: 'all',
    dateRange: 'all',
    source: 'all'
  });
  
  const [staffMembers, setStaffMembers] = useState<string[]>([]);
  const [memberNames, setMemberNames] = useState<string[]>([]);

  // Fetch activity data from multiple sources
  const fetchActivityData = async () => {
    if (!firestore || !isAdmin) return;
    
    setIsLoading(true);
    try {
      const allActivities: ActivityLogEntry[] = [];
      
      // 1. Fetch from application forms
      const userAppsQuery = collectionGroup(firestore, 'applications');
      const adminAppsQuery = collection(firestore, 'applications');
      
      const [userAppsSnapshot, adminAppsSnapshot] = await Promise.all([
        getDocs(userAppsQuery),
        getDocs(adminAppsQuery)
      ]);

      // Process user applications
      userAppsSnapshot.docs.forEach(doc => {
        const appData = doc.data();
        const memberName = `${appData.memberFirstName || ''} ${appData.memberLastName || ''}`.trim();
        
        if (appData.forms && Array.isArray(appData.forms)) {
          appData.forms.forEach((form: any, formIndex: number) => {
            if (form.status === 'Completed' && form.dateCompleted) {
              const isSummary = form.name === 'CS Member Summary' || form.name === 'CS Summary';
              const needsCsReview = isSummary && !appData.applicationChecked;
              const needsDocAck = !isSummary && !form.acknowledged;
              allActivities.push({
                id: `${doc.id}-${form.name}-${form.dateCompleted?.seconds || Date.now()}`,
                date: form.dateCompleted.toDate ? form.dateCompleted.toDate() : new Date(form.dateCompleted),
                memberName,
                memberId: appData.client_ID2 || doc.id,
                activityType: form.type === 'Upload' ? 'form_uploaded' : 'form_completed',
                description: `${form.type === 'Upload' ? 'Uploaded' : 'Completed'} ${form.name}`,
                staffMember: form.completedBy || appData.referrerName || 'System',
                userName: appData.referrerName || '',
                notes: form.notes || '',
                formName: form.name,
                source: 'application',
                priority: 'medium',
                formIndex,
                appPath: doc.ref.path,
                acknowledged: Boolean(form.acknowledged),
                needsReviewType: needsCsReview ? 'cs_summary' : (needsDocAck ? 'document' : null),
                healthPlan: appData.healthPlan
              });
            }
          });
        }

        // Status changes
        if (appData.lastUpdated) {
          allActivities.push({
            id: `${doc.id}-status-${appData.lastUpdated?.seconds || Date.now()}`,
            date: appData.lastUpdated.toDate ? appData.lastUpdated.toDate() : new Date(appData.lastUpdated),
            memberName,
            memberId: appData.client_ID2 || doc.id,
            activityType: 'status_change',
            description: `Application status: ${appData.status}`,
            staffMember: appData.referrerName || 'System',
            userName: appData.referrerName || '',
            notes: `Pathway: ${appData.pathway}, Health Plan: ${appData.healthPlan}`,
            oldValue: '',
            newValue: appData.status,
            source: 'application',
            priority: appData.status === 'Requires Revision' ? 'high' : 'low',
            healthPlan: appData.healthPlan
          });
        }
      });

      // Process admin applications
      adminAppsSnapshot.docs.forEach(doc => {
        const appData = doc.data();
        const memberName = `${appData.memberFirstName || ''} ${appData.memberLastName || ''}`.trim();
        
        if (appData.forms && Array.isArray(appData.forms)) {
          appData.forms.forEach((form: any, formIndex: number) => {
            if (form.status === 'Completed' && form.dateCompleted) {
              const isSummary = form.name === 'CS Member Summary' || form.name === 'CS Summary';
              const needsCsReview = isSummary && !appData.applicationChecked;
              const needsDocAck = !isSummary && !form.acknowledged;
              allActivities.push({
                id: `admin-${doc.id}-${form.name}-${form.dateCompleted?.seconds || Date.now()}`,
                date: form.dateCompleted.toDate ? form.dateCompleted.toDate() : new Date(form.dateCompleted),
                memberName,
                memberId: appData.client_ID2 || doc.id,
                activityType: form.type === 'Upload' ? 'form_uploaded' : 'form_completed',
                description: `${form.type === 'Upload' ? 'Uploaded' : 'Completed'} ${form.name}`,
                staffMember: form.completedBy || 'Admin',
                userName: 'Admin',
                notes: form.notes || '',
                formName: form.name,
                source: 'application',
                priority: 'medium',
                formIndex,
                appPath: doc.ref.path,
                acknowledged: Boolean(form.acknowledged),
                needsReviewType: needsCsReview ? 'cs_summary' : (needsDocAck ? 'document' : null),
                healthPlan: appData.healthPlan
              });
            }
          });
        }
      });

      // 2. Fetch from notifications/system logs
      try {
        const notificationsSnapshot = await getDocs(collection(firestore, 'notifications'));
        notificationsSnapshot.docs.forEach(doc => {
          const notifData = doc.data();
          if (notifData.memberName && notifData.sentAt) {
            allActivities.push({
              id: `notification-${doc.id}`,
              date: notifData.sentAt.toDate ? notifData.sentAt.toDate() : new Date(notifData.sentAt),
              memberName: notifData.memberName,
              memberId: notifData.applicationId || '',
              activityType: 'email_sent',
              description: `Email sent: ${notifData.type || 'Notification'}`,
              staffMember: notifData.sentBy || 'System',
              userName: notifData.userName || '',
              notes: notifData.message || '',
              source: 'system',
              priority: 'low'
            });
          }
        });
      } catch (error) {
        console.log('Could not fetch notifications:', error);
      }

      // Sort by date (most recent first)
      allActivities.sort((a, b) => b.date.getTime() - a.date.getTime());
      
      setActivities(allActivities);
      
      // Extract unique staff members and member names for filters
      const uniqueStaff = [...new Set(allActivities.map(a => a.staffMember).filter(Boolean))];
      const uniqueMembers = [...new Set(allActivities.map(a => a.memberName).filter(Boolean))];
      
      setStaffMembers(uniqueStaff.sort());
      setMemberNames(uniqueMembers.sort());
      
      toast({
        title: "Activity Log Loaded",
        description: `Loaded ${allActivities.length} activities`,
        className: "bg-green-100 text-green-900 border-green-200",
      });
      
    } catch (error) {
      console.error('Error fetching activity data:', error);
      toast({
        title: "Load Failed",
        description: "Failed to load activity log. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchActivityData();
  }, [firestore, isAdmin]);

  // Filter activities based on current filters
  const filteredActivities = useMemo(() => {
    return activities.filter(activity => {
      // Member filter
      if (filters.member && !activity.memberName.toLowerCase().includes(filters.member.toLowerCase())) {
        return false;
      }
      
      // Staff filter
      if (filters.staff !== 'all' && activity.staffMember !== filters.staff) {
        return false;
      }
      
      // Activity type filter
      if (filters.activityType !== 'all' && activity.activityType !== filters.activityType) {
        return false;
      }
      
      // Date range filter
      if (filters.dateRange !== 'all') {
        const activityDate = activity.date;
        switch (filters.dateRange) {
          case 'today':
            if (!isToday(activityDate)) return false;
            break;
          case 'yesterday':
            if (!isYesterday(activityDate)) return false;
            break;
          case 'this_week':
            if (!isThisWeek(activityDate)) return false;
            break;
          case 'this_month':
            if (!isThisMonth(activityDate)) return false;
            break;
          case 'last_30_days':
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            if (activityDate < thirtyDaysAgo) return false;
            break;
        }
      }
      
      // Source filter
      if (filters.source !== 'all' && activity.source !== filters.source) {
        return false;
      }
      
      return true;
    });
  }, [activities, filters]);

  const handleFilterChange = (filterType: string, value: string) => {
    setFilters(prev => ({ ...prev, [filterType]: value }));
  };

  const clearFilters = () => {
    setFilters({
      member: '',
      staff: 'all',
      activityType: 'all',
      dateRange: 'all',
      source: 'all'
    });
  };

  const handleAcknowledge = async (activity: ActivityLogEntry, checked: boolean) => {
    if (!firestore || activity.formIndex === undefined || !activity.appPath) return;
    try {
      const docRef = doc(firestore, activity.appPath);
      await updateDoc(docRef, {
        [`forms.${activity.formIndex}.acknowledged`]: checked,
      });
      setActivities((prev) =>
        prev.map((entry) =>
          entry.id === activity.id ? { ...entry, acknowledged: checked } : entry
        )
      );
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

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'form_completed': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'form_uploaded': return <Upload className="h-4 w-4 text-blue-600" />;
      case 'status_change': return <Edit className="h-4 w-4 text-orange-600" />;
      case 'note_added': return <MessageSquare className="h-4 w-4 text-purple-600" />;
      case 'assignment_change': return <User className="h-4 w-4 text-indigo-600" />;
      case 'email_sent': return <Mail className="h-4 w-4 text-cyan-600" />;
      case 'call_made': return <Phone className="h-4 w-4 text-pink-600" />;
      default: return <Activity className="h-4 w-4 text-gray-600" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatDate = (date: Date) => {
    if (isToday(date)) return `Today ${format(date, 'h:mm a')}`;
    if (isYesterday(date)) return `Yesterday ${format(date, 'h:mm a')}`;
    return format(date, 'MMM d, yyyy h:mm a');
  };

  if (isAdminLoading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>;
  }

  if (!isAdmin) {
    return <div className="flex items-center justify-center h-64">Access denied</div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Activity className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Activity Log</h1>
          <p className="text-muted-foreground">Comprehensive log of all member-related activities</p>
        </div>
      </div>

      {/* Filters */}
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
                onChange={(e) => handleFilterChange('member', e.target.value)}
                className="h-9"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium mb-1 block">Staff Member</label>
              <Select value={filters.staff} onValueChange={(value) => handleFilterChange('staff', value)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All Staff" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Staff</SelectItem>
                  {staffMembers.map(staff => (
                    <SelectItem key={staff} value={staff}>{staff}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-1 block">Activity Type</label>
              <Select value={filters.activityType} onValueChange={(value) => handleFilterChange('activityType', value)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  {ACTIVITY_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-1 block">Date Range</label>
              <Select value={filters.dateRange} onValueChange={(value) => handleFilterChange('dateRange', value)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All Time" />
                </SelectTrigger>
                <SelectContent>
                  {DATE_FILTERS.map(date => (
                    <SelectItem key={date.value} value={date.value}>{date.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-1 block">Source</label>
              <Select value={filters.source} onValueChange={(value) => handleFilterChange('source', value)}>
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

      {/* Activity Log Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Activity Log ({filteredActivities.length} entries)</span>
            <Button variant="outline" size="sm">
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
              <p className="mt-1 text-sm text-gray-500">
                Try adjusting your filters or refresh the data.
              </p>
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
                      <TableCell className="text-xs">
                        {formatDate(activity.date)}
                      </TableCell>
                      <TableCell className="font-medium text-sm">
                        <div>
                          <div className="font-medium">{activity.memberName}</div>
                          {activity.memberId && (
                            <div className="text-xs text-gray-500">ID: {activity.memberId}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center">
                          {getActivityIcon(activity.activityType)}
                        </div>
                      </TableCell>
                      <TableCell>
                        {activity.needsReviewType === 'cs_summary' ? (
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0.5 ${getPlanBadgeClass(activity.healthPlan)}`}
                          >
                            {getPlanBadgeLabel(activity.healthPlan)}(CS)
                          </Badge>
                        ) : activity.needsReviewType === 'document' ? (
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0.5 ${getPlanBadgeClass(activity.healthPlan)}`}
                          >
                            {getPlanBadgeLabel(activity.healthPlan)}(D)
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="font-medium">{activity.description}</div>
                        {activity.formName && (
                          <div className="text-xs text-gray-500">Form: {activity.formName}</div>
                        )}
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
                        <Badge variant="outline" className={`text-xs ${getPriorityColor(activity.priority)}`}>
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