'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { useAuth, useFirestore, useUser } from '@/firebase';
import { useSocialWorker } from '@/hooks/use-social-worker';
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { format } from 'date-fns';
import { AlertCircle, Calendar as CalendarIcon, CheckCircle, FileText, Send } from 'lucide-react';

interface MemberVisit {
  id: string;
  memberName: string;
  rcfeName: string;
  rcfeAddress?: string;
  visitDate?: any;
  visitTime?: string;
  notes?: string;
}

interface ClaimSubmission {
  id?: string;
  socialWorkerEmail: string;
  socialWorkerName: string;
  claimDate: Date;
  memberVisits: MemberVisit[];
  gasReimbursement: number;
  totalMemberVisitFees: number;
  totalAmount: number;
  status: 'draft' | 'submitted' | 'approved' | 'paid' | 'rejected';
  submittedAt?: Date;
}

export default function SWClaimsPage() {
  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const { isSocialWorker, canSubmitClaims, isLoading: swLoading } = useSocialWorker();

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [previousClaims, setPreviousClaims] = useState<ClaimSubmission[]>([]);
  const [isLoadingClaims, setIsLoadingClaims] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadPreviousClaims = async () => {
    if (!firestore || !user?.email) return;
    setIsLoadingClaims(true);
    try {
      const claimsQuery = query(
        collection(firestore, 'sw-claims'),
        where('socialWorkerEmail', '==', user.email),
        orderBy('claimDate', 'desc')
      );
      const querySnapshot = await getDocs(claimsQuery);
      const claims: ClaimSubmission[] = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as any),
        claimDate: (doc.data() as any).claimDate?.toDate?.() || new Date(),
        submittedAt: (doc.data() as any).submittedAt?.toDate?.(),
        memberVisits: Array.isArray((doc.data() as any).memberVisits) ? (doc.data() as any).memberVisits : [],
        gasReimbursement: Number((doc.data() as any).gasReimbursement || 0),
        totalMemberVisitFees: Number((doc.data() as any).totalMemberVisitFees || 0),
        totalAmount: Number((doc.data() as any).totalAmount || 0),
        status: String((doc.data() as any).status || 'draft') as any,
      }));
      setPreviousClaims(claims);
    } catch (error) {
      console.error('Error loading previous claims:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load your claims',
      });
    } finally {
      setIsLoadingClaims(false);
    }
  };

  useEffect(() => {
    if (user?.email) loadPreviousClaims();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email]);

  const claimIdForSelectedDate = useMemo(() => {
    const uid = user?.uid || '';
    const email = (user?.email || '').toLowerCase();
    const swKey = uid || email || 'unknown';
    const yyyymmdd = format(selectedDate, 'yyyyMMdd');
    return `swClaim_${swKey}_${yyyymmdd}`;
  }, [selectedDate, user?.uid, user?.email]);

  const selectedClaim = useMemo(() => {
    return previousClaims.find((c) => c.id === claimIdForSelectedDate) || null;
  }, [previousClaims, claimIdForSelectedDate]);

  const submitSelectedClaim = async () => {
    if (!auth?.currentUser) return;
    if (!selectedClaim?.id) return;

    setIsSubmitting(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/sw-claims/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, claimId: selectedClaim.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !(data as any)?.success) {
        throw new Error((data as any)?.error || 'Failed to submit claim');
      }
      toast({
        title: 'Claim Submitted',
        description: `Submitted claim for ${format(selectedDate, 'MMM d, yyyy')}.`,
      });
      await loadPreviousClaims();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Submission Failed',
        description: error?.message || 'Failed to submit claim. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (swLoading || isUserLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isSocialWorker || !canSubmitClaims()) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Access Denied
            </CardTitle>
            <CardDescription>
              You are not authorized to access the claims system. Please contact your administrator.
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
          <h1 className="text-3xl font-bold">SW Claims</h1>
          <p className="text-muted-foreground">
            Claims are generated automatically from submitted visit questionnaires.
          </p>
        </div>
        <div className="text-right">
          <div className="text-sm text-muted-foreground">Rate Structure</div>
          <div className="font-semibold">$45 per member visit</div>
          <div className="font-semibold">$20 gas per day (if any visit occurred)</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Daily Claim (auto-generated)
              </CardTitle>
              <CardDescription>Select a date to view and submit that day’s claim.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="justify-start text-left font-normal w-full sm:w-[260px]">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(selectedDate, 'PPP')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={(date) => date && setSelectedDate(date)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <div className="flex-1 text-sm text-muted-foreground">
                  Claim ID: <span className="font-mono text-xs">{claimIdForSelectedDate}</span>
                </div>
              </div>

              {!selectedClaim ? (
                <div className="text-sm text-muted-foreground">
                  No claim found for this date yet. Submit at least one visit questionnaire for that day and refresh.
                </div>
              ) : (
                <Card className="bg-muted/40">
                  <CardContent className="pt-6 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">Status</div>
                      <Badge variant={selectedClaim.status === 'paid' ? 'default' : 'secondary'}>
                        {selectedClaim.status}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="font-medium">Visits</div>
                      <div>{selectedClaim.memberVisits.length} × $45 = ${selectedClaim.totalMemberVisitFees}</div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="font-medium">Gas</div>
                      <div>${selectedClaim.gasReimbursement}</div>
                    </div>
                    <div className="flex items-center justify-between border-t pt-3">
                      <div className="font-semibold">Total</div>
                      <div className="font-semibold">${selectedClaim.totalAmount}</div>
                    </div>

                    <div className="pt-2">
                      <Button
                        onClick={submitSelectedClaim}
                        disabled={isSubmitting || selectedClaim.status !== 'draft' || selectedClaim.memberVisits.length === 0}
                        className="w-full bg-green-600 hover:bg-green-700"
                      >
                        {isSubmitting ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                            Submitting...
                          </>
                        ) : (
                          <>
                            <Send className="mr-2 h-4 w-4" />
                            Submit Claim
                          </>
                        )}
                      </Button>
                      {selectedClaim.status !== 'draft' && (
                        <div className="text-xs text-muted-foreground mt-2">
                          This claim is already {selectedClaim.status}.
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <CheckCircle className="h-5 w-5" />
                Recent Claims
              </CardTitle>
              <CardDescription>Your latest auto-generated claims</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingClaims ? (
                <div className="text-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto mb-2"></div>
                  <p className="text-sm text-muted-foreground">Loading...</p>
                </div>
              ) : previousClaims.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No claims yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {previousClaims.slice(0, 8).map((claim) => (
                    <div key={claim.id} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">{format(claim.claimDate, 'MMM d, yyyy')}</span>
                        <Badge variant={claim.status === 'paid' ? 'default' : 'secondary'}>{claim.status}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {claim.memberVisits.length} visits • Gas ${claim.gasReimbursement}
                      </div>
                      <div className="text-sm font-semibold">Total: ${claim.totalAmount}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Claims History</CardTitle>
          <CardDescription>Complete history of your claim submissions</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingClaims ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading claims history...</p>
            </div>
          ) : previousClaims.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No Claims Yet</p>
              <p className="text-sm">Your submitted claims will appear here</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Visits</TableHead>
                  <TableHead>Gas</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previousClaims.map((claim) => (
                  <TableRow key={claim.id}>
                    <TableCell>{format(claim.claimDate, 'MMM d, yyyy')}</TableCell>
                    <TableCell>
                      {claim.memberVisits.length} visits
                      <div className="text-xs text-muted-foreground">${claim.totalMemberVisitFees}</div>
                    </TableCell>
                    <TableCell>${claim.gasReimbursement}</TableCell>
                    <TableCell className="font-semibold">${claim.totalAmount}</TableCell>
                    <TableCell>
                      <Badge variant={claim.status === 'paid' ? 'default' : 'secondary'}>{claim.status}</Badge>
                    </TableCell>
                    <TableCell>{claim.submittedAt ? format(claim.submittedAt, 'MMM d, yyyy') : '—'}</TableCell>
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

