'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  Search,
  Eye,
  Flag,
  Users,
  BarChart3,
  TrendingUp,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { useAuth } from '@/firebase';

interface VisitRecord {
  id: string;
  visitId: string;
  socialWorkerName: string;
  memberName: string;
  memberRoomNumber?: string;
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

export default function SWVisitTrackingPage(): React.JSX.Element {
  const auth = useAuth();
  const [visitRecords, setVisitRecords] = useState<VisitRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'visits' | 'analytics'>('visits');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [expandedVisitId, setExpandedVisitId] = useState<string | null>(null);
  const [claimDatesByVisit, setClaimDatesByVisit] = useState<Record<string, { submittedAt?: string; paidAt?: string }>>({});
  const [geoResolvedByVisit, setGeoResolvedByVisit] = useState<Record<string, { address?: string; status: 'idle' | 'loading' | 'error' }>>({});
  const [deletingVisitId, setDeletingVisitId] = useState<string | null>(null);
  const [deleteReasonByVisitId, setDeleteReasonByVisitId] = useState<Record<string, string>>({});
  const [showRawByVisitId, setShowRawByVisitId] = useState<Record<string, boolean>>({});
  const [analyticsMonth, setAnalyticsMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [swMonthlySummary, setSwMonthlySummary] = useState<null | {
    month: string;
    rows: Array<{
      key: string;
      socialWorkerName: string;
      assignedTotal: number;
      assignedActive: number;
      onHold: number;
      completed: number;
      outstanding: number;
      claimsCount?: number;
      claimsTotalAmount?: number;
    }>;
  }>(null);
  const [loadingSwSummary, setLoadingSwSummary] = useState(false);
  const [swSummaryError, setSwSummaryError] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailTitle, setDetailTitle] = useState<string>('');
  const [detailMembers, setDetailMembers] = useState<Array<{ memberId: string; memberName: string; rcfeName?: string; rcfeAddress?: string }>>([]);

  useEffect(() => {
    loadTrackingData();
  }, [dateFilter]);

  useEffect(() => {
    const load = async () => {
      if (activeTab !== 'analytics') return;
      if (!auth?.currentUser) return;
      if (!/^\d{4}-\d{2}$/.test(String(analyticsMonth || ''))) return;
      setLoadingSwSummary(true);
      setSwSummaryError(null);
      try {
        const idToken = await auth.currentUser.getIdToken();
        const res = await fetch(`/api/admin/sw-visits/sw-monthly-summary?month=${encodeURIComponent(analyticsMonth)}`, {
          headers: { authorization: `Bearer ${idToken}` },
        });
        const data = await res.json().catch(() => ({} as any));
        if (!res.ok || !data?.success) throw new Error(data?.error || `Failed (${res.status})`);
        setSwMonthlySummary({ month: String(data.month || analyticsMonth), rows: Array.isArray(data.rows) ? data.rows : [] });
      } catch (e: any) {
        setSwMonthlySummary(null);
        setSwSummaryError(e?.message || 'Failed to load summary');
      } finally {
        setLoadingSwSummary(false);
      }
    };
    void load();
  }, [activeTab, analyticsMonth, auth]);

  const monthOptions = (() => {
    const months: string[] = [];
    const d = new Date();
    d.setDate(1);
    for (let i = 0; i < 18; i += 1) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      months.push(`${y}-${m}`);
      d.setMonth(d.getMonth() - 1);
    }
    return months;
  })();

  const formatMoney = (value: number) => {
    const n = Number(value || 0) || 0;
    return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
  };

  const openSwDetail = async (params: { swKey: string; swName: string; kind: 'assigned' | 'completed' | 'outstanding' }) => {
    if (!auth?.currentUser) return;
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailError(null);
    setDetailMembers([]);
    setDetailTitle(
      `${params.kind === 'assigned' ? 'Assigned members' : params.kind === 'completed' ? 'Completed members' : 'Outstanding members'} • ${params.swName} • ${analyticsMonth}`
    );
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch(
        `/api/admin/sw-visits/sw-monthly-detail?month=${encodeURIComponent(analyticsMonth)}&swKey=${encodeURIComponent(params.swKey)}`,
        { headers: { authorization: `Bearer ${idToken}` } }
      );
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) throw new Error(data?.error || `Failed (${res.status})`);
      const list =
        params.kind === 'assigned'
          ? (Array.isArray(data.assignedActive) ? data.assignedActive : [])
          : params.kind === 'completed'
            ? (Array.isArray(data.completed) ? data.completed : [])
            : (Array.isArray(data.outstanding) ? data.outstanding : []);
      const normalized = list.map((m: any) => ({
        memberId: String(m?.memberId || '').trim(),
        memberName: String(m?.memberName || '').trim() || 'Unknown member',
        rcfeName: String(m?.rcfeName || '').trim() || undefined,
        rcfeAddress: String(m?.rcfeAddress || '').trim() || undefined,
      })).filter((m: any) => m.memberId || m.memberName);
      setDetailMembers(normalized);
    } catch (e: any) {
      setDetailError(e?.message || 'Failed to load members');
    } finally {
      setDetailLoading(false);
    }
  };

  const loadTrackingData = async () => {
    setLoading(true);
    try {
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
          memberRoomNumber: String(v?.memberRoomNumber || v?.raw?.memberRoomNumber || '').trim() || undefined,
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

  const deleteVisit = async (visit: VisitRecord) => {
    if (!auth?.currentUser) return;
    const reason = String(deleteReasonByVisitId[visit.visitId] || '').trim();
    if (!reason) {
      alert('Delete reason is required.');
      return;
    }
    const ok = typeof window !== 'undefined'
      ? window.confirm(`Delete this questionnaire visit record?\n\nMember: ${visit.memberName}\nSW: ${visit.socialWorkerName}\nDate: ${visit.visitDate}\n\nThis cannot be undone.`)
      : false;
    if (!ok) return;

    setDeletingVisitId(visit.visitId);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/sw-visits/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ visitId: visit.visitId, reason }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) throw new Error(data?.error || `Failed (${res.status})`);
      setDeleteReasonByVisitId((prev) => ({ ...prev, [visit.visitId]: '' }));
      await loadTrackingData();
    } catch (e: any) {
      alert(e?.message || 'Failed to delete visit.');
    } finally {
      setDeletingVisitId(null);
    }
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                        <Badge variant="secondary" className="font-normal">
                          SW: {visit.socialWorkerName}
                        </Badge>
                        {getStatusBadge(visit.status, visit.flagged)}
                        {getScoreBadge(visit.totalScore)}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
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

                  {(() => {
                    const answers = Array.isArray(visit.questionnaireAnswers) ? visit.questionnaireAnswers : [];
                    const summary = answers.slice(0, 10);
                    const ratings = visit.starRatings || {};
                    const hasAnyRating =
                      typeof ratings.care === 'number' ||
                      typeof ratings.safety === 'number' ||
                      typeof ratings.communication === 'number' ||
                      typeof ratings.overall === 'number';

                    return (
                      <div className="rounded-lg border bg-muted/20 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs font-semibold text-muted-foreground uppercase">Questionnaire summary</div>
                          <Badge variant="outline">{summary.length} / {answers.length}</Badge>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                          {[
                            { label: 'Care', value: (ratings as any).care },
                            { label: 'Safety', value: (ratings as any).safety },
                            { label: 'Communication', value: (ratings as any).communication },
                            { label: 'Overall', value: (ratings as any).overall },
                          ].map((r) => (
                            <div key={r.label} className="rounded border bg-white px-2 py-1.5 text-sm">
                              <div className="text-muted-foreground">{r.label}</div>
                              <div className="font-semibold">{typeof r.value === 'number' ? `${r.value} / 5` : '—'}</div>
                            </div>
                          ))}
                        </div>
                        {!hasAnyRating ? (
                          <div className="mt-2 text-xs text-muted-foreground">Star ratings not available for this visit.</div>
                        ) : null}

                        {summary.length > 0 ? (
                          <div className="mt-3 space-y-2 text-sm">
                            {summary.map((qa, index) => (
                              <div key={`${visit.visitId}-summary-qa-${index}`} className="rounded border bg-white p-2">
                                <div className="text-muted-foreground">{qa.question}</div>
                                <div className="font-medium whitespace-pre-wrap">{qa.answer || '—'}</div>
                              </div>
                            ))}
                            {answers.length > summary.length ? (
                              <div className="text-xs text-muted-foreground">
                                +{answers.length - summary.length} more answer(s). Use “View Details” to see all.
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="mt-2 text-sm text-muted-foreground">No questionnaire answers found.</div>
                        )}
                      </div>
                    );
                  })()}
                  
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
                      {(() => {
                        const readyForClaim = Boolean(visit.signedOff) && !Boolean(visit.claimSubmitted) && !Boolean(visit.claimPaid);
                        const alreadyClaimed = Boolean(visit.claimSubmitted) || Boolean(visit.claimPaid);
                        const answers = Array.isArray(visit.questionnaireAnswers) ? visit.questionnaireAnswers : [];
                        return (
                          <div className="rounded-lg border bg-white p-4 space-y-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="space-y-2">
                                <div className="text-sm font-semibold">Processing status</div>
                                <div className="flex flex-wrap gap-2">
                                  {readyForClaim ? (
                                    <Badge className="bg-emerald-600 hover:bg-emerald-600">Ready for claim processing</Badge>
                                  ) : alreadyClaimed ? (
                                    <Badge variant="secondary">Claim already submitted/paid</Badge>
                                  ) : visit.signedOff ? (
                                    <Badge variant="secondary">Signed off (awaiting claim processing)</Badge>
                                  ) : (
                                    <Badge variant="secondary">Awaiting RCFE sign-off</Badge>
                                  )}
                                </div>
                              </div>

                              <div className="w-full sm:max-w-[360px] space-y-2">
                                <Label>Delete (requires permission)</Label>
                                <div className="flex flex-col gap-2">
                                  <Input
                                    value={deleteReasonByVisitId[visit.visitId] ?? ''}
                                    onChange={(e) =>
                                      setDeleteReasonByVisitId((prev) => ({ ...prev, [visit.visitId]: e.target.value }))
                                    }
                                    placeholder="Reason required to delete"
                                  />
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => void deleteVisit(visit)}
                                    disabled={deletingVisitId === visit.visitId}
                                  >
                                    {deletingVisitId === visit.visitId ? 'Deleting…' : 'Delete visit'}
                                  </Button>
                                </div>
                              </div>
                            </div>

                            <div className="rounded-lg border bg-muted/30 p-3">
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-sm font-semibold">Questionnaire (full)</div>
                                <Badge variant="outline">{answers.length} answer(s)</Badge>
                              </div>
                              {answers.length === 0 ? (
                                <div className="text-sm text-muted-foreground mt-2">No questionnaire answers found.</div>
                              ) : (
                                <div className="mt-3 space-y-2 text-sm">
                                  {answers.map((qa, index) => (
                                    <div key={`${visit.visitId}-qa-${index}`} className="rounded border bg-white p-2">
                                      <div className="text-muted-foreground">{qa.question}</div>
                                      <div className="font-medium whitespace-pre-wrap">{qa.answer || '—'}</div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setShowRawByVisitId((prev) => ({ ...prev, [visit.visitId]: !Boolean(prev[visit.visitId]) }))
                              }
                            >
                              {showRawByVisitId[visit.visitId] ? 'Hide raw payload' : 'Show raw payload'}
                            </Button>
                            {showRawByVisitId[visit.visitId] ? (
                              <pre className="max-h-[360px] overflow-auto rounded-md border bg-black/90 p-3 text-xs text-white">
                                {JSON.stringify((visit as any)?.raw ?? null, null, 2)}
                              </pre>
                            ) : null}
                          </div>
                        );
                      })()}

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
                          Location Verified: {visit.rcfeName}
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
      

      {activeTab === 'analytics' && (
        <div className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-sm font-semibold">Monthly social worker summary</div>
              <div className="text-xs text-muted-foreground">
                Members assigned come from Caspio cache. Completed counts include signed-off visits in this month.
              </div>
            </div>
            <div className="w-full sm:w-[220px] space-y-1.5">
              <Label>Month</Label>
              <Select value={analyticsMonth} onValueChange={setAnalyticsMonth}>
                <SelectTrigger>
                  <SelectValue placeholder="Select month" />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Social workers
              </CardTitle>
              <CardDescription>
                Assigned vs completed for {swMonthlySummary?.month || analyticsMonth}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingSwSummary ? (
                <div className="text-sm text-muted-foreground">Loading summary…</div>
              ) : swSummaryError ? (
                <div className="text-sm text-red-600">{swSummaryError}</div>
              ) : (swMonthlySummary?.rows?.length || 0) === 0 ? (
                <div className="text-sm text-muted-foreground">No social worker summary rows found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b">
                        <th className="py-2 pr-4">Social worker</th>
                        <th className="py-2 pr-4">Assigned</th>
                        <th className="py-2 pr-4">Completed</th>
                        <th className="py-2 pr-4">Outstanding</th>
                        <th className="py-2 pr-4">On hold</th>
                        <th className="py-2 pr-4">Claims total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {swMonthlySummary!.rows.map((r) => (
                        <tr key={r.key} className="border-b last:border-b-0">
                          <td className="py-2 pr-4 font-medium">{r.socialWorkerName}</td>
                          <td className="py-2 pr-4">
                            <button
                              type="button"
                              className="underline underline-offset-2"
                              onClick={() => void openSwDetail({ swKey: r.key, swName: r.socialWorkerName, kind: 'assigned' })}
                            >
                              {r.assignedActive}
                            </button>
                            {r.assignedTotal !== r.assignedActive ? (
                              <span className="text-xs text-muted-foreground"> / {r.assignedTotal}</span>
                            ) : null}
                          </td>
                          <td className="py-2 pr-4">
                            <button
                              type="button"
                              className="underline underline-offset-2"
                              onClick={() => void openSwDetail({ swKey: r.key, swName: r.socialWorkerName, kind: 'completed' })}
                            >
                              {r.completed}
                            </button>
                          </td>
                          <td className="py-2 pr-4">
                            <button
                              type="button"
                              onClick={() => void openSwDetail({ swKey: r.key, swName: r.socialWorkerName, kind: 'outstanding' })}
                              className="inline-flex"
                            >
                              {r.outstanding > 0 ? (
                                <Badge variant="destructive">{r.outstanding}</Badge>
                              ) : (
                                <Badge className="bg-emerald-600 hover:bg-emerald-600">0</Badge>
                              )}
                            </button>
                          </td>
                          <td className="py-2 pr-4">{r.onHold}</td>
                          <td className="py-2 pr-4">
                            <div className="font-medium">{formatMoney(Number(r.claimsTotalAmount || 0))}</div>
                            <div className="text-xs text-muted-foreground">{Number(r.claimsCount || 0)} claim(s)</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{detailTitle}</DialogTitle>
                <DialogDescription>
                  Click a member name to copy it.
                </DialogDescription>
              </DialogHeader>
              {detailLoading ? (
                <div className="text-sm text-muted-foreground">Loading…</div>
              ) : detailError ? (
                <div className="text-sm text-red-600">{detailError}</div>
              ) : detailMembers.length === 0 ? (
                <div className="text-sm text-muted-foreground">No members found.</div>
              ) : (
                <ScrollArea className="h-[420px] pr-3">
                  <div className="space-y-2">
                    {detailMembers.map((m) => (
                      <button
                        key={`${m.memberId}-${m.memberName}`}
                        type="button"
                        onClick={() => {
                          try {
                            navigator.clipboard.writeText(m.memberName);
                          } catch {
                            // ignore
                          }
                        }}
                        className="w-full text-left rounded border bg-white p-2 hover:bg-muted/20"
                      >
                        <div className="font-medium">{m.memberName}</div>
                        <div className="text-xs text-muted-foreground">
                          {m.rcfeName ? m.rcfeName : ''}
                          {m.rcfeAddress ? ` • ${m.rcfeAddress}` : ''}
                        </div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </DialogContent>
          </Dialog>

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
                      {visitRecords.length ? Math.round((visitRecords.filter(v => v.geolocationVerified).length / visitRecords.length) * 100) : 0}%
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Signed Off</span>
                    <Badge className="bg-blue-600">
                      {visitRecords.length ? Math.round((visitRecords.filter(v => v.signedOff).length / visitRecords.length) * 100) : 0}%
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Flagged for Review</span>
                    <Badge variant="destructive">
                      {visitRecords.length ? Math.round((visitRecords.filter(v => v.flagged).length / visitRecords.length) * 100) : 0}%
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}