'use client';

import { useState } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, User, Clock, CheckCircle, XCircle, AlertTriangle, Calendar, Download } from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useToast } from '@/hooks/use-toast';

// All Kaiser status steps for comprehensive tracking
const kaiserSteps = [
  "Pre-T2038, Compiling Docs",
  "T2038 Requested",
  "T2038 Received",
  "T2038 received, Need First Contact",
  "T2038 received, doc collection",
  "Needs RN Visit",
  "RN/MSW Scheduled",
  "RN Visit Complete",
  "Need Tier Level",
  "Tier Level Requested",
  "Tier Level Received",
  "Locating RCFEs",
  "Found RCFE",
  "R&B Requested",
  "R&B Signed",
  "RCFE/ILS for Invoicing",
  "ILS Contracted (Complete)",
  "Confirm ILS Contracted",
  "Complete",
  "Tier Level Revision Request",
  "On-Hold",
  "Tier Level Appeal",
  "T2038 email but need auth sheet",
  "Non-active",
];

// Status colors for visual identification
const statusColors: Record<string, string> = {
  "Pre-T2038, Compiling Docs": "bg-yellow-100 text-yellow-800 border-yellow-200",
  "T2038 Requested": "bg-yellow-200 text-yellow-900 border-yellow-300",
  "T2038 Received": "bg-blue-100 text-blue-800 border-blue-200",
  "T2038 received, Need First Contact": "bg-blue-200 text-blue-900 border-blue-300",
  "T2038 received, doc collection": "bg-blue-300 text-blue-900 border-blue-400",
  "Needs RN Visit": "bg-purple-100 text-purple-800 border-purple-200",
  "RN/MSW Scheduled": "bg-purple-200 text-purple-900 border-purple-300",
  "RN Visit Complete": "bg-purple-300 text-purple-900 border-purple-400",
  "Need Tier Level": "bg-indigo-100 text-indigo-800 border-indigo-200",
  "Tier Level Requested": "bg-indigo-200 text-indigo-900 border-indigo-300",
  "Tier Level Received": "bg-indigo-300 text-indigo-900 border-indigo-400",
  "Locating RCFEs": "bg-cyan-100 text-cyan-800 border-cyan-200",
  "Found RCFE": "bg-cyan-200 text-cyan-900 border-cyan-300",
  "R&B Requested": "bg-teal-100 text-teal-800 border-teal-200",
  "R&B Signed": "bg-teal-200 text-teal-900 border-teal-300",
  "RCFE/ILS for Invoicing": "bg-emerald-100 text-emerald-800 border-emerald-200",
  "ILS Contracted (Complete)": "bg-green-100 text-green-800 border-green-200",
  "Confirm ILS Contracted": "bg-green-200 text-green-900 border-green-300",
  "Complete": "bg-green-300 text-green-900 border-green-400",
  "Tier Level Revision Request": "bg-red-100 text-red-800 border-red-200",
  "On-Hold": "bg-orange-100 text-orange-800 border-orange-200",
  "Tier Level Appeal": "bg-red-200 text-red-900 border-red-300",
  "T2038 email but need auth sheet": "bg-amber-100 text-amber-800 border-amber-200",
  "Non-active": "bg-gray-100 text-gray-800 border-gray-200",
  "Pending": "bg-slate-100 text-slate-800 border-slate-200"
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

  const getStatusColor = (status: string): string => {
    return statusColors[status] || 'bg-gray-100 text-gray-800 border-gray-200';
  };

  // Generate ILS Weekly Report
  const generateILSReport = () => {
    // Filter members at major bottleneck stages
    const bottleneckStatuses = [
      "T2038 Requested",
      "Tier Level Requested", 
      "RCFE/ILS for Invoicing"
    ];
    
    const bottleneckMembers = members.filter(member => 
      bottleneckStatuses.includes(member.Kaiser_Status || '')
    );
    
    // Create CSV content
    const csvHeaders = [
      'Member Name',
      'MRN (MCP_CIN)',
      'Kaiser Status',
      'Staff Assignment',
      'Next Step Date',
      'County',
      'Client ID2'
    ];
    
    const csvRows = bottleneckMembers.map(member => [
      `${member.memberFirstName} ${member.memberLastName}`,
      member.memberMrn || 'N/A',
      member.Kaiser_Status || 'N/A',
      member.kaiser_user_assignment || 'Unassigned',
      member.next_steps_date ? formatDate(member.next_steps_date) : 'No date set',
      member.memberCounty || 'N/A',
      member.client_ID2 || 'N/A'
    ]);
    
    const csvContent = [
      csvHeaders.join(','),
      ...csvRows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `ILS_Weekly_Report_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({
      title: 'Report Downloaded',
      description: `Generated ILS report with ${bottleneckMembers.length} members at bottleneck stages`,
      className: 'bg-green-100 text-green-900 border-green-200',
    });
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
        <div className="flex gap-2">
          <Button onClick={handleSync} disabled={isLoading}>
            {isLoading ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Sync from Caspio
          </Button>
          
          <Button 
            onClick={generateILSReport} 
            variant="outline"
            disabled={members.length === 0}
          >
            <Download className="mr-2 h-4 w-4" />
            ILS Weekly Report
          </Button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
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

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">ILS Bottlenecks</CardTitle>
            <Download className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {members.filter(m => 
                m.Kaiser_Status === 'T2038 Requested' || 
                m.Kaiser_Status === 'Tier Level Requested' || 
                m.Kaiser_Status === 'RCFE/ILS for Invoicing'
              ).length}
            </div>
            <p className="text-xs text-muted-foreground">Weekly report ready</p>
          </CardContent>
        </Card>
      </div>

      {/* Comprehensive Kaiser Status Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
        {kaiserSteps.map((status) => {
          const statusMembers = members.filter(m => m.Kaiser_Status === status);
          const overdueMembers = statusMembers.filter(m => isOverdue(m.next_steps_date));
          const assignedStaff = [...new Set(statusMembers.map(m => m.kaiser_user_assignment).filter(Boolean))];
          
          if (statusMembers.length === 0) return null;
          
          return (
            <Card key={status} className={`${overdueMembers.length > 0 ? 'border-red-300 bg-red-50' : ''} hover:shadow-md transition-shadow`}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-medium leading-tight">
                    {status}
                  </CardTitle>
                  <div className="flex items-center gap-1">
                    {overdueMembers.length > 0 && (
                      <AlertTriangle className="h-3 w-3 text-red-600" />
                    )}
                    <Badge className={getStatusColor(status)} variant="outline">
                      {statusMembers.length}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {/* Overdue Alert */}
                {overdueMembers.length > 0 && (
                  <div className="text-xs text-red-600 font-medium mb-2 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {overdueMembers.length} overdue
                  </div>
                )}
                
                {/* Staff Assignments */}
                <div className="text-xs text-muted-foreground mb-2">
                  <div className="font-medium">Staff:</div>
                  {assignedStaff.length > 0 ? (
                    <div>{assignedStaff.slice(0, 2).join(', ')}{assignedStaff.length > 2 ? '...' : ''}</div>
                  ) : (
                    <div className="text-orange-600">Unassigned ({statusMembers.filter(m => !m.kaiser_user_assignment).length})</div>
                  )}
                </div>
                
                {/* Member List Preview */}
                <div className="text-xs text-muted-foreground">
                  <div className="font-medium">Members:</div>
                  <div className="space-y-1">
                    {statusMembers.slice(0, 3).map((member, idx) => (
                      <div key={idx} className="flex items-center justify-between">
                        <span className="truncate">{member.memberFirstName} {member.memberLastName}</span>
                        {isOverdue(member.next_steps_date) && (
                          <AlertTriangle className="h-2 w-2 text-red-500 ml-1" />
                        )}
                      </div>
                    ))}
                    {statusMembers.length > 3 && (
                      <div className="text-gray-500">+{statusMembers.length - 3} more</div>
                    )}
                  </div>
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
                    <TableHead>Kaiser Status</TableHead>
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
                        <Badge className={getStatusColor(member.Kaiser_Status || 'Pending')} variant="outline">
                          <div className="flex items-center gap-1">
                            {getStatusIcon(member.Kaiser_Status || 'Pending')}
                            <span className="text-xs">{member.Kaiser_Status || 'Pending'}</span>
                          </div>
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