'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
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
  TrendingUp
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
  const { isSuperAdmin } = useAdmin();
  const { toast } = useToast();
  
  const [claims, setClaims] = useState<ClaimSubmission[]>([]);
  const [filteredClaims, setFilteredClaims] = useState<ClaimSubmission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedClaim, setSelectedClaim] = useState<ClaimSubmission | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [socialWorkerFilter, setSocialWorkerFilter] = useState('all');
  const [monthFilter, setMonthFilter] = useState(format(new Date(), 'yyyy-MM'));
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
          reviewedAt: data.reviewedAt?.toDate()
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

  const updateClaimStatus = async (claimId: string, newStatus: string, reviewNotes?: string) => {
    if (!firestore) return;
    
    try {
      const claimRef = doc(firestore, 'sw-claims', claimId);
      const updates: any = {
        status: newStatus,
        reviewedAt: new Date(),
        reviewedBy: 'Admin', // In production, use actual admin name
        reviewNotes: reviewNotes || ''
      };

      if (newStatus === 'paid') {
        updates.paidAt = serverTimestamp();
        updates.claimPaid = true;
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
          ? { ...claim, status: newStatus as any, reviewedAt: new Date(), reviewNotes }
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
                      <div>
                        <div className="font-medium">{claim.socialWorkerName}</div>
                        <div className="text-sm text-muted-foreground">{claim.socialWorkerEmail}</div>
                      </div>
                    </TableCell>
                    <TableCell>{format(claim.claimDate, 'MMM d, yyyy')}</TableCell>
                    <TableCell>
                      {claim.memberVisits.length} visits (${claim.totalMemberVisitFees})
                    </TableCell>
                    <TableCell>${claim.gasReimbursement}</TableCell>
                    <TableCell className="font-semibold">${claim.totalAmount}</TableCell>
                    <TableCell>{getStatusBadge(claim.status)}</TableCell>
                    <TableCell>
                      {claim.submittedAt ? format(claim.submittedAt, 'MMM d, yyyy') : '-'}
                    </TableCell>
                    <TableCell>
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

                              {/* Member Visits */}
                              <div>
                                <h4 className="font-semibold mb-3">Member Visits ({selectedClaim.memberVisits.length})</h4>
                                <div className="space-y-2">
                                  {selectedClaim.memberVisits.map((visit) => (
                                    <div key={visit.id} className="border rounded-lg p-3">
                                      <div className="flex justify-between items-start">
                                        <div>
                                          <div className="font-medium">{visit.memberName}</div>
                                          <div className="text-sm text-muted-foreground">
                                            <div className="flex items-center gap-1">
                                              <MapPin className="h-3 w-3" />
                                              {visit.rcfeName}
                                            </div>
                                            {visit.rcfeAddress && <div>{visit.rcfeAddress}</div>}
                                            <div>Time: {visit.visitTime}</div>
                                            {visit.notes && <div>Notes: {visit.notes}</div>}
                                          </div>
                                        </div>
                                        <Badge>$45</Badge>
                                      </div>
                                    </div>
                                  ))}
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
                            </div>
                          )}
                        </DialogContent>
                      </Dialog>
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