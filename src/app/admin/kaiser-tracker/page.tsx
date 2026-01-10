'use client';

import { useState } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, User, Clock, CheckCircle, XCircle, AlertTriangle, Calendar } from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useToast } from '@/hooks/use-toast';

// Simplified status groupings for dashboard overview
const statusGroups = {
  starting: ["Pre-T2038, Compiling Docs", "T2038 Requested"],
  documentation: ["T2038 Received", "T2038 received, Need First Contact", "T2038 received, doc collection", "T2038 email but need auth sheet"],
  assessment: ["Needs RN Visit", "RN/MSW Scheduled", "RN Visit Complete"],
  tierLevel: ["Need Tier Level", "Tier Level Requested", "Tier Level Received"],
  placement: ["Locating RCFEs", "Found RCFE", "R&B Requested", "R&B Signed"],
  contracting: ["RCFE/ILS for Invoicing", "ILS Contracted (Complete)", "Confirm ILS Contracted"],
  completed: ["Complete"],
  issues: ["Tier Level Revision Request", "Tier Level Appeal", "On-Hold", "Non-active"]
};

interface KaiserMember {
  id: string;
  memberFirstName: string;
  memberLastName: string;
  memberMediCalNum: string;
  memberMrn: string;
  memberCounty: string;
  client_ID2: string;
  Kaiser_Status: string;
  CalAIM_Status: string;
  kaiser_user_assignment: string;
  pathway: string;
  next_steps_date: string;
  source: string;
}

// Helper functions
const isOverdue = (dateString: string): boolean => {
  if (!dateString) return false;
  const dueDate = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return dueDate < today;
};

const getDaysOverdue = (dateString: string): number => {
  if (!dateString) return 0;
  const dueDate = new Date(dateString);
  const today = new Date();
  const diffTime = today.getTime() - dueDate.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

const formatDate = (dateString: string): string => {
  if (!dateString) return 'No date set';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric' 
  });
};

const getStatusGroup = (status: string): string => {
  for (const [group, statuses] of Object.entries(statusGroups)) {
    if (statuses.includes(status)) return group;
  }
  return 'other';
};

export default function KaiserTrackerPage() {
  const { isAdmin } = useAdmin();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [members, setMembers] = useState<KaiserMember[]>([]);

  if (!isAdmin) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
          </CardHeader>
          <CardContent>
            <p>You need admin access to view the Kaiser Tracker.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSync = async () => {
    setIsLoading(true);
    try {
      const functions = getFunctions();
      const fetchKaiserMembers = httpsCallable(functions, 'fetchKaiserMembersFromCaspio');
      
      toast({
        title: 'Syncing...',
        description: 'Fetching Kaiser members from Caspio database',
      });
      
      const result = await fetchKaiserMembers();
      const data = result.data as any;
      
      if (data.success) {
        setMembers(data.members || []);
        toast({
          title: 'Success!',
          description: `Loaded ${data.total || data.members?.length || 0} Kaiser members from Caspio`,
          className: 'bg-green-100 text-green-900 border-green-200',
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: data.message || 'Failed to fetch Caspio data',
        });
      }
    } catch (error: any) {
      console.error('Error:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to connect to Caspio',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    if (status === 'Complete' || status === 'ILS Contracted (Complete)') {
      return 'bg-green-100 text-green-800';
    }
    if (status === 'On-Hold' || status === 'Non-active') {
      return 'bg-red-100 text-red-800';
    }
    if (status?.includes('Appeal') || status?.includes('Revision')) {
      return 'bg-orange-100 text-orange-800';
    }
    return 'bg-blue-100 text-blue-800';
  };

  const getStatusIcon = (status: string) => {
    if (status === 'Complete' || status === 'ILS Contracted (Complete)') {
      return <CheckCircle className="h-3 w-3" />;
    }
    if (status === 'On-Hold' || status === 'Non-active') {
      return <XCircle className="h-3 w-3" />;
    }
    return <Clock className="h-3 w-3" />;
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Kaiser Tracker Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of all Kaiser members from Caspio. Click "Manage" to access detailed tracking in the Staff Application Tracker.
          </p>
        </div>
        <Button onClick={handleSync} disabled={isLoading}>
          {isLoading ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Sync from Caspio
        </Button>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Members</CardTitle>
            <User className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{members.length}</div>
            <p className="text-xs text-muted-foreground">Kaiser members</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue Tasks</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {members.filter(m => isOverdue(m.next_steps_date)).length}
            </div>
            <p className="text-xs text-muted-foreground">Past due date</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {members.filter(m => m.Kaiser_Status === 'Complete' || m.Kaiser_Status === 'ILS Contracted (Complete)').length}
            </div>
            <p className="text-xs text-muted-foreground">Finished cases</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">On Hold</CardTitle>
            <XCircle className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {members.filter(m => m.Kaiser_Status === 'On-Hold' || m.Kaiser_Status === 'Non-active').length}
            </div>
            <p className="text-xs text-muted-foreground">Paused cases</p>
          </CardContent>
        </Card>
      </div>

      {/* Process Stage Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {Object.entries(statusGroups).map(([groupName, statuses]) => {
          const groupMembers = members.filter(m => statuses.includes(m.Kaiser_Status || ''));
          const overdueMembers = groupMembers.filter(m => isOverdue(m.next_steps_date));
          
          const groupLabels = {
            starting: 'Starting Process',
            documentation: 'Documentation',
            assessment: 'Assessment Phase',
            tierLevel: 'Tier Level',
            placement: 'RCFE Placement',
            contracting: 'Contracting',
            completed: 'Completed',
            issues: 'Issues/Appeals'
          };
          
          const groupColors = {
            starting: 'bg-yellow-100 text-yellow-800 border-yellow-200',
            documentation: 'bg-blue-100 text-blue-800 border-blue-200',
            assessment: 'bg-purple-100 text-purple-800 border-purple-200',
            tierLevel: 'bg-indigo-100 text-indigo-800 border-indigo-200',
            placement: 'bg-cyan-100 text-cyan-800 border-cyan-200',
            contracting: 'bg-emerald-100 text-emerald-800 border-emerald-200',
            completed: 'bg-green-100 text-green-800 border-green-200',
            issues: 'bg-red-100 text-red-800 border-red-200'
          };
          
          return (
            <Card key={groupName} className={overdueMembers.length > 0 ? 'border-red-300 bg-red-50' : ''}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">
                    {groupLabels[groupName as keyof typeof groupLabels]}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {overdueMembers.length > 0 && (
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                    )}
                    <Badge className={groupColors[groupName as keyof typeof groupColors]}>
                      {groupMembers.length}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {overdueMembers.length > 0 && (
                  <div className="text-xs text-red-600 font-medium mb-2">
                    {overdueMembers.length} overdue
                  </div>
                )}
                <div className="text-xs text-muted-foreground">
                  {groupMembers.length > 0 ? (
                    `${[...new Set(groupMembers.map(m => m.kaiser_user_assignment || 'Unassigned'))].slice(0, 2).join(', ')}${
                      [...new Set(groupMembers.map(m => m.kaiser_user_assignment || 'Unassigned'))].length > 2 ? '...' : ''
                    }`
                  ) : (
                    'No members'
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Members Table */}
      <Card>
        <CardHeader>
          <CardTitle>Kaiser Members ({members.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No Kaiser members loaded yet.</p>
              <p className="text-sm text-muted-foreground mt-2">
                Click "Sync from Caspio" to load member data.
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Client ID2</TableHead>
                    <TableHead>Medi-Cal #</TableHead>
                    <TableHead>MRN</TableHead>
                    <TableHead>County</TableHead>
                    <TableHead>Pathway</TableHead>
                    <TableHead>Kaiser Status</TableHead>
                    <TableHead>CalAIM Status</TableHead>
                    <TableHead>Assignment</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell>
                        <div className="font-medium">
                          {member.memberFirstName} {member.memberLastName}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                          {member.client_ID2 || 'N/A'}
                        </Badge>
                      </TableCell>
                      <TableCell>{member.memberMediCalNum || 'N/A'}</TableCell>
                      <TableCell>{member.memberMrn || 'N/A'}</TableCell>
                      <TableCell>{member.memberCounty || 'N/A'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                          {member.pathway || 'N/A'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(member.Kaiser_Status || 'Pending')}>
                          <div className="flex items-center gap-1">
                            {getStatusIcon(member.Kaiser_Status || 'Pending')}
                            {member.Kaiser_Status || 'Pending'}
                          </div>
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(member.CalAIM_Status || 'Pending')}>
                          <div className="flex items-center gap-1">
                            {getStatusIcon(member.CalAIM_Status || 'Pending')}
                            {member.CalAIM_Status || 'Pending'}
                          </div>
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {member.kaiser_user_assignment || 'Unassigned'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {getStatusGroup(member.Kaiser_Status || 'Pending')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className={`flex items-center gap-1 text-xs ${
                          isOverdue(member.next_steps_date) 
                            ? 'text-red-600 font-medium' 
                            : member.next_steps_date 
                              ? 'text-muted-foreground' 
                              : 'text-gray-400'
                        }`}>
                          {isOverdue(member.next_steps_date) && (
                            <AlertTriangle className="h-3 w-3" />
                          )}
                          {member.next_steps_date ? (
                            <>
                              <Calendar className="h-3 w-3" />
                              {formatDate(member.next_steps_date)}
                              {isOverdue(member.next_steps_date) && (
                                <span className="ml-1">
                                  ({getDaysOverdue(member.next_steps_date)} days overdue)
                                </span>
                              )}
                            </>
                          ) : (
                            'No date set'
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" asChild>
                          <a href={`/admin/applications/${member.id}`}>
                            Manage
                          </a>
                        </Button>
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