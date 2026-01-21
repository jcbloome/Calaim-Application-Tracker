'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Search, 
  Users, 
  UserCheck, 
  Home, 
  MapPin, 
  Mail, 
  Phone,
  Calendar,
  Clock,
  Plus,
  Edit,
  Trash2,
  Save,
  X,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Loader2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface SocialWorker {
  id: string;
  name: string;
  email: string;
  phone?: string;
  county: string;
  city?: string;
  caseload: number;
  maxCaseload: number;
  status: 'Active' | 'Inactive';
}

interface RCFEMember {
  id: string;
  name: string;
  rcfeName: string;
  rcfeAddress: string;
  county: string;
  city: string;
  assignedSocialWorker?: string;
  lastVisit?: string;
  nextVisit?: string;
  status: 'Active' | 'Inactive';
  careLevel: 'Low' | 'Medium' | 'High';
}

interface Assignment {
  id: string;
  socialWorkerId: string;
  socialWorkerName: string;
  memberId: string;
  memberName: string;
  rcfeName: string;
  county: string;
  assignedDate: string;
  lastVisit?: string;
  nextVisit?: string;
  status: 'Active' | 'Completed' | 'Pending';
  notes?: string;
}

export default function SocialWorkerAssignmentsPage() {
  const [socialWorkers, setSocialWorkers] = useState<SocialWorker[]>([]);
  const [rcfeMembers, setRCFEMembers] = useState<RCFEMember[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCounty, setSelectedCounty] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [activeTab, setActiveTab] = useState('assignments');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState<RCFEMember | null>(null);

  const { toast } = useToast();

  // Load initial data
  useEffect(() => {
    loadMockData();
  }, []);

  const loadMockData = () => {
    // Mock social workers
    const mockSocialWorkers: SocialWorker[] = [
      {
        id: '1',
        name: 'Jason Bloome',
        email: 'jcbloome@gmail.com',
        county: 'Los Angeles',
        city: 'Pembroke Pines',
        caseload: 15,
        maxCaseload: 25,
        status: 'Active'
      },
      {
        id: '2',
        name: 'Anna-Lisa Bastian',
        email: 'Annalisabastian@gmail.com',
        county: 'Los Angeles',
        city: 'View Park',
        caseload: 12,
        maxCaseload: 20,
        status: 'Active'
      },
      {
        id: '3',
        name: 'Kia Yang',
        email: 'mskiayang@yahoo.com',
        county: 'Sacramento',
        city: 'Sacramento',
        caseload: 8,
        maxCaseload: 18,
        status: 'Active'
      },
      {
        id: '4',
        name: 'John Amber',
        email: 'john.amber@example.com',
        county: 'Los Angeles',
        city: 'Los Angeles',
        caseload: 10,
        maxCaseload: 20,
        status: 'Active'
      },
      {
        id: '5',
        name: 'Nick Jaksic',
        email: 'nick.jaksic@example.com',
        county: 'Los Angeles',
        city: 'Los Angeles',
        caseload: 8,
        maxCaseload: 18,
        status: 'Active'
      }
    ];

    // Mock RCFE members
    const mockMembers: RCFEMember[] = [
      {
        id: '1',
        name: 'John Smith',
        rcfeName: 'Sunshine Care Home',
        rcfeAddress: '123 Main St, Los Angeles, CA',
        county: 'Los Angeles',
        city: 'Los Angeles',
        assignedSocialWorker: '1',
        lastVisit: '2024-01-10',
        nextVisit: '2024-02-10',
        status: 'Active',
        careLevel: 'Medium'
      },
      {
        id: '2',
        name: 'Mary Johnson',
        rcfeName: 'Golden Years RCFE',
        rcfeAddress: '456 Oak Ave, Sacramento, CA',
        county: 'Sacramento',
        city: 'Sacramento',
        status: 'Active',
        careLevel: 'High'
      },
      {
        id: '3',
        name: 'Robert Davis',
        rcfeName: 'Peaceful Living Home',
        rcfeAddress: '789 Pine St, Los Angeles, CA',
        county: 'Los Angeles',
        city: 'Pasadena',
        assignedSocialWorker: '2',
        lastVisit: '2024-01-15',
        nextVisit: '2024-02-15',
        status: 'Active',
        careLevel: 'Low'
      }
    ];

    // Mock assignments
    const mockAssignments: Assignment[] = [
      {
        id: '1',
        socialWorkerId: '1',
        socialWorkerName: 'Staff Member A',
        memberId: '1',
        memberName: 'Sample Member A',
        rcfeName: 'Sample Care Home A',
        county: 'Los Angeles',
        assignedDate: '2024-01-01',
        lastVisit: '2024-01-10',
        nextVisit: '2024-02-10',
        status: 'Active',
        notes: 'Regular monthly visits scheduled'
      },
      {
        id: '2',
        socialWorkerId: '2',
        socialWorkerName: 'Anna-Lisa Bastian',
        memberId: '3',
        memberName: 'Robert Davis',
        rcfeName: 'Peaceful Living Home',
        county: 'Los Angeles',
        assignedDate: '2024-01-05',
        lastVisit: '2024-01-15',
        nextVisit: '2024-02-15',
        status: 'Active',
        notes: 'Low care level, quarterly visits'
      }
    ];

    setSocialWorkers(mockSocialWorkers);
    setRCFEMembers(mockMembers);
    setAssignments(mockAssignments);
  };

  // Get counties for filter
  const counties = useMemo(() => {
    const uniqueCounties = [...new Set([
      ...socialWorkers.map(sw => sw.county),
      ...rcfeMembers.map(member => member.county)
    ])].sort();
    return uniqueCounties;
  }, [socialWorkers, rcfeMembers]);

  // Filter data
  const filteredAssignments = useMemo(() => {
    let filtered = assignments;

    if (searchTerm) {
      filtered = filtered.filter(assignment =>
        assignment.socialWorkerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        assignment.memberName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        assignment.rcfeName.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (selectedCounty !== 'all') {
      filtered = filtered.filter(assignment => assignment.county === selectedCounty);
    }

    if (selectedStatus !== 'all') {
      filtered = filtered.filter(assignment => assignment.status === selectedStatus);
    }

    return filtered;
  }, [assignments, searchTerm, selectedCounty, selectedStatus]);

  const unassignedMembers = useMemo(() => {
    return rcfeMembers.filter(member => !member.assignedSocialWorker);
  }, [rcfeMembers]);

  const handleAssignSocialWorker = (memberId: string, socialWorkerId: string) => {
    // READ-ONLY MODE: Assignments are disabled to prevent writes to Caspio
    toast({
      title: "Read-Only Mode",
      description: "Assignment functionality is disabled in read-only mode. Data is synced from Caspio only.",
      variant: "destructive"
    });
    
    setShowAssignModal(false);
    setSelectedMember(null);
  };

  const getNextVisitDate = () => {
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    return nextMonth.toISOString().split('T')[0];
  };

  const syncFromCaspio = async () => {
    setSyncing(true);
    try {
      console.log('📊 Syncing social worker assignments from Caspio (READ ONLY)');
      
      // Fetch data from Caspio API
      const response = await fetch('/api/kaiser-members');
      if (!response.ok) {
        throw new Error('Failed to fetch data from Caspio');
      }
      
      const data = await response.json();
      console.log('📊 Synced data from Caspio:', data);
      
      // Debug: Log a few sample members to see the staff assignment fields
      if (data.members && data.members.length > 0) {
        console.log('🔍 Sample member data for staff assignments:');
        data.members.slice(0, 3).forEach((member: any, index: number) => {
          console.log(`Member ${index + 1}:`, {
            name: `${member.Senior_First || ''} ${member.Senior_Last || ''}`.trim(),
            Staff_Assigned: member.Staff_Assigned,
            Kaiser_User_Assignment: member.Kaiser_User_Assignment,
            RCFE_Name: member.RCFE_Name
          });
        });
      }
      
      // Transform Caspio data to our format
      const transformedMembers: RCFEMember[] = data.members
        .filter((member: any) => member.RCFE_Name && member.RCFE_Name.trim() !== '')
        .map((member: any, index: number) => ({
          id: `rcfe-member-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}-${member.client_ID2 || 'unknown'}`,
          name: `${member.Senior_First || ''} ${member.Senior_Last || ''}`.trim(),
          rcfeName: member.RCFE_Name || 'Unknown RCFE',
          rcfeAddress: member.RCFE_Address || 'Address not available',
          county: member.Member_County || 'Los Angeles',
          city: member.Member_City || 'Unknown',
          assignedSocialWorker: member.Social_Worker_Assigned && member.Social_Worker_Assigned.trim() !== '' ? member.Social_Worker_Assigned : undefined,
          lastVisit: member.Last_Visit_Date || undefined,
          nextVisit: member.Next_Visit_Date || undefined,
          status: member.CalAIM_Status === 'Authorized' ? 'Active' : 'Inactive',
          careLevel: member.Care_Level || 'Medium'
        }));

      // Transform social worker assignments - only use Social_Worker_Assigned field
      const staffAssignments = data.members
        .filter((member: any) => {
          // Only include if they have a Social_Worker_Assigned value
          return member.Social_Worker_Assigned && member.Social_Worker_Assigned.trim() !== '';
        })
        .map((member: any) => {
          // Only use the Social_Worker_Assigned field
          const socialWorkerAssignment = member.Social_Worker_Assigned;
          
          // Debug: Log the social worker assignment
          console.log('🔍 Social Worker Assignment Debug (Social_Worker_Assigned Only):', {
            memberName: `${member.Senior_First || ''} ${member.Senior_Last || ''}`.trim(),
            Social_Worker_Assigned: member.Social_Worker_Assigned,
            socialWorkerAssignment: socialWorkerAssignment
          });
          
          // Ensure it's a string and determine if this is an email (social worker) or a name
          const assignmentStr = String(socialWorkerAssignment || '');
          const isEmail = assignmentStr && typeof assignmentStr === 'string' && assignmentStr.includes('@');
          
          // If it's an email, use it as both ID and name (for now)
          // If it's not an email, it might be a name - use it as the name but create an ID
          const socialWorkerId = isEmail ? assignmentStr : `sw-${assignmentStr.replace(/\s+/g, '-').toLowerCase()}`;
          const socialWorkerName = assignmentStr || 'Unassigned';
          
          return {
            id: `assignment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${member.client_ID2 || 'unknown'}`,
            socialWorkerId: socialWorkerId,
            socialWorkerName: socialWorkerName,
            memberId: `member-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${member.client_ID2 || 'unknown'}`,
            memberName: `${member.Senior_First || ''} ${member.Senior_Last || ''}`.trim(),
            rcfeName: member.RCFE_Name || 'Unknown RCFE',
            county: member.Member_County || 'Los Angeles',
            assignedDate: member.Assignment_Date || new Date().toISOString().split('T')[0],
            lastVisit: member.Last_Visit_Date || undefined,
            nextVisit: member.Next_Visit_Date || undefined,
            status: 'Active',
            notes: member.Visit_Notes || undefined
          };
        });

      setRCFEMembers(transformedMembers);
      setAssignments(staffAssignments);
      
      toast({
        title: "Sync Complete",
        description: `Synced ${transformedMembers.length} RCFE members and ${staffAssignments.length} assignments from Caspio (READ ONLY)`,
      });
      
    } catch (error) {
      console.error('❌ Error syncing from Caspio:', error);
      toast({
        title: "Sync Failed",
        description: "Failed to sync data from Caspio. Please try again.",
        variant: "destructive"
      });
    } finally {
      setSyncing(false);
    }
  };

  const getCareLevelBadge = (level: string) => {
    const colors = {
      'Low': 'bg-green-100 text-green-800',
      'Medium': 'bg-yellow-100 text-yellow-800',
      'High': 'bg-red-100 text-red-800'
    };
    return colors[level as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Social Worker Assignments</h1>
          <p className="text-muted-foreground">View social worker assignments to RCFE members</p>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
              📖 Read-Only Mode
            </Badge>
            <span className="text-sm text-muted-foreground">Data synced from Caspio - no write operations</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={syncFromCaspio} 
            disabled={syncing}
            variant="outline"
          >
            {syncing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            {syncing ? 'Syncing...' : 'Sync from Caspio'}
          </Button>
          <Button 
            onClick={() => {
              toast({
                title: "Read-Only Mode",
                description: "Assignment creation is disabled. This page only displays data from Caspio.",
                variant: "destructive"
              });
            }} 
            variant="outline"
            disabled
          >
            <Plus className="h-4 w-4 mr-2" />
            New Assignment (Read-Only)
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-blue-600" />
              <div>
                <p className="text-sm text-muted-foreground">Active Social Workers</p>
                <p className="text-2xl font-bold">{socialWorkers.filter(sw => sw.status === 'Active').length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-green-600" />
              <div>
                <p className="text-sm text-muted-foreground">Total Members</p>
                <p className="text-2xl font-bold">{rcfeMembers.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-purple-600" />
              <div>
                <p className="text-sm text-muted-foreground">Active Assignments</p>
                <p className="text-2xl font-bold">{assignments.filter(a => a.status === 'Active').length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-orange-600" />
              <div>
                <p className="text-sm text-muted-foreground">Unassigned Members</p>
                <p className="text-2xl font-bold">{unassignedMembers.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search assignments..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <Select value={selectedCounty} onValueChange={setSelectedCounty}>
              <SelectTrigger>
                <SelectValue placeholder="All Counties" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Counties</SelectItem>
                {counties.map(county => (
                  <SelectItem key={county} value={county}>{county}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger>
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="Completed">Completed</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" onClick={() => {
              setSearchTerm('');
              setSelectedCounty('all');
              setSelectedStatus('all');
            }}>
              <X className="h-4 w-4 mr-2" />
              Clear Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="assignments">Current Assignments</TabsTrigger>
          <TabsTrigger value="unassigned">Unassigned Members</TabsTrigger>
          <TabsTrigger value="social-workers">Social Workers</TabsTrigger>
        </TabsList>

        <TabsContent value="assignments" className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            {filteredAssignments.map((assignment) => (
              <Card key={assignment.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold">{assignment.memberName}</h3>
                        <Badge variant={assignment.status === 'Active' ? 'default' : 'secondary'}>
                          {assignment.status}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
                        <div>
                          <p className="font-medium">Social Worker</p>
                          <p>{assignment.socialWorkerName}</p>
                        </div>
                        <div>
                          <p className="font-medium">RCFE Facility</p>
                          <p>{assignment.rcfeName}</p>
                        </div>
                        <div>
                          <p className="font-medium">Location</p>
                          <p>{assignment.county} County</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600 mt-2">
                        <div>
                          <p className="font-medium">Assigned Date</p>
                          <p>{assignment.assignedDate}</p>
                        </div>
                        <div>
                          <p className="font-medium">Last Visit</p>
                          <p>{assignment.lastVisit || 'Not visited yet'}</p>
                        </div>
                        <div>
                          <p className="font-medium">Next Visit</p>
                          <p>{assignment.nextVisit || 'Not scheduled'}</p>
                        </div>
                      </div>

                      {assignment.notes && (
                        <div className="mt-2">
                          <p className="font-medium text-sm">Notes</p>
                          <p className="text-sm text-gray-600">{assignment.notes}</p>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Button variant="outline" size="sm">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm">
                        <Calendar className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {filteredAssignments.length === 0 && (
              <Card>
                <CardContent className="p-8 text-center">
                  <Users className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-gray-600">No assignments match your current filters</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="unassigned" className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            {unassignedMembers.map((member) => (
              <Card key={member.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold">{member.name}</h3>
                        <Badge className={getCareLevelBadge(member.careLevel)}>
                          {member.careLevel} Care
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
                        <div>
                          <p className="font-medium">RCFE Facility</p>
                          <p>{member.rcfeName}</p>
                          <p>{member.rcfeAddress}</p>
                        </div>
                        <div>
                          <p className="font-medium">Location</p>
                          <p>{member.city}, {member.county} County</p>
                        </div>
                      </div>
                    </div>

                    <Button 
                      onClick={() => {
                        toast({
                          title: "Read-Only Mode",
                          description: "Assignment functionality is disabled. This page only displays data from Caspio.",
                          variant: "destructive"
                        });
                      }}
                      variant="outline"
                      disabled
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Assign (Read-Only)
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}

            {unassignedMembers.length === 0 && (
              <Card>
                <CardContent className="p-8 text-center">
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-400" />
                  <p className="text-gray-600">All members have been assigned to social workers</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="social-workers" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {socialWorkers.map((sw) => (
              <Card key={sw.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold">{sw.name}</h3>
                      <Badge variant={sw.status === 'Active' ? 'default' : 'secondary'}>
                        {sw.status}
                      </Badge>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-600">Caseload</p>
                      <p className="font-semibold">{sw.caseload}/{sw.maxCaseload}</p>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3 w-3" />
                      <span>{sw.city}, {sw.county}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail className="h-3 w-3" />
                      <span>{sw.email}</span>
                    </div>
                    {sw.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-3 w-3" />
                        <span>{sw.phone}</span>
                      </div>
                    )}
                  </div>

                  {/* Caseload Progress Bar */}
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>Caseload</span>
                      <span>{Math.round((sw.caseload / sw.maxCaseload) * 100)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full ${
                          sw.caseload / sw.maxCaseload > 0.8 ? 'bg-red-500' :
                          sw.caseload / sw.maxCaseload > 0.6 ? 'bg-yellow-500' : 'bg-green-500'
                        }`}
                        style={{ width: `${(sw.caseload / sw.maxCaseload) * 100}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Assignment Modal */}
      {showAssignModal && selectedMember && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Assign Social Worker</CardTitle>
              <CardDescription>
                Assign a social worker to {selectedMember.name} at {selectedMember.rcfeName}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Available Social Workers in {selectedMember.county} County</Label>
                <div className="space-y-2 mt-2">
                  {socialWorkers
                    .filter(sw => sw.county === selectedMember.county && sw.status === 'Active')
                    .map(sw => (
                      <div key={sw.id} className="flex items-center justify-between p-2 border rounded">
                        <div>
                          <p className="font-medium">{sw.name}</p>
                          <p className="text-sm text-gray-600">
                            Caseload: {sw.caseload}/{sw.maxCaseload}
                          </p>
                        </div>
                        <Button 
                          size="sm"
                          onClick={() => handleAssignSocialWorker(selectedMember.id, sw.id)}
                          disabled={sw.caseload >= sw.maxCaseload}
                        >
                          Assign
                        </Button>
                      </div>
                    ))}
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => {
                  setShowAssignModal(false);
                  setSelectedMember(null);
                }} className="flex-1">
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}