'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
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
  TrendingUp,
  LogIn,
  Monitor,
  Smartphone,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { useAuth } from '@/firebase';

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
  rcfeStaffTitle?: string;
  signOffDate?: string;
  geolocationVerified: boolean;
  geolocationLabel?: string;
  geolocationAddress?: string;
  geolocationLat?: number;
  geolocationLng?: number;
  questionnaireAnswers: Array<{ question: string; answer: string }>;
  status: 'completed' | 'pending_signoff' | 'signed_off' | 'flagged';
  claimSubmitted: boolean;
  claimMonth?: string;
  claimPaid?: boolean;
  claimSubmittedAt?: string;
  claimPaidAt?: string;
  visitLocationDetails?: string;
  starRatings?: {
    care: number;
    safety: number;
    communication: number;
    overall: number;
  };
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
  memberNames?: string[];
  visitIds?: string[];
}

interface LoginEvent {
  id: string;
  socialWorkerId: string;
  socialWorkerName: string;
  loginTime: string;
  userAgent: string;
  ipAddress: string;
  sessionId: string;
  portalSection: 'login' | 'portal-home' | 'visit-verification' | 'assignments';
}

export default function SWVisitTrackingPage(): React.JSX.Element {
  const auth = useAuth();
  const [visitRecords, setVisitRecords] = useState<VisitRecord[]>([]);
  const [signOffRecords, setSignOffRecords] = useState<SignOffRecord[]>([]);
  const [loginEvents, setLoginEvents] = useState<LoginEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'visits' | 'signoffs' | 'analytics' | 'logins'>('visits');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [expandedVisitId, setExpandedVisitId] = useState<string | null>(null);
  const [expandedSignoffId, setExpandedSignoffId] = useState<string | null>(null);
  const [claimDatesByVisit, setClaimDatesByVisit] = useState<Record<string, { submittedAt?: string; paidAt?: string }>>({});
  const [geoResolvedByVisit, setGeoResolvedByVisit] = useState<Record<string, { address?: string; status: 'idle' | 'loading' | 'error' }>>({});

  const [selectedVisitIds, setSelectedVisitIds] = useState<string[]>([]);
  const [overrideStaffName, setOverrideStaffName] = useState('');
  const [overrideStaffTitle, setOverrideStaffTitle] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [isOverriding, setIsOverriding] = useState(false);

  const selectedVisits = useMemo(() => {
    const set = new Set(selectedVisitIds);
    return visitRecords.filter((v) => set.has(v.visitId));
  }, [selectedVisitIds, visitRecords]);

  const selectedRcfes = useMemo(() => Array.from(new Set(selectedVisits.map((v) => v.rcfeName).filter(Boolean))), [selectedVisits]);

  useEffect(() => {
    loadTrackingData();
  }, [dateFilter]);

  const loadTrackingData = async () => {
    setLoading(true);
    try {
      // Fetch real login events
      const loginResponse = await fetch(
        `/api/sw-visits/login-tracking?days=${dateFilter === 'all' ? '30' : dateFilter}`
      );
      if (loginResponse.ok) {
        const loginData = await loginResponse.json();
        setLoginEvents(loginData.events || []);
      }

      // Load real visit records (Firestore-backed)
      const days = dateFilter === 'all' ? '30' : dateFilter;
      const visitsResponse = await fetch(`/api/sw-visits/records?days=${encodeURIComponent(days)}`);
      if (visitsResponse.ok) {
        const visitsData = await visitsResponse.json().catch(() => ({}));
        const visitsRaw = Array.isArray((visitsData as any)?.visits) ? (visitsData as any).visits : [];
        const toYyyyMmDd = (value: any): string => {
          if (!value) return '';
          if (typeof value === 'string') return value.slice(0, 10);
          if (typeof value === 'number') return new Date(value).toISOString().slice(0, 10);
          if (typeof value?.toDate === 'function') return value.toDate().toISOString().slice(0, 10);
          return '';
        };
        const normalized = visitsRaw.map((v: any) => ({
          ...v,
          id: String(v?.id || v?.visitId || ''),
          visitId: String(v?.visitId || v?.id || ''),
          socialWorkerName: String(v?.socialWorkerName || v?.socialWorkerId || ''),
          memberName: String(v?.memberName || ''),
          rcfeName: String(v?.rcfeName || ''),
          rcfeAddress: String(v?.rcfeAddress || ''),
          visitDate: String(v?.visitDate || ''),
          completedAt: String(v?.completedAt || v?.submittedAt || ''),
          totalScore: Number(v?.totalScore || 0),
          flagged: Boolean(v?.flagged),
          flagReasons: Array.isArray(v?.flagReasons) ? v.flagReasons : [],
          signedOff: Boolean(v?.signedOff),
          geolocationVerified: Boolean(v?.geolocationVerified),
          questionnaireAnswers: Array.isArray(v?.questionnaireAnswers) ? v.questionnaireAnswers : [],
          status: (v?.status as VisitRecord['status']) || (v?.signedOff ? 'signed_off' : v?.flagged ? 'flagged' : 'pending_signoff'),
          claimSubmitted: Boolean(v?.claimSubmitted),
          claimMonth: String(v?.claimMonth || ''),
          claimPaid: Boolean(v?.claimPaid),
          claimSubmittedAt: toYyyyMmDd(v?.claimSubmittedAt) || toYyyyMmDd(v?.submittedAt),
          claimPaidAt: toYyyyMmDd(v?.claimPaidAt),
        })) as VisitRecord[];
        setVisitRecords(normalized);
      } else {
        setVisitRecords([]);
      }

      // Load sign-off records (Firestore-backed)
      const signoffsResponse = await fetch(`/api/sw-visits/signoffs?days=${encodeURIComponent(days)}`);
      if (signoffsResponse.ok) {
        const signoffsData = await signoffsResponse.json().catch(() => ({}));
        const raw = Array.isArray((signoffsData as any)?.signoffs) ? (signoffsData as any).signoffs : [];
        const normalized = raw.map((s: any) => {
          const claimDay = String(s?.claimDay || '').slice(0, 10) || '';
          const completedVisitsArr = Array.isArray(s?.completedVisits) ? s.completedVisits : [];
          const flaggedVisits = completedVisitsArr.filter((v: any) => Boolean(v?.flagged)).length;
          const memberNames = Array.from(
            new Set(
              completedVisitsArr
                .map((v: any) => String(v?.memberName || '').trim())
                .filter(Boolean)
            )
          );
          const staffName = String(s?.rcfeStaff?.name || s?.rcfeStaffName || '').trim();
          const staffTitle = String(s?.rcfeStaff?.title || s?.rcfeStaffTitle || '').trim();
          const signedAt = String(s?.rcfeStaff?.signedAt || s?.signedAt || s?.submittedAt || '').trim();
          const geoVerified = Boolean(s?.rcfeStaff?.locationVerified || s?.geolocationVerified);
          const visitIds = Array.isArray(s?.visitIds) ? s.visitIds.map((v: any) => String(v || '').trim()).filter(Boolean) : [];
          return {
            id: String(s?.id || ''),
            rcfeName: String(s?.rcfeName || ''),
            socialWorkerName: String(s?.socialWorkerName || s?.socialWorkerId || s?.socialWorkerEmail || ''),
            visitDate: claimDay,
            completedVisits: Array.isArray(s?.visitIds) ? s.visitIds.length : completedVisitsArr.length,
            rcfeStaffName: staffName,
            rcfeStaffTitle: staffTitle,
            signedAt,
            geolocationVerified: geoVerified,
            flaggedVisits,
            memberNames,
            visitIds,
          } as SignOffRecord;
        }) as SignOffRecord[];
        setSignOffRecords(normalized);
      } else {
        setSignOffRecords([]);
      }
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

  const filteredSignoffs = signOffRecords.filter((s) => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    const members = Array.isArray(s.memberNames) ? s.memberNames.join(' ') : '';
    return (
      String(s.rcfeName || '').toLowerCase().includes(q) ||
      String(s.socialWorkerName || '').toLowerCase().includes(q) ||
      String(s.rcfeStaffName || '').toLowerCase().includes(q) ||
      String(members).toLowerCase().includes(q)
    );
  });

  const toggleSelectedVisit = (visitId: string, checked: boolean) => {
    setSelectedVisitIds((prev) => {
      const set = new Set(prev);
      if (checked) set.add(visitId);
      else set.delete(visitId);
      return Array.from(set);
    });
  };

  const clearSelectedVisits = () => setSelectedVisitIds([]);

  const submitAdminOverride = async () => {
    if (selectedVisitIds.length === 0) return;
    if (!auth?.currentUser) {
      alert('Not signed in');
      return;
    }
    if (selectedRcfes.length > 1) {
      alert('Please select visits from only one RCFE at a time.');
      return;
    }
    setIsOverriding(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/sw-visits/override-signoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          visitIds: selectedVisitIds,
          rcfeStaffName: overrideStaffName,
          rcfeStaffTitle: overrideStaffTitle,
          reason: overrideReason,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Override failed (${res.status})`);
      }

      clearSelectedVisits();
      setOverrideReason('');
      // Refresh list
      await loadTrackingData();
      alert('Override sign-off saved.');
    } catch (e: any) {
      console.error(e);
      alert(e?.message || 'Failed to override sign-off.');
    } finally {
      setIsOverriding(false);
    }
  };


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

  const getResolvedGeoAddress = (visit: VisitRecord) => {
    return geoResolvedByVisit[visit.id]?.address || visit.geolocationAddress || '';
  };

  const getGeoMatchStatus = (visit: VisitRecord) => {
    const resolved = getResolvedGeoAddress(visit);
    if (!resolved) return 'Unknown';
    const rcfe = visit.rcfeAddress.toLowerCase();
    const geo = resolved.toLowerCase();
    if (rcfe && geo && (geo.includes(rcfe) || rcfe.includes(geo))) return 'Match';
    return 'Mismatch';
  };

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return;
    const visitsToResolve = visitRecords.filter((visit) =>
      typeof visit.geolocationLat === 'number'
      && typeof visit.geolocationLng === 'number'
      && !visit.geolocationAddress
      && !geoResolvedByVisit[visit.id]
    );

    if (visitsToResolve.length === 0) return;

    visitsToResolve.forEach(async (visit) => {
      setGeoResolvedByVisit((prev) => ({
        ...prev,
        [visit.id]: { status: 'loading' }
      }));
      try {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${visit.geolocationLat},${visit.geolocationLng}&key=${apiKey}`;
        const response = await fetch(url);
        const data = await response.json();
        const address = data?.results?.[0]?.formatted_address || '';
        setGeoResolvedByVisit((prev) => ({
          ...prev,
          [visit.id]: { status: 'idle', address }
        }));
      } catch {
        setGeoResolvedByVisit((prev) => ({
          ...prev,
          [visit.id]: { status: 'error' }
        }));
      }
    });
  }, [visitRecords, geoResolvedByVisit]);


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
        <div className="flex items-center gap-2">
          <Button className="gap-2">
            <Download className="h-4 w-4" />
            Export Report
          </Button>
        </div>
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
        <Button
          variant={activeTab === 'logins' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('logins')}
        >
          <LogIn className="h-4 w-4 mr-1" />
          Login Tracking
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
              {selectedVisitIds.length > 0 && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-blue-900">Admin override sign-off</div>
                      <div className="mt-0.5 text-xs text-blue-800/80">
                        Selected visits: {selectedVisitIds.length}
                        {selectedRcfes.length === 1 ? ` • RCFE: ${selectedRcfes[0]}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={clearSelectedVisits} disabled={isOverriding}>
                        Clear selection
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700"
                        onClick={submitAdminOverride}
                        disabled={isOverriding || selectedRcfes.length !== 1}
                      >
                        {isOverriding ? 'Saving…' : 'Mark signed off'}
                      </Button>
                    </div>
                  </div>

                  {selectedRcfes.length !== 1 ? (
                    <div className="text-sm text-blue-900">
                      Please select visits from only one RCFE at a time.
                    </div>
                  ) : null}

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div>
                      <Label>RCFE staff name (optional)</Label>
                      <Input value={overrideStaffName} onChange={(e) => setOverrideStaffName(e.target.value)} placeholder="Defaults to admin name" />
                    </div>
                    <div>
                      <Label>RCFE staff title (optional)</Label>
                      <Input value={overrideStaffTitle} onChange={(e) => setOverrideStaffTitle(e.target.value)} placeholder="Defaults to Admin" />
                    </div>
                    <div>
                      <Label>Reason (optional)</Label>
                      <Input value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="Why admin override?" />
                    </div>
                  </div>

                  <div className="text-xs text-blue-900/80">
                    This creates a sign-off record and sets the selected visit records to <span className="font-semibold">signed_off</span>.
                  </div>
                </div>
              )}

              {filteredVisits.map((visit) => (
                <div key={visit.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        {visit.signedOff ? null : visit.status === 'pending_signoff' ? (
                          <Checkbox
                            checked={selectedVisitIds.includes(visit.visitId)}
                            onCheckedChange={(next) => toggleSelectedVisit(visit.visitId, Boolean(next))}
                          />
                        ) : null}
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
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setExpandedVisitId((prev) => (prev === visit.id ? null : visit.id))
                      }
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      {expandedVisitId === visit.id ? 'Hide Details' : 'View Details'}
                      {expandedVisitId === visit.id ? (
                        <ChevronUp className="h-4 w-4 ml-2" />
                      ) : (
                        <ChevronDown className="h-4 w-4 ml-2" />
                      )}
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

                  {expandedVisitId === visit.id && (
                    <div className="space-y-4">
                      <div className="border rounded-lg p-3 bg-muted/40">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                          <div>
                            <span className="text-muted-foreground">Visit ID:</span>
                            <span className="ml-2 font-medium">{visit.visitId}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">RCFE Address:</span>
                            <span className="ml-2 font-medium">{visit.rcfeAddress}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Status:</span>
                            <span className="ml-2 font-medium">{visit.status}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Geolocation:</span>
                            <span className="ml-2 font-medium">
                              {visit.geolocationVerified ? 'Verified' : 'Not Verified'}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Sign-Off:</span>
                            <span className="ml-2 font-medium">
                              {visit.signedOff ? `Signed by ${visit.rcfeStaffName}` : 'Pending'}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Score:</span>
                            <span className="ml-2 font-medium">{visit.totalScore}</span>
                          </div>
                        </div>
                        {visit.flagReasons.length > 0 && (
                          <div className="mt-3 text-sm">
                            <p className="text-muted-foreground mb-1">Flag Reasons:</p>
                            <ul className="list-disc pl-5 space-y-1">
                              {visit.flagReasons.map((reason, index) => (
                                <li key={`${visit.id}-reason-${index}`}>{reason}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                      <div className="border rounded-lg bg-white">
                        <div className="border-b px-4 py-2 text-sm font-semibold">
                          Visit Summary (Full Report)
                        </div>
                        <div className="space-y-5 p-4 text-sm">
                          <div>
                            <div className="text-xs uppercase text-muted-foreground mb-2">Visit Details</div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div>
                                <span className="text-muted-foreground">Visited Member:</span>
                                <span className="ml-2 font-medium">{visit.memberName}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Visited Location:</span>
                                <span className="ml-2 font-medium">{visit.rcfeName}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Address:</span>
                                <span className="ml-2 font-medium">{visit.rcfeAddress}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Where in facility:</span>
                                <span className="ml-2 font-medium">{visit.visitLocationDetails || 'Not specified'}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Geolocation:</span>
                                <span className="ml-2 font-medium">
                                  {visit.geolocationVerified ? 'Verified' : 'Not Verified'}
                                  {visit.geolocationLabel ? ` • ${visit.geolocationLabel}` : ''}
                                </span>
                              </div>
                            <div>
                              <span className="text-muted-foreground">Geolocation Address:</span>
                              <span className="ml-2 font-medium">
                                {getResolvedGeoAddress(visit) || (geoResolvedByVisit[visit.id]?.status === 'loading' ? 'Resolving...' : 'Not available')}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Address Match:</span>
                              <span className="ml-2 font-medium">
                                {getGeoMatchStatus(visit)}
                              </span>
                            </div>
                              <div>
                                <span className="text-muted-foreground">Sign-Off Person:</span>
                                <span className="ml-2 font-medium">
                                  {visit.signedOff ? `${visit.rcfeStaffName || 'Staff'}${visit.rcfeStaffTitle ? ` (${visit.rcfeStaffTitle})` : ''}` : 'Pending'}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Sign-Off Date:</span>
                                <span className="ml-2 font-medium">
                                  {visit.signOffDate ? new Date(visit.signOffDate).toLocaleString() : 'Pending'}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div>
                            <div className="text-xs uppercase text-muted-foreground mb-2">Star Ratings</div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                              {[
                                { label: 'Care', value: visit.starRatings?.care },
                                { label: 'Safety', value: visit.starRatings?.safety },
                                { label: 'Communication', value: visit.starRatings?.communication },
                                { label: 'Overall', value: visit.starRatings?.overall }
                              ].map((rating) => (
                                <div key={rating.label} className="rounded border p-2">
                                  <div className="text-muted-foreground">{rating.label}</div>
                                  <div className="font-semibold">{rating.value ?? '—'} / 5</div>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div>
                            <div className="text-xs uppercase text-muted-foreground mb-2">Questionnaire Answers</div>
                            <div className="space-y-2">
                              {visit.questionnaireAnswers.map((qa, index) => (
                                <div key={`${visit.id}-qa-${index}`} className="rounded border p-2">
                                  <div className="text-muted-foreground">{qa.question}</div>
                                  <div className="font-medium">{qa.answer}</div>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div>
                            <div className="text-xs uppercase text-muted-foreground mb-2">Claims & Payment</div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div>
                                <span className="text-muted-foreground">Claim Submitted:</span>
                                <span className="ml-2 font-medium">{visit.claimSubmitted ? 'Yes' : 'No'}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Claim Status:</span>
                                <span className="ml-2 font-medium">
                                  {visit.claimSubmitted ? (visit.claimPaid ? 'Paid' : 'Unpaid') : 'N/A'}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">Claim Submitted Date:</span>
                                <Input
                                  type="date"
                                  value={claimDatesByVisit[visit.id]?.submittedAt ?? visit.claimSubmittedAt ?? ''}
                                  onChange={(event) =>
                                    setClaimDatesByVisit((prev) => ({
                                      ...prev,
                                      [visit.id]: { ...prev[visit.id], submittedAt: event.target.value }
                                    }))
                                  }
                                  className="h-8 w-40"
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">Claim Paid Date:</span>
                                <Input
                                  type="date"
                                  value={claimDatesByVisit[visit.id]?.paidAt ?? visit.claimPaidAt ?? ''}
                                  onChange={(event) =>
                                    setClaimDatesByVisit((prev) => ({
                                      ...prev,
                                      [visit.id]: { ...prev[visit.id], paidAt: event.target.value }
                                    }))
                                  }
                                  className="h-8 w-40"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
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
            <CardTitle>Sign-Off Records ({filteredSignoffs.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredSignoffs.map((signoff) => (
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
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setExpandedSignoffId((prev) => (prev === signoff.id ? null : signoff.id))
                      }
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      {expandedSignoffId === signoff.id ? 'Hide Sign-Off' : 'View Sign-Off'}
                      {expandedSignoffId === signoff.id ? (
                        <ChevronUp className="h-4 w-4 ml-2" />
                      ) : (
                        <ChevronDown className="h-4 w-4 ml-2" />
                      )}
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

                  {expandedSignoffId === signoff.id && (
                    <div className="border rounded-lg p-3 bg-muted/40 text-sm space-y-2">
                      <div>
                        <span className="text-muted-foreground">RCFE Staff Title:</span>
                        <span className="ml-2 font-medium">{signoff.rcfeStaffTitle}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Completed Visits:</span>
                        <span className="ml-2 font-medium">{signoff.completedVisits}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Flagged Visits:</span>
                        <span className="ml-2 font-medium text-red-600">{signoff.flaggedVisits}</span>
                      </div>
                      {Array.isArray(signoff.memberNames) && signoff.memberNames.length > 0 ? (
                        <div>
                          <span className="text-muted-foreground">Members:</span>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {signoff.memberNames.slice(0, 12).map((m) => (
                              <Badge key={m} variant="secondary" className="font-normal">
                                {m}
                              </Badge>
                            ))}
                            {signoff.memberNames.length > 12 ? (
                              <Badge variant="secondary" className="font-normal">
                                +{signoff.memberNames.length - 12} more
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              ))}
              
              {filteredSignoffs.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No sign-off records found matching your criteria.
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

      {/* Login Tracking Tab */}
      {activeTab === 'logins' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Total Logins</p>
                    <p className="text-2xl font-bold">{loginEvents.length}</p>
                  </div>
                  <LogIn className="h-8 w-8 text-blue-600" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Unique Users</p>
                    <p className="text-2xl font-bold">
                      {[...new Set(loginEvents.map(e => e.socialWorkerId))].length}
                    </p>
                  </div>
                  <Users className="h-8 w-8 text-green-600" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Portal Access</p>
                    <p className="text-2xl font-bold">
                      {loginEvents.filter(e => e.portalSection === 'portal-home').length}
                    </p>
                  </div>
                  <Monitor className="h-8 w-8 text-purple-600" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Visit Tool Access</p>
                    <p className="text-2xl font-bold">
                      {loginEvents.filter(e => e.portalSection === 'visit-verification').length}
                    </p>
                  </div>
                  <Activity className="h-8 w-8 text-orange-600" />
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LogIn className="h-5 w-5" />
                Recent Portal Access ({loginEvents.length} events)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {loginEvents.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <LogIn className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No login events recorded yet</p>
                    <p className="text-sm">Login tracking will appear here as social workers access the portal</p>
                  </div>
                ) : (
                  loginEvents.slice(0, 20).map((event) => (
                    <div key={event.sessionId} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center space-x-4">
                        <div className="bg-blue-100 rounded-full p-2">
                          {event.portalSection === 'login' && <LogIn className="h-4 w-4 text-blue-600" />}
                          {event.portalSection === 'portal-home' && <Monitor className="h-4 w-4 text-blue-600" />}
                          {event.portalSection === 'visit-verification' && <Activity className="h-4 w-4 text-blue-600" />}
                          {event.portalSection === 'assignments' && <Users className="h-4 w-4 text-blue-600" />}
                        </div>
                        <div>
                          <p className="font-medium">{event.socialWorkerName}</p>
                          <p className="text-sm text-muted-foreground">
                            Accessed: {event.portalSection.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">
                          {new Date(event.loginTime).toLocaleDateString()}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(event.loginTime).toLocaleTimeString()}
                        </p>
                        <div className="flex items-center gap-1 mt-1">
                          <MapPin className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            {event.ipAddress}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {loginEvents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Access Patterns</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-medium mb-3">Most Active Social Workers</h4>
                    <div className="space-y-2">
                      {Object.entries(
                        loginEvents.reduce((acc, event) => {
                          acc[event.socialWorkerName] = (acc[event.socialWorkerName] || 0) + 1;
                          return acc;
                        }, {} as Record<string, number>)
                      )
                      .sort(([,a], [,b]) => b - a)
                      .slice(0, 5)
                      .map(([name, count]) => (
                        <div key={name} className="flex justify-between items-center">
                          <span className="text-sm">{name}</span>
                          <Badge variant="secondary">{count} logins</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-medium mb-3">Portal Section Usage</h4>
                    <div className="space-y-2">
                      {Object.entries(
                        loginEvents.reduce((acc, event) => {
                          const section = event.portalSection.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase());
                          acc[section] = (acc[section] || 0) + 1;
                          return acc;
                        }, {} as Record<string, number>)
                      )
                      .sort(([,a], [,b]) => b - a)
                      .map(([section, count]) => (
                        <div key={section} className="flex justify-between items-center">
                          <span className="text-sm">{section}</span>
                          <Badge variant="outline">{count} accesses</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}