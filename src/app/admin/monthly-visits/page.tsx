'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { 
  Search, 
  Calendar, 
  Clock, 
  MapPin, 
  Users, 
  CheckCircle, 
  AlertTriangle, 
  Plus,
  Edit,
  Eye,
  Filter,
  Download,
  Upload,
  Bell
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Visit {
  id: string;
  socialWorkerId: string;
  socialWorkerName: string;
  memberId: string;
  memberName: string;
  rcfeName: string;
  rcfeAddress: string;
  county: string;
  city: string;
  scheduledDate: string;
  scheduledTime: string;
  status: 'Scheduled' | 'Completed' | 'Cancelled' | 'Overdue';
  visitType: 'Monthly' | 'Quarterly' | 'Emergency' | 'Follow-up';
  duration: number; // in minutes
  notes?: string;
  completedDate?: string;
  completedBy?: string;
  careLevel: 'Low' | 'Medium' | 'High';
}

interface VisitReport {
  id: string;
  visitId: string;
  memberCondition: 'Excellent' | 'Good' | 'Fair' | 'Poor';
  rcfeCompliance: 'Compliant' | 'Minor Issues' | 'Major Issues';
  actionItems: string[];
  nextVisitRecommendation: string;
  reportDate: string;
  reportedBy: string;
}

export default function MonthlyVisitsPage() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [visitReports, setVisitReports] = useState<VisitReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCounty, setSelectedCounty] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [activeTab, setActiveTab] = useState('calendar');
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null);

  const { toast } = useToast();

  // Mock data - replace with real API calls
  useEffect(() => {
    loadMockData();
  }, []);

  const loadMockData = () => {
    const mockVisits: Visit[] = [
      {
        id: '1',
        socialWorkerId: '1',
        socialWorkerName: 'Jason Bloome',
        memberId: '1',
        memberName: 'John Smith',
        rcfeName: 'Sunshine Care Home',
        rcfeAddress: '123 Main St, Los Angeles, CA 90210',
        county: 'Los Angeles',
        city: 'Los Angeles',
        scheduledDate: '2024-02-15',
        scheduledTime: '10:00',
        status: 'Scheduled',
        visitType: 'Monthly',
        duration: 60,
        careLevel: 'Medium'
      },
      {
        id: '2',
        socialWorkerId: '2',
        socialWorkerName: 'Anna-Lisa Bastian',
        memberId: '2',
        memberName: 'Mary Johnson',
        rcfeName: 'Golden Years RCFE',
        rcfeAddress: '456 Oak Ave, Sacramento, CA 95814',
        county: 'Sacramento',
        city: 'Sacramento',
        scheduledDate: '2024-02-10',
        scheduledTime: '14:00',
        status: 'Completed',
        visitType: 'Monthly',
        duration: 45,
        completedDate: '2024-02-10',
        completedBy: 'Anna-Lisa Bastian',
        careLevel: 'High',
        notes: 'Member is doing well, RCFE staff is attentive'
      },
      {
        id: '3',
        socialWorkerId: '1',
        socialWorkerName: 'Jason Bloome',
        memberId: '3',
        memberName: 'Robert Davis',
        rcfeName: 'Peaceful Living Home',
        rcfeAddress: '789 Pine St, Pasadena, CA 91101',
        county: 'Los Angeles',
        city: 'Pasadena',
        scheduledDate: '2024-01-20',
        scheduledTime: '09:00',
        status: 'Overdue',
        visitType: 'Monthly',
        duration: 60,
        careLevel: 'Low'
      }
    ];

    setVisits(mockVisits);
  };

  // Get counties for filter
  const counties = useMemo(() => {
    const uniqueCounties = [...new Set(visits.map(visit => visit.county))].sort();
    return uniqueCounties;
  }, [visits]);

  // Filter visits
  const filteredVisits = useMemo(() => {
    let filtered = visits;

    if (searchTerm) {
      filtered = filtered.filter(visit =>
        visit.socialWorkerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        visit.memberName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        visit.rcfeName.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (selectedCounty !== 'all') {
      filtered = filtered.filter(visit => visit.county === selectedCounty);
    }

    if (selectedStatus !== 'all') {
      filtered = filtered.filter(visit => visit.status === selectedStatus);
    }

    if (selectedMonth) {
      filtered = filtered.filter(visit => 
        visit.scheduledDate.startsWith(selectedMonth)
      );
    }

    return filtered.sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime());
  }, [visits, searchTerm, selectedCounty, selectedStatus, selectedMonth]);

  // Get visit statistics
  const visitStats = useMemo(() => {
    const total = visits.length;
    const scheduled = visits.filter(v => v.status === 'Scheduled').length;
    const completed = visits.filter(v => v.status === 'Completed').length;
    const overdue = visits.filter(v => v.status === 'Overdue').length;
    const thisMonth = visits.filter(v => v.scheduledDate.startsWith(selectedMonth)).length;

    return { total, scheduled, completed, overdue, thisMonth };
  }, [visits, selectedMonth]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Scheduled': return 'bg-blue-100 text-blue-800';
      case 'Completed': return 'bg-green-100 text-green-800';
      case 'Cancelled': return 'bg-gray-100 text-gray-800';
      case 'Overdue': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getCareLevelColor = (level: string) => {
    switch (level) {
      case 'Low': return 'bg-green-100 text-green-800';
      case 'Medium': return 'bg-yellow-100 text-yellow-800';
      case 'High': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const handleCompleteVisit = (visitId: string) => {
    setVisits(prev => prev.map(visit =>
      visit.id === visitId
        ? {
            ...visit,
            status: 'Completed' as const,
            completedDate: new Date().toISOString().split('T')[0],
            completedBy: visit.socialWorkerName
          }
        : visit
    ));

    toast({
      title: "Visit Completed",
      description: "Visit has been marked as completed",
    });
  };

  const handleRescheduleVisit = (visitId: string, newDate: string, newTime: string) => {
    setVisits(prev => prev.map(visit =>
      visit.id === visitId
        ? { ...visit, scheduledDate: newDate, scheduledTime: newTime }
        : visit
    ));

    toast({
      title: "Visit Rescheduled",
      description: "Visit has been rescheduled successfully",
    });
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Monthly Visits Management</h1>
          <p className="text-muted-foreground">Schedule and track social worker visits to RCFE members</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export Schedule
          </Button>
          <Button onClick={() => setShowScheduleModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Schedule Visit
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-600" />
              <div>
                <p className="text-sm text-muted-foreground">Total Visits</p>
                <p className="text-2xl font-bold">{visitStats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-orange-600" />
              <div>
                <p className="text-sm text-muted-foreground">Scheduled</p>
                <p className="text-2xl font-bold">{visitStats.scheduled}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <div>
                <p className="text-sm text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold">{visitStats.completed}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <div>
                <p className="text-sm text-muted-foreground">Overdue</p>
                <p className="text-2xl font-bold">{visitStats.overdue}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-purple-600" />
              <div>
                <p className="text-sm text-muted-foreground">This Month</p>
                <p className="text-2xl font-bold">{visitStats.thisMonth}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search visits..."
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
                <SelectItem value="Scheduled">Scheduled</SelectItem>
                <SelectItem value="Completed">Completed</SelectItem>
                <SelectItem value="Overdue">Overdue</SelectItem>
                <SelectItem value="Cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>

            <Input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            />

            <Button variant="outline" onClick={() => {
              setSearchTerm('');
              setSelectedCounty('all');
              setSelectedStatus('all');
              setSelectedMonth(new Date().toISOString().slice(0, 7));
            }}>
              Clear Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="calendar">Visit Calendar</TabsTrigger>
          <TabsTrigger value="overdue">Overdue Visits</TabsTrigger>
          <TabsTrigger value="reports">Visit Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            {filteredVisits.map((visit) => (
              <Card key={visit.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold">{visit.memberName}</h3>
                        <Badge className={getStatusColor(visit.status)}>
                          {visit.status}
                        </Badge>
                        <Badge className={getCareLevelColor(visit.careLevel)}>
                          {visit.careLevel} Care
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm text-gray-600">
                        <div>
                          <p className="font-medium">Social Worker</p>
                          <p>{visit.socialWorkerName}</p>
                        </div>
                        <div>
                          <p className="font-medium">RCFE Facility</p>
                          <p>{visit.rcfeName}</p>
                          <p className="text-xs">{visit.rcfeAddress}</p>
                        </div>
                        <div>
                          <p className="font-medium">Scheduled</p>
                          <p>{visit.scheduledDate} at {visit.scheduledTime}</p>
                          <p className="text-xs">{visit.duration} minutes</p>
                        </div>
                        <div>
                          <p className="font-medium">Visit Type</p>
                          <p>{visit.visitType}</p>
                        </div>
                      </div>

                      {visit.notes && (
                        <div className="mt-2">
                          <p className="font-medium text-sm">Notes</p>
                          <p className="text-sm text-gray-600">{visit.notes}</p>
                        </div>
                      )}

                      {visit.status === 'Completed' && visit.completedDate && (
                        <div className="mt-2 p-2 bg-green-50 rounded">
                          <p className="text-sm text-green-800">
                            Completed on {visit.completedDate} by {visit.completedBy}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      {visit.status === 'Scheduled' && (
                        <>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleCompleteVisit(visit.id)}
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="sm">
                            <Edit className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      {visit.status === 'Completed' && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            setSelectedVisit(visit);
                            setShowReportModal(true);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      )}
                      {visit.status === 'Overdue' && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          className="text-red-600 border-red-600"
                        >
                          <Calendar className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {filteredVisits.length === 0 && (
              <Card>
                <CardContent className="p-8 text-center">
                  <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-gray-600">No visits match your current filters</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="overdue" className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            {visits.filter(v => v.status === 'Overdue').map((visit) => (
              <Card key={visit.id} className="border-red-200">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="h-5 w-5 text-red-600" />
                        <h3 className="font-semibold text-red-800">{visit.memberName}</h3>
                        <Badge className="bg-red-100 text-red-800">
                          Overdue since {visit.scheduledDate}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
                        <div>
                          <p className="font-medium">Social Worker</p>
                          <p>{visit.socialWorkerName}</p>
                        </div>
                        <div>
                          <p className="font-medium">RCFE Facility</p>
                          <p>{visit.rcfeName}</p>
                        </div>
                        <div>
                          <p className="font-medium">Original Schedule</p>
                          <p>{visit.scheduledDate} at {visit.scheduledTime}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleCompleteVisit(visit.id)}
                      >
                        Mark Complete
                      </Button>
                      <Button size="sm">
                        Reschedule
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <Card>
            <CardContent className="p-8 text-center">
              <Upload className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p className="text-gray-600">Visit reports feature coming soon</p>
              <p className="text-sm text-gray-500 mt-2">
                This will allow social workers to submit detailed visit reports
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}