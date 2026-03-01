'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useFirestore } from '@/firebase';
import { useAdmin } from '@/hooks/use-admin';
import { collection, query, orderBy, limit, onSnapshot, doc, where, writeBatch, serverTimestamp } from 'firebase/firestore';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { 
  DollarSign, 
  Eye, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Users, 
  Car, 
  MapPin,
  Calendar,
  Filter,
  Download,
  AlertCircle,
  TrendingUp,
  Trash2
} from 'lucide-react';

interface MemberVisit {
  id: string;
  memberName: string;
  rcfeName: string;
  rcfeAddress: string;
  visitDate: Date;
  visitTime: string;
  notes?: string;
}

interface ClaimSubmission {
  id: string;
  socialWorkerEmail: string;
  socialWorkerName: string;
  claimDate: Date;
  visitIds?: string[];
  memberVisits: MemberVisit[];
  gasReimbursement: number;
  totalMemberVisitFees: number;
  totalAmount: number;
  notes?: string;
  status: 'draft' | 'submitted' | 'needs_correction' | 'reviewed' | 'ready_for_payment' | 'approved' | 'paid' | 'rejected';
  hasFlaggedVisits?: boolean;
  submittedAt?: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
  reviewNotes?: string;
  correctionReason?: string;
  correctionRequestedAt?: Date;
  correctionRequestedBy?: string;
  readyForPaymentAt?: Date;
  readyForPaymentBy?: string;
  paidAt?: Date;
  paidBy?: string;
  paymentStatus?: string;
  claimPaid?: boolean;
  claimPaidAt?: Date;
}

interface ClaimSummary {
  totalClaims: number;
  totalAmount: number;
  pendingClaims: number;
  pendingAmount: number;
  needsCorrectionClaims: number;
  needsCorrectionAmount: number;
  readyClaims: number;
  readyAmount: number;
  paidClaims: number;
  paidAmount: number;
}

export default function SWClaimsManagementPage() {
  const firestore = useFirestore();
  const { isSuperAdmin, user: adminUser } = useAdmin();
  const { toast } = useToast();
  
  const [claims, setClaims] = useState<ClaimSubmission[]>([]);
  const [filteredClaims, setFilteredClaims] = useState<ClaimSubmission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedClaim, setSelectedClaim] = useState<ClaimSubmission | null>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [showAllClaims, setShowAllClaims] = useState(false);
  const [selectedClaimVisits, setSelectedClaimVisits] = useState<any[]>([]);
  const [loadingSelectedClaimVisits, setLoadingSelectedClaimVisits] = useState(false);
  const [selectedClaimVisitsError, setSelectedClaimVisitsError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<
    | 'all'
    | 'draft'
    | 'submitted'
    | 'needs_correction'
    | 'reviewed'
    | 'ready_for_payment'
    | 'approved'
    | 'paid'
    | 'rejected'
    // UI-only meta filters
    | 'payment_queue'
    | 'paid_any'
    | 'payment_queue_7'
    | 'payment_queue_14'
    | 'payment_queue_30'
  >('submitted');
  const [socialWorkerFilter, setSocialWorkerFilter] = useState('all');
  const [monthFilter, setMonthFilter] = useState(format(new Date(), 'yyyy-MM'));
  const [selectedClaimIds, setSelectedClaimIds] = useState<Record<string, boolean>>({});
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTargetIds, setDeleteTargetIds] = useState<string[]>([]);
  const [deleteReason, setDeleteReason] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [duplicateMemberName, setDuplicateMemberName] = useState('');
  const [duplicateMonth, setDuplicateMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [adminActionNote, setAdminActionNote] = useState('');
  const [summary, setSummary] = useState<ClaimSummary>({
    totalClaims: 0,
    totalAmount: 0,
    pendingClaims: 0,
    pendingAmount: 0,
    needsCorrectionClaims: 0,
    needsCorrectionAmount: 0,
    readyClaims: 0,
    readyAmount: 0,
    paidClaims: 0,
    paidAmount: 0
  });
  const [claimEvents, setClaimEvents] = useState<any[]>([]);
  const [loadingClaimEvents, setLoadingClaimEvents] = useState(false);
  const [claimEventsError, setClaimEventsError] = useState<string | null>(null);
  const [sendingReminders, setSendingReminders] = useState(false);
  const [reminderError, setReminderError] = useState<string | null>(null);
  const [reminderResult, setReminderResult] = useState<any | null>(null);

  useEffect(() => {
    if (!firestore) return;

    setIsLoading(true);
    const claimsQuery = query(collection(firestore, 'sw-claims'), orderBy('claimDate', 'desc'), limit(2000));
    const unsub = onSnapshot(
      claimsQuery,
      (snap) => {
        const loadedClaims: ClaimSubmission[] = snap.docs.map((docSnap) => {
          const data: any = docSnap.data();
          const toDate = (value: any): Date | undefined => {
            try {
              if (!value) return undefined;
              if (typeof value?.toDate === 'function') return value.toDate();
              if (value instanceof Date) return value;
              const d = new Date(value);
              return Number.isNaN(d.getTime()) ? undefined : d;
            } catch {
              return undefined;
            }
          };

          const memberVisitsRaw: any[] = Array.isArray(data?.memberVisits) ? data.memberVisits : [];
          const memberVisits: MemberVisit[] = memberVisitsRaw.map((v: any) => ({
            ...v,
            visitDate: (toDate(v?.visitDate) || new Date()) as any,
          }));

          const claimDate = toDate(data?.claimDate) || new Date();
          return {
            id: docSnap.id,
            ...data,
            claimDate,
            submittedAt: toDate(data?.submittedAt),
            reviewedAt: toDate(data?.reviewedAt),
            paidAt: toDate(data?.paidAt),
            claimPaidAt: toDate(data?.claimPaidAt),
            memberVisits,
          } as ClaimSubmission;
        });

        setClaims(loadedClaims);
        setIsLoading(false);
      },
      (error) => {
        console.error('Error loading claims:', error);
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to load claims' });
        setClaims([]);
        setIsLoading(false);
      }
    );

    return () => unsub();
  }, [firestore, toast]);

  useEffect(() => {
    applyFilters();
  }, [claims, statusFilter, socialWorkerFilter, monthFilter]);

  const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();
  const isPaidLike = (c: ClaimSubmission) => {
    if (c.status === 'paid') return true;
    if (Boolean(c.claimPaid)) return true;
    if (Boolean(c.paidAt)) return true;
    if (norm((c as any)?.paymentStatus) === 'paid') return true;
    return false;
  };
  const needsPaymentLike = (c: ClaimSubmission) => !isPaidLike(c) && (c.status === 'ready_for_payment' || c.status === 'approved');

  const toMs = (d: any) => (d instanceof Date ? d.getTime() : 0);
  const readyAtMs = (c: ClaimSubmission) => toMs(c.readyForPaymentAt) || toMs(c.reviewedAt) || toMs(c.submittedAt) || toMs(c.claimDate) || 0;
  const readyAgeDays = (c: ClaimSubmission) => {
    const ms = readyAtMs(c);
    if (!ms) return 0;
    const ageMs = Date.now() - ms;
    return Math.max(0, Math.floor(ageMs / (1000 * 60 * 60 * 24)));
  };

  const paymentQueueBuckets = useMemo(() => {
    const queue = claims.filter((c) => needsPaymentLike(c));
    const b7 = queue.filter((c) => readyAgeDays(c) >= 7);
    const b14 = queue.filter((c) => readyAgeDays(c) >= 14);
    const b30 = queue.filter((c) => readyAgeDays(c) >= 30);
    const sumAmount = (list: ClaimSubmission[]) => list.reduce((s, c) => s + Number(c.totalAmount || 0), 0);
    return {
      totalCount: queue.length,
      totalAmount: sumAmount(queue),
      d7Count: b7.length,
      d7Amount: sumAmount(b7),
      d14Count: b14.length,
      d14Amount: sumAmount(b14),
      d30Count: b30.length,
      d30Amount: sumAmount(b30),
    };
  }, [claims]);

  useEffect(() => {
    setDuplicateMonth(monthFilter);
  }, [monthFilter]);

  useEffect(() => {
    setAdminActionNote(String(selectedClaim?.reviewNotes || '').trim());
  }, [selectedClaim?.id]);

  useEffect(() => {
    const claimId = String(selectedClaim?.id || '').trim();
    if (!claimId || !adminUser) {
      setClaimEvents([]);
      setClaimEventsError(null);
      setLoadingClaimEvents(false);
      return;
    }
    let cancelled = false;
    setLoadingClaimEvents(true);
    setClaimEventsError(null);
    setClaimEvents([]);
    (async () => {
      try {
        const idToken = await adminUser.getIdToken();
        const res = await fetch(`/api/admin/sw-claims/events?claimId=${encodeURIComponent(claimId)}&limit=100`, {
          headers: { authorization: `Bearer ${idToken}` },
        });
        const data = await res.json().catch(() => ({} as any));
        if (!res.ok || !data?.success) throw new Error(data?.error || `Failed to load audit log (HTTP ${res.status})`);
        const events = Array.isArray(data?.events) ? data.events : [];
        if (!cancelled) setClaimEvents(events);
      } catch (e: any) {
        if (!cancelled) setClaimEventsError(e?.message || 'Failed to load audit log.');
      } finally {
        if (!cancelled) setLoadingClaimEvents(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminUser, selectedClaim?.id]);

  const openClaimReview = (claim: ClaimSubmission) => {
    setSelectedClaim(claim);
    setReviewDialogOpen(true);
  };

  useEffect(() => {
    const claim = selectedClaim;
    if (!claim || !adminUser) {
      setSelectedClaimVisits([]);
      setSelectedClaimVisitsError(null);
      setLoadingSelectedClaimVisits(false);
      return;
    }

    const visitIdsFromDoc: string[] = Array.isArray((claim as any)?.visitIds) ? ((claim as any).visitIds as any) : [];
    const visitIdsFromMemberVisits: string[] = Array.isArray((claim as any)?.memberVisits)
      ? (claim as any).memberVisits
          .map((v: any) => String(v?.id || v?.visitId || '').trim())
          .filter(Boolean)
      : [];
    const visitIds = Array.from(new Set([...visitIdsFromDoc, ...visitIdsFromMemberVisits])).slice(0, 500);

    if (visitIds.length === 0) {
      setSelectedClaimVisits([]);
      setSelectedClaimVisitsError(null);
      setLoadingSelectedClaimVisits(false);
      return;
    }

    let cancelled = false;
    setLoadingSelectedClaimVisits(true);
    setSelectedClaimVisitsError(null);
    setSelectedClaimVisits([]);

    (async () => {
      try {
        const idToken = await adminUser.getIdToken();
        const res = await fetch('/api/admin/sw-visits/by-ids', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ visitIds }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !(data as any)?.success) {
          throw new Error((data as any)?.error || 'Failed to load visit questionnaires');
        }
        const visits = Array.isArray((data as any)?.visits) ? (data as any).visits : [];
        if (!cancelled) setSelectedClaimVisits(visits);
      } catch (e: any) {
        if (!cancelled) setSelectedClaimVisitsError(e?.message || 'Failed to load visit questionnaires');
      } finally {
        if (!cancelled) setLoadingSelectedClaimVisits(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedClaim?.id, adminUser]);

  const normalizeName = (s: string) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

  const renderQuestionnaireBlock = (visit: any) => {
    const raw = (visit as any)?.raw || {};
    const score = (v: any) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    const yesNo = (v: any) => (v === true ? 'Yes' : v === false ? 'No' : '—');

    const memberConcerns = raw?.memberConcerns || {};
    const rcfeAssessment = raw?.rcfeAssessment || {};
    const wellbeing = raw?.memberWellbeing || raw?.memberWellBeing || {};
    const satisfaction = raw?.careSatisfaction || raw?.careSatifaction || {};
    const summary = raw?.visitSummary || {};

    const qa: Array<{ label: string; value: any }> = [
      { label: 'Visit date', value: String(raw?.visitDate || (visit as any)?.visitDate || '').trim() || '—' },
      { label: 'Meeting location', value: String(raw?.meetingLocation || '').trim() || '—' },
      { label: 'Room number', value: String(raw?.memberRoomNumber || (visit as any)?.memberRoomNumber || '').trim() || '—' },
      { label: 'Member concerns?', value: yesNo(memberConcerns?.hasConcerns) },
      { label: 'Urgency', value: String(memberConcerns?.urgencyLevel || '').trim() || '—' },
      { label: 'Action required?', value: yesNo(memberConcerns?.actionRequired) },
      { label: 'Concern details', value: String(memberConcerns?.detailedConcerns || '').trim() || '—' },
      { label: 'RCFE issues / notes', value: String(rcfeAssessment?.notes || '').trim() || '—' },
      { label: 'Flag for review?', value: yesNo(rcfeAssessment?.flagForReview) },
      { label: 'Visit summary', value: String(raw?.visitNarrative || raw?.visitSummaryText || summary?.visitSummaryText || summary?.notes || '').trim() || '—' },
    ];

    const stars: Array<{ label: string; value: number | null }> = [
      { label: 'Care', value: score(satisfaction?.careQualityScore ?? raw?.careQualityScore) },
      { label: 'Safety', value: score(wellbeing?.safetyScore ?? raw?.safetyScore) },
      { label: 'Communication', value: score(satisfaction?.communicationScore ?? raw?.communicationScore) },
      { label: 'Overall', value: score(summary?.overallScore ?? raw?.overallScore) },
    ];

    const totalScore = Number((visit as any)?.totalScore || summary?.totalScore || 0) || 0;
    const flagged = Boolean((visit as any)?.flagged || summary?.flagged);
    const flagReasons = Array.isArray((visit as any)?.flagReasons) ? (visit as any).flagReasons : [];

    return (
      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="font-semibold">{String((visit as any)?.memberName || 'Member')}</div>
          <Badge variant="outline">{String((visit as any)?.rcfeName || 'RCFE')}</Badge>
          {flagged ? <Badge className="bg-amber-500 hover:bg-amber-500">Flagged</Badge> : <Badge variant="secondary">Not flagged</Badge>}
          <Badge variant="outline">Total score: {totalScore}</Badge>
        </div>

        {flagged && flagReasons.length > 0 ? (
          <div className="text-sm">
            <div className="font-medium mb-1">Flag reasons</div>
            <ul className="list-disc pl-5 text-muted-foreground">
              {flagReasons.slice(0, 10).map((r: any, idx: number) => (
                <li key={idx}>{String(r || '').trim() || '—'}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {stars.map((s) => (
            <div key={s.label} className="rounded border px-3 py-2 text-sm">
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className="font-semibold">{s.value ?? '—'}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {qa.map((item) => (
            <div key={item.label} className="rounded border px-3 py-2 text-sm">
              <div className="text-xs text-muted-foreground">{item.label}</div>
              <div className="whitespace-pre-wrap break-words">{String(item.value ?? '—')}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const deleteTargetSummaries = useMemo(() => {
    const byId = new Map<string, ClaimSubmission>();
    claims.forEach((c) => byId.set(c.id, c));
    const toLine = (claim: ClaimSubmission) => {
      const sw = String(claim.socialWorkerName || claim.socialWorkerEmail || 'Social Worker').trim();
      const claimDate = claim.claimDate ? format(claim.claimDate, 'MMM d, yyyy') : '—';
      const firstVisit = Array.isArray(claim.memberVisits) ? claim.memberVisits[0] : null;
      const visitLine = firstVisit
        ? `${format(firstVisit.visitDate, 'MM/dd/yyyy')} • ${String(firstVisit.memberName || '—').trim()} • ${String(firstVisit.rcfeName || '—').trim()}`
        : '—';
      const extra = Math.max(0, (claim.memberVisits?.length || 0) - 1);
      return `${sw} • ${claimDate} • ${visitLine}${extra > 0 ? ` (+${extra} more)` : ''}`;
    };
    return deleteTargetIds
      .map((id) => {
        const claim = byId.get(id);
        return claim ? ({ id, line: toLine(claim) } as const) : ({ id, line: 'Claim not loaded in UI' } as const);
      })
      .filter(Boolean);
  }, [claims, deleteTargetIds]);

  const applyFilters = () => {
    let filtered = [...claims];

    // Status filter
    if (statusFilter !== 'all') {
      if (statusFilter === 'payment_queue') {
        filtered = filtered.filter((claim) => needsPaymentLike(claim));
      } else if (statusFilter === 'payment_queue_7') {
        filtered = filtered.filter((claim) => needsPaymentLike(claim) && readyAgeDays(claim) >= 7);
      } else if (statusFilter === 'payment_queue_14') {
        filtered = filtered.filter((claim) => needsPaymentLike(claim) && readyAgeDays(claim) >= 14);
      } else if (statusFilter === 'payment_queue_30') {
        filtered = filtered.filter((claim) => needsPaymentLike(claim) && readyAgeDays(claim) >= 30);
      } else if (statusFilter === 'paid_any') {
        filtered = filtered.filter((claim) => isPaidLike(claim));
      } else {
        filtered = filtered.filter((claim) => claim.status === statusFilter);
      }
    }

    // Social worker filter
    if (socialWorkerFilter !== 'all') {
      filtered = filtered.filter(claim => claim.socialWorkerEmail === socialWorkerFilter);
    }

    // Month filter
    if (monthFilter) {
      const [year, month] = monthFilter.split('-').map(Number);
      const startDate = startOfMonth(new Date(year, month - 1));
      const endDate = endOfMonth(new Date(year, month - 1));
      
      filtered = filtered.filter(claim => 
        claim.claimDate >= startDate && claim.claimDate <= endDate
      );
    }

    // When working the payment queue, show oldest first.
    if (
      statusFilter === 'payment_queue' ||
      statusFilter === 'payment_queue_7' ||
      statusFilter === 'payment_queue_14' ||
      statusFilter === 'payment_queue_30'
    ) {
      filtered = [...filtered].sort((a, b) => readyAtMs(a) - readyAtMs(b));
    }

    setFilteredClaims(filtered);
    // Summary cards should reflect the same filters as the table (so if Claims (0), cards show 0 too).
    calculateSummary(filtered);
  };

  const selectedIds = Object.keys(selectedClaimIds).filter((k) => selectedClaimIds[k]);
  const allFilteredSelected = filteredClaims.length > 0 && selectedIds.length === filteredClaims.length;

  const toggleAllFiltered = (next: boolean) => {
    if (!next) {
      setSelectedClaimIds({});
      return;
    }
    const map: Record<string, boolean> = {};
    filteredClaims.forEach((c) => {
      map[c.id] = true;
    });
    setSelectedClaimIds(map);
  };

  const openDelete = (ids: string[]) => {
    const unique = Array.from(new Set(ids.map((x) => String(x || '').trim()).filter(Boolean)));
    setDeleteTargetIds(unique);
    setDeleteReason('');
    setDeleteDialogOpen(true);
  };

  const deleteClaims = async () => {
    if (isDeleting) return;
    if (deleteTargetIds.length === 0) return;
    const reason = String(deleteReason || '').trim();
    if (!reason) {
      toast({ variant: 'destructive', title: 'Reason required', description: 'Please enter a reason for deleting these claims.' });
      return;
    }
    if (!adminUser) {
      toast({ variant: 'destructive', title: 'Not signed in', description: 'Please sign in again.' });
      return;
    }

    setIsDeleting(true);
    try {
      const idToken = await adminUser.getIdToken();
      const res = await fetch('/api/admin/sw-claims/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ claimIds: deleteTargetIds, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !(data as any)?.success) {
        throw new Error((data as any)?.error || 'Failed to delete claims');
      }

      const deleted: string[] = Array.isArray((data as any)?.deleted) ? (data as any).deleted : [];
      const remaining = claims.filter((c) => !deleted.includes(c.id));
      setClaims(remaining);

      setSelectedClaimIds((prev) => {
        const next = { ...prev };
        deleted.forEach((id) => {
          delete next[id];
        });
        return next;
      });

      toast({
        title: 'Claims deleted',
        description: deleted.length === 1 ? 'Deleted 1 claim.' : `Deleted ${deleted.length} claims.`,
      });
      setDeleteDialogOpen(false);
      setDeleteTargetIds([]);
      setDeleteReason('');
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Delete failed', description: e?.message || 'Could not delete claims.' });
    } finally {
      setIsDeleting(false);
    }
  };

  const selectDuplicateClaims = () => {
    const memberNeedle = normalizeName(duplicateMemberName);
    if (!memberNeedle) {
      toast({ variant: 'destructive', title: 'Member name required', description: 'Enter a member name to select duplicates.' });
      return;
    }
    const targetMonth = String(duplicateMonth || '').trim();
    if (!targetMonth) {
      toast({ variant: 'destructive', title: 'Month required', description: 'Select a month (YYYY-MM).' });
      return;
    }

    const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const matches = claims.filter((c) => {
      const inMonth = monthKey(c.claimDate) === targetMonth;
      if (!inMonth) return false;
      return (c.memberVisits || []).some((v) => normalizeName(v.memberName) === memberNeedle);
    });

    if (matches.length <= 1) {
      toast({ title: 'No duplicates found', description: `Found ${matches.length} claim(s) for that member in ${targetMonth}.` });
      return;
    }

    // Keep newest (submittedAt if present, else claimDate), select the rest.
    const sortKey = (c: ClaimSubmission) => {
      const s = c.submittedAt instanceof Date ? c.submittedAt.getTime() : 0;
      const d = c.claimDate instanceof Date ? c.claimDate.getTime() : 0;
      return s || d || 0;
    };
    const sorted = [...matches].sort((a, b) => sortKey(b) - sortKey(a));
    const toDelete = sorted.slice(1).map((c) => c.id);

    setSelectedClaimIds((prev) => {
      const next = { ...prev };
      toDelete.forEach((id) => {
        next[id] = true;
      });
      return next;
    });

    toast({
      title: 'Duplicates selected',
      description: `Selected ${toDelete.length} duplicate claim(s) for deletion (kept the newest).`,
    });
  };

  function calculateSummary(claimsData: ClaimSubmission[]) {
    const paidAny = (c: ClaimSubmission) => isPaidLike(c);
    const needsPaymentAny = (c: ClaimSubmission) => needsPaymentLike(c);
    const summary: ClaimSummary = {
      totalClaims: claimsData.length,
      totalAmount: claimsData.reduce((sum, claim) => sum + claim.totalAmount, 0),
      pendingClaims: claimsData.filter(c => c.status === 'submitted').length,
      pendingAmount: claimsData.filter(c => c.status === 'submitted').reduce((sum, claim) => sum + claim.totalAmount, 0),
      needsCorrectionClaims: claimsData.filter(c => c.status === 'needs_correction').length,
      needsCorrectionAmount: claimsData.filter(c => c.status === 'needs_correction').reduce((sum, claim) => sum + claim.totalAmount, 0),
      readyClaims: claimsData.filter((c) => needsPaymentAny(c)).length,
      readyAmount: claimsData.filter((c) => needsPaymentAny(c)).reduce((sum, claim) => sum + claim.totalAmount, 0),
      paidClaims: claimsData.filter((c) => paidAny(c)).length,
      paidAmount: claimsData.filter((c) => paidAny(c)).reduce((sum, claim) => sum + claim.totalAmount, 0)
    };
    
    setSummary(summary);
  }

  const renderDraftVisitDetails = (claim: ClaimSubmission) => {
    if (claim.status !== 'draft') return null;
    const visits = Array.isArray(claim.memberVisits) ? claim.memberVisits : [];
    if (visits.length === 0) return null;
    const first = visits[0];
    const extra = Math.max(0, visits.length - 1);
    return (
      <div className="mt-1 text-xs text-muted-foreground">
        <div className="truncate">
          {first.memberName} • {first.rcfeName} • {format(first.visitDate, 'MM/dd/yyyy')}
          {extra > 0 ? ` (+${extra} more)` : ''}
        </div>
      </div>
    );
  };

  const unsubmittedDraftClaimsForMonth = useMemo(() => {
    const m = String(monthFilter || '').trim();
    const inMonth = claims.filter((c: any) => {
      const cm = String((c as any)?.claimMonth || '').trim();
      if (cm) return cm === m;
      const d = (c as any)?.claimDate instanceof Date ? (c as any).claimDate : null;
      return d ? format(d, 'yyyy-MM') === m : false;
    });
    return inMonth.filter((c: any) => String(c?.status || '').trim().toLowerCase() === 'draft');
  }, [claims, monthFilter]);

  const selectDraftClaimsForMonth = () => {
    const next: Record<string, boolean> = {};
    unsubmittedDraftClaimsForMonth.forEach((c: any) => {
      if (c?.id) next[String(c.id)] = true;
    });
    setSelectedClaimIds(next);
    setReminderResult(null);
    setReminderError(null);
  };

  const sendRemindersForSelectedDrafts = async () => {
    if (!adminUser) return;
    const selected = selectedIds;
    if (selected.length === 0) {
      toast({ variant: 'destructive', title: 'Nothing selected', description: 'Select one or more draft claims first.' });
      return;
    }
    const selectedDraftIds = selected.filter((id) => {
      const c = claims.find((x) => String((x as any)?.id || '').trim() === String(id).trim()) as any;
      return String(c?.status || '').trim().toLowerCase() === 'draft';
    });
    if (selectedDraftIds.length === 0) {
      toast({ variant: 'destructive', title: 'No draft claims selected', description: 'Reminders are only sent for draft (unsubmitted) claims.' });
      return;
    }
    setSendingReminders(true);
    setReminderError(null);
    setReminderResult(null);
    try {
      const idToken = await adminUser.getIdToken();
      const res = await fetch('/api/admin/sw-claims/send-reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ claimIds: selectedDraftIds, onlyDraft: true }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) throw new Error(data?.error || `Failed to send reminders (HTTP ${res.status})`);
      setReminderResult(data);
      toast({
        title: 'Reminders sent',
        description: `Notified ${Number(data?.socialWorkersNotified || 0)} social worker(s).`,
      });
    } catch (e: any) {
      setReminderError(e?.message || 'Failed to send reminders.');
      toast({ variant: 'destructive', title: 'Reminder failed', description: e?.message || 'Please try again.' });
    } finally {
      setSendingReminders(false);
    }
  };

  const updateClaimStatus = async (claimId: string, newStatus: ClaimSubmission['status'], reviewNotes?: string) => {
    try {
      const actorLabel =
        String(adminUser?.displayName || adminUser?.email || '').trim()
        || 'Admin';
      const notes = String(reviewNotes || '').trim();

      if (newStatus === 'needs_correction' && !notes) {
        toast({
          variant: 'destructive',
          title: 'Reason required',
          description: 'Enter a correction reason in Admin note before marking Needs correction.',
        });
        return;
      }

      if (!adminUser) throw new Error('No admin session');
      const idToken = await adminUser.getIdToken();
      const res = await fetch('/api/admin/sw-claims/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ claimId, newStatus, reviewNotes: notes, actorLabel }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Failed to update claim status');

      toast({
        title: 'Status Updated',
        description: `Claim status changed to ${String(newStatus).replace(/_/g, ' ')}`
      });
      
      setSelectedClaim(null);
    } catch (error) {
      console.error('Error updating claim status:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to update claim status'
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      'submitted': 'outline',
      'needs_correction': 'destructive',
      'reviewed': 'secondary',
      'ready_for_payment': 'secondary',
      'approved': 'secondary',
      'paid': 'default',
      'rejected': 'destructive',
      'draft': 'outline'
    } as const;

    const colors = {
      'submitted': 'text-blue-700',
      'needs_correction': 'text-red-700',
      'reviewed': 'text-slate-700',
      'ready_for_payment': 'text-green-700',
      'approved': 'text-green-700',
      'paid': 'text-green-800',
      'rejected': 'text-red-700',
      'draft': 'text-gray-700'
    };

    return (
      <Badge variant={variants[status as keyof typeof variants]} className={colors[status as keyof typeof colors]}>
        {String(status || '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())}
      </Badge>
    );
  };

  const exportToCsv = () => {
    const csvData = filteredClaims.map(claim => ({
      'Social Worker': claim.socialWorkerName,
      'Email': claim.socialWorkerEmail,
      'Date': format(claim.claimDate, 'yyyy-MM-dd'),
      'Member Visits': claim.memberVisits.length,
      'Visit Fees': claim.totalMemberVisitFees,
      'Gas Reimbursement': claim.gasReimbursement,
      'Total Amount': claim.totalAmount,
      'Status': claim.status,
      'Needs Payment': needsPaymentLike(claim) ? 'YES' : '',
      'Paid': isPaidLike(claim) ? 'YES' : '',
      'Paid At': claim.paidAt ? format(claim.paidAt, 'yyyy-MM-dd HH:mm') : '',
      'Submitted': claim.submittedAt ? format(claim.submittedAt, 'yyyy-MM-dd HH:mm') : '',
      'Notes': claim.notes || ''
    }));

    const csv = [
      Object.keys(csvData[0]).join(','),
      ...csvData.map(row => Object.values(row).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sw-claims-${monthFilter}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Get unique social workers for filter
  const socialWorkers = [...new Set(claims.map(claim => claim.socialWorkerEmail))];

  const recentSubmittedClaims = useMemo(() => {
    const eligible = claims.filter((c) => c.status !== 'draft' && c.status !== 'rejected');
    const submitted = eligible.filter((c) => String(c.status || '').toLowerCase() === 'submitted');
    const toMs = (d: any) => (d instanceof Date ? d.getTime() : 0);
    return [...submitted].sort((a, b) => (toMs(b.submittedAt) || toMs(b.claimDate)) - (toMs(a.submittedAt) || toMs(a.claimDate))).slice(0, 12);
  }, [claims]);

  const quickSetFilter = (next: typeof statusFilter) => {
    setShowAllClaims(true);
    setStatusFilter(next);
  };

  const bulkUpdateStatus = async (params: { ids: string[]; newStatus: ClaimSubmission['status'] }) => {
    if (!adminUser) return;
    const ids = params.ids.map((x) => String(x || '').trim()).filter(Boolean);
    if (ids.length === 0) return;
    if (bulkUpdating) return;
    setBulkUpdating(true);
    try {
      const idToken = await adminUser.getIdToken();
      let ok = 0;
      let fail = 0;
      for (const claimId of ids) {
        try {
          const res = await fetch('/api/admin/sw-claims/update-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', authorization: `Bearer ${idToken}` },
            body: JSON.stringify({ claimId, newStatus: params.newStatus, reviewNotes: '' }),
          });
          const data = await res.json().catch(() => ({} as any));
          if (!res.ok || !data?.success) throw new Error(data?.error || `Failed (${res.status})`);
          ok += 1;
        } catch (e) {
          console.error('Bulk update failed:', e);
          fail += 1;
        }
      }
      toast({
        title: 'Bulk update complete',
        description: `Updated ${ok} claim(s) to ${String(params.newStatus).replace(/_/g, ' ')}${fail ? ` • ${fail} failed` : ''}`,
      });
      if (fail === 0) setSelectedClaimIds({});
    } finally {
      setBulkUpdating(false);
    }
  };

  const getPaymentBadge = (claim: ClaimSubmission) => {
    if (isPaidLike(claim)) {
      const when = claim.paidAt ? format(claim.paidAt, 'MMM d, yyyy') : '';
      return (
        <div className="flex flex-col gap-1">
          <Badge className="w-fit" variant="default">
            Paid
          </Badge>
          {when ? <div className="text-xs text-muted-foreground whitespace-nowrap">{when}</div> : null}
        </div>
      );
    }
    if (needsPaymentLike(claim)) {
      const when = claim.readyForPaymentAt ? format(claim.readyForPaymentAt, 'MMM d, yyyy') : '';
      return (
        <div className="flex flex-col gap-1">
          <Badge className="w-fit" variant="secondary">
            Needs payment
          </Badge>
          {when ? <div className="text-xs text-muted-foreground whitespace-nowrap">Ready: {when}</div> : null}
        </div>
      );
    }
    return <div className="text-xs text-muted-foreground whitespace-nowrap">—</div>;
  };

  const getAgingBadge = (claim: ClaimSubmission) => {
    if (!needsPaymentLike(claim)) return <div className="text-xs text-muted-foreground whitespace-nowrap">—</div>;
    const days = readyAgeDays(claim);
    const label = `${days}d`;
    const variant =
      days >= 30 ? 'destructive' : days >= 14 ? 'secondary' : days >= 7 ? 'outline' : 'outline';
    const className = days >= 30 ? 'text-red-700' : days >= 14 ? 'text-amber-700' : 'text-slate-700';
    return (
      <Badge variant={variant as any} className={className}>
        {label}
      </Badge>
    );
  };

  // Show loading while checking admin status
  if (!isSuperAdmin) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Access Denied
            </CardTitle>
            <CardDescription>
              You need super admin permissions to manage SW claims.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold">SW Claims Management</h1>
          <p className="text-muted-foreground">
            Manage and review social worker claims submissions (auto-updates in real time).
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={exportToCsv} variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Delete claim(s)</DialogTitle>
            <DialogDescription>
              This permanently deletes the claim document and logs an audit record. A reason is required.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm">
              Deleting <span className="font-semibold">{deleteTargetIds.length}</span> claim(s).
            </div>
            {deleteTargetSummaries.length > 0 ? (
              <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
                <div className="font-medium text-foreground mb-1">Selected claim(s)</div>
                <div className="space-y-1" title={deleteTargetSummaries.map((x) => `${x.id}: ${x.line}`).join('\n')}>
                  {deleteTargetSummaries.slice(0, 6).map((x) => (
                    <div key={`del-sum-${x.id}`} className="whitespace-nowrap">
                      <span className="font-mono text-[10px] text-muted-foreground">{x.id}</span>
                      <span className="mx-2">—</span>
                      {x.line}
                    </div>
                  ))}
                  {deleteTargetSummaries.length > 6 ? (
                    <div className="whitespace-nowrap">+{deleteTargetSummaries.length - 6} more…</div>
                  ) : null}
                </div>
              </div>
            ) : null}
            <div className="space-y-2">
              <div className="text-sm font-medium">Reason</div>
              <Textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="Example: Duplicate claim for same member/month; keeping newest."
                rows={4}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={isDeleting}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => void deleteClaims()} disabled={isDeleting || deleteTargetIds.length === 0}>
                <Trash2 className="mr-2 h-4 w-4" />
                {isDeleting ? 'Deleting…' : 'Delete'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Claim Review{selectedClaim ? ` - ${selectedClaim.socialWorkerName}` : ''}
            </DialogTitle>
            <DialogDescription>
              {selectedClaim
                ? `${format(selectedClaim.claimDate, 'MMMM d, yyyy')} • Total: $${Number(selectedClaim.totalAmount || 0).toFixed(2)}`
                : 'Review claim details.'}
            </DialogDescription>
          </DialogHeader>

          {selectedClaim ? (
            <div className="space-y-6">
              {/* Claim Details */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold mb-2">Claim Information</h4>
                  <div className="space-y-1 text-sm">
                    <div>Social Worker: {selectedClaim.socialWorkerName}</div>
                    <div>Email: {selectedClaim.socialWorkerEmail}</div>
                    <div>Date: {format(selectedClaim.claimDate, 'MMMM d, yyyy')}</div>
                    <div>Status: {getStatusBadge(selectedClaim.status)}</div>
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Financial Summary</h4>
                  <div className="space-y-1 text-sm">
                    <div>
                      Member Visits: {selectedClaim.memberVisits.length} × $45 = ${Number(selectedClaim.totalMemberVisitFees || 0).toFixed(2)}
                    </div>
                    <div>Gas Reimbursement: ${Number(selectedClaim.gasReimbursement || 0).toFixed(2)}</div>
                    <div className="font-semibold">Total: ${Number(selectedClaim.totalAmount || 0).toFixed(2)}</div>
                  </div>
                </div>
              </div>

              {/* Line items (payables) */}
              <div>
                <h4 className="font-semibold mb-3">Line items</h4>
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date visited</TableHead>
                        <TableHead>Member</TableHead>
                        <TableHead>Home</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedClaim.memberVisits.map((visit) => (
                        <TableRow key={visit.id}>
                          <TableCell className="whitespace-nowrap">{format(visit.visitDate, 'MM/dd/yyyy')}</TableCell>
                          <TableCell className="font-medium">{visit.memberName}</TableCell>
                          <TableCell className="min-w-[220px]">
                            <div className="font-medium">{visit.rcfeName}</div>
                            <div className="text-xs text-muted-foreground">{visit.rcfeAddress}</div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{visit.visitTime || '—'}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{visit.notes ? visit.notes : '—'}</TableCell>
                          <TableCell className="text-right font-medium">$45.00</TableCell>
                        </TableRow>
                      ))}

                      <TableRow>
                        <TableCell colSpan={5} className="text-sm text-muted-foreground">
                          Gas reimbursement
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          ${Number(selectedClaim.gasReimbursement || 0).toFixed(2)}
                        </TableCell>
                      </TableRow>

                      <TableRow>
                        <TableCell colSpan={5} className="text-sm font-semibold">
                          Total
                        </TableCell>
                        <TableCell className="text-right text-sm font-semibold">
                          ${Number(selectedClaim.totalAmount || 0).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Visits: {selectedClaim.memberVisits.length} × $45 = ${Number(selectedClaim.totalMemberVisitFees || 0).toFixed(2)}
                </div>
              </div>

              {/* Questionnaires */}
              <div>
                <h4 className="font-semibold mb-3">Questionnaires (from visit records)</h4>
                {loadingSelectedClaimVisits ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading questionnaires…
                  </div>
                ) : selectedClaimVisitsError ? (
                  <Alert variant="destructive">
                    <AlertTitle>Unable to load questionnaires</AlertTitle>
                    <AlertDescription>{selectedClaimVisitsError}</AlertDescription>
                  </Alert>
                ) : selectedClaimVisits.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No visit records found for this claim.</div>
                ) : (
                  <div className="space-y-4">
                    {selectedClaimVisits.map((v: any) => (
                      <div key={String(v?.visitId || v?.id || '')}>{renderQuestionnaireBlock(v)}</div>
                    ))}
                  </div>
                )}
              </div>

              {/* Audit log */}
              <div>
                <h4 className="font-semibold mb-3">Audit log</h4>
                {loadingClaimEvents ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading audit log…
                  </div>
                ) : claimEventsError ? (
                  <Alert variant="destructive">
                    <AlertTitle>Unable to load audit log</AlertTitle>
                    <AlertDescription>{claimEventsError}</AlertDescription>
                  </Alert>
                ) : claimEvents.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No audit events yet.</div>
                ) : (
                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="whitespace-nowrap">Time</TableHead>
                          <TableHead>Actor</TableHead>
                          <TableHead className="whitespace-nowrap">Change</TableHead>
                          <TableHead>Note</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {claimEvents.slice(0, 50).map((e: any) => (
                          <TableRow key={String(e?.id || Math.random())}>
                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                              {String(e?.createdAtIso || '').replace('T', ' ').replace('Z', ' UTC') || '—'}
                            </TableCell>
                            <TableCell className="text-sm">
                              {String(e?.actorName || e?.actorEmail || 'Admin')}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-sm">
                              <span className="font-mono text-xs">{String(e?.fromStatus || '—')}</span> →{' '}
                              <span className="font-mono text-xs">{String(e?.toStatus || '—')}</span>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {String(e?.notes || '').trim() ? String(e?.notes) : '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              {/* Notes */}
              {selectedClaim.notes ? (
                <div>
                  <h4 className="font-semibold mb-2">Additional Notes</h4>
                  <p className="text-sm bg-muted p-3 rounded">{selectedClaim.notes}</p>
                </div>
              ) : null}

              {/* Action Buttons */}
              <div className="pt-4 border-t space-y-3">
                <div className="text-sm text-muted-foreground">
                  {selectedClaim.status === 'submitted' ? (
                    <div>
                      This claim is <span className="font-semibold text-foreground">Submitted</span>. Review it, then either request correction or approve for
                      payment processing.
                    </div>
                  ) : selectedClaim.status === 'needs_correction' ? (
                    <div>
                      This claim is <span className="font-semibold text-foreground">Needs correction</span>. The Social Worker should revise and resubmit based on
                      your note.
                    </div>
                  ) : selectedClaim.status === 'reviewed' ? (
                    <div>
                      This claim is <span className="font-semibold text-foreground">Reviewed</span>. Approve for payment processing when ready.
                    </div>
                  ) : selectedClaim.status === 'ready_for_payment' || selectedClaim.status === 'approved' ? (
                    <div>
                      This claim is <span className="font-semibold text-foreground">Ready for payment</span>. Mark it as Paid once payment is sent.
                    </div>
                  ) : selectedClaim.status === 'paid' ? (
                    <div>
                      This claim is <span className="font-semibold text-foreground">Paid</span>.
                    </div>
                  ) : selectedClaim.status === 'rejected' ? (
                    <div>
                      This claim is <span className="font-semibold text-foreground">Rejected</span>.
                    </div>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">Admin note (optional)</div>
                  <Textarea
                    value={adminActionNote}
                    onChange={(e) => setAdminActionNote(e.target.value)}
                    placeholder="Optional: reason for approval/rejection, payment note, or override explanation."
                    rows={3}
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  {selectedClaim.status === 'submitted' ? (
                    <>
                      <Button onClick={() => updateClaimStatus(selectedClaim.id, 'reviewed', adminActionNote)} className="bg-slate-800 hover:bg-slate-900">
                        <CheckCircle className="mr-2 h-4 w-4" />
                        Mark reviewed
                      </Button>
                      <Button onClick={() => updateClaimStatus(selectedClaim.id, 'needs_correction', adminActionNote)} variant="destructive">
                        <XCircle className="mr-2 h-4 w-4" />
                        Needs correction
                      </Button>
                      <Button onClick={() => updateClaimStatus(selectedClaim.id, 'ready_for_payment', adminActionNote)} className="bg-green-600 hover:bg-green-700">
                        <CheckCircle className="mr-2 h-4 w-4" />
                        Approve for payment
                      </Button>
                    </>
                  ) : null}

                  {selectedClaim.status === 'reviewed' || selectedClaim.status === 'needs_correction' ? (
                    <Button onClick={() => updateClaimStatus(selectedClaim.id, 'ready_for_payment', adminActionNote)} className="bg-green-600 hover:bg-green-700">
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Approve for payment
                    </Button>
                  ) : null}

                  {selectedClaim.status === 'ready_for_payment' || selectedClaim.status === 'approved' ? (
                    <Button onClick={() => updateClaimStatus(selectedClaim.id, 'paid', adminActionNote)} className="bg-emerald-700 hover:bg-emerald-800">
                      <DollarSign className="mr-2 h-4 w-4" />
                      Mark as Paid
                    </Button>
                  ) : null}

                  {selectedClaim.status === 'paid' ? (
                    <Button onClick={() => updateClaimStatus(selectedClaim.id, 'ready_for_payment', adminActionNote)} variant="outline">
                      Mark as Unpaid
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Select a claim to review.</div>
          )}
        </DialogContent>
      </Dialog>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Claims</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalClaims}</div>
            <p className="text-xs text-muted-foreground">
              ${summary.totalAmount.toLocaleString()} total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{summary.pendingClaims}</div>
            <p className="text-xs text-muted-foreground">
              ${summary.pendingAmount.toLocaleString()} pending
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Needs Correction</CardTitle>
            <XCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{summary.needsCorrectionClaims}</div>
            <p className="text-xs text-muted-foreground">
              ${summary.needsCorrectionAmount.toLocaleString()} needs correction
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ready for Payment</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{summary.readyClaims}</div>
            <p className="text-xs text-muted-foreground">
              ${summary.readyAmount.toLocaleString()} ready
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Paid</CardTitle>
            <DollarSign className="h-4 w-4 text-green-800" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-800">{summary.paidClaims}</div>
            <p className="text-xs text-muted-foreground">
              ${summary.paidAmount.toLocaleString()} paid out
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recently submitted */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Recently submitted</CardTitle>
            <CardDescription>One-line view. Expand to see full list & filters.</CardDescription>
          </div>
          <Button variant="outline" onClick={() => setShowAllClaims((v) => !v)}>
            {showAllClaims ? 'Hide all claims' : 'Show all claims'}
          </Button>
        </CardHeader>
        <CardContent>
          {recentSubmittedClaims.length === 0 ? (
            <div className="text-sm text-muted-foreground">No recently submitted claims found.</div>
          ) : (
            <div className="divide-y rounded-md border">
              {recentSubmittedClaims.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {c.socialWorkerName} • {format(c.claimDate, 'MMM d, yyyy')} • {c.memberVisits.length} visit(s) • ${Number(c.totalAmount || 0).toFixed(2)}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{c.socialWorkerEmail}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {getStatusBadge(c.status)}
                    <Button variant="outline" size="sm" onClick={() => openClaimReview(c)}>
                      <Eye className="mr-2 h-4 w-4" />
                      Review
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {showAllClaims ? (
        <>
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium">Status</label>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="payment_queue">Payment queue (unpaid)</SelectItem>
                  <SelectItem value="payment_queue_7">Payment queue aging: 7+ days</SelectItem>
                  <SelectItem value="payment_queue_14">Payment queue aging: 14+ days</SelectItem>
                  <SelectItem value="payment_queue_30">Payment queue aging: 30+ days</SelectItem>
                  <SelectItem value="paid_any">Paid (incl. legacy)</SelectItem>
                  <SelectItem value="submitted">Submitted (action needed)</SelectItem>
                  <SelectItem value="needs_correction">Needs correction</SelectItem>
                  <SelectItem value="reviewed">Reviewed</SelectItem>
                  <SelectItem value="ready_for_payment">Ready for payment</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="draft">Draft (unsubmitted)</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">Social Worker</label>
              <Select value={socialWorkerFilter} onValueChange={setSocialWorkerFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Workers</SelectItem>
                  {socialWorkers.map(email => (
                    <SelectItem key={email} value={email}>
                      {email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">Month</label>
              <Input
                type="month"
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-6 rounded-lg border p-4">
            <div className="text-sm font-semibold mb-3">Duplicate cleanup (member + month)</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div>
                <div className="text-sm font-medium">Member name (exact)</div>
                <Input value={duplicateMemberName} onChange={(e) => setDuplicateMemberName(e.target.value)} placeholder="Forrest Kendrick" />
              </div>
              <div>
                <div className="text-sm font-medium">Month</div>
                <Input type="month" value={duplicateMonth} onChange={(e) => setDuplicateMonth(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={selectDuplicateClaims}>
                  Select duplicates
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => openDelete(selectedIds)}
                  disabled={selectedIds.length === 0}
                  title={selectedIds.length === 0 ? 'Select claims in the table first' : 'Delete selected claims'}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete selected ({selectedIds.length})
                </Button>
              </div>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Tip: click “Select duplicates” then enter a delete reason and confirm.
            </div>
          </div>

          <div className="mt-6 rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm font-semibold">Quick views</div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => quickSetFilter('submitted')}>Submitted</Button>
                <Button variant="outline" size="sm" onClick={() => quickSetFilter('needs_correction')}>Needs correction</Button>
                <Button variant="outline" size="sm" onClick={() => quickSetFilter('payment_queue')}>Payment queue</Button>
                <Button variant="outline" size="sm" onClick={() => quickSetFilter('payment_queue_7')}>7+ days</Button>
                <Button variant="outline" size="sm" onClick={() => quickSetFilter('payment_queue_14')}>14+ days</Button>
                <Button variant="outline" size="sm" onClick={() => quickSetFilter('payment_queue_30')}>30+ days</Button>
                <Button variant="outline" size="sm" onClick={() => quickSetFilter('paid_any')}>Paid</Button>
                <Button variant="outline" size="sm" onClick={() => quickSetFilter('draft')}>Drafts</Button>
              </div>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Payment queue shows <span className="font-medium">Ready / Approved</span> claims that are not yet marked paid.
            </div>
          </div>

          <div className="mt-6 rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Payment queue aging (unpaid)</div>
                <div className="text-xs text-muted-foreground">
                  Aging is measured from <span className="font-medium">Ready for payment</span> (fallback: reviewed/submitted/claim date). Queue views sort <span className="font-medium">oldest first</span>.
                </div>
              </div>
              <div className="text-right text-sm">
                <div className="font-semibold">{paymentQueueBuckets.totalCount} total</div>
                <div className="text-xs text-muted-foreground">${paymentQueueBuckets.totalAmount.toLocaleString()} unpaid</div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
              <button
                type="button"
                className="rounded border p-3 text-left hover:bg-muted/40"
                onClick={() => quickSetFilter('payment_queue_7')}
              >
                <div className="text-xs text-muted-foreground">7+ days</div>
                <div className="text-lg font-semibold">{paymentQueueBuckets.d7Count}</div>
                <div className="text-xs text-muted-foreground">${paymentQueueBuckets.d7Amount.toLocaleString()}</div>
              </button>
              <button
                type="button"
                className="rounded border p-3 text-left hover:bg-muted/40"
                onClick={() => quickSetFilter('payment_queue_14')}
              >
                <div className="text-xs text-muted-foreground">14+ days</div>
                <div className="text-lg font-semibold">{paymentQueueBuckets.d14Count}</div>
                <div className="text-xs text-muted-foreground">${paymentQueueBuckets.d14Amount.toLocaleString()}</div>
              </button>
              <button
                type="button"
                className="rounded border p-3 text-left hover:bg-muted/40"
                onClick={() => quickSetFilter('payment_queue_30')}
              >
                <div className="text-xs text-muted-foreground">30+ days</div>
                <div className="text-lg font-semibold text-red-700">{paymentQueueBuckets.d30Count}</div>
                <div className="text-xs text-muted-foreground">${paymentQueueBuckets.d30Amount.toLocaleString()}</div>
              </button>
            </div>
          </div>

          <div className="mt-6 rounded-lg border p-4">
            <div className="text-sm font-semibold mb-2">Follow-up: unsubmitted SW claims (draft)</div>
            <div className="text-sm text-muted-foreground">
              These are claims with completed questionnaires/sign-off, but the Social Worker has not submitted the claim yet.
            </div>
            <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="text-sm">
                Draft claims in <span className="font-semibold">{monthFilter}</span>: <span className="font-semibold">{unsubmittedDraftClaimsForMonth.length}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={selectDraftClaimsForMonth} disabled={unsubmittedDraftClaimsForMonth.length === 0}>
                  Select draft claims (month)
                </Button>
                <Button
                  onClick={() => void sendRemindersForSelectedDrafts()}
                  disabled={sendingReminders || selectedIds.length === 0}
                >
                  {sendingReminders ? 'Sending…' : `Send reminder email(s) (${selectedIds.length})`}
                </Button>
              </div>
            </div>
            {reminderError ? <div className="mt-2 text-sm text-destructive">{reminderError}</div> : null}
            {reminderResult?.success ? (
              <div className="mt-2 text-xs text-muted-foreground">
                Notified {Number(reminderResult?.socialWorkersNotified || 0)} social worker(s). Eligible draft claims: {Number(reminderResult?.eligible || 0)}.
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Claims Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Claims ({filteredClaims.length})</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={exportToCsv} disabled={filteredClaims.length === 0}>
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={selectedIds.length === 0 || bulkUpdating}
                onClick={() => bulkUpdateStatus({ ids: selectedIds, newStatus: 'ready_for_payment' })}
                title={selectedIds.length === 0 ? 'Select one or more claims first' : 'Mark selected as Ready for payment'}
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Mark ready ({selectedIds.length})
              </Button>
              <Button
                variant="default"
                size="sm"
                disabled={selectedIds.length === 0 || bulkUpdating}
                onClick={() => bulkUpdateStatus({ ids: selectedIds, newStatus: 'paid' })}
                title={selectedIds.length === 0 ? 'Select one or more claims first' : 'Mark selected as Paid'}
              >
                <DollarSign className="mr-2 h-4 w-4" />
                Mark paid ({selectedIds.length})
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Loading claims...</div>
          ) : filteredClaims.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No claims found matching the current filters
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[44px]">
                    <Checkbox checked={allFilteredSelected} onCheckedChange={(v) => toggleAllFiltered(Boolean(v))} />
                  </TableHead>
                  <TableHead>Social Worker</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Visits</TableHead>
                  <TableHead>Gas</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="whitespace-nowrap">Aging</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClaims.map((claim) => (
                  <TableRow key={claim.id}>
                    <TableCell>
                      <Checkbox
                        checked={Boolean(selectedClaimIds[claim.id])}
                        onCheckedChange={(v) => setSelectedClaimIds((prev) => ({ ...prev, [claim.id]: Boolean(v) }))}
                      />
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{claim.socialWorkerName}</div>
                        <div className="text-sm text-muted-foreground">{claim.socialWorkerEmail}</div>
                      </div>
                    </TableCell>
                    <TableCell>{format(claim.claimDate, 'MMM d, yyyy')}</TableCell>
                    <TableCell>
                      {claim.memberVisits.length} visits (${claim.totalMemberVisitFees})
                      {renderDraftVisitDetails(claim)}
                    </TableCell>
                    <TableCell>${claim.gasReimbursement}</TableCell>
                    <TableCell className="font-semibold">${claim.totalAmount}</TableCell>
                    <TableCell>{getStatusBadge(claim.status)}</TableCell>
                    <TableCell>{getPaymentBadge(claim)}</TableCell>
                    <TableCell>{getAgingBadge(claim)}</TableCell>
                    <TableCell>
                      {claim.submittedAt ? format(claim.submittedAt, 'MMM d, yyyy') : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={() => openClaimReview(claim)}>
                          <Eye className="mr-2 h-4 w-4" />
                          Review
                        </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => openDelete([claim.id])}
                        title="Delete claim (requires reason)"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
        </>
      ) : null}
    </div>
  );
}
