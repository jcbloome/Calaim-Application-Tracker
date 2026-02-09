'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { useAuth, useFirestore } from '@/firebase';
import { useSocialWorker } from '@/hooks/use-social-worker';
import { collection, addDoc, query, where, getDocs, serverTimestamp, orderBy, Timestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { 
  DollarSign, 
  Calendar as CalendarIcon, 
  MapPin, 
  Users, 
  Car, 
  Plus, 
  Trash2,
  Save,
  FileText,
  AlertCircle,
  CheckCircle,
  Loader2
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
  id?: string;
  socialWorkerEmail: string;
  socialWorkerName: string;
  claimDate: Date | Timestamp;
  memberVisits: MemberVisit[];
  gasReimbursement: number;
  totalMemberVisitFees: number;
  totalAmount: number;
  notes?: string;
  status: 'draft' | 'submitted' | 'approved' | 'paid' | 'rejected';
  submittedAt?: Date | Timestamp;
}

export default function SubmitClaimsPage() {
  const { user } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const { isSocialWorker, canSubmitClaims, isLoading: swLoading } = useSocialWorker();
  
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [memberVisits, setMemberVisits] = useState<MemberVisit[]>([]);
  const [gasReimbursement, setGasReimbursement] = useState<number>(20);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previousClaims, setPreviousClaims] = useState<ClaimSubmission[]>([]);
  const [isLoadingClaims, setIsLoadingClaims] = useState(true);

  // New member visit form state
  const [newVisit, setNewVisit] = useState({
    memberName: '',
    rcfeName: '',
    rcfeAddress: '',
    visitTime: '',
    notes: ''
  });

  const normalizeMemberName = (name: string) => name.trim().toLowerCase();
  const getMonthKey = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

  const currentMonthKey = useMemo(() => getMonthKey(selectedDate), [selectedDate]);

  const monthlyVisitLog = useMemo(() => {
    const entries: Array<{
      memberName: string;
      rcfeName: string;
      visitDate: Date;
      claimId?: string;
    }> = [];
    previousClaims.forEach((claim) => {
      claim.memberVisits.forEach((visit) => {
        const visitDate = visit.visitDate instanceof Date ? visit.visitDate : new Date(visit.visitDate);
        if (getMonthKey(visitDate) === currentMonthKey) {
          entries.push({
            memberName: visit.memberName,
            rcfeName: visit.rcfeName,
            visitDate,
            claimId: claim.id
          });
        }
      });
    });
    return entries.sort((a, b) => b.visitDate.getTime() - a.visitDate.getTime());
  }, [previousClaims, currentMonthKey]);

  const isMemberAlreadyClaimedThisMonth = (memberName: string) => {
    const normalizedName = normalizeMemberName(memberName);
    const inCurrentDraft = memberVisits.some(
      (visit) => normalizeMemberName(visit.memberName) === normalizedName
    );
    if (inCurrentDraft) return true;

    return previousClaims.some((claim) =>
      claim.memberVisits.some((visit) => {
        const visitDate = visit.visitDate instanceof Date ? visit.visitDate : new Date(visit.visitDate);
        return (
          normalizeMemberName(visit.memberName) === normalizedName &&
          getMonthKey(visitDate) === currentMonthKey
        );
      })
    );
  };

  useEffect(() => {
    if (user?.email && isSocialWorker) {
      loadPreviousClaims();
    }
  }, [user, isSocialWorker]);

  const loadPreviousClaims = async () => {
    if (!firestore || !user?.email) return;
    
    setIsLoadingClaims(true);
    try {
      const claimsQuery = query(
        collection(firestore, 'sw-claims'),
        where('socialWorkerEmail', '==', user.email),
        orderBy('submittedAt', 'desc')
      );
      
      const querySnapshot = await getDocs(claimsQuery);
      const claims: ClaimSubmission[] = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          claimDate: data.claimDate?.toDate ? data.claimDate.toDate() : new Date(data.claimDate),
          submittedAt: data.submittedAt?.toDate ? data.submittedAt.toDate() : (data.submittedAt ? new Date(data.submittedAt) : undefined),
          memberVisits: (data.memberVisits || []).map((visit: any) => ({
            ...visit,
            visitDate: visit.visitDate?.toDate ? visit.visitDate.toDate() : new Date(visit.visitDate)
          }))
        };
      }) as ClaimSubmission[];
      
      setPreviousClaims(claims);
    } catch (error) {
      console.error('Error loading previous claims:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load previous claims'
      });
    } finally {
      setIsLoadingClaims(false);
    }
  };

  const addMemberVisit = () => {
    if (!newVisit.memberName || !newVisit.rcfeName || !newVisit.visitTime) {
      toast({
        variant: 'destructive',
        title: 'Missing Information',
        description: 'Please fill in member name, RCFE name, and visit time'
      });
      return;
    }
    if (isMemberAlreadyClaimedThisMonth(newVisit.memberName)) {
      toast({
        variant: 'destructive',
        title: 'Monthly Limit Reached',
        description: `Only one monthly invoice is allowed per member. ${newVisit.memberName} already has a visit logged this month.`
      });
      return;
    }

    const visit: MemberVisit = {
      id: Date.now().toString(),
      memberName: newVisit.memberName,
      rcfeName: newVisit.rcfeName,
      rcfeAddress: newVisit.rcfeAddress,
      visitDate: selectedDate,
      visitTime: newVisit.visitTime,
      notes: newVisit.notes
    };

    setMemberVisits([...memberVisits, visit]);
    setNewVisit({
      memberName: '',
      rcfeName: '',
      rcfeAddress: '',
      visitTime: '',
      notes: ''
    });

    toast({
      title: 'Visit Added',
      description: `Added visit for ${visit.memberName}`
    });
  };

  const removeMemberVisit = (id: string) => {
    setMemberVisits(memberVisits.filter(visit => visit.id !== id));
  };

  const calculateTotals = () => {
    const memberVisitFees = memberVisits.length * 45;
    const totalAmount = memberVisitFees + gasReimbursement;
    return { memberVisitFees, totalAmount };
  };

  const submitClaim = async () => {
    if (!firestore || !user) return;
    
    if (memberVisits.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No Visits',
        description: 'Please add at least one member visit'
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const { memberVisitFees, totalAmount } = calculateTotals();
      
      const claimData = {
        socialWorkerEmail: user.email!,
        socialWorkerName: user.displayName || user.email!,
        claimDate: selectedDate,
        memberVisits: memberVisits.map(v => ({
          ...v,
          visitDate: v.visitDate
        })),
        gasReimbursement,
        totalMemberVisitFees: memberVisitFees,
        totalAmount,
        notes: notes || undefined,
        status: 'submitted' as const,
        submittedAt: new Date()
      };

      await addDoc(collection(firestore, 'sw-claims'), {
        ...claimData,
        claimDate: Timestamp.fromDate(selectedDate),
        memberVisits: claimData.memberVisits.map(v => ({
          ...v,
          visitDate: Timestamp.fromDate(v.visitDate)
        })),
        submittedAt: serverTimestamp()
      });

      toast({
        title: 'Claim Submitted',
        description: `Claim for $${totalAmount} has been submitted successfully`
      });

      // Reset form
      setMemberVisits([]);
      setNotes('');
      setGasReimbursement(20);
      setSelectedDate(new Date());
      
      // Reload claims
      await loadPreviousClaims();
      
    } catch (error) {
      console.error('Error submitting claim:', error);
      toast({
        variant: 'destructive',
        title: 'Submission Failed',
        description: 'Failed to submit claim. Please try again.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const { memberVisitFees, totalAmount } = calculateTotals();

  // Show loading while checking social worker status
  if (swLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-8">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Check if user is authorized
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
              You are not authorized to access the claims submission system. Please contact your administrator.
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
          <h1 className="text-3xl font-bold">Submit Claims</h1>
          <p className="text-muted-foreground">
            Submit your member visit claims and gas reimbursements
          </p>
        </div>
        <div className="text-right">
          <div className="text-sm text-muted-foreground">Rate Structure</div>
          <div className="font-semibold">$45 per member visit</div>
          <div className="font-semibold">$20 daily gas allowance</div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Visits Logged This Month
          </CardTitle>
          <CardDescription>
            One monthly invoice per member is allowed. Month: {format(selectedDate, 'MMMM yyyy')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {monthlyVisitLog.length === 0 ? (
            <div className="text-sm text-muted-foreground">No visits logged yet for this month.</div>
          ) : (
            <div className="space-y-2">
              {monthlyVisitLog.map((entry, index) => (
                <div key={`${entry.memberName}-${entry.visitDate.toISOString()}-${index}`} className="flex items-center justify-between border rounded-md p-2">
                  <div>
                    <div className="font-medium">{entry.memberName}</div>
                    <div className="text-xs text-muted-foreground">{entry.rcfeName}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {format(entry.visitDate, 'MMM d, yyyy')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Claim Submission Form */}
        <div className="space-y-6">
          {/* Date Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarIcon className="h-5 w-5" />
                Visit Date
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
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
            </CardContent>
          </Card>

          {/* Add Member Visit */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Add Member Visit
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="memberName">Member Name *</Label>
                  <Input
                    id="memberName"
                    value={newVisit.memberName}
                    onChange={(e) => setNewVisit({...newVisit, memberName: e.target.value})}
                    placeholder="Enter member name"
                  />
                </div>
                <div>
                  <Label htmlFor="visitTime">Visit Time *</Label>
                  <Input
                    id="visitTime"
                    type="time"
                    value={newVisit.visitTime}
                    onChange={(e) => setNewVisit({...newVisit, visitTime: e.target.value})}
                  />
                </div>
              </div>
              
              <div>
                <Label htmlFor="rcfeName">RCFE Name *</Label>
                <Input
                  id="rcfeName"
                  value={newVisit.rcfeName}
                  onChange={(e) => setNewVisit({...newVisit, rcfeName: e.target.value})}
                  placeholder="Enter RCFE facility name"
                />
              </div>
              
              <div>
                <Label htmlFor="rcfeAddress">RCFE Address</Label>
                <Input
                  id="rcfeAddress"
                  value={newVisit.rcfeAddress}
                  onChange={(e) => setNewVisit({...newVisit, rcfeAddress: e.target.value})}
                  placeholder="Enter RCFE address"
                />
              </div>
              
              <div>
                <Label htmlFor="visitNotes">Visit Notes</Label>
                <Textarea
                  id="visitNotes"
                  value={newVisit.notes}
                  onChange={(e) => setNewVisit({...newVisit, notes: e.target.value})}
                  placeholder="Any notes about the visit..."
                  rows={2}
                />
              </div>
              
              <Button onClick={addMemberVisit} className="w-full">
                <Plus className="mr-2 h-4 w-4" />
                Add Visit
              </Button>
            </CardContent>
          </Card>

          {/* Gas Reimbursement */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Car className="h-5 w-5" />
                Gas Reimbursement
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-2">
                <Label htmlFor="gasAmount">Daily Gas Allowance</Label>
                <Input
                  id="gasAmount"
                  type="number"
                  value={gasReimbursement}
                  onChange={(e) => setGasReimbursement(Number(e.target.value))}
                  className="w-24"
                  min="0"
                  step="0.01"
                />
                <span className="text-sm text-muted-foreground">
                  (Covers all visits for {format(selectedDate, 'MMM d, yyyy')})
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Additional Notes */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Additional Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any additional notes for this claim..."
                rows={3}
              />
            </CardContent>
          </Card>
        </div>

        {/* Current Claim Summary */}
        <div className="space-y-6">
          {/* Claim Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Claim Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between">
                <span>Member Visits ({memberVisits.length})</span>
                <span className="font-semibold">${memberVisitFees}</span>
              </div>
              <div className="flex justify-between">
                <span>Gas Reimbursement</span>
                <span className="font-semibold">${gasReimbursement}</span>
              </div>
              <hr />
              <div className="flex justify-between text-lg font-bold">
                <span>Total Amount</span>
                <span>${totalAmount}</span>
              </div>
              
              <Button 
                onClick={submitClaim} 
                disabled={isSubmitting || memberVisits.length === 0}
                className="w-full"
                size="lg"
              >
                {isSubmitting ? (
                  <>
                    <Save className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Submit Claim
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Member Visits List */}
          {memberVisits.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Member Visits ({memberVisits.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {memberVisits.map((visit) => (
                    <div key={visit.id} className="flex items-start justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <div className="font-medium">{visit.memberName}</div>
                        <div className="text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {visit.rcfeName}
                          </div>
                          <div>Time: {visit.visitTime}</div>
                          {visit.notes && <div>Notes: {visit.notes}</div>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="default">$45</Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeMemberVisit(visit.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Previous Claims */}
      <Card>
        <CardHeader>
          <CardTitle>Previous Claims</CardTitle>
          <CardDescription>Your submitted claims history</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingClaims ? (
            <div className="text-center py-8">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              <p className="text-muted-foreground">Loading previous claims...</p>
            </div>
          ) : previousClaims.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No previous claims found
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
                {previousClaims.map((claim) => {
                  const claimDate = claim.claimDate instanceof Date ? claim.claimDate : new Date(claim.claimDate);
                  const submittedDate = claim.submittedAt instanceof Date ? claim.submittedAt : (claim.submittedAt ? new Date(claim.submittedAt) : null);
                  
                  return (
                    <TableRow key={claim.id}>
                      <TableCell>{format(claimDate, 'MMM d, yyyy')}</TableCell>
                      <TableCell>
                        {claim.memberVisits.length} visits (${claim.totalMemberVisitFees})
                      </TableCell>
                      <TableCell>${claim.gasReimbursement}</TableCell>
                      <TableCell className="font-semibold">${claim.totalAmount}</TableCell>
                      <TableCell>
                        <Badge variant={
                          claim.status === 'paid' ? 'default' :
                          claim.status === 'approved' ? 'secondary' :
                          claim.status === 'submitted' ? 'outline' : 
                          claim.status === 'rejected' ? 'destructive' : 'outline'
                        }>
                          {claim.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {submittedDate ? format(submittedDate, 'MMM d, yyyy') : '-'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
