'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { useAuth, useFirestore } from '@/firebase';
import { useSocialWorker } from '@/hooks/use-social-worker';
import { collection, addDoc, query, where, getDocs, serverTimestamp, orderBy } from 'firebase/firestore';
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
  CheckCircle
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
  claimDate: Date;
  memberVisits: MemberVisit[];
  gasReimbursement: number;
  totalMemberVisitFees: number;
  totalAmount: number;
  notes?: string;
  status: 'draft' | 'submitted' | 'approved' | 'paid';
  submittedAt?: Date;
}

export default function SWClaimsPage() {
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

  useEffect(() => {
    if (user?.email) {
      loadPreviousClaims();
    }
  }, [user]);

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
      const claims: ClaimSubmission[] = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        claimDate: doc.data().claimDate.toDate(),
        submittedAt: doc.data().submittedAt?.toDate()
      })) as ClaimSubmission[];
      
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
      description: `Added visit for ${newVisit.memberName}`
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
      
      const claimData: Omit<ClaimSubmission, 'id'> = {
        socialWorkerEmail: user.email!,
        socialWorkerName: user.displayName || user.email!,
        claimDate: selectedDate,
        memberVisits,
        gasReimbursement,
        totalMemberVisitFees: memberVisitFees,
        totalAmount,
        notes,
        status: 'submitted',
        submittedAt: new Date()
      };

      await addDoc(collection(firestore, 'sw-claims'), {
        ...claimData,
        claimDate: serverTimestamp(),
        submittedAt: serverTimestamp()
      });

      toast({
        title: 'Claim Submitted',
        description: `Claim for $${totalAmount} has been submitted successfully`
      });

      // Reset form
      setMemberVisits([]);
      setNotes('');
      setSelectedDate(new Date());
      
      // Reload claims
      loadPreviousClaims();
      
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
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
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
          <h1 className="text-3xl font-bold">SW Claims Submission</h1>
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
            <div className="text-center py-8">Loading previous claims...</div>
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
                {previousClaims.map((claim) => (
                  <TableRow key={claim.id}>
                    <TableCell>{format(claim.claimDate, 'MMM d, yyyy')}</TableCell>
                    <TableCell>
                      {claim.memberVisits.length} visits (${claim.totalMemberVisitFees})
                    </TableCell>
                    <TableCell>${claim.gasReimbursement}</TableCell>
                    <TableCell className="font-semibold">${claim.totalAmount}</TableCell>
                    <TableCell>
                      <Badge variant={
                        claim.status === 'paid' ? 'default' :
                        claim.status === 'approved' ? 'secondary' :
                        claim.status === 'submitted' ? 'outline' : 'destructive'
                      }>
                        {claim.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {claim.submittedAt ? format(claim.submittedAt, 'MMM d, yyyy') : '-'}
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