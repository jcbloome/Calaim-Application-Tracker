'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Search, 
  MapPin, 
  Users, 
  Building2, 
  Navigation, 
  Stethoscope,
  UserCheck,
  Home,
  Loader2,
  RefreshCw,
  Eye,
  EyeOff,
  Filter,
  ChevronDown,
  Calendar,
  Clock,
  CheckCircle,
  AlertTriangle,
  Plus,
  Edit,
  Download,
  Upload,
  Bell,
  UserPlus,
  ArrowRightLeft
} from 'lucide-react';
import { findCountyByCity, searchCities, getCitiesInCounty } from '@/lib/california-cities';
import { useToast } from '@/hooks/use-toast';
import GoogleMapsComponent from '@/components/GoogleMapsComponent';
import { ResourceDetailModal } from '@/components/ResourceDetailModal';

interface ResourceCounts {
  rcfes: number;
  socialWorkers: number;
  registeredNurses: number;
  authorizedMembers: number;
}

interface Visit {
  id: string;
  memberName: string;
  memberClientId: string;
  healthPlan: string;
  visitType: 'Initial Assessment' | 'Follow-up' | 'Monthly Check' | 'Emergency';
  scheduledDate: string;
  scheduledTime: string;
  status: 'Scheduled' | 'Completed' | 'Cancelled' | 'Rescheduled';
  assignedStaff: string;
  location: string;
  notes?: string;
  completedDate?: string;
  duration?: number; // in minutes
}

interface StaffMember {
  id: string;
  name: string;
  role: string;
  location: string;
  assignedMembers: number;
  capacity: number;
  workload: 'Low' | 'Medium' | 'High' | 'Overloaded';
}

export default function MapIntelligencePage() {
  const { toast } = useToast();
  
  // Map state
  const [resourceCounts, setResourceCounts] = useState<ResourceCounts>({
    rcfes: 0,
    socialWorkers: 0,
    registeredNurses: 0,
    authorizedMembers: 0
  });
  const [isMapLoading, setIsMapLoading] = useState(false);
  const [selectedResource, setSelectedResource] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Monthly Visits state
  const [visits, setVisits] = useState<Visit[]>([]);
  const [isVisitsLoading, setIsVisitsLoading] = useState(false);
  const [visitFilter, setVisitFilter] = useState({
    status: 'all',
    healthPlan: 'all',
    dateRange: 'thisMonth'
  });

  // Staff Reassignment state
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<string>('');
  const [reassignmentTarget, setReassignmentTarget] = useState<string>('');
  const [isReassigning, setIsReassigning] = useState(false);

  // Sample data for visits
  useEffect(() => {
    const sampleVisits: Visit[] = [
      {
        id: '1',
        memberName: 'John Doe',
        memberClientId: 'KAI-12345',
        healthPlan: 'Kaiser',
        visitType: 'Monthly Check',
        scheduledDate: '2026-01-20',
        scheduledTime: '10:00',
        status: 'Scheduled',
        assignedStaff: 'Sarah Johnson',
        location: 'Los Angeles, CA',
        notes: 'Regular monthly assessment'
      },
      {
        id: '2',
        memberName: 'Jane Smith',
        memberClientId: 'HN-67890',
        healthPlan: 'Health Net',
        visitType: 'Follow-up',
        scheduledDate: '2026-01-18',
        scheduledTime: '14:30',
        status: 'Completed',
        assignedStaff: 'Mike Wilson',
        location: 'San Diego, CA',
        completedDate: '2026-01-18',
        duration: 45,
        notes: 'Member doing well, no issues'
      },
      {
        id: '3',
        memberName: 'Robert Johnson',
        memberClientId: 'KAI-11111',
        healthPlan: 'Kaiser',
        visitType: 'Initial Assessment',
        scheduledDate: '2026-01-22',
        scheduledTime: '09:00',
        status: 'Scheduled',
        assignedStaff: 'Emily Davis',
        location: 'San Francisco, CA',
        notes: 'New member intake assessment'
      }
    ];
    setVisits(sampleVisits);

    // Sample staff data
    const sampleStaff: StaffMember[] = [
      {
        id: '1',
        name: 'Sarah Johnson',
        role: 'Social Worker (MSW)',
        location: 'Los Angeles County',
        assignedMembers: 25,
        capacity: 30,
        workload: 'High'
      },
      {
        id: '2',
        name: 'Mike Wilson',
        role: 'Registered Nurse',
        location: 'San Diego County',
        assignedMembers: 15,
        capacity: 25,
        workload: 'Medium'
      },
      {
        id: '3',
        name: 'Emily Davis',
        role: 'Social Worker (MSW)',
        location: 'San Francisco County',
        assignedMembers: 32,
        capacity: 30,
        workload: 'Overloaded'
      },
      {
        id: '4',
        name: 'David Chen',
        role: 'Registered Nurse',
        location: 'Orange County',
        assignedMembers: 12,
        capacity: 25,
        workload: 'Low'
      }
    ];
    setStaffMembers(sampleStaff);
  }, []);

  const handleResourceUpdate = (counts: ResourceCounts) => {
    setResourceCounts(counts);
  };

  const handleResourceClick = (resourceType: string) => {
    setSelectedResource(resourceType);
    setIsModalOpen(true);
  };

  const handleScheduleVisit = () => {
    toast({
      title: "Visit Scheduled",
      description: "New visit has been added to the calendar."
    });
  };

  const handleReassignStaff = async () => {
    if (!selectedStaff || !reassignmentTarget) {
      toast({
        title: "Error",
        description: "Please select both source and target staff members.",
        variant: "destructive"
      });
      return;
    }

    setIsReassigning(true);
    
    // Simulate API call
    setTimeout(() => {
      toast({
        title: "Staff Reassignment Complete",
        description: "Members have been successfully reassigned based on location proximity."
      });
      setIsReassigning(false);
      setSelectedStaff('');
      setReassignmentTarget('');
    }, 2000);
  };

  const getWorkloadColor = (workload: string) => {
    switch (workload) {
      case 'Low': return 'bg-green-100 text-green-800 border-green-200';
      case 'Medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'High': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'Overloaded': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Scheduled': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Completed': return 'bg-green-100 text-green-800 border-green-200';
      case 'Cancelled': return 'bg-red-100 text-red-800 border-red-200';
      case 'Rescheduled': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const filteredVisits = useMemo(() => {
    return visits.filter(visit => {
      if (visitFilter.status !== 'all' && visit.status !== visitFilter.status) return false;
      if (visitFilter.healthPlan !== 'all' && visit.healthPlan !== visitFilter.healthPlan) return false;
      return true;
    });
  }, [visits, visitFilter]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Navigation className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Map Intelligence & Monthly Visits</h1>
            <p className="text-muted-foreground">
              Interactive mapping, visit scheduling, and staff management for CalAIM members
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsMapLoading(true)}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh Data
          </Button>
        </div>
      </div>

      {/* Tabs for different views */}
      <Tabs defaultValue="map" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="map">Interactive Map</TabsTrigger>
          <TabsTrigger value="visits">Monthly Visits</TabsTrigger>
          <TabsTrigger value="staff">Staff Reassignment</TabsTrigger>
        </TabsList>

        {/* Interactive Map Tab */}
        <TabsContent value="map" className="space-y-6">
          {/* Resource Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleResourceClick('rcfes')}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">RCFEs</CardTitle>
                <Building2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{resourceCounts.rcfes}</div>
                <p className="text-xs text-muted-foreground">Registered facilities</p>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleResourceClick('socialWorkers')}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Social Workers</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{resourceCounts.socialWorkers}</div>
                <p className="text-xs text-muted-foreground">MSW professionals</p>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleResourceClick('registeredNurses')}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Registered Nurses</CardTitle>
                <Stethoscope className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{resourceCounts.registeredNurses}</div>
                <p className="text-xs text-muted-foreground">RN professionals</p>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleResourceClick('authorizedMembers')}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Authorized Members</CardTitle>
                <UserCheck className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{resourceCounts.authorizedMembers}</div>
                <p className="text-xs text-muted-foreground">Active CalAIM members</p>
              </CardContent>
            </Card>
          </div>

          {/* Google Maps Component */}
          <Card>
            <CardHeader>
              <CardTitle>California CalAIM Resource Map</CardTitle>
              <CardDescription>
                Interactive map showing RCFEs, social workers, nurses, and authorized members across California
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[600px] w-full">
                <GoogleMapsComponent onResourceUpdate={handleResourceUpdate} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Monthly Visits Tab */}
        <TabsContent value="visits" className="space-y-6">
          {/* Visit Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Visit Filters
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={visitFilter.status} onValueChange={(value) => setVisitFilter(prev => ({ ...prev, status: value }))}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="Scheduled">Scheduled</SelectItem>
                      <SelectItem value="Completed">Completed</SelectItem>
                      <SelectItem value="Cancelled">Cancelled</SelectItem>
                      <SelectItem value="Rescheduled">Rescheduled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Health Plan</Label>
                  <Select value={visitFilter.healthPlan} onValueChange={(value) => setVisitFilter(prev => ({ ...prev, healthPlan: value }))}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Plans</SelectItem>
                      <SelectItem value="Kaiser">Kaiser</SelectItem>
                      <SelectItem value="Health Net">Health Net</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button onClick={handleScheduleVisit}>
                    <Plus className="mr-2 h-4 w-4" />
                    Schedule Visit
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Visits Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Monthly Visits ({filteredVisits.length})
              </CardTitle>
              <CardDescription>
                Scheduled and completed visits for CalAIM members
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Health Plan</TableHead>
                    <TableHead>Visit Type</TableHead>
                    <TableHead>Date & Time</TableHead>
                    <TableHead>Assigned Staff</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredVisits.map((visit) => (
                    <TableRow key={visit.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{visit.memberName}</div>
                          <div className="text-sm text-muted-foreground">{visit.memberClientId}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={
                          visit.healthPlan === 'Kaiser' ? 'bg-green-50 text-green-700 border-green-200' :
                          'bg-orange-50 text-orange-700 border-orange-200'
                        }>
                          {visit.healthPlan}
                        </Badge>
                      </TableCell>
                      <TableCell>{visit.visitType}</TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{visit.scheduledDate}</div>
                          <div className="text-sm text-muted-foreground">{visit.scheduledTime}</div>
                        </div>
                      </TableCell>
                      <TableCell>{visit.assignedStaff}</TableCell>
                      <TableCell>{visit.location}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getStatusColor(visit.status)}>
                          {visit.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline">
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="outline">
                            <Eye className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Staff Reassignment Tab */}
        <TabsContent value="staff" className="space-y-6">
          {/* Staff Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {staffMembers.map((staff) => (
              <Card key={staff.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">{staff.name}</CardTitle>
                  <CardDescription className="text-xs">{staff.role}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Members:</span>
                      <span className="font-medium">{staff.assignedMembers}/{staff.capacity}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Location:</span>
                      <span className="text-xs">{staff.location}</span>
                    </div>
                    <Badge variant="outline" className={getWorkloadColor(staff.workload)}>
                      {staff.workload} Workload
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Staff Reassignment Tool */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5" />
                Staff Reassignment by Location
              </CardTitle>
              <CardDescription>
                Reassign members between staff based on geographic proximity and workload
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div className="space-y-2">
                  <Label>From Staff Member</Label>
                  <Select value={selectedStaff} onValueChange={setSelectedStaff}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select staff to reassign from" />
                    </SelectTrigger>
                    <SelectContent>
                      {staffMembers.filter(s => s.assignedMembers > 0).map((staff) => (
                        <SelectItem key={staff.id} value={staff.id}>
                          {staff.name} ({staff.assignedMembers} members)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>To Staff Member</Label>
                  <Select value={reassignmentTarget} onValueChange={setReassignmentTarget}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select target staff" />
                    </SelectTrigger>
                    <SelectContent>
                      {staffMembers.filter(s => s.id !== selectedStaff && s.assignedMembers < s.capacity).map((staff) => (
                        <SelectItem key={staff.id} value={staff.id}>
                          {staff.name} ({staff.capacity - staff.assignedMembers} available)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button 
                  onClick={handleReassignStaff} 
                  disabled={!selectedStaff || !reassignmentTarget || isReassigning}
                >
                  {isReassigning ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Reassigning...
                    </>
                  ) : (
                    <>
                      <UserPlus className="mr-2 h-4 w-4" />
                      Reassign Members
                    </>
                  )}
                </Button>
              </div>
              
              {selectedStaff && reassignmentTarget && (
                <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                  <h4 className="font-medium text-blue-900 mb-2">Reassignment Preview</h4>
                  <p className="text-sm text-blue-700">
                    This will automatically reassign members from the selected staff to the target staff based on:
                  </p>
                  <ul className="text-sm text-blue-700 mt-2 ml-4 list-disc">
                    <li>Geographic proximity (same county/region priority)</li>
                    <li>Target staff capacity and current workload</li>
                    <li>Member care continuity considerations</li>
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Staff Performance Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Staff Performance Summary</CardTitle>
              <CardDescription>
                Overview of staff workload distribution and capacity utilization
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff Member</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Assigned Members</TableHead>
                    <TableHead>Capacity</TableHead>
                    <TableHead>Utilization</TableHead>
                    <TableHead>Workload Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staffMembers.map((staff) => {
                    const utilization = Math.round((staff.assignedMembers / staff.capacity) * 100);
                    return (
                      <TableRow key={staff.id}>
                        <TableCell className="font-medium">{staff.name}</TableCell>
                        <TableCell>{staff.role}</TableCell>
                        <TableCell>{staff.location}</TableCell>
                        <TableCell>{staff.assignedMembers}</TableCell>
                        <TableCell>{staff.capacity}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-20 bg-gray-200 rounded-full h-2">
                              <div 
                                className={`h-2 rounded-full ${
                                  utilization >= 100 ? 'bg-red-500' :
                                  utilization >= 80 ? 'bg-orange-500' :
                                  utilization >= 60 ? 'bg-yellow-500' :
                                  'bg-green-500'
                                }`}
                                style={{ width: `${Math.min(utilization, 100)}%` }}
                              />
                            </div>
                            <span className="text-sm">{utilization}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getWorkloadColor(staff.workload)}>
                            {staff.workload}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Resource Detail Modal */}
      <ResourceDetailModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        resourceType={selectedResource}
      />
    </div>
  );
}