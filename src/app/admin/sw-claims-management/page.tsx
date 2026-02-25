'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useFirestore } from '@/firebase';
import { useAdmin } from '@/hooks/use-admin';
import { collection, query, orderBy, getDocs, doc, updateDoc, where, writeBatch, serverTimestamp } from 'firebase/firestore';
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
  RefreshCw,
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
  memberVisits: MemberVisit[];
  gasReimbursement: number;
  totalMemberVisitFees: number;
  totalAmount: number;
  notes?: string;
  status: 'draft' | 'submitted' | 'approved' | 'paid' | 'rejected';
  submittedAt?: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
  reviewNotes?: string;
  paidAt?: Date;
  paidBy?: string;
}

interface ClaimSummary {
  totalClaims: number;
  totalAmount: number;
  pendingClaims: number;
  pendingAmount: number;
  approvedClaims: number;
  approvedAmount: number;
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
  const [statusFilter, setStatusFilter] = useState('all');
  const [socialWorkerFilter, setSocialWorkerFilter] = useState('all');
  const [monthFilter, setMonthFilter] = useState(format(new Date(), 'yyyy-MM'));
  const [selectedClaimIds, setSelectedClaimIds] = useState<Record<string, boolean>>({});
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTargetIds, setDeleteTargetIds] = useState<string[]>([]);
  const [deleteReason, setDeleteReason] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [duplicateMemberName, setDuplicateMemberName] = useState('');
  const [duplicateMonth, setDuplicateMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [summary, setSummary] = useState<ClaimSummary>({
    totalClaims: 0,
    totalAmount: 0,
    pendingClaims: 0,
    pendingAmount: 0,
    approvedClaims: 0,
    approvedAmount: 0,
    paidClaims: 0,
    paidAmount: 0
  });

  useEffect(() => {
    loadClaims();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [claims, statusFilter, socialWorkerFilter, monthFilter]);

  useEffect(() => {
    setDuplicateMonth(monthFilter);
  }, [monthFilter]);

  const normalizeName = (s: string) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

  const loadClaims = async () => {
    if (!firestore) return;
    
    setIsLoading(true);
    try {
      const claimsQuery = query(
        collection(firestore, 'sw-claims'),
        orderBy('submittedAt', 'desc')
      );
      
      const querySnapshot = await getDocs(claimsQuery);
      const loadedClaims: ClaimSubmission[] = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          claimDate: data.claimDate.toDate(),
          submittedAt: data.submittedAt?.toDate(),
          reviewedAt: data.reviewedAt?.toDate(),
          paidAt: data.paidAt?.toDate(),
        };
      }) as ClaimSubmission[];
      
      setClaims(loadedClaims);
      calculateSummary(loadedClaims);
    } catch (error) {
      console.error('Error loading claims:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load claims'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...claims];

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(claim => claim.status === statusFilter);
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

    setFilteredClaims(filtered);
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
      calculateSummary(remaining);

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

  const calculateSummary = (claimsData: ClaimSubmission[]) => {
    const summary: ClaimSummary = {
      totalClaims: claimsData.length,
      totalAmount: claimsData.reduce((sum, claim) => sum + claim.totalAmount, 0),
      pendingClaims: claimsData.filter(c => c.status === 'submitted').length,
      pendingAmount: claimsData.filter(c => c.status === 'submitted').reduce((sum, claim) => sum + claim.totalAmount, 0),
      approvedClaims: claimsData.filter(c => c.status === 'approved').length,
      approvedAmount: claimsData.filter(c => c.status === 'approved').reduce((sum, claim) => sum + claim.totalAmount, 0),
      paidClaims: claimsData.filter(c => c.status === 'paid').length,
      paidAmount: claimsData.filter(c => c.status === 'paid').reduce((sum, claim) => sum + claim.totalAmount, 0)
    };
    
    setSummary(summary);
  };

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

  const updateClaimStatus = async (claimId: string, newStatus: string, reviewNotes?: string) => {
    if (!firestore) return;
    
    try {
      const claimRef = doc(firestore, 'sw-claims', claimId);
      const actorLabel =
        String(adminUser?.displayName || adminUser?.email || '').trim()
        || 'Admin';
      const updates: any = {
        status: newStatus,
        reviewedAt: new Date(),
        reviewedBy: actorLabel,
        reviewNotes: reviewNotes || ''
      };

      if (newStatus === 'paid') {
        updates.paidAt = serverTimestamp();
        updates.claimPaid = true;
        updates.paidBy = actorLabel;
      }

      await updateDoc(claimRef, updates);

      // When paid, propagate paid fields to linked visit records
      if (newStatus === 'paid') {
        const claim = claims.find((c) => c.id === claimId) as any;
        const visitIdsFromDoc: string[] = Array.isArray(claim?.visitIds) ? claim.visitIds : [];
        const visitIdsFromMemberVisits: string[] = Array.isArray(claim?.memberVisits)
          ? claim.memberVisits.map((v: any) => String(v?.id || '').trim()).filter(Boolean)
          : [];
        const visitIds = Array.from(new Set([...visitIdsFromDoc, ...visitIdsFromMemberVisits]));

        if (visitIds.length > 0) {
          const batch = writeBatch(firestore);
          visitIds.slice(0, 500).forEach((visitId) => {
            const visitRef = doc(firestore, 'sw_visit_records', String(visitId));
            batch.set(
              visitRef,
              {
                claimId,
                claimPaid: true,
                claimPaidAt: serverTimestamp(),
                claimStatus: 'paid',
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            );
          });
          await batch.commit();
        }
      }

      // Update local state
      setClaims(claims.map(claim => 
        claim.id === claimId 
          ? {
              ...claim,
              status: newStatus as any,
              reviewedAt: new Date(),
              reviewedBy: actorLabel,
              reviewNotes,
              paidAt: newStatus === 'paid' ? new Date() : claim.paidAt,
              paidBy: newStatus === 'paid' ? actorLabel : claim.paidBy,
            }
          : claim
      ));

      toast({
        title: 'Status Updated',
        description: `Claim status changed to ${newStatus}`
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
      'approved': 'secondary',
      'paid': 'default',
      'rejected': 'destructive',
      'draft': 'outline'
    } as const;

    const colors = {
      'submitted': 'text-blue-700',
      'approved': 'text-green-700',
      'paid': 'text-green-800',
      'rejected': 'text-red-700',
      'draft': 'text-gray-700'
    };

    return (
      <Badge variant={variants[status as keyof typeof variants]} className={colors[status as keyof typeof colors]}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
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
            Manage and review social worker claims submissions
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={loadClaims} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
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

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
            <CardTitle className="text-sm font-medium">Approved</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{summary.approvedClaims}</div>
            <p className="text-xs text-muted-foreground">
              ${summary.approvedAmount.toLocaleString()} approved
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
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
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
        </CardContent>
      </Card>

      {/* Claims Table */}
      <Card>
        <CardHeader>
          <CardTitle>Claims ({filteredClaims.length})</CardTitle>
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
                    <TableCell>
                      {claim.submittedAt ? format(claim.submittedAt, 'MMM d, yyyy') : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setSelectedClaim(claim)}
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            Review
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>Claim Review - {claim.socialWorkerName}</DialogTitle>
                            <DialogDescription>
                              {format(claim.claimDate, 'MMMM d, yyyy')} • Total: ${claim.totalAmount}
                            </DialogDescription>
                          </DialogHeader>
                          
                          {selectedClaim && (
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
                                    <div>Member Visits: {selectedClaim.memberVisits.length} × $45 = ${selectedClaim.totalMemberVisitFees}</div>
                                    <div>Gas Reimbursement: ${selectedClaim.gasReimbursement}</div>
                                    <div className="font-semibold">Total: ${selectedClaim.totalAmount}</div>
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
                                          <TableCell className="whitespace-nowrap">
                                            {format(visit.visitDate, 'MM/dd/yyyy')}
                                          </TableCell>
                                          <TableCell className="font-medium">{visit.memberName}</TableCell>
                                          <TableCell className="min-w-[220px]">
                                            <div className="font-medium">{visit.rcfeName}</div>
                                            <div className="text-xs text-muted-foreground">{visit.rcfeAddress}</div>
                                          </TableCell>
                                          <TableCell className="whitespace-nowrap">{visit.visitTime || '—'}</TableCell>
                                          <TableCell className="text-sm text-muted-foreground">
                                            {visit.notes ? visit.notes : '—'}
                                          </TableCell>
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

                              {/* Notes */}
                              {selectedClaim.notes && (
                                <div>
                                  <h4 className="font-semibold mb-2">Additional Notes</h4>
                                  <p className="text-sm bg-muted p-3 rounded">{selectedClaim.notes}</p>
                                </div>
                              )}

                              {/* Action Buttons */}
                              <div className="flex gap-2 pt-4 border-t">
                                {selectedClaim.status === 'submitted' && (
                                  <>
                                    <Button 
                                      onClick={() => updateClaimStatus(selectedClaim.id, 'approved')}
                                      className="bg-green-600 hover:bg-green-700"
                                    >
                                      <CheckCircle className="mr-2 h-4 w-4" />
                                      Approve
                                    </Button>
                                    <Button 
                                      onClick={() => updateClaimStatus(selectedClaim.id, 'rejected')}
                                      variant="destructive"
                                    >
                                      <XCircle className="mr-2 h-4 w-4" />
                                      Reject
                                    </Button>
                                  </>
                                )}
                                {selectedClaim.status === 'approved' && (
                                  <Button 
                                    onClick={() => updateClaimStatus(selectedClaim.id, 'paid')}
                                    className="bg-green-800 hover:bg-green-900"
                                  >
                                    <DollarSign className="mr-2 h-4 w-4" />
                                    Mark as Paid
                                  </Button>
                                )}
                              </div>
                              {selectedClaim.status === 'paid' ? (
                                <div className="pt-3 text-sm text-muted-foreground">
                                  Paid{selectedClaim.paidAt ? ` on ${format(selectedClaim.paidAt, 'MMM d, yyyy h:mm a')}` : ''}{' '}
                                  {selectedClaim.paidBy ? `by ${selectedClaim.paidBy}` : ''}
                                </div>
                              ) : null}
                            </div>
                          )}
                        </DialogContent>
                      </Dialog>
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
    </div>
  );
}