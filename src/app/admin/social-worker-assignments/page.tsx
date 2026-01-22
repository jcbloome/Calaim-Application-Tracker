'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, Clock, CheckCircle, Calendar, User, RefreshCw, Edit, Users, UserPlus, Search, Filter } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Member {
  id: string;
  Client_ID2: string;
  memberName: string;
  memberFirstName: string;
  memberLastName: string;
  memberCounty: string;
  CalAIM_MCO: string;
  CalAIM_Status: string;
  Social_Worker_Assigned: string;
  Staff_Assigned: string;
  Hold_For_Social_Worker: string;
  RCFE_Name: string;
  RCFE_Address: string;
  pathway: string;
  last_updated: string;
}

interface SocialWorkerStats {
  name: string;
  memberCount: number;
  members: Member[];
  mcoBreakdown: Record<string, number>;
  statusBreakdown: Record<string, number>;
  countyBreakdown: Record<string, number>;
  rcfeBreakdown: Record<string, number>;
  onHoldCount: number;
  activeCount: number;
}

export default function SocialWorkerAssignmentsPage() {
  const { isAdmin, isLoading } = useAdmin();
  const { toast } = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSocialWorker, setSelectedSocialWorker] = useState('all');
  const [selectedMCO, setSelectedMCO] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedCounty, setSelectedCounty] = useState('all');
  const [selectedRCFE, setSelectedRCFE] = useState('all');
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [selectedSWForModal, setSelectedSWForModal] = useState<SocialWorkerStats | null>(null);

  // Fetch all members from API (Kaiser + Health Net + other MCOs)
  const fetchAllMembers = async () => {
    setIsLoadingMembers(true);
    try {
      const response = await fetch('/api/all-members');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const responseData = await response.json();
      
      if (!responseData.success) {
        throw new Error(responseData.error || 'Failed to fetch members');
      }
      
      setMembers(responseData.members || []);
      
      toast({
        title: "Data Loaded Successfully",
        description: `Loaded ${responseData.members?.length || 0} members from all MCOs`,
      });
    } catch (error) {
      console.error('Error fetching all members:', error);
      toast({
        title: "Load Failed",
        description: "Failed to load members. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingMembers(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchAllMembers();
    }
  }, [isAdmin]);

  // Calculate social worker statistics
  const socialWorkerStats = useMemo((): SocialWorkerStats[] => {
    const stats: Record<string, SocialWorkerStats> = {};
    
    members.forEach(member => {
      const swName = member.Social_Worker_Assigned || 'Unassigned';
      
      if (!stats[swName]) {
        stats[swName] = {
          name: swName,
          memberCount: 0,
          members: [],
          mcoBreakdown: {},
          statusBreakdown: {},
          countyBreakdown: {},
          rcfeBreakdown: {},
          onHoldCount: 0,
          activeCount: 0
        };
      }
      
      stats[swName].memberCount++;
      stats[swName].members.push(member);
      
      // MCO breakdown
      const mco = member.CalAIM_MCO || 'Unknown';
      stats[swName].mcoBreakdown[mco] = (stats[swName].mcoBreakdown[mco] || 0) + 1;
      
      // Status breakdown
      const status = member.CalAIM_Status || 'No Status';
      stats[swName].statusBreakdown[status] = (stats[swName].statusBreakdown[status] || 0) + 1;
      
      // County breakdown
      const county = member.memberCounty || 'Unknown';
      stats[swName].countyBreakdown[county] = (stats[swName].countyBreakdown[county] || 0) + 1;
      
      // RCFE breakdown
      const rcfe = member.RCFE_Name || 'No RCFE';
      stats[swName].rcfeBreakdown[rcfe] = (stats[swName].rcfeBreakdown[rcfe] || 0) + 1;
      
      // Hold status
      if (member.Hold_For_Social_Worker === '🔴 Hold') {
        stats[swName].onHoldCount++;
      }
      
      // Active status (not expired, denied, or non-active)
      if (!['Expired', 'Denied', 'Non-active'].includes(status)) {
        stats[swName].activeCount++;
      }
    });
    
    return Object.values(stats).sort((a, b) => {
      // Sort: Unassigned last, then by member count descending
      if (a.name === 'Unassigned') return 1;
      if (b.name === 'Unassigned') return -1;
      return b.memberCount - a.memberCount;
    });
  }, [members]);

  // Get all unique social workers for filter
  const allSocialWorkers = useMemo(() => {
    return socialWorkerStats.map(sw => sw.name);
  }, [socialWorkerStats]);

  // Get all unique values for filters
  const allMCOs = useMemo(() => {
    return [...new Set(members.map(m => m.CalAIM_MCO || 'Unknown'))].sort();
  }, [members]);

  const allStatuses = useMemo(() => {
    return [...new Set(members.map(m => m.CalAIM_Status || 'No Status'))].sort();
  }, [members]);

  const allCounties = useMemo(() => {
    return [...new Set(members.map(m => m.memberCounty || 'Unknown'))].sort();
  }, [members]);

  const allRCFEs = useMemo(() => {
    return [...new Set(members.map(m => m.RCFE_Name || 'No RCFE'))].sort();
  }, [members]);

  // Filter members based on search and filters
  const filteredMembers = useMemo(() => {
    return members.filter(member => {
      const matchesSearch = !searchTerm || 
        member.memberName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        member.Client_ID2.toString().includes(searchTerm) ||
        (member.Social_Worker_Assigned || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesSW = selectedSocialWorker === 'all' || 
        (member.Social_Worker_Assigned || 'Unassigned') === selectedSocialWorker;
      
      const matchesMCO = selectedMCO === 'all' || 
        (member.CalAIM_MCO || 'Unknown') === selectedMCO;
      
      const matchesStatus = selectedStatus === 'all' || 
        (member.CalAIM_Status || 'No Status') === selectedStatus;
      
      const matchesCounty = selectedCounty === 'all' || 
        (member.memberCounty || 'Unknown') === selectedCounty;
      
      const matchesRCFE = selectedRCFE === 'all' || 
        (member.RCFE_Name || 'No RCFE') === selectedRCFE;
      
      return matchesSearch && matchesSW && matchesMCO && matchesStatus && matchesCounty && matchesRCFE;
    });
  }, [members, searchTerm, selectedSocialWorker, selectedStatus, selectedCounty]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading social worker assignments...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-96">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Access Denied
            </CardTitle>
            <CardDescription>
              You need admin permissions to view social worker assignments.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Social Worker Assignments</h1>
          <p className="text-muted-foreground">
            Manage member assignments to social workers | {members.length} total members (all MCOs)
          </p>
        </div>
        <Button onClick={fetchAllMembers} disabled={isLoadingMembers}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingMembers ? 'animate-spin' : ''}`} />
          Sync from Caspio
        </Button>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="assignments">Member Assignments</TabsTrigger>
          <TabsTrigger value="workload">Workload Analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Members</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{members.length}</div>
                <p className="text-xs text-muted-foreground">
                  Members in system (all MCOs)
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Social Workers</CardTitle>
                <UserPlus className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{socialWorkerStats.filter(sw => sw.name !== 'Unassigned').length}</div>
                <p className="text-xs text-muted-foreground">
                  Active social workers
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Unassigned</CardTitle>
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">
                  {socialWorkerStats.find(sw => sw.name === 'Unassigned')?.memberCount || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  Members without social worker
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">On Hold</CardTitle>
                <Clock className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {socialWorkerStats.reduce((sum, sw) => sum + sw.onHoldCount, 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Members on hold for SW visit
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Social Worker Summary Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {socialWorkerStats.map((sw) => (
              <Card key={sw.name} className={sw.name === 'Unassigned' ? 'border-yellow-200 bg-yellow-50' : ''}>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center justify-between">
                    <span className={sw.name === 'Unassigned' ? 'text-yellow-700' : ''}>
                      {sw.name === 'Unassigned' ? '⚠️ Unassigned Members' : sw.name}
                    </span>
                    <Button
                      variant={sw.name === 'Unassigned' ? 'destructive' : 'default'}
                      size="sm"
                      onClick={() => {
                        setSelectedSWForModal(sw);
                        setShowMemberModal(true);
                      }}
                    >
                      {sw.memberCount} members
                    </Button>
                  </CardTitle>
                  <CardDescription>
                    {sw.activeCount} active • {sw.onHoldCount} on hold
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="text-sm">
                      <strong>MCOs:</strong>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {Object.entries(sw.mcoBreakdown)
                          .sort(([,a], [,b]) => b - a)
                          .map(([mco, count]) => (
                            <Badge key={mco} variant="default" className="text-xs">
                              {mco}: {count}
                            </Badge>
                          ))}
                      </div>
                    </div>
                    <div className="text-sm">
                      <strong>Top RCFEs:</strong>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {Object.entries(sw.rcfeBreakdown)
                          .sort(([,a], [,b]) => b - a)
                          .slice(0, 2)
                          .map(([rcfe, count]) => (
                            <Badge key={rcfe} variant="secondary" className="text-xs">
                              {rcfe === 'No RCFE' ? 'No RCFE' : rcfe.substring(0, 20) + (rcfe.length > 20 ? '...' : '')}: {count}
                            </Badge>
                          ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="assignments" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filter Members
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Search</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search members..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Social Worker</label>
                  <Select value={selectedSocialWorker} onValueChange={setSelectedSocialWorker}>
                    <SelectTrigger>
                      <SelectValue placeholder="All social workers" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Social Workers</SelectItem>
                      {allSocialWorkers.map(sw => (
                        <SelectItem key={sw} value={sw}>
                          {sw} ({socialWorkerStats.find(s => s.name === sw)?.memberCount || 0})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">MCO</label>
                  <Select value={selectedMCO} onValueChange={setSelectedMCO}>
                    <SelectTrigger>
                      <SelectValue placeholder="All MCOs" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All MCOs</SelectItem>
                      {allMCOs.map(mco => (
                        <SelectItem key={mco} value={mco}>
                          {mco}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">CalAIM Status</label>
                  <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                    <SelectTrigger>
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      {allStatuses.map(status => (
                        <SelectItem key={status} value={status}>
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">County</label>
                  <Select value={selectedCounty} onValueChange={setSelectedCounty}>
                    <SelectTrigger>
                      <SelectValue placeholder="All counties" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Counties</SelectItem>
                      {allCounties.map(county => (
                        <SelectItem key={county} value={county}>
                          {county}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">RCFE</label>
                  <Select value={selectedRCFE} onValueChange={setSelectedRCFE}>
                    <SelectTrigger>
                      <SelectValue placeholder="All RCFEs" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All RCFEs</SelectItem>
                      {allRCFEs.map(rcfe => (
                        <SelectItem key={rcfe} value={rcfe}>
                          {rcfe === 'No RCFE' ? 'No RCFE' : rcfe.substring(0, 30) + (rcfe.length > 30 ? '...' : '')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex items-end">
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setSearchTerm('');
                      setSelectedSocialWorker('all');
                      setSelectedMCO('all');
                      setSelectedStatus('all');
                      setSelectedCounty('all');
                      setSelectedRCFE('all');
                    }}
                    className="w-full"
                  >
                    Clear Filters
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Members Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Member Assignments ({filteredMembers.length})</span>
                <Badge variant="outline">{filteredMembers.length} of {members.length} members</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Member</TableHead>
                      <TableHead>Client ID</TableHead>
                      <TableHead>MCO</TableHead>
                      <TableHead>County</TableHead>
                      <TableHead>CalAIM Status</TableHead>
                      <TableHead>Social Worker</TableHead>
                      <TableHead>RCFE</TableHead>
                      <TableHead>Hold Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoadingMembers ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8">
                          <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                          Loading members...
                        </TableCell>
                      </TableRow>
                    ) : filteredMembers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                          No members found matching the current filters.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredMembers.map((member) => (
                        <TableRow key={member.id}>
                          <TableCell className="font-medium">
                            {member.memberName}
                          </TableCell>
                          <TableCell>{member.Client_ID2}</TableCell>
                          <TableCell>
                            <Badge variant="default" className="text-xs">
                              {member.CalAIM_MCO || 'Unknown'}
                            </Badge>
                          </TableCell>
                          <TableCell>{member.memberCounty}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs">
                              {member.CalAIM_Status || 'No Status'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {member.Social_Worker_Assigned ? (
                              <Badge variant="default" className="text-xs">
                                {member.Social_Worker_Assigned}
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="text-xs">
                                Unassigned
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="text-xs">
                              {member.RCFE_Name ? (
                                <div>
                                  <div className="font-medium">{member.RCFE_Name}</div>
                                  <div className="text-muted-foreground">{member.RCFE_Address}</div>
                                </div>
                              ) : (
                                <Badge variant="outline" className="text-xs">
                                  No RCFE
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {member.Hold_For_Social_Worker === '🔴 Hold' ? (
                              <Badge variant="destructive" className="text-xs">
                                🔴 Hold
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">
                                Active
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm">
                              <Edit className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="workload" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Social Worker Workload Analysis</CardTitle>
              <CardDescription>
                Detailed breakdown of member assignments and workload distribution
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {socialWorkerStats.map((sw) => (
                  <div key={sw.name} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold flex items-center gap-2">
                        {sw.name === 'Unassigned' ? (
                          <>
                            <AlertTriangle className="h-5 w-5 text-yellow-500" />
                            <span className="text-yellow-700">Unassigned Members</span>
                          </>
                        ) : (
                          <>
                            <User className="h-5 w-5" />
                            {sw.name}
                          </>
                        )}
                      </h3>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{sw.memberCount} total</Badge>
                        <Badge variant="default">{sw.activeCount} active</Badge>
                        {sw.onHoldCount > 0 && (
                          <Badge variant="destructive">{sw.onHoldCount} on hold</Badge>
                        )}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <h4 className="font-medium mb-2">Status Breakdown</h4>
                        <div className="space-y-1">
                          {Object.entries(sw.statusBreakdown)
                            .sort(([,a], [,b]) => b - a)
                            .map(([status, count]) => (
                              <div key={status} className="flex justify-between items-center text-sm">
                                <span>{status}</span>
                                <Badge variant="outline" className="text-xs">{count}</Badge>
                              </div>
                            ))}
                        </div>
                      </div>
                      
                      <div>
                        <h4 className="font-medium mb-2">County Distribution</h4>
                        <div className="space-y-1">
                          {Object.entries(sw.countyBreakdown)
                            .sort(([,a], [,b]) => b - a)
                            .map(([county, count]) => (
                              <div key={county} className="flex justify-between items-center text-sm">
                                <span>{county}</span>
                                <Badge variant="secondary" className="text-xs">{count}</Badge>
                              </div>
                            ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Member Details Modal */}
      <Dialog open={showMemberModal} onOpenChange={setShowMemberModal}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedSWForModal?.name === 'Unassigned' ? 'Unassigned Members' : `${selectedSWForModal?.name} - Member Details`}
            </DialogTitle>
            <DialogDescription>
              {selectedSWForModal?.memberCount} members across {Object.keys(selectedSWForModal?.rcfeBreakdown || {}).length} RCFEs
            </DialogDescription>
          </DialogHeader>
          
          {selectedSWForModal && (
            <div className="space-y-4">
              {/* MCO Summary */}
              <div>
                <h4 className="font-medium mb-2">MCO Distribution</h4>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(selectedSWForModal.mcoBreakdown).map(([mco, count]) => (
                    <Badge key={mco} variant="default">
                      {mco}: {count}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* RCFE Breakdown */}
              <div>
                <h4 className="font-medium mb-2">RCFE Facilities</h4>
                <div className="space-y-2">
                  {Object.entries(selectedSWForModal.rcfeBreakdown)
                    .sort(([,a], [,b]) => b - a)
                    .map(([rcfe, count]) => {
                      const rcfeMembers = selectedSWForModal.members.filter(m => 
                        (m.RCFE_Name || 'No RCFE') === rcfe
                      );
                      const rcfeAddress = rcfeMembers[0]?.RCFE_Address || 'Address not available';
                      
                      return (
                        <div key={rcfe} className="border rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <h5 className="font-medium">{rcfe === 'No RCFE' ? 'No RCFE Assigned' : rcfe}</h5>
                              {rcfe !== 'No RCFE' && (
                                <p className="text-sm text-muted-foreground">{rcfeAddress}</p>
                              )}
                            </div>
                            <Badge variant="outline">{count} members</Badge>
                          </div>
                          
                          {/* Members at this RCFE */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                            {rcfeMembers.map(member => (
                              <div key={member.id} className="text-sm p-2 bg-muted rounded">
                                <div className="font-medium">{member.memberName}</div>
                                <div className="text-muted-foreground">
                                  {member.CalAIM_MCO} • {member.CalAIM_Status}
                                </div>
                                <div className="text-muted-foreground">
                                  ID: {member.Client_ID2}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}