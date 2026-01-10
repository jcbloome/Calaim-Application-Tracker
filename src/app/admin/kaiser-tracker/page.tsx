'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, User, MapPin, Clock, AlertCircle, CheckCircle, XCircle, Filter, Download, RefreshCw, Edit, Save, X } from 'lucide-react';
import { useCollection, useFirestore } from '@/firebase';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useToast } from '@/hooks/use-toast';

interface KaiserMember {
  id: string;
  memberFirstName: string;
  memberLastName: string;
  memberMediCalNum: string;
  memberMrn?: string;
  memberCounty: string;
  healthPlan: string;
  
  // Key linking field
  client_ID2?: string;
  
  // Kaiser specific fields
  MCP_CIN?: string;
  CalAIM_MCP?: string;
  Kaiser_Status?: 'Pending' | 'Authorized' | 'Denied' | 'In Review' | 'Submitted';
  CalAIM_Status?: 'Authorized' | 'Not Authorized' | 'Pending' | 'Under Review';
  kaiser_user_assignment?: string;
  
  // Additional Caspio fields
  ApplicationID?: string;
  UserID?: string;
  ReferrerFirstName?: string;
  ReferrerLastName?: string;
  ReferrerEmail?: string;
  ReferrerPhone?: string;
  HealthPlan?: string;
  Pathway?: string;
  DateCreated?: string;
  
  // Next steps tracking
  next_steps?: string;
  next_steps_date?: string;
  last_updated?: string;
  
  // Application info
  status: string;
  pathway: string;
  createdAt: any;
  
  // Source tracking
  source?: 'firebase' | 'caspio';
  caspio_id?: string;
}

const statusColors = {
  'Pending': 'bg-yellow-100 text-yellow-800',
  'Authorized': 'bg-green-100 text-green-800',
  'Denied': 'bg-red-100 text-red-800',
  'In Review': 'bg-blue-100 text-blue-800',
  'Submitted': 'bg-purple-100 text-purple-800',
  'Not Authorized': 'bg-red-100 text-red-800',
  'Under Review': 'bg-orange-100 text-orange-800'
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'Authorized': return <CheckCircle className="h-4 w-4" />;
    case 'Denied': case 'Not Authorized': return <XCircle className="h-4 w-4" />;
    case 'Pending': case 'Under Review': case 'In Review': return <Clock className="h-4 w-4" />;
    default: return <AlertCircle className="h-4 w-4" />;
  }
};

const getNextSteps = (member: KaiserMember) => {
  if (member.next_steps) return member.next_steps;
  
  // Auto-generate next steps based on status
  switch (member.Kaiser_Status) {
    case 'Pending':
      return 'Submit initial Kaiser application';
    case 'Submitted':
      return 'Follow up on application status';
    case 'In Review':
      return 'Await Kaiser review decision';
    case 'Authorized':
      return member.CalAIM_Status === 'Authorized' ? 'Complete enrollment process' : 'Obtain CalAIM authorization';
    case 'Denied':
      return 'Review denial reason and consider appeal';
    default:
      return 'Update Kaiser status';
  }
};

const isOverdue = (dateString?: string) => {
  if (!dateString) return false;
  const dueDate = new Date(dateString);
  const today = new Date();
  return dueDate < today;
};

export default function KaiserTrackerPage() {
  const { isAdmin, isSuperAdmin, isLoading: isAdminLoading } = useAdmin();
  const db = useFirestore();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [countyFilter, setCountyFilter] = useState<string>('all');
  const [assignmentFilter, setAssignmentFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState('all');
  const [caspioMembers, setCaspioMembers] = useState<KaiserMember[]>([]);
  const [isLoadingCaspio, setIsLoadingCaspio] = useState(false);
  const [editingMember, setEditingMember] = useState<string | null>(null);
  const [editingData, setEditingData] = useState<Partial<KaiserMember>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Query Kaiser members (members with Kaiser health plan)
  const kaiserQuery = useMemo(() => {
    if (!db) return null;
    try {
      return query(
        collection(db, 'applications'),
        where('healthPlan', '==', 'Kaiser'),
        orderBy('createdAt', 'desc')
      );
    } catch (error) {
      console.error('Error creating Kaiser query:', error);
      return null;
    }
  }, [db]);

  const { data: applications, loading, error } = useCollection(kaiserQuery || undefined);

  // Fetch Caspio data
  const fetchCaspioData = async () => {
    setIsLoadingCaspio(true);
    try {
      const functions = getFunctions();
      const fetchKaiserMembers = httpsCallable(functions, 'fetchKaiserMembersFromCaspio');
      
      const result = await fetchKaiserMembers();
      const data = result.data as any;
      
      if (data.success) {
        setCaspioMembers(data.members || []);
        toast({
          title: 'Success!',
          description: `Loaded ${data.total} members from Caspio`,
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
      console.error('Error fetching Caspio data:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to connect to Caspio',
      });
    } finally {
      setIsLoadingCaspio(false);
    }
  };

  // Start editing a member
  const startEditing = (member: KaiserMember) => {
    setEditingMember(member.id);
    setEditingData({
      Kaiser_Status: member.Kaiser_Status,
      CalAIM_Status: member.CalAIM_Status,
      kaiser_user_assignment: member.kaiser_user_assignment,
      next_steps_date: member.next_steps_date
    });
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingMember(null);
    setEditingData({});
  };

  // Save changes to both Firebase and Caspio
  const saveChanges = async (member: KaiserMember) => {
    setIsSaving(true);
    try {
      const functions = getFunctions();
      const syncKaiserStatus = httpsCallable(functions, 'syncKaiserStatus');
      
      const result = await syncKaiserStatus({
        applicationId: member.id.startsWith('caspio-') ? null : member.id,
        client_ID2: member.client_ID2,
        Kaiser_Status: editingData.Kaiser_Status,
        CalAIM_Status: editingData.CalAIM_Status,
        kaiser_user_assignment: editingData.kaiser_user_assignment,
        next_steps_date: editingData.next_steps_date
      });
      
      toast({
        title: 'Success!',
        description: 'Kaiser status synced to both systems',
        className: 'bg-green-100 text-green-900 border-green-200',
      });
      
      // Refresh data to show changes
      await fetchCaspioData();
      
      setEditingMember(null);
      setEditingData({});
      
    } catch (error: any) {
      console.error('Error saving changes:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to save changes',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const kaiserMembers: KaiserMember[] = useMemo(() => {
    try {
      const firebaseMembers = applications ? applications.map(app => ({
        id: app.id,
        memberFirstName: app.memberFirstName || '',
        memberLastName: app.memberLastName || '',
        memberMediCalNum: app.memberMediCalNum || '',
        memberMrn: app.memberMrn,
        memberCounty: app.memberCounty || '',
        healthPlan: app.healthPlan || '',
        
        // Kaiser specific fields (these would come from Caspio sync or manual entry)
        client_ID2: app.client_ID2,
        MCP_CIN: app.MCP_CIN,
        CalAIM_MCP: app.CalAIM_MCP,
        Kaiser_Status: app.Kaiser_Status || 'Pending',
        CalAIM_Status: app.CalAIM_Status || 'Pending',
        kaiser_user_assignment: app.kaiser_user_assignment,
        
        // Next steps
        next_steps: app.next_steps,
        next_steps_date: app.next_steps_date,
        last_updated: app.lastUpdated,
        
        // Application info
        status: app.status || '',
        pathway: app.pathway || '',
        createdAt: app.createdAt,
        source: 'firebase' as const
      })) : [];

      // Combine Firebase and Caspio data, prioritizing Caspio data for Kaiser-specific fields
      const combinedMembers = [...firebaseMembers];
      
      // Add Caspio-only members or update existing ones with Caspio data
      if (caspioMembers && Array.isArray(caspioMembers)) {
        caspioMembers.forEach(caspioMember => {
          const existingIndex = combinedMembers.findIndex(fm => 
            (fm.memberMediCalNum && caspioMember.memberMediCalNum && fm.memberMediCalNum === caspioMember.memberMediCalNum) ||
            (fm.memberFirstName === caspioMember.memberFirstName && fm.memberLastName === caspioMember.memberLastName)
          );
          
          if (existingIndex >= 0) {
            // Update existing member with Caspio data
            combinedMembers[existingIndex] = {
              ...combinedMembers[existingIndex],
              ...caspioMember,
              id: combinedMembers[existingIndex].id, // Keep Firebase ID
              source: 'firebase' as const
            };
          } else {
            // Add new Caspio-only member
            combinedMembers.push({
              ...caspioMember,
              id: `caspio-${caspioMember.caspio_id || Math.random()}`,
              healthPlan: 'Kaiser',
              status: 'Caspio Only',
              pathway: 'Unknown',
              createdAt: null,
              source: 'caspio' as const
            });
          }
        });
      }
      
      return combinedMembers;
    } catch (error) {
      console.error('Error processing Kaiser members:', error);
      return [];
    }
  }, [applications, caspioMembers]);

  // Filter members based on search and filters
  const filteredMembers = useMemo(() => {
    return kaiserMembers.filter(member => {
      const matchesSearch = searchTerm === '' || 
        `${member.memberFirstName} ${member.memberLastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
        member.memberMediCalNum.includes(searchTerm) ||
        (member.memberMrn && member.memberMrn.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesStatus = statusFilter === 'all' || member.Kaiser_Status === statusFilter;
      const matchesCounty = countyFilter === 'all' || member.memberCounty === countyFilter;
      const matchesAssignment = assignmentFilter === 'all' || member.kaiser_user_assignment === assignmentFilter;
      
      return matchesSearch && matchesStatus && matchesCounty && matchesAssignment;
    });
  }, [kaiserMembers, searchTerm, statusFilter, countyFilter, assignmentFilter]);

  // Group members by status for tabs
  const membersByStatus = useMemo(() => {
    const groups = {
      all: filteredMembers,
      pending: filteredMembers.filter(m => m.Kaiser_Status === 'Pending'),
      submitted: filteredMembers.filter(m => m.Kaiser_Status === 'Submitted'),
      inReview: filteredMembers.filter(m => m.Kaiser_Status === 'In Review'),
      authorized: filteredMembers.filter(m => m.Kaiser_Status === 'Authorized'),
      denied: filteredMembers.filter(m => m.Kaiser_Status === 'Denied'),
      overdue: filteredMembers.filter(m => isOverdue(m.next_steps_date))
    };
    return groups;
  }, [filteredMembers]);

  // Get unique values for filters
  const uniqueCounties = useMemo(() => 
    [...new Set(kaiserMembers.map(m => m.memberCounty).filter(Boolean))].sort(),
    [kaiserMembers]
  );

  const uniqueAssignments = useMemo(() => 
    [...new Set(kaiserMembers.map(m => m.kaiser_user_assignment).filter(Boolean))].sort(),
    [kaiserMembers]
  );

  if (isAdminLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-6 w-6 animate-spin" />
          <span>Loading Kaiser Tracker...</span>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
          <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
          <p className="text-muted-foreground">Admin privileges required to access Kaiser Tracker.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <XCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
          <h2 className="text-xl font-semibold mb-2">Error Loading Data</h2>
          <p className="text-muted-foreground">Unable to load Kaiser member data. Please try refreshing the page.</p>
          <Button onClick={() => window.location.reload()} className="mt-4">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh Page
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Kaiser Tracker</h1>
          <p className="text-muted-foreground">Comprehensive tracking for Kaiser CalAIM members</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-lg px-3 py-1">
            {kaiserMembers.length} Total Members
          </Badge>
          <Button 
            onClick={fetchCaspioData} 
            disabled={isLoadingCaspio}
            variant="outline"
            size="sm"
          >
            {isLoadingCaspio ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Sync from Caspio
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{membersByStatus.pending.length}</div>
            <p className="text-xs text-muted-foreground">Awaiting submission</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Submitted</CardTitle>
            <AlertCircle className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{membersByStatus.submitted.length}</div>
            <p className="text-xs text-muted-foreground">Sent to Kaiser</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Review</CardTitle>
            <AlertCircle className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{membersByStatus.inReview.length}</div>
            <p className="text-xs text-muted-foreground">Under Kaiser review</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Authorized</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{membersByStatus.authorized.length}</div>
            <p className="text-xs text-muted-foreground">Kaiser approved</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Denied</CardTitle>
            <XCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{membersByStatus.denied.length}</div>
            <p className="text-xs text-muted-foreground">Kaiser denied</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue</CardTitle>
            <AlertCircle className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{membersByStatus.overdue.length}</div>
            <p className="text-xs text-muted-foreground">Past due date</p>
          </CardContent>
        </Card>
      </div>

      {/* Additional Stage Breakdown Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Kaiser Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm">Pending</span>
                <Badge className="bg-yellow-100 text-yellow-800">{membersByStatus.pending.length}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Submitted</span>
                <Badge className="bg-purple-100 text-purple-800">{membersByStatus.submitted.length}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">In Review</span>
                <Badge className="bg-blue-100 text-blue-800">{membersByStatus.inReview.length}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Authorized</span>
                <Badge className="bg-green-100 text-green-800">{membersByStatus.authorized.length}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Denied</span>
                <Badge className="bg-red-100 text-red-800">{membersByStatus.denied.length}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">CalAIM Authorization</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(() => {
                const calaimAuthorized = kaiserMembers.filter(m => m.CalAIM_Status === 'Authorized').length;
                const calaimPending = kaiserMembers.filter(m => m.CalAIM_Status === 'Pending' || m.CalAIM_Status === 'Under Review').length;
                const calaimNotAuthorized = kaiserMembers.filter(m => m.CalAIM_Status === 'Not Authorized').length;
                
                return (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Authorized</span>
                      <Badge className="bg-green-100 text-green-800">{calaimAuthorized}</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Pending Review</span>
                      <Badge className="bg-yellow-100 text-yellow-800">{calaimPending}</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Not Authorized</span>
                      <Badge className="bg-red-100 text-red-800">{calaimNotAuthorized}</Badge>
                    </div>
                  </>
                );
              })()}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Assignment Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(() => {
                const assigned = kaiserMembers.filter(m => m.kaiser_user_assignment && m.kaiser_user_assignment !== '').length;
                const unassigned = kaiserMembers.filter(m => !m.kaiser_user_assignment || m.kaiser_user_assignment === '').length;
                const overdue = membersByStatus.overdue.length;
                
                return (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Assigned</span>
                      <Badge className="bg-blue-100 text-blue-800">{assigned}</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Unassigned</span>
                      <Badge className="bg-gray-100 text-gray-800">{unassigned}</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Overdue Tasks</span>
                      <Badge className="bg-orange-100 text-orange-800">{overdue}</Badge>
                    </div>
                  </>
                );
              })()}
            </div>
          </CardContent>
        </Card>
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Search</label>
              <Input
                placeholder="Name, Medi-Cal #, MRN..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Kaiser Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Submitted">Submitted</SelectItem>
                  <SelectItem value="In Review">In Review</SelectItem>
                  <SelectItem value="Authorized">Authorized</SelectItem>
                  <SelectItem value="Denied">Denied</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">County</label>
              <Select value={countyFilter} onValueChange={setCountyFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All counties" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Counties</SelectItem>
                  {uniqueCounties.map(county => (
                    <SelectItem key={county} value={county}>{county}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Assignment</label>
              <Select value={assignmentFilter} onValueChange={setAssignmentFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All assignments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Assignments</SelectItem>
                  {uniqueAssignments.map(assignment => (
                    <SelectItem key={assignment} value={assignment}>{assignment}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Member Table with Tabs */}
      <Card>
        <CardHeader>
          <CardTitle>Kaiser Members</CardTitle>
          <CardDescription>
            Comprehensive tracking of all Kaiser CalAIM members
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-7">
              <TabsTrigger value="all">All ({membersByStatus.all.length})</TabsTrigger>
              <TabsTrigger value="pending">Pending ({membersByStatus.pending.length})</TabsTrigger>
              <TabsTrigger value="submitted">Submitted ({membersByStatus.submitted.length})</TabsTrigger>
              <TabsTrigger value="inReview">In Review ({membersByStatus.inReview.length})</TabsTrigger>
              <TabsTrigger value="authorized">Authorized ({membersByStatus.authorized.length})</TabsTrigger>
              <TabsTrigger value="denied">Denied ({membersByStatus.denied.length})</TabsTrigger>
              <TabsTrigger value="overdue" className="text-red-600">Overdue ({membersByStatus.overdue.length})</TabsTrigger>
            </TabsList>

            {Object.entries(membersByStatus).map(([key, members]) => (
              <TabsContent key={key} value={key}>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Member</TableHead>
                        <TableHead>Client ID2</TableHead>
                        <TableHead>Medi-Cal #</TableHead>
                        <TableHead>MRN</TableHead>
                        <TableHead>County</TableHead>
                        <TableHead>Kaiser Status</TableHead>
                        <TableHead>CalAIM Status</TableHead>
                        <TableHead>Assignment</TableHead>
                        <TableHead>Next Steps</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {members.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                            No members found matching the current filters.
                          </TableCell>
                        </TableRow>
                      ) : (
                        members.map((member) => (
                          <TableRow key={member.id}>
                            <TableCell>
                              <div className="font-medium">
                                {member.memberFirstName} {member.memberLastName}
                              </div>
                              {member.source === 'caspio' && (
                                <Badge variant="secondary" className="text-xs mt-1">
                                  Caspio
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              <div className="font-medium text-blue-600">
                                {member.client_ID2 || '-'}
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {member.memberMediCalNum}
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {member.memberMrn || '-'}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {member.memberCounty}
                              </div>
                            </TableCell>
                            <TableCell>
                              {editingMember === member.id ? (
                                <Select 
                                  value={editingData.Kaiser_Status || member.Kaiser_Status || 'Pending'} 
                                  onValueChange={(value) => setEditingData({...editingData, Kaiser_Status: value as any})}
                                >
                                  <SelectTrigger className="w-32">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="Pending">Pending</SelectItem>
                                    <SelectItem value="Submitted">Submitted</SelectItem>
                                    <SelectItem value="In Review">In Review</SelectItem>
                                    <SelectItem value="Authorized">Authorized</SelectItem>
                                    <SelectItem value="Denied">Denied</SelectItem>
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Badge className={statusColors[member.Kaiser_Status || 'Pending']}>
                                  <div className="flex items-center gap-1">
                                    {getStatusIcon(member.Kaiser_Status || 'Pending')}
                                    {member.Kaiser_Status || 'Pending'}
                                  </div>
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {editingMember === member.id ? (
                                <Select 
                                  value={editingData.CalAIM_Status || member.CalAIM_Status || 'Pending'} 
                                  onValueChange={(value) => setEditingData({...editingData, CalAIM_Status: value as any})}
                                >
                                  <SelectTrigger className="w-32">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="Pending">Pending</SelectItem>
                                    <SelectItem value="Under Review">Under Review</SelectItem>
                                    <SelectItem value="Authorized">Authorized</SelectItem>
                                    <SelectItem value="Not Authorized">Not Authorized</SelectItem>
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Badge className={statusColors[member.CalAIM_Status || 'Pending']}>
                                  <div className="flex items-center gap-1">
                                    {getStatusIcon(member.CalAIM_Status || 'Pending')}
                                    {member.CalAIM_Status || 'Pending'}
                                  </div>
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {editingMember === member.id ? (
                                <Input
                                  value={editingData.kaiser_user_assignment || member.kaiser_user_assignment || ''}
                                  onChange={(e) => setEditingData({...editingData, kaiser_user_assignment: e.target.value})}
                                  placeholder="Assign to..."
                                  className="w-32"
                                />
                              ) : (
                                <div className="flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  {member.kaiser_user_assignment || 'Unassigned'}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="max-w-xs">
                              <div className="text-sm truncate">
                                {getNextSteps(member)}
                              </div>
                            </TableCell>
                            <TableCell>
                              {member.next_steps_date ? (
                                <div className={`flex items-center gap-1 text-sm ${isOverdue(member.next_steps_date) ? 'text-red-600' : ''}`}>
                                  <Calendar className="h-3 w-3" />
                                  {new Date(member.next_steps_date).toLocaleDateString()}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {editingMember === member.id ? (
                                  <>
                                    <Button 
                                      size="sm" 
                                      onClick={() => saveChanges(member)}
                                      disabled={isSaving}
                                      className="bg-green-600 hover:bg-green-700"
                                    >
                                      {isSaving ? (
                                        <RefreshCw className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <Save className="h-3 w-3" />
                                      )}
                                    </Button>
                                    <Button 
                                      size="sm" 
                                      variant="outline" 
                                      onClick={cancelEditing}
                                      disabled={isSaving}
                                    >
                                      <X className="h-3 w-3" />
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <Button 
                                      size="sm" 
                                      variant="outline" 
                                      onClick={() => startEditing(member)}
                                    >
                                      <Edit className="h-3 w-3" />
                                    </Button>
                                    {!member.id.startsWith('caspio-') && (
                                      <Button size="sm" variant="outline" asChild>
                                        <a href={`/admin/applications/${member.id}`}>
                                          View
                                        </a>
                                      </Button>
                                    )}
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}