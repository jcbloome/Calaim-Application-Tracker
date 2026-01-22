'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  FileBarChart,
  Calendar,
  MapPin,
  User,
  Building,
  AlertTriangle,
  CheckCircle,
  Clock,
  Download,
  Filter,
  Search,
  Eye,
  Flag,
  Users,
  BarChart3,
  TrendingUp
} from 'lucide-react';

interface VisitRecord {
  id: string;
  visitId: string;
  socialWorkerName: string;
  memberName: string;
  rcfeName: string;
  rcfeAddress: string;
  visitDate: string;
  completedAt: string;
  totalScore: number;
  flagged: boolean;
  flagReasons: string[];
  signedOff: boolean;
  rcfeStaffName?: string;
  geolocationVerified: boolean;
  status: 'completed' | 'pending_signoff' | 'signed_off' | 'flagged';
}

interface SignOffRecord {
  id: string;
  rcfeName: string;
  socialWorkerName: string;
  visitDate: string;
  completedVisits: number;
  rcfeStaffName: string;
  rcfeStaffTitle: string;
  signedAt: string;
  geolocationVerified: boolean;
  flaggedVisits: number;
}

export default function SWVisitTrackingPage(): React.JSX.Element {
  const [visitRecords, setVisitRecords] = useState<VisitRecord[]>([]);
  const [signOffRecords, setSignOffRecords] = useState<SignOffRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'visits' | 'signoffs' | 'analytics'>('visits');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');

  useEffect(() => {
    loadTrackingData();
  }, []);

  const loadTrackingData = async () => {
    setLoading(true);
    try {
      // Simulate loading data - in production this would come from Firestore
      // For now, we'll create mock data to demonstrate the system
      
      const mockVisits: VisitRecord[] = [
        {
          id: '1',
          visitId: 'visit-1737584123456',
          socialWorkerName: 'Billy Buckhalter',
          memberName: 'Mike Kirby',
          rcfeName: 'Highland Manor Assisted Living',
          rcfeAddress: '123 Highland Ave, Los Angeles, CA',
          visitDate: '2025-01-22',
          completedAt: '2025-01-22T14:30:15Z',
          totalScore: 58,
          flagged: false,
          flagReasons: [],
          signedOff: true,
          rcfeStaffName: 'Jennifer Martinez',
          geolocationVerified: true,
          status: 'signed_off'
        },
        {
          id: '2',
          visitId: 'visit-1737584234567',
          socialWorkerName: 'Billy Buckhalter',
          memberName: 'Sarah Johnson',
          rcfeName: 'Highland Manor Assisted Living',
          rcfeAddress: '123 Highland Ave, Los Angeles, CA',
          visitDate: '2025-01-22',
          completedAt: '2025-01-22T15:15:30Z',
          totalScore: 35,
          flagged: true,
          flagReasons: ['Low care satisfaction', 'Member has urgent concerns'],
          signedOff: false,
          geolocationVerified: true,
          status: 'flagged'
        },
        {
          id: '3',
          visitId: 'visit-1737584345678',
          socialWorkerName: 'Billy Buckhalter',
          memberName: 'Robert Chen',
          rcfeName: 'Savant of Santa Monica',
          rcfeAddress: '456 Ocean Blvd, Santa Monica, CA',
          visitDate: '2025-01-22',
          completedAt: '2025-01-22T16:45:00Z',
          totalScore: 62,
          flagged: false,
          flagReasons: [],
          signedOff: false,
          geolocationVerified: true,
          status: 'pending_signoff'
        }
      ];

      const mockSignOffs: SignOffRecord[] = [
        {
          id: 'signoff-1',
          rcfeName: 'Highland Manor Assisted Living',
          socialWorkerName: 'Billy Buckhalter',
          visitDate: '2025-01-22',
          completedVisits: 2,
          rcfeStaffName: 'Jennifer Martinez',
          rcfeStaffTitle: 'Administrator',
          signedAt: '2025-01-22T15:30:00Z',
          geolocationVerified: true,
          flaggedVisits: 1
        }
      ];

      setVisitRecords(mockVisits);
      setSignOffRecords(mockSignOffs);
    } catch (error) {
      console.error('Error loading tracking data:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredVisits = visitRecords.filter(visit => {
    const matchesSearch = 
      visit.socialWorkerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      visit.memberName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      visit.rcfeName.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || visit.status === statusFilter;
    
    const matchesDate = dateFilter === 'all' || 
      (dateFilter === 'today' && visit.visitDate === new Date().toISOString().split('T')[0]) ||
      (dateFilter === 'week' && new Date(visit.visitDate) >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
    
    return matchesSearch && matchesStatus && matchesDate;
  });

  const getStatusBadge = (status: string, flagged: boolean) => {
    if (flagged) {
      return <Badge variant="destructive" className="gap-1"><Flag className="h-3 w-3" />Flagged</Badge>;
    }
    
    switch (status) {
      case 'signed_off':
        return <Badge variant="default" className="gap-1 bg-green-600"><CheckCircle className="h-3 w-3" />Signed Off</Badge>;
      case 'pending_signoff':
        return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Pending Sign-Off</Badge>;
      case 'completed':
        return <Badge variant="outline" className="gap-1"><CheckCircle className="h-3 w-3" />Completed</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const getScoreBadge = (score: number) => {
    if (score >= 60) return <Badge className="bg-green-600">Excellent ({score})</Badge>;
    if (score >= 50) return <Badge className="bg-blue-600">Good ({score})</Badge>;
    if (score >= 40) return <Badge className="bg-yellow-600">Fair ({score})</Badge>;
    return <Badge variant="destructive">Needs Attention ({score})</Badge>;
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center py-12">
          <div className="text-center space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-muted-foreground">Loading visit tracking data...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <FileBarChart className="h-8 w-8 text-blue-600" />
            SW Visit Tracking System
          </h1>
          <p className="text-muted-foreground mt-2">
            Comprehensive tracking and monitoring of social worker visits and sign-offs
          </p>
        </div>
        <Button className="gap-2">
          <Download className="h-4 w-4" />
          Export Report
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-8 w-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold">{visitRecords.length}</p>
                <p className="text-sm text-muted-foreground">Total Visits</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Flag className="h-8 w-8 text-red-600" />
              <div>
                <p className="text-2xl font-bold">{visitRecords.filter(v => v.flagged).length}</p>
                <p className="text-sm text-muted-foreground">Flagged Visits</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Clock className="h-8 w-8 text-yellow-600" />
              <div>
                <p className="text-2xl font-bold">{visitRecords.filter(v => v.status === 'pending_signoff').length}</p>
                <p className="text-sm text-muted-foreground">Pending Sign-Off</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Users className="h-8 w-8 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">{signOffRecords.length}</p>
                <p className="text-sm text-muted-foreground">Sign-Off Records</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tab Navigation */}
      <div className="flex space-x-1 bg-muted p-1 rounded-lg w-fit">
        <Button
          variant={activeTab === 'visits' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('visits')}
        >
          Visit Records
        </Button>
        <Button
          variant={activeTab === 'signoffs' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('signoffs')}
        >
          Sign-Off Records
        </Button>
        <Button
          variant={activeTab === 'analytics' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('analytics')}
        >
          Analytics
        </Button>
      </div>

      {/* Filters (for visits tab) */}
      {activeTab === 'visits' && (
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-4 items-center">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search visits..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-64"
                />
              </div>
              
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="signed_off">Signed Off</SelectItem>
                  <SelectItem value="pending_signoff">Pending Sign-Off</SelectItem>
                  <SelectItem value="flagged">Flagged</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by date" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Dates</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Content based on active tab */}
      {activeTab === 'visits' && (
        <Card>
          <CardHeader>
            <CardTitle>Visit Records ({filteredVisits.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredVisits.map((visit) => (
                <div key={visit.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold">{visit.memberName}</h3>
                        {getStatusBadge(visit.status, visit.flagged)}
                        {getScoreBadge(visit.totalScore)}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <User className="h-4 w-4" />
                          {visit.socialWorkerName}
                        </span>
                        <span className="flex items-center gap-1">
                          <Building className="h-4 w-4" />
                          {visit.rcfeName}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {new Date(visit.visitDate).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <Button variant="outline" size="sm">
                      <Eye className="h-4 w-4 mr-2" />
                      View Details
                    </Button>
                  </div>
                  
                  {visit.flagged && (
                    <div className="bg-red-50 border border-red-200 rounded p-3">
                      <div className="flex items-center gap-2 text-red-800 font-medium mb-2">
                        <AlertTriangle className="h-4 w-4" />
                        Flagged for Review
                      </div>
                      <ul className="text-sm text-red-700 space-y-1">
                        {visit.flagReasons.map((reason, index) => (
                          <li key={index}>• {reason}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      Completed: {new Date(visit.completedAt).toLocaleString()}
                    </span>
                    <div className="flex items-center gap-4">
                      {visit.geolocationVerified && (
                        <span className="flex items-center gap-1 text-green-600">
                          <MapPin className="h-4 w-4" />
                          Location Verified
                        </span>
                      )}
                      {visit.signedOff && (
                        <span className="flex items-center gap-1 text-blue-600">
                          <CheckCircle className="h-4 w-4" />
                          Signed by {visit.rcfeStaffName}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              
              {filteredVisits.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No visits found matching your criteria.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'signoffs' && (
        <Card>
          <CardHeader>
            <CardTitle>Sign-Off Records ({signOffRecords.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {signOffRecords.map((signoff) => (
                <div key={signoff.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <h3 className="font-semibold">{signoff.rcfeName}</h3>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Social Worker:</span>
                          <span className="ml-2 font-medium">{signoff.socialWorkerName}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">RCFE Staff:</span>
                          <span className="ml-2 font-medium">{signoff.rcfeStaffName} ({signoff.rcfeStaffTitle})</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Visits Signed:</span>
                          <span className="ml-2 font-medium">{signoff.completedVisits}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Flagged Visits:</span>
                          <span className="ml-2 font-medium text-red-600">{signoff.flaggedVisits}</span>
                        </div>
                      </div>
                    </div>
                    <Button variant="outline" size="sm">
                      <Eye className="h-4 w-4 mr-2" />
                      View Sign-Off
                    </Button>
                  </div>
                  
                  <div className="flex items-center justify-between text-sm border-t pt-3">
                    <span className="text-muted-foreground">
                      Signed: {new Date(signoff.signedAt).toLocaleString()}
                    </span>
                    {signoff.geolocationVerified && (
                      <span className="flex items-center gap-1 text-green-600">
                        <MapPin className="h-4 w-4" />
                        Location Verified
                      </span>
                    )}
                  </div>
                </div>
              ))}
              
              {signOffRecords.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No sign-off records found.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'analytics' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Visit Quality Scores
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span>Excellent (60+)</span>
                  <Badge className="bg-green-600">{visitRecords.filter(v => v.totalScore >= 60).length}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span>Good (50-59)</span>
                  <Badge className="bg-blue-600">{visitRecords.filter(v => v.totalScore >= 50 && v.totalScore < 60).length}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span>Fair (40-49)</span>
                  <Badge className="bg-yellow-600">{visitRecords.filter(v => v.totalScore >= 40 && v.totalScore < 50).length}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span>Needs Attention (&lt;40)</span>
                  <Badge variant="destructive">{visitRecords.filter(v => v.totalScore < 40).length}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Compliance Metrics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span>Geolocation Verified</span>
                  <Badge className="bg-green-600">
                    {Math.round((visitRecords.filter(v => v.geolocationVerified).length / visitRecords.length) * 100)}%
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span>Signed Off</span>
                  <Badge className="bg-blue-600">
                    {Math.round((visitRecords.filter(v => v.signedOff).length / visitRecords.length) * 100)}%
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span>Flagged for Review</span>
                  <Badge variant="destructive">
                    {Math.round((visitRecords.filter(v => v.flagged).length / visitRecords.length) * 100)}%
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}